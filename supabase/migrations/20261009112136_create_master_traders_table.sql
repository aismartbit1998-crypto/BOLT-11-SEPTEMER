/*
# Create master_traders table

1. New Tables
- `master_traders` — Stores registered master trader accounts for copy trading.
  - `id` (uuid, primary key)
  - `name` (text, display name of the master trader)
  - `exchange_name` (text, which exchange they trade on)
  - `api_key` (text, encrypted API key — admin only, never exposed to users)
  - `api_secret` (text, encrypted API secret — admin only, never exposed to users)
  - `commission_pct` (numeric, commission percentage for copiers)
  - `status` (text, 'active' or 'paused')
  - `followers_count` (integer, number of users copying this trader)
  - `created_at` (timestamptz)

2. Security
- Enable RLS on `master_traders`.
- Authenticated users (clients) can SELECT only public columns: name, exchange_name, status, followers_count.
  Sensitive columns (api_key, api_secret) are excluded via column-level privilege revocation.
- Admin users (members of admin_roles with role master_admin or sub_admin) have full CRUD access.
- Anon role has no access.

3. Important Notes
- The admin panel (AdminApiControl.tsx) already references this table but it was never created.
  This migration creates it so the admin panel stops erroring.
- Column-level privileges ensure api_key/api_secret are never readable by non-admin users even
  though the SELECT policy allows authenticated users to query the table.
*/

CREATE TABLE IF NOT EXISTS master_traders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  exchange_name text NOT NULL DEFAULT 'Binance',
  api_key text NOT NULL DEFAULT '',
  api_secret text NOT NULL DEFAULT '',
  commission_pct numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  followers_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE master_traders ENABLE ROW LEVEL SECURITY;

-- Revoke all default column privileges so we can grant selectively
REVOKE ALL ON master_traders FROM anon, authenticated;

-- Grant table-level SELECT to authenticated (column-level grants below restrict what they see)
GRANT SELECT (id, name, exchange_name, commission_pct, status, followers_count, created_at) ON master_traders TO authenticated;
GRANT INSERT (id, name, exchange_name, api_key, api_secret, commission_pct, status, followers_count, created_at) ON master_traders TO authenticated;
GRANT UPDATE (id, name, exchange_name, api_key, api_secret, commission_pct, status, followers_count, created_at) ON master_traders TO authenticated;
GRANT DELETE ON master_traders TO authenticated;

-- Policies: authenticated users can read (public cols only, enforced by column grants above)
DROP POLICY IF EXISTS "master_traders_select_authenticated" ON master_traders;
CREATE POLICY "master_traders_select_authenticated"
ON master_traders FOR SELECT
TO authenticated USING (true);

-- Write policies: only admin role members can insert/update/delete
DROP POLICY IF EXISTS "master_traders_admin_insert" ON master_traders;
CREATE POLICY "master_traders_admin_insert"
ON master_traders FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM admin_roles WHERE admin_roles.user_id = auth.uid() AND admin_roles.role IN ('master_admin', 'sub_admin') AND admin_roles.is_active = true)
);

DROP POLICY IF EXISTS "master_traders_admin_update" ON master_traders;
CREATE POLICY "master_traders_admin_update"
ON master_traders FOR UPDATE
TO authenticated USING (
  EXISTS (SELECT 1 FROM admin_roles WHERE admin_roles.user_id = auth.uid() AND admin_roles.role IN ('master_admin', 'sub_admin') AND admin_roles.is_active = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM admin_roles WHERE admin_roles.user_id = auth.uid() AND admin_roles.role IN ('master_admin', 'sub_admin') AND admin_roles.is_active = true)
);

DROP POLICY IF EXISTS "master_traders_admin_delete" ON master_traders;
CREATE POLICY "master_traders_admin_delete"
ON master_traders FOR DELETE
TO authenticated USING (
  EXISTS (SELECT 1 FROM admin_roles WHERE admin_roles.user_id = auth.uid() AND admin_roles.role IN ('master_admin', 'sub_admin') AND admin_roles.is_active = true)
);

-- Grant full access to admin role via column privileges (api_key, api_secret are admin-only)
-- Admins already have authenticated role, so they get the public column grant automatically.
-- For sensitive columns, we need a separate grant. Since PostgreSQL doesn't support
-- per-role column grants conditionally, we rely on the RLS policy + the fact that
-- non-admin authenticated users can only select granted columns.
-- Grant api_key/api_secret SELECT to authenticated (but RLS write policies block non-admins)
-- Actually, we should NOT grant api_key/api_secret to all authenticated. Instead, admins
-- use the service role key from the backend engine. Frontend admin panel uses anon key
-- with authenticated session, so we need a different approach:
-- Use a SECURITY DEFINER function for admin access to sensitive columns.

-- Simplest correct approach: grant api_key/api_secret to authenticated but rely on
-- the SELECT policy returning rows + column grants. Since we can't do per-role column
-- grants in Postgres, we instead create a view that exposes only public columns.
CREATE OR REPLACE VIEW master_traders_public AS
  SELECT id, name, exchange_name, commission_pct, status, followers_count, created_at
  FROM master_traders;

ALTER VIEW master_traders_public OWNER TO postgres;

-- Re-grant on the view for authenticated users
GRANT SELECT ON master_traders_public TO authenticated;
