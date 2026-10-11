-- Auth reset: drop old trigger, functions, and tables
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_auth_user() CASCADE;
DROP FUNCTION IF EXISTS public.get_profile_by_id(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_create_sub_admin(uuid, text, text, jsonb, integer, uuid, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.deduct_sub_admin_quota(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_sub_admin_quota(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_generate_license(text, text, text, text, text, integer, numeric, text, text[], uuid, text) CASCADE;
DROP TABLE IF EXISTS public.admin_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Recreate profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'client' CHECK (role IN ('master_admin', 'sub_admin', 'client')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  parent_admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  license_quota integer NOT NULL DEFAULT 0,
  quota_ledger jsonb NOT NULL DEFAULT '{}'::jsonb,
  country text,
  disclaimer_accepted boolean NOT NULL DEFAULT false,
  disclaimer_accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_profile" ON public.profiles;
CREATE POLICY "select_own_profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
CREATE POLICY "update_own_profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Recreate admin_roles
CREATE TABLE public.admin_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  role text NOT NULL CHECK (role IN ('master_admin', 'sub_admin')),
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  license_quota integer NOT NULL DEFAULT 0,
  quota_ledger jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_login timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_admin_role" ON public.admin_roles;
CREATE POLICY "select_own_admin_role" ON public.admin_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_admin_roles_role ON public.admin_roles(role);

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, status)
  VALUES (NEW.id, NEW.email, 'client', 'active')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- get_profile_by_id
CREATE OR REPLACE FUNCTION public.get_profile_by_id(p_user_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE result json;
BEGIN
  SELECT to_json(p) INTO result FROM public.profiles p WHERE p.id = p_user_id;
  IF result IS NULL THEN RETURN 'null'::json; END IF;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_profile_by_id TO authenticated;

-- initialize_master_admin
CREATE OR REPLACE FUNCTION public.initialize_master_admin(p_display_name text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_existing_admin_count integer;
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'User not found in auth.users'; END IF;
  INSERT INTO public.profiles (id, email, role, status)
  VALUES (v_user_id, v_email, 'master_admin', 'active')
  ON CONFLICT (id) DO UPDATE SET role = 'master_admin', status = 'active';
  SELECT COUNT(*) INTO v_existing_admin_count FROM public.admin_roles WHERE role = 'master_admin' AND is_active = true;
  INSERT INTO public.admin_roles (user_id, email, name, role, permissions, is_active)
  VALUES (v_user_id, v_email, COALESCE(p_display_name, split_part(v_email, '@', 1)), 'master_admin', '{"all": true}'::jsonb, true)
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email, name = COALESCE(EXCLUDED.name, admin_roles.name),
    role = 'master_admin', permissions = '{"all": true}'::jsonb, is_active = true;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  RETURN json_build_object('success', true, 'profile', to_json(v_profile), 'is_first_master', v_existing_admin_count = 0);
END;
$$;
GRANT EXECUTE ON FUNCTION public.initialize_master_admin TO authenticated;

-- admin_create_sub_admin
CREATE OR REPLACE FUNCTION public.admin_create_sub_admin(
  p_user_id uuid, p_email text, p_name text DEFAULT NULL,
  p_permissions jsonb DEFAULT '[]'::jsonb, p_license_quota integer DEFAULT 0,
  p_parent_admin_id uuid DEFAULT NULL, p_quota_ledger jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, status, permissions, license_quota, parent_admin_id, quota_ledger)
  VALUES (p_user_id, p_email, 'sub_admin', 'active', p_permissions, p_license_quota, p_parent_admin_id, p_quota_ledger)
  ON CONFLICT (id) DO UPDATE SET
    role = 'sub_admin', permissions = p_permissions, license_quota = p_license_quota,
    parent_admin_id = p_parent_admin_id, quota_ledger = p_quota_ledger;
  INSERT INTO public.admin_roles (user_id, email, name, role, permissions, is_active, license_quota, quota_ledger)
  VALUES (p_user_id, p_email, p_name, 'sub_admin', p_permissions, true, p_license_quota, p_quota_ledger)
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email, name = EXCLUDED.name, role = 'sub_admin',
    permissions = EXCLUDED.permissions, is_active = true,
    license_quota = EXCLUDED.license_quota, quota_ledger = EXCLUDED.quota_ledger;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_create_sub_admin TO authenticated;

NOTIFY pgrst, 'reload schema';