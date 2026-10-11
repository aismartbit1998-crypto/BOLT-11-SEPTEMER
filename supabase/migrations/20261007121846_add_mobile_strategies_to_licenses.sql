/*
# Add mobile_number and allotted_strategies to licenses table

## Purpose
The Admin Panel's License Management page needs to store:
1. A mobile number for the client receiving the license
2. The specific AI strategies/bots allotted to that client

These columns enable the "Generate & Allot License" modal to capture
client contact info and strategy selections, and the User Panel to
enforce which strategies a client is allowed to use.

## Changes
1. `licenses.mobile_number` — text column, nullable, stores the client's phone.
2. `licenses.allotted_strategies` — jsonb column, nullable, stores an array
   of strategy name strings that the client is allowed to use.

## Security
- No RLS policy changes. Existing policies on licenses remain unchanged.
- The admin panel uses the service-role key via the engine server.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'licenses' AND column_name = 'mobile_number'
  ) THEN
    ALTER TABLE licenses ADD COLUMN mobile_number text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'licenses' AND column_name = 'allotted_strategies'
  ) THEN
    ALTER TABLE licenses ADD COLUMN allotted_strategies jsonb;
  END IF;
END $$;
