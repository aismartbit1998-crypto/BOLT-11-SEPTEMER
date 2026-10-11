/*
# Add DCA execution columns to bots and trade logging columns to transactions

## Overview
The existing `bots` table tracks bot lifecycle (status, TP/SL, PnL) but lacks
DCA-specific parameters needed by the DCA execution loop. The existing
`transactions` table is payment-focused and lacks columns for trade execution
logging. This migration adds the columns needed by the DCA runner service.

## Changes to `bots`
1. `dca_base_order_usdt` (numeric, default 50) — base DCA buy amount in USDT
2. `dca_safety_order_step_pct` (numeric, default 5) — percentage drop from
   last average entry price that triggers the next safety (DCA) buy
3. `dca_max_safety_orders` (integer, default 5) — maximum number of safety
   orders the bot will place before stopping DCA accumulation
4. `dca_safety_order_multiplier` (numeric, default 1.5) — multiplier applied
   to each subsequent safety order size (e.g. 1.5x = 50% larger each step)
5. `dca_orders_executed` (integer, default 0) — running count of safety
   orders placed so far by the DCA runner
6. `dca_avg_entry_price` (numeric, nullable) — running weighted average
   entry price across all DCA fills
7. `dca_last_buy_price` (numeric, nullable) — price of the most recent DCA
   buy, used to calculate the threshold for the next safety order

## Changes to `transactions`
8. `bot_id` (uuid, nullable) — FK to bots(id) ON DELETE SET NULL, links a
   trade execution record to the bot that placed it
9. `user_id` (uuid, nullable) — FK to auth.users(id) ON DELETE CASCADE,
   links the trade to the owning user
10. `trade_side` (text, nullable) — 'BUY' or 'SELL'
11. `trade_pair` (text, nullable) — e.g. 'BTC/USDT'
12. `trade_amount` (numeric, nullable) — quantity of base asset traded
13. `trade_price` (numeric, nullable) — execution price per unit
14. `trade_type` (text, nullable) — 'dca_base', 'dca_safety', 'tp_close',
    'sl_close', 'manual_close'
15. `exchange_order_id` (text, nullable) — order ID returned by the exchange
16. `trade_mode` (text, nullable) — 'live' or 'paper'

## Security
- No RLS policy changes. The engine writes via the service-role key which
  bypasses RLS. Existing policies on both tables remain unchanged.
- `bot_id` FK uses ON DELETE SET NULL so deleting a bot does not erase
  historical trade records.
- `user_id` FK uses ON DELETE CASCADE so deleting a user purges their trades.
*/

-- ─── DCA columns on bots ────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'dca_base_order_usdt') THEN
    ALTER TABLE bots ADD COLUMN dca_base_order_usdt numeric NOT NULL DEFAULT 50;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'dca_safety_order_step_pct') THEN
    ALTER TABLE bots ADD COLUMN dca_safety_order_step_pct numeric NOT NULL DEFAULT 5;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'dca_max_safety_orders') THEN
    ALTER TABLE bots ADD COLUMN dca_max_safety_orders integer NOT NULL DEFAULT 5;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'dca_safety_order_multiplier') THEN
    ALTER TABLE bots ADD COLUMN dca_safety_order_multiplier numeric NOT NULL DEFAULT 1.5;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'dca_orders_executed') THEN
    ALTER TABLE bots ADD COLUMN dca_orders_executed integer NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'dca_avg_entry_price') THEN
    ALTER TABLE bots ADD COLUMN dca_avg_entry_price numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'dca_last_buy_price') THEN
    ALTER TABLE bots ADD COLUMN dca_last_buy_price numeric;
  END IF;
END
$$;

-- ─── Trade logging columns on transactions ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'bot_id') THEN
    ALTER TABLE transactions ADD COLUMN bot_id uuid REFERENCES bots(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'user_id') THEN
    ALTER TABLE transactions ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'trade_side') THEN
    ALTER TABLE transactions ADD COLUMN trade_side text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'trade_pair') THEN
    ALTER TABLE transactions ADD COLUMN trade_pair text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'trade_amount') THEN
    ALTER TABLE transactions ADD COLUMN trade_amount numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'trade_price') THEN
    ALTER TABLE transactions ADD COLUMN trade_price numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'trade_type') THEN
    ALTER TABLE transactions ADD COLUMN trade_type text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'exchange_order_id') THEN
    ALTER TABLE transactions ADD COLUMN exchange_order_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'trade_mode') THEN
    ALTER TABLE transactions ADD COLUMN trade_mode text;
  END IF;
END
$$;

-- Index for the DCA runner's primary query: status = 'running' + strategy filter
CREATE INDEX IF NOT EXISTS idx_bots_status_strategy ON bots(status, strategy);
-- Index for trade history lookups by bot
CREATE INDEX IF NOT EXISTS idx_transactions_bot_id ON transactions(bot_id);
