/*
# Create user_active_bots table

## Purpose
Stores user-configured AI trading bots launched from the user dashboard.
Each row represents one active bot instance created by a user.

## New Table: user_active_bots
- id (uuid, PK, default gen_random_uuid)
- user_id (uuid, NOT NULL, default auth.uid(), FK to auth.users ON DELETE CASCADE)
- bot_name (text, not null) — user-facing name
- exchange (text, not null) — exchange the bot trades on (e.g. "binance")
- trading_pair (text, not null) — e.g. "BTC/USDT"
- strategy_type (text, not null) — one of: "AI Smart DCA", "Auto-Grid", "Momentum Scalper"
- investment_amount (numeric, not null) — USDT allocation
- risk_level (text, not null, default 'Medium') — "Low", "Medium", or "High"
- status (text, not null, default 'active') — "active", "paused", "stopped"
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now())

## Security
- RLS enabled on user_active_bots.
- 4 owner-scoped policies (SELECT, INSERT, UPDATE, DELETE) scoped TO authenticated.
- user_id defaults to auth.uid() so inserts omitting user_id still satisfy the WITH CHECK.

## Notes
1. The DEFAULT auth.uid() on user_id ensures frontend inserts work without explicitly passing user_id.
2. Only the owning user can see, create, modify, or delete their bots.
3. Exchange names align with CCXT exchange IDs for engine compatibility.
*/

CREATE TABLE IF NOT EXISTS user_active_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  bot_name text NOT NULL,
  exchange text NOT NULL,
  trading_pair text NOT NULL,
  strategy_type text NOT NULL CHECK (strategy_type IN ('AI Smart DCA', 'Auto-Grid', 'Momentum Scalper')),
  investment_amount numeric NOT NULL DEFAULT 0,
  risk_level text NOT NULL DEFAULT 'Medium' CHECK (risk_level IN ('Low', 'Medium', 'High')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'stopped')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_active_bots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_active_bots" ON user_active_bots;
CREATE POLICY "select_own_active_bots"
ON user_active_bots FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_active_bots" ON user_active_bots;
CREATE POLICY "insert_own_active_bots"
ON user_active_bots FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_active_bots" ON user_active_bots;
CREATE POLICY "update_own_active_bots"
ON user_active_bots FOR UPDATE
TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_active_bots" ON user_active_bots;
CREATE POLICY "delete_own_active_bots"
ON user_active_bots FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_active_bots_user_id ON user_active_bots(user_id);