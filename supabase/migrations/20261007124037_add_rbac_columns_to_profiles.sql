/*
# Add RBAC columns to profiles table

## Purpose
Support the Sub-Admin tier with role-based access control and tenant isolation:
1. `role` — distinguishes master_admin, sub_admin, and client users
2. `permissions` — jsonb array storing allowed action keys
3. `parent_admin_id` — links a client to the sub-admin who created them
4. `license_quota` — how many licenses a sub-admin can generate

## Security
- No RLS policy changes. The engine server uses the service-role key for admin operations.
- Tenant isolation is enforced at the API layer in server.ts.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE profiles ADD COLUMN role text NOT NULL DEFAULT 'client';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'permissions'
  ) THEN
    ALTER TABLE profiles ADD COLUMN permissions jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'parent_admin_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN parent_admin_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'license_quota'
  ) THEN
    ALTER TABLE profiles ADD COLUMN license_quota integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Add license_quota to admin_roles table as well for backwards compat
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_roles' AND column_name = 'license_quota'
  ) THEN
    ALTER TABLE admin_roles ADD COLUMN license_quota integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Add parent_admin_id to licenses table for tenant isolation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'licenses' AND column_name = 'parent_admin_id'
  ) THEN
    ALTER TABLE licenses ADD COLUMN parent_admin_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
