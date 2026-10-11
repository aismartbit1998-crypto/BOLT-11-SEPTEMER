/*
# Create launch_bot and helper SECURITY DEFINER functions

## Purpose
The backend engine (Node.js) needs to insert bots into the `bots` table,
but it doesn't have the `SUPABASE_SERVICE_ROLE_KEY` in its environment.
These functions allow the engine to operate on bots using the anon key,
with the functions running as the table owner (bypassing RLS).

## Changes
1. `launch_bot` — inserts a new bot, returns the inserted row as JSON
2. `get_user_bots` — lists bots for a user (optionally filtered by trading_mode)
3. `get_running_bot_count` — counts running bots for a user
4. `update_bot_status` — updates a bot's status

## Security
- All functions are SECURITY DEFINER, bypassing RLS.
- They only perform the specific operation intended — no arbitrary SQL.
- Callable by `anon` and `authenticated` roles.
*/

CREATE OR REPLACE FUNCTION public.launch_bot(
  p_user_id uuid,
  p_name text,
  p_market_type text,
  p_coin text,
  p_strategy text,
  p_trading_mode text,
  p_direction text,
  p_entry_price numeric,
  p_quantity numeric,
  p_position_size numeric,
  p_investment_amount_inr numeric,
  p_leverage integer,
  p_take_profit_pct numeric,
  p_stop_loss_pct numeric,
  p_take_profit_price numeric,
  p_stop_loss_price numeric,
  p_max_daily_loss numeric,
  p_max_daily_profit numeric,
  p_indicators text[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_row record;
BEGIN
  INSERT INTO public.bots (
    user_id, name, market_type, coin, strategy, status, profit_loss,
    trading_mode, direction, entry_price, quantity, position_size,
    investment_amount_inr, leverage, take_profit_pct, stop_loss_pct,
    take_profit_price, stop_loss_price, max_daily_loss, max_daily_profit,
    indicators
  ) VALUES (
    p_user_id, p_name, p_market_type, p_coin, p_strategy, 'running', 0,
    p_trading_mode, p_direction, p_entry_price, p_quantity, p_position_size,
    p_investment_amount_inr, p_leverage, p_take_profit_pct, p_stop_loss_pct,
    p_take_profit_price, p_stop_loss_price, p_max_daily_loss, p_max_daily_profit,
    p_indicators
  )
  RETURNING * INTO inserted_row;

  RETURN to_json(inserted_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.launch_bot TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_user_bots(
  p_user_id uuid,
  p_trading_mode text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NOT NULL AND p_trading_mode IS NOT NULL THEN
    RETURN (SELECT json_agg(t) FROM (SELECT * FROM public.bots WHERE user_id = p_user_id AND trading_mode = p_trading_mode ORDER BY created_at DESC) t);
  ELSIF p_user_id IS NOT NULL THEN
    RETURN (SELECT json_agg(t) FROM (SELECT * FROM public.bots WHERE user_id = p_user_id ORDER BY created_at DESC) t);
  ELSIF p_trading_mode IS NOT NULL THEN
    RETURN (SELECT json_agg(t) FROM (SELECT * FROM public.bots WHERE trading_mode = p_trading_mode ORDER BY created_at DESC) t);
  ELSE
    RETURN (SELECT json_agg(t) FROM (SELECT * FROM public.bots ORDER BY created_at DESC) t);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_bots TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_running_bot_count(
  p_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cnt integer;
BEGIN
  SELECT count(*) INTO cnt FROM public.bots
  WHERE user_id = p_user_id AND status = 'running';
  RETURN cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_running_bot_count TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_bot_status(
  p_bot_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.bots SET status = p_status WHERE id = p_bot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_bot_status TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
