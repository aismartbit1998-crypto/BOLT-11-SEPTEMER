/*
# Create admin write RPC functions

## Purpose
Admin endpoints in the engine use the anon key, but RLS blocks access
to profiles, licenses, client_updates, trades, and admin_activity_log.
These SECURITY DEFINER functions bypass RLS for admin operations.
*/

-- ─── Update client profile + license ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_update_client(
  p_client_id uuid,
  p_country text,
  p_status text,
  p_plan_name text,
  p_valid_until text,
  p_bot_limit integer,
  p_update_title text,
  p_update_message text,
  p_update_type text,
  p_severity text,
  p_executed_by text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_license_id uuid;
BEGIN
  IF p_country IS NOT NULL THEN
    UPDATE public.profiles SET country = p_country WHERE id = p_client_id;
  END IF;
  IF p_status IS NOT NULL THEN
    UPDATE public.profiles SET status = p_status WHERE id = p_client_id;
  END IF;

  IF p_plan_name IS NOT NULL OR p_valid_until IS NOT NULL OR p_bot_limit IS NOT NULL THEN
    SELECT id INTO v_license_id FROM public.licenses WHERE user_id = p_client_id LIMIT 1;

    IF v_license_id IS NOT NULL THEN
      UPDATE public.licenses SET
        plan_name = COALESCE(p_plan_name, plan_name),
        valid_until = COALESCE(p_valid_until, valid_until),
        bot_limit = COALESCE(p_bot_limit, bot_limit)
      WHERE id = v_license_id;
    ELSE
      INSERT INTO public.licenses (user_id, plan_name, bot_limit, valid_from, valid_until, monthly_fee, is_active)
      VALUES (p_client_id, COALESCE(p_plan_name, 'Starter'), COALESCE(p_bot_limit, 2),
              now(), COALESCE(p_valid_until, (now() + interval '30 days')::text),
              CASE WHEN COALESCE(p_plan_name, 'Starter') = 'Pro' THEN 99 WHEN COALESCE(p_plan_name, 'Starter') = 'Enterprise' THEN 499 ELSE 29 END,
              true);
    END IF;
  END IF;

  IF p_update_message IS NOT NULL THEN
    INSERT INTO public.client_updates (client_id, update_type, title, message, severity, executed_by)
    VALUES (p_client_id, COALESCE(p_update_type, 'status_change'), COALESCE(p_update_title, p_update_message), p_update_message, COALESCE(p_severity, 'info'), COALESCE(p_executed_by, 'Master Admin'));
  END IF;

  RETURN 'ok';
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_update_client TO anon, authenticated;

-- ─── Admin execute trade ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_execute_trade(
  p_client_id uuid,
  p_client_name text,
  p_coin text,
  p_market_type text,
  p_direction text,
  p_entry_price numeric,
  p_amount numeric,
  p_quantity numeric,
  p_leverage integer,
  p_position_size numeric,
  p_tp_pct numeric,
  p_sl_pct numeric,
  p_executed_by text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_row record;
BEGIN
  INSERT INTO public.trades (
    client_id, client_name, coin, market_type, direction,
    entry_price, amount, quantity, leverage, position_size,
    tp_pct, sl_pct, status, executed_by
  ) VALUES (
    p_client_id, p_client_name, p_coin, p_market_type, p_direction,
    p_entry_price, p_amount, p_quantity, p_leverage, p_position_size,
    p_tp_pct, p_sl_pct, 'open', p_executed_by
  )
  RETURNING * INTO inserted_row;

  INSERT INTO public.client_updates (client_id, update_type, title, message, severity, executed_by)
  VALUES (p_client_id, 'risk_action', 'Trade Executed by Admin',
          p_executed_by || ' opened a ' || p_direction || ' ' || p_coin || ' trade on your behalf — ' || p_quantity::text || ' @ ' || p_entry_price::text,
          'info', p_executed_by);

  RETURN to_json(inserted_row);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_execute_trade TO anon, authenticated;

-- ─── Admin insert client_update ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_insert_client_update(
  p_client_id uuid,
  p_update_type text,
  p_title text,
  p_message text,
  p_severity text,
  p_executed_by text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.client_updates (client_id, update_type, title, message, severity, executed_by)
  VALUES (p_client_id, p_update_type, p_title, p_message, COALESCE(p_severity, 'info'), COALESCE(p_executed_by, 'Master Admin'));
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_insert_client_update TO anon, authenticated;

-- ─── Admin insert admin_activity_log ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_insert_activity_log(
  p_admin_email text,
  p_admin_name text,
  p_action_type text,
  p_message text,
  p_severity text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_activity_log (admin_email, admin_name, action_type, message, severity)
  VALUES (p_admin_email, p_admin_name, p_action_type, p_message, COALESCE(p_severity, 'info'));
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_insert_activity_log TO anon, authenticated;

-- ─── Admin ban client ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_ban_client(
  p_client_id uuid,
  p_executed_by text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET status = 'banned' WHERE id = p_client_id;
  INSERT INTO public.client_updates (client_id, update_type, title, message, severity, executed_by)
  VALUES (p_client_id, 'status_change', 'Account Banned',
          'Your account has been banned by administration. Please contact support if you believe this is an error.',
          'critical', COALESCE(p_executed_by, 'Master Admin'));
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_ban_client TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
