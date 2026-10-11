/*
# Fix Sub-Admin Creation: Missing Unique Constraint + Profile Auto-Insert

## Summary
Sub-admin creation was silently failing for two reasons:
1. `admin_roles.user_id` had no UNIQUE constraint, so the `ON CONFLICT (user_id)`
   clause in `admin_create_sub_admin` raised a Postgres error, aborting the insert.
2. New auth users created via `admin.auth.admin.createUser()` had no matching
   `profiles` row. The RPC's `UPDATE profiles WHERE id = p_user_id` affected 0 rows,
   and then the INSERT into admin_roles failed on the conflict clause.

## Changes
1. Add UNIQUE constraint on `admin_roles.user_id`
2. Rewrite `admin_create_sub_admin` to INSERT-OR-UPDATE the profile (not just UPDATE)
3. Create a trigger `on_auth_user_created` on `auth.users` that auto-inserts a
   `profiles` row with `role='client'` whenever a new auth user is created
4. NOTIFY pgrst to reload schema
*/

-- 1. Add unique constraint on admin_roles.user_id (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_roles_user_id_key'
    AND conrelid = 'public.admin_roles'::regclass
  ) THEN
    ALTER TABLE public.admin_roles ADD CONSTRAINT admin_roles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- 2. Create function to auto-insert a profile row when a new auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    'client',
    'active'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 3. Create the trigger on auth.users (idempotent — drop if exists first)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- 4. Rewrite admin_create_sub_admin to INSERT profile if missing, then upsert admin_roles
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
  -- Insert profile row if it doesn't exist yet (trigger may not have fired for older users)
  INSERT INTO public.profiles (id, email, role, status, permissions, license_quota, parent_admin_id, quota_ledger)
  VALUES (
    p_user_id,
    p_email,
    'sub_admin',
    'active',
    p_permissions,
    p_license_quota,
    p_parent_admin_id,
    p_quota_ledger
  )
  ON CONFLICT (id) DO UPDATE SET
    role = 'sub_admin',
    permissions = p_permissions,
    license_quota = p_license_quota,
    parent_admin_id = p_parent_admin_id,
    quota_ledger = p_quota_ledger;

  -- Upsert admin_roles (now works because user_id has a UNIQUE constraint)
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

NOTIFY pgrst, 'reload schema';
