
-- Owner + admin SELECT policies on pool stub tables
CREATE POLICY enrollments_select_own ON public.enrollments FOR SELECT
  USING (user_id = auth.uid() OR private.is_admin(auth.uid()));

CREATE POLICY prize_requests_select_own ON public.prize_requests FOR SELECT
  USING (user_id = auth.uid() OR private.is_admin(auth.uid()));

CREATE POLICY payments_select_own ON public.payments FOR SELECT
  USING (
    private.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.id = payments.enrollment_id AND e.user_id = auth.uid()
    )
  );

CREATE POLICY pool_settings_select_visible ON public.pool_settings FOR SELECT
  USING (private.is_admin(auth.uid()) OR status IN ('open','active','closed','coming_soon'));
