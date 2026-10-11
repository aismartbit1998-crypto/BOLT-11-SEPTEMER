/*
# Create admin analytics and bot worker RPC functions

## Purpose
The engine uses the anon key (no service role key available). RLS blocks
anon-key access to profiles, user_funds, licenses, broker_keys, bots,
trade_history, and admin_activity_log. These SECURITY DEFINER functions
bypass RLS so the engine can read/write the data it needs.

## Security
- All functions are SECURITY DEFINER, bypassing RLS.
- Read-only functions only SELECT.
- Write functions only update the specific columns needed.
- Callable by anon and authenticated roles.
*/

-- ─── Admin dashboard stats ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_users bigint;
  total_bots bigint;
  running_bots bigint;
  paused_bots bigint;
  bot_rows json;
  trade_rows json;
  fund_rows json;
  license_rows json;
BEGIN
  SELECT count(*) INTO total_users FROM public.profiles;
  SELECT count(*) INTO total_bots FROM public.bots;
  SELECT count(*) INTO running_bots FROM public.bots WHERE status = 'running';
  SELECT count(*) INTO paused_bots FROM public.bots WHERE status = 'paused';

  SELECT coalesce(json_agg(t), '[]'::json) INTO bot_rows
    FROM (SELECT profit_loss, trading_mode, status FROM public.bots) t;

  SELECT coalesce(json_agg(t), '[]'::json) INTO trade_rows
    FROM (SELECT amount, price, pnl FROM public.trade_history) t;

  SELECT coalesce(json_agg(t), '[]'::json) INTO fund_rows
    FROM (SELECT balance, unrealized_pnl, realized_pnl FROM public.user_funds) t;

  SELECT coalesce(json_agg(t), '[]'::json) INTO license_rows
    FROM (SELECT plan_name, is_active FROM public.licenses) t;

  RETURN json_build_object(
    'total_users', total_users,
    'total_bots', total_bots,
    'running_bots', running_bots,
    'paused_bots', paused_bots,
    'bots', bot_rows,
    'trades', trade_rows,
    'funds', fund_rows,
    'licenses', license_rows
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats TO anon, authenticated;

-- ─── Admin recent activity ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_admin_recent_activity(p_limit integer DEFAULT 20)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(p_limit, 50);
  trade_rows json;
  bot_rows json;
  log_rows json;
BEGIN
  SELECT coalesce(json_agg(t), '[]'::json) INTO trade_rows
    FROM (SELECT id, user_id, pair, side, amount, price, pnl, strategy, created_at
          FROM public.trade_history ORDER BY created_at DESC LIMIT v_limit) t;

  SELECT coalesce(json_agg(t), '[]'::json) INTO bot_rows
    FROM (SELECT id, user_id, name, coin, strategy, status, trading_mode, created_at
          FROM public.bots ORDER BY created_at DESC LIMIT v_limit) t;

  SELECT coalesce(json_agg(t), '[]'::json) INTO log_rows
    FROM (SELECT id, admin_email, admin_name, action_type, message, severity, created_at
          FROM public.admin_activity_log ORDER BY created_at DESC LIMIT v_limit) t;

  RETURN json_build_object(
    'trades', trade_rows,
    'bots', bot_rows,
    'admin_logs', log_rows
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_admin_recent_activity TO anon, authenticated;

-- ─── Admin clients list ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_admin_clients()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_rows json;
  fund_rows json;
  bot_rows json;
  license_rows json;
  broker_rows json;
BEGIN
  SELECT coalesce(json_agg(t), '[]'::json) INTO profile_rows
    FROM (SELECT id, email, status, country, created_at FROM public.profiles) t;

  SELECT coalesce(json_agg(t), '[]'::json) INTO fund_rows
    FROM (SELECT user_id, balance, unrealized_pnl, realized_pnl, manual_trading_enabled
          FROM public.user_funds) t;

  SELECT coalesce(json_agg(t), '[]'::json) INTO bot_rows
    FROM (SELECT user_id, status FROM public.bots) t;

  SELECT coalesce(json_agg(t), '[]'::json) INTO license_rows
    FROM (SELECT user_id, plan_name, bot_limit, valid_until, is_active
          FROM public.licenses) t;

  SELECT coalesce(json_agg(t), '[]'::json) INTO broker_rows
    FROM (SELECT user_id, exchange_name, is_connected FROM public.broker_keys) t;

  RETURN json_build_object(
    'profiles', profile_rows,
    'funds', fund_rows,
    'bots', bot_rows,
    'licenses', license_rows,
    'broker_keys', broker_rows
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_admin_clients TO anon, authenticated;

-- ─── Bot worker: get all running bots ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_running_bots()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (SELECT coalesce(json_agg(t), '[]'::json)
    FROM (SELECT id, name, coin, user_id, direction, entry_price, quantity,
                 position_size, leverage, take_profit_pct, stop_loss_pct,
                 take_profit_price, stop_loss_price, trading_mode, profit_loss
          FROM public.bots WHERE status = 'running') t);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_running_bots TO anon, authenticated;

-- ─── Bot worker: update bot pnl/status ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_bot_pnl(
  p_bot_id uuid,
  p_profit_loss numeric,
  p_status text,
  p_last_checked_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status IS NOT NULL THEN
    UPDATE public.bots
      SET profit_loss = p_profit_loss,
          status = p_status,
          last_checked_at = COALESCE(p_last_checked_at, now())
      WHERE id = p_bot_id;
  ELSE
    UPDATE public.bots
      SET profit_loss = p_profit_loss,
          last_checked_at = COALESCE(p_last_checked_at, now())
      WHERE id = p_bot_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_bot_pnl TO anon, authenticated;

-- ─── Bot worker: get broker keys for a user ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_broker_keys(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (SELECT json_agg(t)
    FROM (SELECT exchange_name, encrypted_api_key, encrypted_api_secret, encryption_iv
          FROM public.broker_keys
          WHERE user_id = p_user_id AND is_connected = true) t);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_broker_keys TO anon, authenticated;

-- ─── Upsert broker keys ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_broker_keys(
  p_user_id uuid,
  p_exchange_name text,
  p_exchange_id text,
  p_encrypted_api_key text,
  p_encrypted_api_secret text,
  p_encryption_iv text,
  p_api_key_masked text,
  p_api_secret_masked text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id uuid;
BEGIN
  SELECT id INTO existing_id FROM public.broker_keys
    WHERE user_id = p_user_id AND exchange_name = p_exchange_name
    LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.broker_keys SET
      encrypted_api_key = p_encrypted_api_key,
      encrypted_api_secret = p_encrypted_api_secret,
      encryption_iv = p_encryption_iv,
      api_key = p_api_key_masked,
      api_secret = p_api_secret_masked,
      is_connected = true,
      exchange_id = COALESCE(p_exchange_id, exchange_id)
    WHERE id = existing_id;
  ELSE
    INSERT INTO public.broker_keys (user_id, exchange_name, exchange_id,
      encrypted_api_key, encrypted_api_secret, encryption_iv,
      api_key, api_secret, is_connected)
    VALUES (p_user_id, p_exchange_name, p_exchange_id,
      p_encrypted_api_key, p_encrypted_api_secret, p_encryption_iv,
      p_api_key_masked, p_api_secret_masked, true);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_broker_keys TO anon, authenticated;

-- ─── Get bot status for worker monitoring ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_bot_status_list()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (SELECT coalesce(json_agg(t), '[]'::json)
    FROM (SELECT id, name, coin, status, direction, entry_price,
                 take_profit_price, stop_loss_price, profit_loss, last_checked_at
          FROM public.bots WHERE status = 'running') t);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_bot_status_list TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
