-- ─── Frontend-facing RPCs for Admin Panel ────────────────────────────────────
-- These functions replace direct supabase.from() calls in the frontend that
-- fail silently due to RLS. They are SECURITY DEFINER so the anon-key client
-- can call them.

-- 1. get_all_licenses — list all licenses ordered by created_at desc
CREATE OR REPLACE FUNCTION public.get_all_licenses()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT COALESCE(json_agg(l.* ORDER BY l.created_at DESC), '[]'::json) INTO result
  FROM public.licenses l;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_all_licenses TO anon, authenticated;

-- 2. toggle_license_active — toggle is_active on a license
CREATE OR REPLACE FUNCTION public.toggle_license_active(p_license_id uuid, p_is_active boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.licenses SET is_active = p_is_active WHERE id = p_license_id;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.toggle_license_active TO anon, authenticated;

-- 3. get_all_admin_roles — list all admin_roles
CREATE OR REPLACE FUNCTION public.get_all_admin_roles()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT COALESCE(json_agg(a.* ORDER BY a.created_at DESC), '[]'::json) INTO result
  FROM public.admin_roles a;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_all_admin_roles TO anon, authenticated;

-- 4. get_admin_activity_logs — list activity logs
CREATE OR REPLACE FUNCTION public.get_admin_activity_logs(p_limit integer DEFAULT 50)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT COALESCE(json_agg(l.* ORDER BY l.created_at DESC), '[]'::json) INTO result
  FROM (
    SELECT * FROM public.admin_activity_log ORDER BY created_at DESC LIMIT p_limit
  ) l;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_admin_activity_logs TO anon, authenticated;

-- 5. insert_admin_activity_log — insert an activity log entry
CREATE OR REPLACE FUNCTION public.insert_admin_activity_log(
  p_admin_email text,
  p_admin_name text,
  p_action_type text,
  p_message text,
  p_severity text DEFAULT 'info'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_activity_log (admin_email, admin_name, action_type, message, severity)
  VALUES (p_admin_email, p_admin_name, p_action_type, p_message, p_severity);
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.insert_admin_activity_log TO anon, authenticated;

-- 6. delete_admin_role — delete an admin role entry
CREATE OR REPLACE FUNCTION public.delete_admin_role(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.admin_roles WHERE id = p_id;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_admin_role TO anon, authenticated;

-- 7. toggle_admin_role_active — toggle is_active on an admin role
CREATE OR REPLACE FUNCTION public.toggle_admin_role_active(p_id uuid, p_is_active boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.admin_roles SET is_active = p_is_active WHERE id = p_id;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.toggle_admin_role_active TO anon, authenticated;

-- 8. get_all_client_profiles — list all profiles for dropdowns
CREATE OR REPLACE FUNCTION public.get_all_client_profiles()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT COALESCE(json_agg(json_build_object('id', p.id, 'email', p.email) ORDER BY p.email), '[]'::json) INTO result
  FROM public.profiles p;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_all_client_profiles TO anon, authenticated;

-- 9. insert_client_update — insert a client_update notification
CREATE OR REPLACE FUNCTION public.insert_client_update(
  p_client_id uuid,
  p_update_type text,
  p_title text,
  p_message text,
  p_severity text DEFAULT 'info',
  p_executed_by text DEFAULT 'Master Admin'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.client_updates (client_id, update_type, title, message, severity, executed_by)
  VALUES (p_client_id, p_update_type, p_title, p_message, p_severity, p_executed_by);
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.insert_client_update TO anon, authenticated;

-- 10. update_client_status — update a client's status (ban/suspend/activate)
CREATE OR REPLACE FUNCTION public.update_client_status(p_client_id uuid, p_status text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET status = p_status WHERE id = p_client_id;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_client_status TO anon, authenticated;

-- 11. disconnect_broker_key — set is_connected=false on a broker key
CREATE OR REPLACE FUNCTION public.disconnect_broker_key(p_key_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.broker_keys SET is_connected = false WHERE id = p_key_id;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.disconnect_broker_key TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
