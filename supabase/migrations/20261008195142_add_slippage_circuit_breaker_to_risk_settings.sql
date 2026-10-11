/*
# Add max_slippage_pct and ai_circuit_breaker columns to risk_settings

1. Modified Tables
- `risk_settings` — adds two new columns:
  - `max_slippage_pct` (numeric, default 1.5) — maximum allowed slippage percentage before orders are rejected
  - `ai_circuit_breaker` (boolean, default true) — enables AI volatility circuit breaker that pauses trades during flash crashes
2. Security
- No RLS changes needed; existing policies on risk_settings remain unchanged.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'risk_settings' AND column_name = 'max_slippage_pct') THEN
    ALTER TABLE risk_settings ADD COLUMN max_slippage_pct numeric NOT NULL DEFAULT 1.5;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'risk_settings' AND column_name = 'ai_circuit_breaker') THEN
    ALTER TABLE risk_settings ADD COLUMN ai_circuit_breaker boolean NOT NULL DEFAULT true;
  END IF;
END $$;