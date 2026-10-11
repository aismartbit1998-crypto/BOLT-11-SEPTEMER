/*
# Add is_universal_default column to smart_board_templates

## Overview
Adds a boolean column `is_universal_default` to the `smart_board_templates` table
to distinguish between the universal default bot (managed by the core engine,
locked down for users) and custom allotted bots (fully editable by users).

## Changes
- `smart_board_templates.is_universal_default` (boolean, default false) — when true,
  the bot is a universal default that all users see but cannot edit, delete, or
  configure. Only one row should have this set to true at a time.

## Data
- Inserts a default universal bot record ("Cortex Universal DCA Bot") if none exists
  with is_universal_default = true.

## Security
- No RLS policy changes needed — existing policies already allow authenticated
  users to SELECT smart_board_templates.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'smart_board_templates'
    AND column_name = 'is_universal_default'
  ) THEN
    ALTER TABLE smart_board_templates
    ADD COLUMN is_universal_default boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Insert the universal default bot if it doesn't exist
INSERT INTO smart_board_templates (
  name, description, strategy_type, coin, market_type, leverage,
  take_profit_pct, stop_loss_pct, indicators, risk_level,
  max_trades_per_day, max_daily_loss, max_daily_profit, direction,
  is_active, is_universal_default, created_by
)
SELECT
  'Cortex Universal DCA Bot',
  'A universal dollar-cost-averaging bot managed by the core engine. All users get this bot by default — it cannot be modified.',
  'dca', 'BTC', 'spot', 1,
  5, 2, ARRAY['RSI'], 'Low',
  10, 500, 1000, 'long',
  true, true, 'system'
WHERE NOT EXISTS (
  SELECT 1 FROM smart_board_templates WHERE is_universal_default = true
);
