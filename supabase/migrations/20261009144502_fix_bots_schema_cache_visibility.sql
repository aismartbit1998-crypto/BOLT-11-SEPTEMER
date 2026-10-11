/*
# Fix: Re-expose bots table to PostgREST schema cache

The `bots` table exists in the database but PostgREST's schema cache
was not picking it up, causing "Could not find the table 'public.bots'
in the schema cache" errors from the frontend.

This migration re-grants privileges to anon and authenticated roles,
which forces PostgREST to re-introspect the table on the next
schema reload. We also issue the NOTIFY at the end.
*/

-- Re-grant all privileges on bots table to API roles
GRANT ALL ON public.bots TO anon;
GRANT ALL ON public.bots TO authenticated;
GRANT ALL ON public.bots TO service_role;

-- Ensure RLS is still enabled
ALTER TABLE public.bots ENABLE ROW LEVEL SECURITY;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
