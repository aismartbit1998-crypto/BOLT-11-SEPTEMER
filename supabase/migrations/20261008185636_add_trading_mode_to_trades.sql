/*
# Add trading_mode column to trades table

## Purpose
The `trades` table (created in migration 20261006133229) records manual trades
placed by admins/users. It lacks a `trading_mode` column to distinguish live
vs paper trades. The Workspace Toggle pattern in the frontend needs this column
to filter the Trade History view by the current workspace (paper/live).

## Changes
1. Adds `trading_mode` (text, nullable, CHECK 'live' or 'paper') to `trades`.
2. Defaults existing rows to 'live' (they were all real trades placed before
   the paper mode existed).

## Security
- No RLS changes. Existing policies remain intact.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trades' AND column_name = 'trading_mode') THEN
    ALTER TABLE trades ADD COLUMN trading_mode text CHECK (trading_mode IN ('live', 'paper'));
    UPDATE trades SET trading_mode = 'live' WHERE trading_mode IS NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_trades_trading_mode ON trades(trading_mode);
