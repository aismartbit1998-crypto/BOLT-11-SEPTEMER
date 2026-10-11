/*
# Add status and country columns to profiles table

## Purpose
The Admin Panel's Client Management page needs to track client account status
(active / suspended / banned) and country for each user. These columns enable:
- Aggregated stats (Total / Active / Suspended / Banned client counts)
- Dynamic filtering by country
- Soft-delete / status change workflow from the admin panel

## Changes
1. `profiles.status` — text column, defaults to 'active', CHECK constraint
   limits to 'active', 'suspended', 'banned'.
2. `profiles.country` — text column, nullable, defaults to NULL.

## Security
- No RLS policy changes. Existing policies on profiles remain unchanged.
- The admin panel uses the service-role key via the engine server, so it can
  read/write these columns regardless of RLS.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'status'
  ) THEN
    ALTER TABLE profiles ADD COLUMN status text NOT NULL DEFAULT 'active';
    ALTER TABLE profiles ADD CONSTRAINT profiles_status_check
      CHECK (status IN ('active', 'suspended', 'banned'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'country'
  ) THEN
    ALTER TABLE profiles ADD COLUMN country text;
  END IF;
END $$;
