BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

-- Status destrutivos/operacionais sem delete físico.
ALTER TABLE public.pool_settings
  ADD COLUMN IF NOT EXISTS pool_ends_at timestamptz;

ALTER TABLE public.pool_settings
  DROP CONSTRAINT IF EXISTS pool_settings_status_check;

ALTER TABLE public.pool_settings
  ADD CONSTRAINT pool_settings_status_check
  CHECK (status IN ('draft', 'open', 'closed', 'archived'));

ALTER TABLE public.enrollments
  DROP CONSTRAINT IF EXISTS enrollments_status_check;

ALTER TABLE public.enrollments
  ADD CONSTRAINT enrollments_status_check
  CHECK (
    status IN (
      'requested',
      'payment_pending',
      'active',
      'rejected',
      'cancelled',
      'removed',
      'refund_pending'
    )
  );

CREATE INDEX IF NOT EXISTS enrollments_pool_status_idx
  ON public.enrollments(pool_id, status);

-- Summary: player não enxerga bolão arquivado; staff continua enxergando na operação/admin.
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
  pool_ends_at timestamptz,
  participants_count integer,
  estimated_prize_cents integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
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
    ps.pool_ends_at,
    COUNT(e.id) FILTER (WHERE e.status = 'active')::int AS participants_count,
    (
      COUNT(e.id) FILTER (WHERE e.status = 'active')
      * ps.entry_fee_cents
      * ps.prize_percentage
      / 100
    )::int AS estimated_prize_cents
  FROM public.pool_settings ps
  LEFT JOIN public.enrollments e ON e.pool_id = ps.id
  WHERE ps.slug = 'world-cup-2026'
    AND (
      ps.status <> 'archived'
      OR private.is_active_staff(auth.uid())
    )
  GROUP BY ps.id;
$$;

REVOKE ALL ON FUNCTION private.get_pool_public_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_pool_public_summary() TO authenticated, service_role;

CREATE OR REPLACE VIEW public.pool_public_summary
WITH (security_invoker = true)
AS SELECT * FROM private.get_pool_public_summary();

GRANT SELECT ON public.pool_public_summary TO authenticated, service_role;

-- Ranking oficial: somente inscrição ativa no pool atual entra no ranking do bolão.
CREATE OR REPLACE FUNCTION private.get_ranking_pool()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  nickname text,
  avatar_url text,
  total_points integer,
  exact_scores_count integer,
  outcome_hits_count integer,
  knockout_qualified_count integer,
  knockout_combo_count integer,
  special_points integer,
  bets_count integer,
  rank_position integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  WITH settings AS (
    SELECT id AS pool_id
    FROM public.pool_settings
    WHERE slug = 'world-cup-2026'
    LIMIT 1
  ),
  active_members AS (
    SELECT DISTINCT ON (e.user_id)
      e.user_id,
      COALESCE(e.activated_at, e.requested_at, e.created_at) AS confirmed_at
    FROM public.enrollments e
    WHERE e.pool_id = (SELECT pool_id FROM settings)
      AND e.status = 'active'
    ORDER BY e.user_id, COALESCE(e.activated_at, e.requested_at, e.created_at)
  ),
  aggregates AS (
    SELECT
      p.id AS user_id,
      p.display_name,
      p.nickname,
      p.avatar_url,
      (
        COALESCE(SUM(CASE WHEN m.status = 'closed' THEN b.points ELSE 0 END), 0)
        + COALESCE(MAX(sp.points), 0)
      )::int AS total_points,
      COALESCE(SUM(CASE
        WHEN m.status = 'closed'
          AND b.points > 0
          AND COALESCE(m.regulation_home_score, m.home_score) = COALESCE(b.regulation_home_score, b.home_score)
          AND COALESCE(m.regulation_away_score, m.away_score) = COALESCE(b.regulation_away_score, b.away_score)
        THEN 1 ELSE 0 END
      ), 0)::int AS exact_scores_count,
      COALESCE(SUM(CASE
        WHEN m.status = 'closed' AND b.points > 0 THEN 1 ELSE 0 END
      ), 0)::int AS outcome_hits_count,
      COALESCE(SUM(CASE
        WHEN m.status = 'closed'
          AND private.is_knockout_stage(m.stage)
          AND (b.knockout_points_breakdown->>'qualified_team')::boolean
        THEN 1 ELSE 0 END
      ), 0)::int AS knockout_qualified_count,
      COALESCE(SUM(CASE
        WHEN m.status = 'closed'
          AND private.is_knockout_stage(m.stage)
          AND (b.knockout_points_breakdown->>'perfect_combo')::boolean
        THEN 1 ELSE 0 END
      ), 0)::int AS knockout_combo_count,
      COALESCE(MAX(sp.points), 0)::int AS special_points,
      COUNT(b.id)::int AS bets_count,
      MIN(sp.submitted_at) AS special_submitted_at,
      MIN(active_members.confirmed_at) AS confirmed_at
    FROM active_members
    JOIN public.profiles p
      ON p.id = active_members.user_id
      AND p.status = 'active'
    LEFT JOIN public.bets b ON b.user_id = p.id
    LEFT JOIN public.matches m ON m.id = b.match_id
    LEFT JOIN public.special_predictions sp
      ON sp.user_id = p.id
      AND sp.pool_id = (SELECT pool_id FROM settings)
    GROUP BY p.id, p.display_name, p.nickname, p.avatar_url
  )
  SELECT
    aggregates.user_id,
    aggregates.display_name,
    aggregates.nickname,
    aggregates.avatar_url,
    aggregates.total_points,
    aggregates.exact_scores_count,
    aggregates.outcome_hits_count,
    aggregates.knockout_qualified_count,
    aggregates.knockout_combo_count,
    aggregates.special_points,
    aggregates.bets_count,
    RANK() OVER (
      ORDER BY
        total_points DESC,
        exact_scores_count DESC,
        knockout_qualified_count DESC,
        knockout_combo_count DESC,
        special_points DESC,
        special_submitted_at ASC NULLS LAST,
        confirmed_at ASC NULLS LAST
    )::int AS rank_position
  FROM aggregates;
$$;

REVOKE ALL ON FUNCTION private.get_ranking_pool() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_ranking_pool() TO authenticated, service_role;

CREATE OR REPLACE VIEW public.ranking_pool
WITH (security_invoker = true)
AS SELECT * FROM private.get_ranking_pool();

GRANT SELECT ON public.ranking_pool TO authenticated, service_role;

COMMIT;
