/*
# Expand bots.strategy check constraint

## Purpose
The `bots.strategy` column only allowed 'scalping', 'grid', 'trailing'.
The frontend sends 'scalper', 'dca', 'grid', 'copier' as strategy values.
This migration drops the old constraint and adds a new one that accepts
all strategy values used by the frontend.

## Changes
- Drop `bots_strategy_check`
- Create new `bots_strategy_check` allowing: 'scalping', 'scalper', 'grid', 'trailing', 'dca', 'copier'
*/

ALTER TABLE public.bots DROP CONSTRAINT IF EXISTS bots_strategy_check;

ALTER TABLE public.bots ADD CONSTRAINT bots_strategy_check
  CHECK (strategy IN ('scalping', 'scalper', 'grid', 'trailing', 'dca', 'copier'));
