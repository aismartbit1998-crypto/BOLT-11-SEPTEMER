-- ─── Admin Panel RPC Functions (SECURITY DEFINER) ────────────────────────────
-- All admin operations that previously used direct table access now go through
-- SECURITY DEFINER functions so they bypass RLS when called with the anon key.

-- 1. get_client_trades — fetch trade history for a client
CREATE OR REPLACE FUNCTION public.get_client_trades(p_client_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT COALESCE(json_agg(t.* ORDER BY t.created_at DESC), '[]'::json) INTO result
  FROM (
    SELECT * FROM public.trades
    WHERE client_id = p_client_id
    ORDER BY created_at DESC
    LIMIT 50
  ) t;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_client_trades TO anon, authenticated;

-- 2. get_profile_by_id — fetch a single profile by id
CREATE OR REPLACE FUNCTION public.get_profile_by_id(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT to_json(p) FROM public.profiles p WHERE p.id = p_user_id;
  IF NOT FOUND THEN RETURN 'null'::json; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_profile_by_id TO anon, authenticated;

-- 3. get_client_broker_keys_raw — fetch broker keys for admin view
CREATE OR REPLACE FUNCTION public.get_client_broker_keys_raw(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT COALESCE(json_agg(b.* ORDER BY b.created_at DESC), '[]'::json) INTO result
  FROM (
    SELECT id, exchange_name, exchange_id, encrypted_api_key, encrypted_api_secret,
           encryption_iv, is_connected, created_at
    FROM public.broker_keys
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
  ) b;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_client_broker_keys_raw TO anon, authenticated;

-- 4. get_sub_admins — list sub-admins, optionally filtered by creator
CREATE OR REPLACE FUNCTION public.get_sub_admins(p_created_by uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF p_created_by IS NOT NULL THEN
    SELECT COALESCE(json_agg(p.* ORDER BY p.created_at DESC), '[]'::json) INTO result
    FROM public.profiles p
    WHERE p.role = 'sub_admin' AND p.parent_admin_id = p_created_by;
  ELSE
    SELECT COALESCE(json_agg(p.* ORDER BY p.created_at DESC), '[]'::json) INTO result
    FROM public.profiles p
    WHERE p.role = 'sub_admin';
  END IF;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_sub_admins TO anon, authenticated;

-- 5. admin_create_sub_admin — create profile + admin_roles entry
CREATE OR REPLACE FUNCTION public.admin_create_sub_admin(
  p_user_id uuid,
  p_email text,
  p_name text DEFAULT NULL,
  p_permissions jsonb DEFAULT '[]'::jsonb,
  p_license_quota integer DEFAULT 0,
  p_parent_admin_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET role = 'sub_admin',
      permissions = p_permissions,
      license_quota = p_license_quota,
      parent_admin_id = p_parent_admin_id
  WHERE id = p_user_id;

  INSERT INTO public.admin_roles (user_id, email, name, role, permissions, is_active, license_quota)
  VALUES (p_user_id, p_email, p_name, 'sub_admin', p_permissions, true, p_license_quota)
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    role = 'sub_admin',
    permissions = EXCLUDED.permissions,
    is_active = true,
    license_quota = EXCLUDED.license_quota;

  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_create_sub_admin TO anon, authenticated;

-- 6. admin_generate_license — full license creation flow
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
  p_parent_admin_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_existing profiles%ROWTYPE;
  v_license_rec record;
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

  -- 2. Deactivate existing active licenses for this user
  UPDATE public.licenses SET is_active = false
  WHERE user_id = v_user_id AND is_active = true;

  -- 3. Insert new license
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

  -- 4. Deduct quota from sub-admin if applicable
  IF p_parent_admin_id IS NOT NULL THEN
    UPDATE public.profiles
    SET license_quota = GREATEST(license_quota - 1, 0)
    WHERE id = p_parent_admin_id AND role = 'sub_admin';
  END IF;

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
GRANT EXECUTE ON FUNCTION public.admin_generate_license TO anon, authenticated;

-- 7. get_license_stats — aggregated license statistics
CREATE OR REPLACE FUNCTION public.get_license_stats(p_admin_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_sub_admin boolean;
  result json;
BEGIN
  SELECT role = 'sub_admin' INTO v_is_sub_admin FROM public.profiles WHERE id = p_admin_id;

  IF v_is_sub_admin THEN
    SELECT json_build_object(
      'total', count(*),
      'active', count(*) FILTER (WHERE is_active AND (valid_until IS NULL OR valid_until > now())),
      'expired', count(*) FILTER (WHERE valid_until IS NOT NULL AND valid_until <= now()),
      'custom', count(*) FILTER (WHERE plan_name = 'Custom Tailored')
    ) INTO result
    FROM public.licenses
    WHERE parent_admin_id = p_admin_id;
  ELSE
    SELECT json_build_object(
      'total', count(*),
      'active', count(*) FILTER (WHERE is_active AND (valid_until IS NULL OR valid_until > now())),
      'expired', count(*) FILTER (WHERE valid_until IS NOT NULL AND valid_until <= now()),
      'custom', count(*) FILTER (WHERE plan_name = 'Custom Tailored')
    ) INTO result
    FROM public.licenses;
  END IF;

  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_license_stats TO anon, authenticated;

-- 8. get_smart_board_templates — list all
CREATE OR REPLACE FUNCTION public.get_smart_board_templates()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT COALESCE(json_agg(t.* ORDER BY t.created_at DESC), '[]'::json) INTO result
  FROM public.smart_board_templates t;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_smart_board_templates TO anon, authenticated;

-- 9. create_smart_board_template
CREATE OR REPLACE FUNCTION public.create_smart_board_template(
  p_name text,
  p_strategy_type text,
  p_coin text,
  p_description text DEFAULT NULL,
  p_market_type text DEFAULT 'spot',
  p_leverage integer DEFAULT 1,
  p_take_profit_pct numeric DEFAULT NULL,
  p_stop_loss_pct numeric DEFAULT NULL,
  p_indicators text[] DEFAULT NULL,
  p_risk_level text DEFAULT 'Medium',
  p_max_trades_per_day integer DEFAULT 20,
  p_max_daily_loss numeric DEFAULT NULL,
  p_max_daily_profit numeric DEFAULT NULL,
  p_direction text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.smart_board_templates (
    name, description, strategy_type, coin, market_type, leverage,
    take_profit_pct, stop_loss_pct, indicators, risk_level,
    max_trades_per_day, max_daily_loss, max_daily_profit, direction,
    is_active, created_by
  ) VALUES (
    p_name, p_description, p_strategy_type, p_coin, p_market_type, p_leverage,
    p_take_profit_pct, p_stop_loss_pct, p_indicators, p_risk_level,
    p_max_trades_per_day, p_max_daily_loss, p_max_daily_profit, p_direction,
    true, p_created_by
  )
  RETURNING id INTO v_id;

  RETURN to_json(t) FROM public.smart_board_templates t WHERE t.id = v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_smart_board_template TO anon, authenticated;

-- 10. delete_smart_board_template
CREATE OR REPLACE FUNCTION public.delete_smart_board_template(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.smart_board_templates WHERE id = p_id;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_smart_board_template TO anon, authenticated;

-- 11. get_user_allotments — list allotments with board template join
CREATE OR REPLACE FUNCTION public.get_user_allotments(p_user_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT COALESCE(json_agg(json_build_object(
      'id', u.id, 'user_id', u.user_id, 'board_template_id', u.board_template_id,
      'is_active', u.is_active, 'allotted_by', u.allotted_by, 'created_at', u.created_at,
      'smart_board_templates', to_json(t)
    ) ORDER BY u.created_at DESC), '[]'::json) INTO result
    FROM public.user_board_licenses u
    LEFT JOIN public.smart_board_templates t ON t.id = u.board_template_id
    WHERE u.user_id = p_user_id;
  ELSE
    SELECT COALESCE(json_agg(json_build_object(
      'id', u.id, 'user_id', u.user_id, 'board_template_id', u.board_template_id,
      'is_active', u.is_active, 'allotted_by', u.allotted_by, 'created_at', u.created_at,
      'smart_board_templates', to_json(t)
    ) ORDER BY u.created_at DESC), '[]'::json) INTO result
    FROM public.user_board_licenses u
    LEFT JOIN public.smart_board_templates t ON t.id = u.board_template_id;
  END IF;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_allotments TO anon, authenticated;

-- 12. upsert_user_allotment — insert or reactivate
CREATE OR REPLACE FUNCTION public.upsert_user_allotment(
  p_user_id uuid,
  p_board_template_id uuid,
  p_allotted_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing user_board_licenses%ROWTYPE;
BEGIN
  SELECT * INTO v_existing FROM public.user_board_licenses
  WHERE user_id = p_user_id AND board_template_id = p_board_template_id LIMIT 1;

  IF FOUND THEN
    IF NOT v_existing.is_active THEN
      UPDATE public.user_board_licenses
      SET is_active = true, allotted_by = p_allotted_by
      WHERE id = v_existing.id;
    END IF;
    RETURN json_build_object('success', true, 'message', 'Board license already exists and is active.');
  ELSE
    INSERT INTO public.user_board_licenses (user_id, board_template_id, is_active, allotted_by)
    VALUES (p_user_id, p_board_template_id, true, p_allotted_by);
    RETURN json_build_object('success', true, 'message', 'Board allotted to user successfully.');
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_user_allotment TO anon, authenticated;

-- 13. bulk_upsert_user_allotments
CREATE OR REPLACE FUNCTION public.bulk_upsert_user_allotments(
  p_user_id uuid,
  p_board_template_ids uuid[],
  p_allotted_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing record;
  v_existing_ids uuid[] := '{}';
  v_to_insert uuid[] := '{}';
  v_to_reactivate uuid[] := '{}';
  v_board_id uuid;
BEGIN
  FOR v_existing IN
    SELECT id, board_template_id, is_active FROM public.user_board_licenses
    WHERE user_id = p_user_id AND board_template_id = ANY(p_board_template_ids)
  LOOP
    v_existing_ids := array_append(v_existing_ids, v_existing.board_template_id);
    IF NOT v_existing.is_active THEN
      v_to_reactivate := array_append(v_to_reactivate, v_existing.id);
    END IF;
  END LOOP;

  FOREACH v_board_id IN ARRAY p_board_template_ids LOOP
    IF NOT v_board_id = ANY(v_existing_ids) THEN
      v_to_insert := array_append(v_to_insert, v_board_id);
    END IF;
  END LOOP;

  IF array_length(v_to_insert, 1) > 0 THEN
    INSERT INTO public.user_board_licenses (user_id, board_template_id, is_active, allotted_by)
    SELECT p_user_id, id, true, p_allotted_by
    FROM public.smart_board_templates
    WHERE id = ANY(v_to_insert);
  END IF;

  IF array_length(v_to_reactivate, 1) > 0 THEN
    UPDATE public.user_board_licenses
    SET is_active = true, allotted_by = p_allotted_by
    WHERE id = ANY(v_to_reactivate);
  END IF;

  RETURN json_build_object(
    'inserted', COALESCE(array_length(v_to_insert, 1), 0),
    'reactivated', COALESCE(array_length(v_to_reactivate, 1), 0),
    'assigned_count', COALESCE(array_length(v_to_insert, 1), 0) + COALESCE(array_length(v_to_reactivate, 1), 0)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_user_allotments TO anon, authenticated;

-- 14. delete_user_allotment
CREATE OR REPLACE FUNCTION public.delete_user_allotment(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_board_licenses WHERE id = p_id;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_user_allotment TO anon, authenticated;

-- 15. get_user_assigned_boards — universal + custom boards for a user
CREATE OR REPLACE FUNCTION public.get_user_assigned_boards(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  universal json;
  custom json;
BEGIN
  SELECT COALESCE(json_agg(json_build_object(
    'id', t.id, 'name', t.name, 'description', t.description,
    'strategy_type', t.strategy_type, 'coin', t.coin,
    'market_type', t.market_type, 'leverage', t.leverage,
    'take_profit_pct', t.take_profit_pct, 'stop_loss_pct', t.stop_loss_pct,
    'indicators', t.indicators, 'risk_level', t.risk_level,
    'max_trades_per_day', t.max_trades_per_day, 'max_daily_loss', t.max_daily_loss,
    'max_daily_profit', t.max_daily_profit, 'direction', t.direction,
    'is_active', t.is_active, 'is_universal_default', t.is_universal_default,
    'license_id', 'universal_' || t.id::text
  )), '[]'::json) INTO universal
  FROM public.smart_board_templates t
  WHERE t.is_universal_default = true AND t.is_active = true;

  SELECT COALESCE(json_agg(json_build_object(
    'id', t.id, 'name', t.name, 'description', t.description,
    'strategy_type', t.strategy_type, 'coin', t.coin,
    'market_type', t.market_type, 'leverage', t.leverage,
    'take_profit_pct', t.take_profit_pct, 'stop_loss_pct', t.stop_loss_pct,
    'indicators', t.indicators, 'risk_level', t.risk_level,
    'max_trades_per_day', t.max_trades_per_day, 'max_daily_loss', t.max_daily_loss,
    'max_daily_profit', t.max_daily_profit, 'direction', t.direction,
    'is_active', t.is_active, 'is_universal_default', t.is_universal_default,
    'license_id', u.id
  )), '[]'::json) INTO custom
  FROM public.user_board_licenses u
  JOIN public.smart_board_templates t ON t.id = u.board_template_id
  WHERE u.user_id = p_user_id
    AND u.is_active = true
    AND t.is_active = true
    AND t.is_universal_default = false;

  RETURN universal || custom;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_assigned_boards TO anon, authenticated;

-- 16. get_expiring_licenses — licenses expiring within N days
CREATE OR REPLACE FUNCTION public.get_expiring_licenses(p_days integer DEFAULT 3)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT COALESCE(json_agg(json_build_object(
    'id', l.id, 'user_id', l.user_id, 'plan_name', l.plan_name,
    'valid_until', l.valid_until, 'is_active', l.is_active,
    'profiles', CASE WHEN p.id IS NOT NULL THEN json_build_object(
      'id', p.id, 'email', p.email, 'full_name', p.full_name, 'mobile_number', p.mobile_number
    ) ELSE 'null'::json END
  )), '[]'::json) INTO result
  FROM public.licenses l
  LEFT JOIN public.profiles p ON p.id = l.user_id
  WHERE l.is_active = true
    AND l.valid_until >= now()
    AND l.valid_until <= now() + (p_days || ' days')::interval;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_expiring_licenses TO anon, authenticated;

-- 17. get_broadcast_recipients — clients for broadcast
CREATE OR REPLACE FUNCTION public.get_broadcast_recipients(
  p_admin_id uuid,
  p_target text DEFAULT 'all'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_sub_admin boolean;
  result json;
BEGIN
  SELECT role = 'sub_admin' INTO v_is_sub_admin FROM public.profiles WHERE id = p_admin_id;

  IF p_target = 'all' THEN
    IF v_is_sub_admin THEN
      SELECT COALESCE(json_agg(json_build_object(
        'id', p.id, 'email', p.email, 'name', COALESCE(p.full_name, ''), 'phone', COALESCE(p.mobile_number, '')
      )), '[]'::json) INTO result
      FROM public.profiles p
      WHERE p.role = 'client' AND p.parent_admin_id = p_admin_id;
    ELSE
      SELECT COALESCE(json_agg(json_build_object(
        'id', p.id, 'email', p.email, 'name', COALESCE(p.full_name, ''), 'phone', COALESCE(p.mobile_number, '')
      )), '[]'::json) INTO result
      FROM public.profiles p WHERE p.role = 'client';
    END IF;
  ELSIF p_target = 'active' THEN
    IF v_is_sub_admin THEN
      SELECT COALESCE(json_agg(json_build_object(
        'id', p.id, 'email', p.email, 'name', COALESCE(p.full_name, ''), 'phone', COALESCE(p.mobile_number, '')
      )), '[]'::json) INTO result
      FROM public.profiles p
      JOIN public.licenses l ON l.user_id = p.id
      WHERE p.role = 'client' AND p.parent_admin_id = p_admin_id
        AND l.is_active = true AND (l.valid_until IS NULL OR l.valid_until > now());
    ELSE
      SELECT COALESCE(json_agg(DISTINCT json_build_object(
        'id', p.id, 'email', p.email, 'name', COALESCE(p.full_name, ''), 'phone', COALESCE(p.mobile_number, '')
      )), '[]'::json) INTO result
      FROM public.profiles p
      JOIN public.licenses l ON l.user_id = p.id
      WHERE p.role = 'client'
        AND l.is_active = true AND (l.valid_until IS NULL OR l.valid_until > now());
    END IF;
  ELSIF p_target = 'expired' THEN
    IF v_is_sub_admin THEN
      SELECT COALESCE(json_agg(json_build_object(
        'id', p.id, 'email', p.email, 'name', COALESCE(p.full_name, ''), 'phone', COALESCE(p.mobile_number, '')
      )), '[]'::json) INTO result
      FROM public.profiles p
      WHERE p.role = 'client' AND p.parent_admin_id = p_admin_id
        AND NOT EXISTS (
          SELECT 1 FROM public.licenses l
          WHERE l.user_id = p.id AND l.is_active = true
            AND (l.valid_until IS NULL OR l.valid_until > now())
        );
    ELSE
      SELECT COALESCE(json_agg(json_build_object(
        'id', p.id, 'email', p.email, 'name', COALESCE(p.full_name, ''), 'phone', COALESCE(p.mobile_number, '')
      )), '[]'::json) INTO result
      FROM public.profiles p
      WHERE p.role = 'client'
        AND NOT EXISTS (
          SELECT 1 FROM public.licenses l
          WHERE l.user_id = p.id AND l.is_active = true
            AND (l.valid_until IS NULL OR l.valid_until > now())
        );
    END IF;
  ELSE
    result := '[]'::json;
  END IF;

  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_broadcast_recipients TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
