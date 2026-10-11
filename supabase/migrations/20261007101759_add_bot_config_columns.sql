/*
# Add bot execution config columns to bots table

## Overview
The bots table currently stores only name, market_type, coin, strategy, status, and PnL.
The autonomous background bot worker needs entry price, TP/SL percentages, leverage,
direction, quantity, and trading mode to monitor open positions and trigger
take-profit or stop-loss automatically.

## Changes
1. Adds `trading_mode` (text, nullable) — 'live' or 'paper'
2. Adds `direction` (text, nullable) — 'long' or 'short'
3. Adds `entry_price` (numeric, nullable) — price at which the bot entered
4. Adds `quantity` (numeric, nullable) — coin quantity of the position
5. Adds `position_size` (numeric, nullable) — notional value in USD
6. Adds `leverage` (integer, nullable, default 1) — leverage multiplier
7. Adds `take_profit_pct` (numeric, nullable) — TP percentage
8. Adds `stop_loss_pct` (numeric, nullable) — SL percentage
9. Adds `take_profit_price` (numeric, nullable) — computed TP price
10. Adds `stop_loss_price` (numeric, nullable) — computed SL price
11. Adds `max_daily_loss` (numeric, nullable) — daily loss safety limit
12. Adds `max_daily_profit` (numeric, nullable) — daily profit safety limit
13. Adds `indicators` (text[], nullable) — active technical indicators
14. Adds `last_checked_at` (timestamptz, nullable) — last time the worker checked this bot

## Security
- RLS policies on bots remain unchanged (owner-scoped CRUD).
- The engine server uses the service-role key to read/update bots, bypassing RLS.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'trading_mode') THEN
    ALTER TABLE bots ADD COLUMN trading_mode text CHECK (trading_mode IN ('live', 'paper'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'direction') THEN
    ALTER TABLE bots ADD COLUMN direction text CHECK (direction IN ('long', 'short'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'entry_price') THEN
    ALTER TABLE bots ADD COLUMN entry_price numeric;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'quantity') THEN
    ALTER TABLE bots ADD COLUMN quantity numeric;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'position_size') THEN
    ALTER TABLE bots ADD COLUMN position_size numeric;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'leverage') THEN
    ALTER TABLE bots ADD COLUMN leverage integer DEFAULT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'take_profit_pct') THEN
    ALTER TABLE bots ADD COLUMN take_profit_pct numeric;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'stop_loss_pct') THEN
    ALTER TABLE bots ADD COLUMN stop_loss_pct numeric;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'take_profit_price') THEN
    ALTER TABLE bots ADD COLUMN take_profit_price numeric;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'stop_loss_price') THEN
    ALTER TABLE bots ADD COLUMN stop_loss_price numeric;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'max_daily_loss') THEN
    ALTER TABLE bots ADD COLUMN max_daily_loss numeric;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'max_daily_profit') THEN
    ALTER TABLE bots ADD COLUMN max_daily_profit numeric;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'indicators') THEN
    ALTER TABLE bots ADD COLUMN indicators text[];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'last_checked_at') THEN
    ALTER TABLE bots ADD COLUMN last_checked_at timestamptz;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_bots_status_running ON bots(status) WHERE status = 'running';
