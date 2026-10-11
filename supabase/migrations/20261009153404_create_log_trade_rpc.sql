/*
# Create log_trade RPC function

## Purpose
The engine inserts into trade_history using the anon key, but RLS blocks
anon-key inserts (policy requires auth.uid() = user_id). This SECURITY
DEFINER function bypasses RLS so the engine can log trades.

## Changes
- Create `log_trade` function that inserts a trade_history row
- Grant execute to anon and authenticated roles
*/

CREATE OR REPLACE FUNCTION public.log_trade(
  p_user_id uuid,
  p_pair text,
  p_side text,
  p_amount numeric,
  p_price numeric,
  p_pnl numeric DEFAULT 0,
  p_strategy text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.trade_history (user_id, pair, side, amount, price, pnl, strategy)
  VALUES (p_user_id, p_pair, p_side, p_amount, p_price, p_pnl, p_strategy);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_trade TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
