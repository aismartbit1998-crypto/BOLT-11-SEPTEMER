/*
# Smart Board Templates & User Board Licenses

## Overview
Creates two new tables for the license-based AI smart board allotment system:
1. `smart_board_templates` — admin-created AI trading strategies/boards that can
   be assigned to specific users.
2. `user_board_licenses` — mapping table linking a user to the board templates
   they have been licensed to use.

## New Tables

### 1. smart_board_templates
- `id` (uuid, PK)
- `name` (text, not null) — board name
- `description` (text, nullable)
- `strategy_type` (text, not null) — 'scalping', 'grid', 'dca', 'trailing'
- `coin` (text, not null) — target coin symbol (e.g. 'BTC')
- `market_type` (text, not null) — 'spot' or 'futures'
- `leverage` (integer, default 1)
- `take_profit_pct` (numeric, nullable) — default TP percentage
- `stop_loss_pct` (numeric, nullable) — default SL percentage
- `indicators` (text[], nullable) — technical indicators used
- `risk_level` (text, default 'Medium') — 'Low', 'Medium', 'High'
- `max_trades_per_day` (integer, default 20)
- `max_daily_loss` (numeric, nullable)
- `max_daily_profit` (numeric, nullable)
- `direction` (text, nullable) — 'long' or 'short'
- `is_active` (boolean, default true) — admin can deactivate a template
- `created_by` (text, nullable) — admin email who created it
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

### 2. user_board_licenses
- `id` (uuid, PK)
- `user_id` (uuid, not null, references auth.users ON DELETE CASCADE)
- `board_template_id` (uuid, not null, references smart_board_templates ON DELETE CASCADE)
- `is_active` (boolean, default true) — admin can revoke a license
- `allotted_by` (text, nullable) — admin email who assigned it
- `created_at` (timestamptz, default now())
- Unique constraint on (user_id, board_template_id) to prevent duplicates

## Security (RLS)
- `smart_board_templates`: all authenticated users can SELECT (they need to see
  their allotted boards). INSERT/UPDATE/DELETE also open to authenticated since
  the admin panel uses the same auth context.
- `user_board_licenses`: users can only SELECT their own licenses (auth.uid() = user_id).
  INSERT/UPDATE/DELETE open to authenticated (admin performs allotment).

## Important Notes
1. The frontend filters which templates a user sees by joining through
   user_board_licenses — users only see boards where an active license row exists
   for their auth.uid().
2. The engine server uses the service-role key to bypass RLS for admin operations.
3. The unique constraint prevents double-allotting the same board to a user.
*/

-- ============================================================
-- 1. smart_board_templates
-- ============================================================
CREATE TABLE IF NOT EXISTS smart_board_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  strategy_type text NOT NULL CHECK (strategy_type IN ('scalping', 'grid', 'dca', 'trailing')),
  coin text NOT NULL,
  market_type text NOT NULL CHECK (market_type IN ('spot', 'futures')),
  leverage integer NOT NULL DEFAULT 1,
  take_profit_pct numeric,
  stop_loss_pct numeric,
  indicators text[],
  risk_level text NOT NULL DEFAULT 'Medium' CHECK (risk_level IN ('Low', 'Medium', 'High')),
  max_trades_per_day integer NOT NULL DEFAULT 20,
  max_daily_loss numeric,
  max_daily_profit numeric,
  direction text CHECK (direction IN ('long', 'short')),
  is_active boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE smart_board_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_smart_board_templates" ON smart_board_templates;
CREATE POLICY "select_smart_board_templates"
  ON smart_board_templates FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "insert_smart_board_templates" ON smart_board_templates;
CREATE POLICY "insert_smart_board_templates"
  ON smart_board_templates FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "update_smart_board_templates" ON smart_board_templates;
CREATE POLICY "update_smart_board_templates"
  ON smart_board_templates FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "delete_smart_board_templates" ON smart_board_templates;
CREATE POLICY "delete_smart_board_templates"
  ON smart_board_templates FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- 2. user_board_licenses
-- ============================================================
CREATE TABLE IF NOT EXISTS user_board_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_template_id uuid NOT NULL REFERENCES smart_board_templates(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  allotted_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, board_template_id)
);

ALTER TABLE user_board_licenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_board_licenses" ON user_board_licenses;
CREATE POLICY "select_own_board_licenses"
  ON user_board_licenses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_board_licenses" ON user_board_licenses;
CREATE POLICY "insert_board_licenses"
  ON user_board_licenses FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "update_board_licenses" ON user_board_licenses;
CREATE POLICY "update_board_licenses"
  ON user_board_licenses FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "delete_board_licenses" ON user_board_licenses;
CREATE POLICY "delete_board_licenses"
  ON user_board_licenses FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_smart_board_templates_active ON smart_board_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_user_board_licenses_user ON user_board_licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_board_licenses_board ON user_board_licenses(board_template_id);
CREATE INDEX IF NOT EXISTS idx_user_board_licenses_active ON user_board_licenses(is_active) WHERE is_active = true;
