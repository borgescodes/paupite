-- Add enrollment mode controls to pool_settings
ALTER TABLE pool_settings
  ADD COLUMN IF NOT EXISTS enrollments_mode text DEFAULT 'closed'
    CHECK (enrollments_mode IN ('open', 'coming_soon', 'closed')),
  ADD COLUMN IF NOT EXISTS coming_soon_message text;

-- Rebuild get_pool_public_summary to include new columns
CREATE OR REPLACE FUNCTION private.get_pool_public_summary()
RETURNS TABLE (
  id uuid,
  title text,
  status text,
  entry_fee_cents integer,
  minimum_participants integer,
  prize_percentage integer,
  prize_description text,
  terms text,
  free_ranking_starts_at timestamptz,
  enrollment_opens_at timestamptz,
  enrollment_closes_at timestamptz,
  enrollments_mode text,
  coming_soon_message text,
  participants_count integer,
  estimated_prize_cents integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ps.id,
    ps.title,
    ps.status,
    ps.entry_fee_cents,
    ps.minimum_participants,
    ps.prize_percentage,
    ps.prize_description,
    ps.terms,
    ps.free_ranking_starts_at,
    ps.enrollment_opens_at,
    ps.enrollment_closes_at,
    ps.enrollments_mode,
    ps.coming_soon_message,
    COUNT(e.id) FILTER (WHERE e.status = 'active')::int,
    (
      COUNT(e.id) FILTER (WHERE e.status = 'active')
      * ps.entry_fee_cents
      * ps.prize_percentage
      / 100
    )::int
  FROM pool_settings ps
  LEFT JOIN enrollments e ON e.pool_id = ps.id
  WHERE ps.slug = 'copa-2026'
  GROUP BY ps.id
$$;

REVOKE ALL ON FUNCTION private.get_pool_public_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_pool_public_summary() TO authenticated, service_role;

DROP VIEW IF EXISTS public.pool_public_summary;
CREATE VIEW public.pool_public_summary WITH (security_invoker = true) AS
SELECT * FROM private.get_pool_public_summary();
GRANT SELECT ON public.pool_public_summary TO authenticated, service_role;
