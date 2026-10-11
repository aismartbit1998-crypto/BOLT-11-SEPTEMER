/*
# Add exchange_id column to broker_keys

1. Modified Tables
- `broker_keys`: Added `exchange_id` (text, nullable) column to store the CCXT exchange identifier
  (e.g. 'binance', 'kucoin', 'wazirx', 'zebpay', 'kraken', 'bybit') alongside the existing
  `exchange_name` display label. This enables dynamic multi-exchange support via CCXT.
2. Security
- No RLS policy changes — existing policies remain intact.
3. Important Notes
- The column is nullable so existing rows are unaffected.
- New connections will populate both `exchange_name` (display) and `exchange_id` (CCXT class lookup).
*/

ALTER TABLE broker_keys
ADD COLUMN IF NOT EXISTS exchange_id text;
