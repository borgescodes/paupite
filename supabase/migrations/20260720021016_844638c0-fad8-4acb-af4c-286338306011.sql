
-- audit_logs: writes must go through SECURITY DEFINER functions / service_role only.
REVOKE INSERT ON public.audit_logs FROM anon, authenticated;

DROP POLICY IF EXISTS "audit_logs_no_client_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_no_client_insert"
  ON public.audit_logs
  AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

-- profiles: rows are created by the handle_new_user trigger on auth.users (SECURITY DEFINER).
REVOKE INSERT ON public.profiles FROM anon, authenticated;

DROP POLICY IF EXISTS "profiles_no_client_insert" ON public.profiles;
CREATE POLICY "profiles_no_client_insert"
  ON public.profiles
  AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);
