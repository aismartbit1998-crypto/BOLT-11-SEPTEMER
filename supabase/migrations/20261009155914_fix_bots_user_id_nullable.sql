/*
# Fix bots.user_id to allow null (demo/paper trading without login)

## Problem
bots.user_id is NOT NULL with FK to auth.users(id).
When the engine calls launch_bot with the anon key, auth.uid() is null.
If the user isn't logged in, user_id is null → RAISE EXCEPTION.
Even if user_id is provided but not in auth.users → FK violation.

## Fix
- Drop the FK constraint (users can trade in paper mode without auth)
- Make user_id nullable
- Update launch_bot to not require user_id
*/

ALTER TABLE public.bots DROP CONSTRAINT IF EXISTS bots_user_id_fkey;
ALTER TABLE public.bots ALTER COLUMN user_id DROP NOT NULL;

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
  v_user_id uuid;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());

  INSERT INTO public.bots (
    user_id, name, market_type, coin, strategy, status, profit_loss,
    trading_mode, direction, entry_price, quantity, position_size,
    investment_amount_inr, leverage, take_profit_pct, stop_loss_pct,
    take_profit_price, stop_loss_price, max_daily_loss, max_daily_profit,
    indicators
  ) VALUES (
    v_user_id, p_name, p_market_type, p_coin, p_strategy, 'running', 0,
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

NOTIFY pgrst, 'reload schema';
