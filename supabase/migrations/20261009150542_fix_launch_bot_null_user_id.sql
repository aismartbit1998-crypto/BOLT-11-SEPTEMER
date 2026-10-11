/*
# Fix launch_bot function to handle null user_id

The `bots.user_id` column is NOT NULL with DEFAULT auth.uid().
When called from the engine with the anon key, auth.uid() is null,
so we need to pass a real user_id. When user_id is provided, use it
directly. The function now uses COALESCE to fall back to auth.uid()
when p_user_id is null.
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
  v_user_id uuid;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

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
