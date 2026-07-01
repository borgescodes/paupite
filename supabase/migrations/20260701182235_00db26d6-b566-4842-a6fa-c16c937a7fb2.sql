ALTER TABLE public.notifications_cleanup_backup_20260630 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notifications_cleanup_backup_20260630 FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notifications_cleanup_backup_20260630 TO service_role;