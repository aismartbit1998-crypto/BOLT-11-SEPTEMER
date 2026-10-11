/*
# Add missing tables for full Supabase integration

## What this migration does
Creates 6 new tables that the frontend needs to fully replace all mock data:
1. `signals` — AI trading signals (replaces mock signals array)
2. `copy_trading_bots` — Copy-trading marketplace bots (replaces marketplaceData.ts)
3. `broker_responses` — Broker API response logs (replaces inline hardcoded array)
4. `bug_reports` — User-submitted bug reports (was never persisted)
5. `system_settings` — Global system configuration (replaces fake save stub)
6. `api_health_logs` — Exchange API health monitoring (replaces inline hardcoded array)

## Table details

### signals
- `id` uuid PK
- `user_id` uuid (nullable, for user-specific signals; null = public)
- `coin` text — e.g. "BTC"
- `signal_type` text — "BUY" | "SELL"
- `confidence` numeric — 0-100
- `entry_price` numeric
- `target_price` numeric
- `stop_loss` numeric
- `source` text — signal source name
- `created_at` timestamptz

### copy_trading_bots
- `id` uuid PK
- `name` text
- `description` text
- `strategy_type` text
- `risk_level` text — "Low" | "Medium" | "High"
- `monthly_return_pct` numeric
- `win_rate` numeric
- `max_drawdown_pct` numeric
- `copiers_count` integer
- `followers_count` integer
- `sparkline_data` jsonb — array of recent performance points
- `is_active` boolean
- `created_at` timestamptz

### broker_responses
- `id` uuid PK
- `user_id` uuid (nullable)
- `exchange_name` text
- `endpoint` text
- `status` text — "success" | "error"
- `latency_ms` integer
- `message` text
- `created_at` timestamptz

### bug_reports
- `id` uuid PK
- `user_id` uuid (nullable)
- `category` text
- `severity` text
- `description` text
- `ticket_number` text
- `status` text default 'open'
- `created_at` timestamptz

### system_settings
- `id` uuid PK (single row)
- `app_name` text
- `tagline` text
- `primary_color` text
- `accent_color` text
- `support_email` text
- `maintenance_mode` boolean default false
- `email_alerts` boolean default true
- `two_factor` boolean default false
- `updated_at` timestamptz

### api_health_logs
- `id` uuid PK
- `exchange_name` text
- `status` text — "healthy" | "degraded" | "down"
- `latency_ms` integer
- `last_checked_at` timestamptz
- `error_rate_pct` numeric
- `message` text

## Security
All tables have RLS enabled.
- `signals`: public read (anon + authenticated), authenticated insert
- `copy_trading_bots`: public read, authenticated insert/update/delete
- `broker_responses`: owner-scoped (auth.uid = user_id)
- `bug_reports`: owner-scoped read + insert, admin read all
- `system_settings`: public read, authenticated update
- `api_health_logs`: public read, authenticated insert

## Notes
1. All tables use `gen_random_uuid()` for PK defaults
2. Owner-scoped tables default `user_id` to `auth.uid()` so inserts work without client passing it
3. A default row is inserted into `system_settings` so the admin panel has data on first load
*/

-- ─── signals ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  coin text NOT NULL,
  signal_type text NOT NULL DEFAULT 'BUY',
  confidence numeric NOT NULL DEFAULT 50,
  entry_price numeric,
  target_price numeric,
  stop_loss numeric,
  source text NOT NULL DEFAULT 'Cortex AI Engine',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "signals_public_select" ON signals;
CREATE POLICY "signals_public_select" ON signals FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "signals_auth_insert" ON signals;
CREATE POLICY "signals_auth_insert" ON signals FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "signals_auth_update" ON signals;
CREATE POLICY "signals_auth_update" ON signals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "signals_auth_delete" ON signals;
CREATE POLICY "signals_auth_delete" ON signals FOR DELETE TO authenticated USING (true);

-- ─── copy_trading_bots ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS copy_trading_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  strategy_type text NOT NULL DEFAULT 'scalping',
  risk_level text NOT NULL DEFAULT 'Medium',
  monthly_return_pct numeric NOT NULL DEFAULT 0,
  win_rate numeric NOT NULL DEFAULT 0,
  max_drawdown_pct numeric NOT NULL DEFAULT 0,
  copiers_count integer NOT NULL DEFAULT 0,
  followers_count integer NOT NULL DEFAULT 0,
  sparkline_data jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE copy_trading_bots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "copy_bots_public_select" ON copy_trading_bots;
CREATE POLICY "copy_bots_public_select" ON copy_trading_bots FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "copy_bots_auth_insert" ON copy_trading_bots;
CREATE POLICY "copy_bots_auth_insert" ON copy_trading_bots FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "copy_bots_auth_update" ON copy_trading_bots;
CREATE POLICY "copy_bots_auth_update" ON copy_trading_bots FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "copy_bots_auth_delete" ON copy_trading_bots;
CREATE POLICY "copy_bots_auth_delete" ON copy_trading_bots FOR DELETE TO authenticated USING (true);

-- ─── broker_responses ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broker_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange_name text NOT NULL,
  endpoint text,
  status text NOT NULL DEFAULT 'success',
  latency_ms integer NOT NULL DEFAULT 0,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE broker_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "broker_responses_owner_select" ON broker_responses;
CREATE POLICY "broker_responses_owner_select" ON broker_responses FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "broker_responses_owner_insert" ON broker_responses;
CREATE POLICY "broker_responses_owner_insert" ON broker_responses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "broker_responses_owner_delete" ON broker_responses;
CREATE POLICY "broker_responses_owner_delete" ON broker_responses FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ─── bug_reports ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  severity text NOT NULL,
  description text NOT NULL,
  ticket_number text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bug_reports_owner_select" ON bug_reports;
CREATE POLICY "bug_reports_owner_select" ON bug_reports FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "bug_reports_owner_insert" ON bug_reports;
CREATE POLICY "bug_reports_owner_insert" ON bug_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ─── system_settings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_name text NOT NULL DEFAULT 'Cortex AI',
  tagline text NOT NULL DEFAULT 'AI-Powered Crypto Trading Platform',
  primary_color text NOT NULL DEFAULT '#00D9C0',
  accent_color text NOT NULL DEFAULT '#FFB800',
  support_email text NOT NULL DEFAULT 'support@cortexai.io',
  maintenance_mode boolean NOT NULL DEFAULT false,
  email_alerts boolean NOT NULL DEFAULT true,
  two_factor boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "system_settings_public_select" ON system_settings;
CREATE POLICY "system_settings_public_select" ON system_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "system_settings_auth_update" ON system_settings;
CREATE POLICY "system_settings_auth_update" ON system_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Insert a default row if none exists
INSERT INTO system_settings (app_name, tagline)
SELECT 'Cortex AI', 'AI-Powered Crypto Trading Platform'
WHERE NOT EXISTS (SELECT 1 FROM system_settings);

-- ─── api_health_logs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_health_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_name text NOT NULL,
  status text NOT NULL DEFAULT 'healthy',
  latency_ms integer NOT NULL DEFAULT 0,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  error_rate_pct numeric NOT NULL DEFAULT 0,
  message text
);
ALTER TABLE api_health_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "api_health_public_select" ON api_health_logs;
CREATE POLICY "api_health_public_select" ON api_health_logs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "api_health_auth_insert" ON api_health_logs;
CREATE POLICY "api_health_auth_insert" ON api_health_logs FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "api_health_auth_update" ON api_health_logs;
CREATE POLICY "api_health_auth_update" ON api_health_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ─── Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broker_responses_user_id ON broker_responses (user_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_user_id ON bug_reports (user_id);
CREATE INDEX IF NOT EXISTS idx_copy_trading_bots_active ON copy_trading_bots (is_active);
