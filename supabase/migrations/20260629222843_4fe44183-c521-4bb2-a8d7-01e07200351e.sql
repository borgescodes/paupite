
-- Restrict pool_settings reads to authenticated users
DROP POLICY IF EXISTS pool_settings_select_visible ON public.pool_settings;
CREATE POLICY pool_settings_select_visible ON public.pool_settings
  FOR SELECT TO authenticated
  USING (
    private.is_admin(auth.uid())
    OR status = ANY (ARRAY['open','active','closed','coming_soon'])
  );

-- Enrollments: explicit write policies (users insert own; admins manage)
CREATE POLICY enrollments_insert_own ON public.enrollments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY enrollments_admin_write ON public.enrollments
  FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()));

-- Prize requests: users may insert their own; only admins update/delete
CREATE POLICY prize_requests_insert_own ON public.prize_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY prize_requests_admin_write ON public.prize_requests
  FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()));
