-- update_client_license — update license fields for a user's active license
CREATE OR REPLACE FUNCTION public.update_client_license(
  p_user_id uuid,
  p_valid_until text DEFAULT NULL,
  p_bot_limit integer DEFAULT NULL,
  p_plan_name text DEFAULT NULL,
  p_monthly_fee numeric DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.licenses SET
    valid_until = COALESCE(p_valid_until, valid_until),
    bot_limit = COALESCE(p_bot_limit, bot_limit),
    plan_name = COALESCE(p_plan_name, plan_name),
    monthly_fee = COALESCE(p_monthly_fee, monthly_fee)
  WHERE user_id = p_user_id AND is_active = true;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_client_license TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
