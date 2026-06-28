-- Restrict policies to authenticated role only
ALTER POLICY enrollments_select_own ON public.enrollments TO authenticated;
ALTER POLICY payments_select_own ON public.payments TO authenticated;
ALTER POLICY prize_requests_select_own ON public.prize_requests TO authenticated;

-- Set immutable search_path on private helper functions
ALTER FUNCTION private.normalized_special_text(text) SET search_path = public, private;
ALTER FUNCTION private.is_knockout_stage(text) SET search_path = public, private;
ALTER FUNCTION private.normalize_knockout_stage(text) SET search_path = public, private;