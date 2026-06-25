-- Corrige a migration de compatibilidade que fez ranking_pool espelhar ranking_free.
-- Mantém uma única tabela de palpites: a diferença entre os rankings é somente
-- a elegibilidade da inscrição no bolão.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.get_ranking_free()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  nickname text,
  avatar_url text,
  total_points integer,
  exact_scores_count integer,
  outcome_hits_count integer,
  bets_count integer,
  rank_position integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH settings AS (
    SELECT free_ranking_starts_at
    FROM public.pool_settings
    WHERE slug = 'world-cup-2026'
    LIMIT 1
  ),
  aggregates AS (
    SELECT
      p.id AS user_id,
      p.display_name,
      p.nickname,
      p.avatar_url,
      COALESCE(SUM(CASE WHEN m.status = 'closed' THEN b.points ELSE 0 END), 0)::int
        AS total_points,
      COALESCE(SUM(CASE
        WHEN m.status = 'closed'
          AND b.points > 0
          AND m.home_score = b.home_score
          AND m.away_score = b.away_score
        THEN 1 ELSE 0 END
      ), 0)::int AS exact_scores_count,
      COALESCE(SUM(CASE
        WHEN m.status = 'closed' AND b.points > 0 THEN 1 ELSE 0 END
      ), 0)::int AS outcome_hits_count,
      COUNT(b.id) FILTER (WHERE m.id IS NOT NULL)::int AS bets_count
    FROM public.profiles p
    LEFT JOIN public.bets b ON b.user_id = p.id
    LEFT JOIN public.matches m ON m.id = b.match_id
      AND (
        (SELECT free_ranking_starts_at FROM settings) IS NULL
        OR m.kickoff_at >= (SELECT free_ranking_starts_at FROM settings)
      )
    WHERE p.status = 'active'
    GROUP BY p.id, p.display_name, p.nickname, p.avatar_url
  )
  SELECT
    aggregates.*,
    RANK() OVER (
      ORDER BY
        total_points DESC,
        exact_scores_count DESC,
        outcome_hits_count DESC,
        bets_count DESC
    )::int AS rank_position
  FROM aggregates;
$$;

CREATE OR REPLACE FUNCTION private.get_ranking_pool()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  nickname text,
  avatar_url text,
  total_points integer,
  exact_scores_count integer,
  outcome_hits_count integer,
  bets_count integer,
  rank_position integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH active_members AS (
    SELECT DISTINCT e.user_id
    FROM public.enrollments e
    WHERE e.status IN ('active', 'confirmed', 'paid')
  ),
  aggregates AS (
    SELECT
      p.id AS user_id,
      p.display_name,
      p.nickname,
      p.avatar_url,
      COALESCE(SUM(CASE WHEN m.status = 'closed' THEN b.points ELSE 0 END), 0)::int
        AS total_points,
      COALESCE(SUM(CASE
        WHEN m.status = 'closed'
          AND b.points > 0
          AND m.home_score = b.home_score
          AND m.away_score = b.away_score
        THEN 1 ELSE 0 END
      ), 0)::int AS exact_scores_count,
      COALESCE(SUM(CASE
        WHEN m.status = 'closed' AND b.points > 0 THEN 1 ELSE 0 END
      ), 0)::int AS outcome_hits_count,
      COUNT(b.id)::int AS bets_count
    FROM active_members
    JOIN public.profiles p
      ON p.id = active_members.user_id
      AND p.status = 'active'
    LEFT JOIN public.bets b ON b.user_id = p.id
    LEFT JOIN public.matches m ON m.id = b.match_id
    GROUP BY p.id, p.display_name, p.nickname, p.avatar_url
  )
  SELECT
    aggregates.*,
    RANK() OVER (
      ORDER BY
        total_points DESC,
        exact_scores_count DESC,
        outcome_hits_count DESC,
        bets_count DESC
    )::int AS rank_position
  FROM aggregates;
$$;

REVOKE ALL ON FUNCTION private.get_ranking_free() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.get_ranking_pool() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_ranking_free() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_ranking_pool() TO authenticated, service_role;

CREATE OR REPLACE VIEW public.ranking_free
WITH (security_invoker = true)
AS SELECT * FROM private.get_ranking_free();

CREATE OR REPLACE VIEW public.ranking_pool
WITH (security_invoker = true)
AS SELECT * FROM private.get_ranking_pool();

CREATE OR REPLACE VIEW public.ranking
WITH (security_invoker = true)
AS SELECT * FROM public.ranking_free;

GRANT SELECT ON public.ranking, public.ranking_free, public.ranking_pool
TO authenticated, service_role;

-- A instalação completa possui pool_id e janelas de inscrição. A migration de
-- compatibilidade do Lovable criou uma versão reduzida. O bloco abaixo corrige
-- a contagem sem exigir que uma dessas duas formas seja descartada.
DO $$
BEGIN
  DROP VIEW IF EXISTS public.pool_public_summary;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'enrollments'
      AND column_name = 'pool_id'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pool_settings'
      AND column_name = 'enrollment_opens_at'
  ) THEN
    EXECUTE $view$
      CREATE VIEW public.pool_public_summary
      WITH (security_invoker = true)
      AS
      SELECT
        settings.id,
        settings.title,
        settings.status,
        settings.entry_fee_cents,
        settings.minimum_participants,
        settings.prize_percentage,
        settings.prize_description,
        settings.terms,
        settings.free_ranking_starts_at,
        settings.enrollment_opens_at,
        settings.enrollment_closes_at,
        COUNT(enrollments.id) FILTER (
          WHERE enrollments.status IN ('active', 'confirmed', 'paid')
        )::int AS participants_count,
        (
          COUNT(enrollments.id) FILTER (
            WHERE enrollments.status IN ('active', 'confirmed', 'paid')
          )
          * settings.entry_fee_cents
          * settings.prize_percentage
          / 100
        )::int AS estimated_prize_cents
      FROM public.pool_settings settings
      LEFT JOIN public.enrollments enrollments
        ON enrollments.pool_id = settings.id
      WHERE settings.slug = 'world-cup-2026'
      GROUP BY settings.id
    $view$;
  ELSE
    EXECUTE $view$
      CREATE VIEW public.pool_public_summary
      WITH (security_invoker = true)
      AS
      SELECT
        settings.id,
        settings.title,
        settings.status,
        settings.entry_fee_cents,
        settings.minimum_participants,
        settings.prize_percentage,
        settings.prize_description,
        settings.terms,
        COUNT(enrollments.id) FILTER (
          WHERE enrollments.status IN ('active', 'confirmed', 'paid')
        )::int AS participants_count,
        (
          COUNT(enrollments.id) FILTER (
            WHERE enrollments.status IN ('active', 'confirmed', 'paid')
          )
          * settings.entry_fee_cents
          * settings.prize_percentage
          / 100
        )::int AS estimated_prize_cents
      FROM public.pool_settings settings
      LEFT JOIN public.enrollments enrollments ON true
      WHERE settings.slug = 'world-cup-2026'
      GROUP BY settings.id
    $view$;
  END IF;
END
$$;

GRANT SELECT ON public.pool_public_summary TO authenticated, service_role;

COMMIT;
