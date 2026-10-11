/*
# Add encrypted API key columns to broker_keys

## Overview
The broker_keys table currently stores API keys in plaintext. This migration
adds encrypted_api_key and encrypted_api_secret columns so the engine server
can store AES-256-GCM encrypted versions of customer broker credentials.

## Changes
1. Adds `encrypted_api_key` (text, nullable) to broker_keys
2. Adds `encrypted_api_secret` (text, nullable) to broker_keys
3. Adds `encryption_iv` (text, nullable) to broker_keys — stores the initialization vector

## Security
- The original api_key and api_secret columns remain for backward compatibility
- The engine server encrypts keys before storing and decrypts on-the-fly when launching bots
- RLS policies remain unchanged (authenticated users can CRUD their own broker keys)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'broker_keys' AND column_name = 'encrypted_api_key'
  ) THEN
    ALTER TABLE broker_keys ADD COLUMN encrypted_api_key text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'broker_keys' AND column_name = 'encrypted_api_secret'
  ) THEN
    ALTER TABLE broker_keys ADD COLUMN encrypted_api_secret text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'broker_keys' AND column_name = 'encryption_iv'
  ) THEN
    ALTER TABLE broker_keys ADD COLUMN encryption_iv text;
  END IF;
END
$$;
