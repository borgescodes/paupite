BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

ALTER TABLE public.pool_settings
  ADD COLUMN IF NOT EXISTS pool_ends_at timestamptz;

ALTER TABLE public.prize_requests
  ADD COLUMN IF NOT EXISTS pix_key text;

UPDATE public.enrollments
SET status = CASE
  WHEN status IN ('confirmed', 'paid') THEN 'active'
  WHEN status = 'pending' THEN 'requested'
  ELSE status
END
WHERE status IN ('confirmed', 'paid', 'pending');

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

UPDATE public.prize_requests
SET status = 'requested'
WHERE status = 'pending';

ALTER TABLE public.prize_requests
  DROP CONSTRAINT IF EXISTS prize_requests_pix_key_nonempty;

ALTER TABLE public.prize_requests
  ADD CONSTRAINT prize_requests_pix_key_nonempty
  CHECK (pix_key IS NULL OR btrim(pix_key) <> '');

CREATE INDEX IF NOT EXISTS prize_requests_pool_status_idx
  ON public.prize_requests(pool_id, status);

-- Staff precisa operar inscrições, pagamentos e solicitações de prêmio.
DROP POLICY IF EXISTS enrollments_superadmin_select ON public.enrollments;
DROP POLICY IF EXISTS enrollments_staff_select ON public.enrollments;
CREATE POLICY enrollments_staff_select
ON public.enrollments FOR SELECT TO authenticated
USING (private.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS payments_superadmin_select ON public.payments;
DROP POLICY IF EXISTS payments_staff_select ON public.payments;
CREATE POLICY payments_staff_select
ON public.payments FOR SELECT TO authenticated
USING (private.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS prize_requests_superadmin_select ON public.prize_requests;
DROP POLICY IF EXISTS prize_requests_staff_select ON public.prize_requests;
CREATE POLICY prize_requests_staff_select
ON public.prize_requests FOR SELECT TO authenticated
USING (private.is_active_staff(auth.uid()));

-- Palpites especiais: além da janela aberta, o jogador precisa estar ativo.
DROP POLICY IF EXISTS special_predictions_insert_own_open ON public.special_predictions;
DROP POLICY IF EXISTS special_predictions_update_own_open ON public.special_predictions;

CREATE POLICY special_predictions_insert_own_open
ON public.special_predictions FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND private.special_predictions_open(pool_id)
  AND EXISTS (
    SELECT 1
    FROM public.enrollments enrollment
    WHERE enrollment.pool_id = special_predictions.pool_id
      AND enrollment.user_id = auth.uid()
      AND enrollment.status = 'active'
  )
);

CREATE POLICY special_predictions_update_own_open
ON public.special_predictions FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  AND private.special_predictions_open(pool_id)
  AND EXISTS (
    SELECT 1
    FROM public.enrollments enrollment
    WHERE enrollment.pool_id = special_predictions.pool_id
      AND enrollment.user_id = auth.uid()
      AND enrollment.status = 'active'
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND private.special_predictions_open(pool_id)
  AND EXISTS (
    SELECT 1
    FROM public.enrollments enrollment
    WHERE enrollment.pool_id = special_predictions.pool_id
      AND enrollment.user_id = auth.uid()
      AND enrollment.status = 'active'
  )
);

-- Resumo público do bolão com fim configurável e contagem somente de ativos.
DROP VIEW IF EXISTS public.pool_public_summary;
DROP FUNCTION IF EXISTS private.get_pool_public_summary();

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
  GROUP BY ps.id;
$$;

REVOKE ALL ON FUNCTION private.get_pool_public_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_pool_public_summary() TO authenticated, service_role;

CREATE VIEW public.pool_public_summary
WITH (security_invoker = true)
AS SELECT * FROM private.get_pool_public_summary();

GRANT SELECT ON public.pool_public_summary TO authenticated, service_role;

-- Ranking oficial: apenas inscrição active no pool atual.
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
