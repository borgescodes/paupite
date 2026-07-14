
-- Ensure backup and internal tables are locked down to service_role only
REVOKE ALL ON public.notifications_cleanup_backup_20260630 FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.points_reset_backup FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.pool_delete_backup FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.notifications_cleanup_backup_20260630 TO service_role;
GRANT ALL ON public.points_reset_backup TO service_role;
GRANT ALL ON public.pool_delete_backup TO service_role;

-- match_imports: writes are service_role only (Edge Functions). Explicit deny for authenticated.
REVOKE INSERT, UPDATE, DELETE ON public.match_imports FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.match_imports TO service_role;

-- Explicit fail-closed policies (belt-and-suspenders) for tables above
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications_cleanup_backup_20260630' AND policyname='deny_all') THEN
    EXECUTE 'CREATE POLICY deny_all ON public.notifications_cleanup_backup_20260630 AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='points_reset_backup' AND policyname='deny_all') THEN
    EXECUTE 'CREATE POLICY deny_all ON public.points_reset_backup AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pool_delete_backup' AND policyname='deny_all') THEN
    EXECUTE 'CREATE POLICY deny_all ON public.pool_delete_backup AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)';
  END IF;
END $$;

-- match_imports: explicit block on writes from authenticated (superadmin flow goes via Edge Function/service_role)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='match_imports' AND policyname='deny_writes_authenticated') THEN
    EXECUTE 'CREATE POLICY deny_writes_authenticated ON public.match_imports AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false)';
    EXECUTE 'CREATE POLICY deny_updates_authenticated ON public.match_imports AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false)';
    EXECUTE 'CREATE POLICY deny_deletes_authenticated ON public.match_imports AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false)';
  END IF;
END $$;

-- notification_campaigns: add SELECT policy for active admins/superadmins so the admin UI can list campaigns via PostgREST if desired
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notification_campaigns' AND policyname='admins_can_read_campaigns') THEN
    EXECUTE $POL$
      CREATE POLICY admins_can_read_campaigns
      ON public.notification_campaigns
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.status = 'active'
            AND p.role IN ('admin','superadmin')
        )
      )
    $POL$;
  END IF;
END $$;
GRANT SELECT ON public.notification_campaigns TO authenticated;
