CREATE OR REPLACE FUNCTION public.get_profile_by_id(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result json;
BEGIN
  SELECT to_json(p) INTO result
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF result IS NULL THEN
    RETURN 'null'::json;
  END IF;

  RETURN result;
END;
$$;