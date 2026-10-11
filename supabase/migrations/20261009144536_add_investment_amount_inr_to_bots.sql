/*
# Add investment_amount_inr column to bots table

The frontend AISmartBotView inserts `investment_amount_inr` into the
`bots` table, but this column was never created. While PostgREST
would normally return a "column does not exist" error, the missing
column can also cause schema cache validation issues in newer
versions of the Supabase JS SDK (v2.57+) when the insert payload
contains fields not in the cached OpenAPI spec.

1. Changes
- Add `investment_amount_inr` (numeric, nullable) to `public.bots`.

2. Security
- No RLS policy changes needed — the column is user-owned like the
  rest of the row.
*/

ALTER TABLE public.bots ADD COLUMN IF NOT EXISTS investment_amount_inr numeric;

NOTIFY pgrst, 'reload schema';
