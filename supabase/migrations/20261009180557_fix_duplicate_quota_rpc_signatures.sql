/*
# Fix Duplicate Quota RPC Signatures

## Summary
The quota ledger migration created new function signatures with p_quota_ledger / p_plan_key
params but did not DROP the old signatures. Postgres kept both as overloads, causing
RPC resolution ambiguity — Supabase's .rpc() may call the old overload that silently
ignores the quota_ledger parameter. This migration drops the old overloads and keeps
only the current versions.

## Changes
1. DROP old `admin_create_sub_admin` overload (without p_quota_ledger)
2. DROP old `admin_generate_license` overload (without p_plan_key)
3. Recreate both with the correct signatures to ensure single canonical version
4. NOTIFY pgrst to reload schema cache
*/

-- 1. Drop old admin_create_sub_admin overload (6 params, no p_quota_ledger)
DROP FUNCTION IF EXISTS public.admin_create_sub_admin(uuid, text, text, jsonb, integer, uuid);

-- 2. Drop old admin_generate_license overload (10 params, no p_plan_key)
DROP FUNCTION IF EXISTS public.admin_generate_license(text, text, text, text, text, integer, numeric, text, text[], uuid);

-- 3. Recreate admin_create_sub_admin with quota_ledger (canonical single version)
CREATE OR REPLACE FUNCTION public.admin_create_sub_admin(
  p_user_id uuid,
  p_email text,
  p_name text DEFAULT NULL,
  p_permissions jsonb DEFAULT '[]'::jsonb,
  p_license_quota integer DEFAULT 0,
  p_parent_admin_id uuid DEFAULT NULL,
  p_quota_ledger jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET role = 'sub_admin',
      permissions = p_permissions,
      license_quota = p_license_quota,
      parent_admin_id = p_parent_admin_id,
      quota_ledger = p_quota_ledger
  WHERE id = p_user_id;

  INSERT INTO public.admin_roles (user_id, email, name, role, permissions, is_active, license_quota, quota_ledger)
  VALUES (p_user_id, p_email, p_name, 'sub_admin', p_permissions, true, p_license_quota, p_quota_ledger)
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    role = 'sub_admin',
    permissions = EXCLUDED.permissions,
    is_active = true,
    license_quota = EXCLUDED.license_quota,
    quota_ledger = EXCLUDED.quota_ledger;

  RETURN true;
END;
$$;

-- 4. Recreate admin_generate_license with p_plan_key (canonical single version)
CREATE OR REPLACE FUNCTION public.admin_generate_license(
  p_email text,
  p_license_key text,
  p_full_name text DEFAULT NULL,
  p_mobile_number text DEFAULT NULL,
  p_plan_name text DEFAULT 'Starter',
  p_bot_limit integer DEFAULT 2,
  p_monthly_fee numeric DEFAULT 0,
  p_valid_until text DEFAULT NULL,
  p_allotted_strategies text[] DEFAULT NULL,
  p_parent_admin_id uuid DEFAULT NULL,
  p_plan_key text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_existing profiles%ROWTYPE;
  v_license_rec record;
  v_ledger jsonb;
  v_entry jsonb;
  v_total int;
  v_used int;
BEGIN
  -- 1. Find or create profile
  SELECT * INTO v_existing FROM public.profiles WHERE email = p_email LIMIT 1;

  IF FOUND THEN
    v_user_id := v_existing.id;
  ELSE
    INSERT INTO public.profiles (email, role, parent_admin_id)
    VALUES (p_email, 'client', p_parent_admin_id)
    RETURNING id INTO v_user_id;
  END IF;

  -- 2. Per-plan quota check for sub-admins with quota_ledger
  IF p_parent_admin_id IS NOT NULL AND p_plan_key IS NOT NULL THEN
    SELECT quota_ledger INTO v_ledger FROM public.profiles WHERE id = p_parent_admin_id AND role = 'sub_admin';
    IF v_ledger IS NOT NULL AND v_ledger != '{}'::jsonb THEN
      v_entry := v_ledger->p_plan_key;
      IF v_entry IS NULL THEN
        RAISE EXCEPTION 'Quota not allocated for plan: %', p_plan_key;
      END IF;
      v_total := (v_entry->>'total')::int;
      v_used := (v_entry->>'used')::int;
      IF v_used >= v_total THEN
        RAISE EXCEPTION 'Insufficient quota for plan: %', p_plan_key;
      END IF;

      -- Atomically deduct quota
      v_ledger := jsonb_set(v_ledger, ARRAY[p_plan_key, 'used'], to_jsonb(v_used + 1));
      UPDATE public.profiles SET quota_ledger = v_ledger WHERE id = p_parent_admin_id;
      UPDATE public.admin_roles SET quota_ledger = v_ledger WHERE user_id = p_parent_admin_id;
      UPDATE public.profiles SET license_quota = GREATEST(license_quota - 1, 0) WHERE id = p_parent_admin_id;
      UPDATE public.admin_roles SET license_quota = GREATEST(license_quota - 1, 0) WHERE user_id = p_parent_admin_id;
    END IF;
  END IF;

  -- 3. Deactivate existing active licenses for this user
  UPDATE public.licenses SET is_active = false
  WHERE user_id = v_user_id AND is_active = true;

  -- 4. Insert new license
  INSERT INTO public.licenses (
    user_id, plan_name, bot_limit, is_active,
    valid_from, valid_until, monthly_fee, license_key,
    mobile_number, allotted_strategies, parent_admin_id
  ) VALUES (
    v_user_id, p_plan_name, p_bot_limit, true,
    now(), COALESCE(p_valid_until, (now() + interval '30 days')::text),
    p_monthly_fee, p_license_key,
    p_mobile_number, p_allotted_strategies, p_parent_admin_id
  )
  RETURNING * INTO v_license_rec;

  -- 5. Insert transaction record
  INSERT INTO public.transactions (
    client_name, client_email, plan_name, amount, currency, status, payment_method
  ) VALUES (
    COALESCE(p_full_name, split_part(p_email, '@', 1)),
    p_email, p_plan_name, p_monthly_fee, 'USD', 'completed', 'Manual Assignment'
  );

  -- 6. Insert client_update notification
  INSERT INTO public.client_updates (
    client_id, update_type, title, message, severity, executed_by
  ) VALUES (
    v_user_id, 'license_update', 'New License Assigned',
    'Your license has been updated: ' || p_plan_name || ' plan, ' || p_bot_limit || ' bots max. Valid until ' || COALESCE(p_valid_until, (now() + interval '30 days')::text) || '.',
    'success', 'Master Admin'
  );

  RETURN json_build_object('license', to_json(v_license_rec), 'user_id', v_user_id);
END;
$$;

NOTIFY pgrst, 'reload schema';
