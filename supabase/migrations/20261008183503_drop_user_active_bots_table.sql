/*
# Drop orphaned user_active_bots table

## Reason
The `user_active_bots` table was created as a parallel bot-tracking system
but is fully orphaned. Its only consumer (`CreateBotPanel.tsx`) has been
deleted from the codebase. The active bot lifecycle runs exclusively
through the `bots` table (status: running/paused/stopped) via
`TradingStatusView.tsx` and `AISmartBotView.tsx`.

## Changes
1. Drops the `user_active_bots` table and all dependent objects (policies,
   indexes) via CASCADE.
2. No foreign keys from other tables point to `user_active_bots`, so no
   downstream breakage.

## Security
- Removes 4 RLS policies and 1 index that were scoped to this table only.
- No other tables or views are affected.
*/

DROP TABLE IF EXISTS user_active_bots CASCADE;
