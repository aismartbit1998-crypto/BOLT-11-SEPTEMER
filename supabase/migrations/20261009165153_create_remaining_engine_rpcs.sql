-- Remaining RPCs to eliminate all direct table access in engine

-- get_risk_settings — read global risk config
CREATE OR REPLACE FUNCTION public.get_risk_settings()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT COALESCE(json_agg(r), '[]'::json) INTO result
  FROM (
    SELECT global_kill_switch, auto_disable_on_breach, max_slippage_pct, ai_circuit_breaker
    FROM public.risk_settings
    LIMIT 1
  ) r;
  RETURN result->0;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_risk_settings TO anon, authenticated;

-- log_dca_trade — insert a DCA trade transaction
CREATE OR REPLACE FUNCTION public.log_dca_trade(
  p_bot_id uuid,
  p_user_id text,
  p_side text,
  p_pair text,
  p_amount numeric,
  p_price numeric,
  p_trade_type text,
  p_exchange_order_id text DEFAULT NULL,
  p_trade_mode text DEFAULT 'paper',
  p_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.transactions (
    bot_id, user_id, trade_side, trade_pair, trade_amount, trade_price,
    trade_type, exchange_order_id, trade_mode, status,
    client_name, plan_name, amount, payment_method
  ) VALUES (
    p_bot_id, p_user_id, UPPER(p_side), p_pair, p_amount, p_price,
    p_trade_type, p_exchange_order_id, p_trade_mode,
    CASE WHEN p_error IS NOT NULL THEN 'failed' ELSE 'completed' END,
    'Bot ' || substring(p_bot_id::text, 1, 8), p_trade_type, 0, p_trade_mode
  );
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_dca_trade TO anon, authenticated;

-- update_dca_bot_state — update DCA-specific columns after a buy/sell
CREATE OR REPLACE FUNCTION public.update_dca_bot_state(
  p_bot_id uuid,
  p_status text DEFAULT NULL,
  p_profit_loss numeric DEFAULT NULL,
  p_quantity numeric DEFAULT NULL,
  p_entry_price numeric DEFAULT NULL,
  p_dca_orders_executed integer DEFAULT NULL,
  p_dca_avg_entry_price numeric DEFAULT NULL,
  p_dca_last_buy_price numeric DEFAULT NULL,
  p_last_checked_at text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.bots SET
    status = COALESCE(p_status, status),
    profit_loss = COALESCE(p_profit_loss, profit_loss),
    quantity = COALESCE(p_quantity, quantity),
    entry_price = COALESCE(p_entry_price, entry_price),
    dca_orders_executed = COALESCE(p_dca_orders_executed, dca_orders_executed),
    dca_avg_entry_price = COALESCE(p_dca_avg_entry_price, dca_avg_entry_price),
    dca_last_buy_price = COALESCE(p_dca_last_buy_price, dca_last_buy_price),
    last_checked_at = COALESCE(p_last_checked_at, last_checked_at)
  WHERE id = p_bot_id;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_dca_bot_state TO anon, authenticated;

-- get_dca_bots — fetch all running DCA bots
CREATE OR REPLACE FUNCTION public.get_dca_bots()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT COALESCE(json_agg(b.*), '[]'::json) INTO result
  FROM public.bots b
  WHERE b.status = 'running'
    AND b.strategy = 'dca';
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_dca_bots TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
