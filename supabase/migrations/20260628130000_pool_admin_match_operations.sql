BEGIN;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS matches_deleted_at_idx
  ON public.matches(deleted_at)
  WHERE deleted_at IS NOT NULL;

UPDATE public.pool_scoring_rules
SET special_points = COALESCE(special_points, '{}'::jsonb) - 'top_scorer',
    special_results = COALESCE(special_results, '{}'::jsonb) - 'top_scorer',
    updated_at = now();

CREATE OR REPLACE FUNCTION private.special_prediction_points(
  _prediction public.special_predictions
)
RETURNS TABLE (points integer, breakdown jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  rules public.pool_scoring_rules%ROWTYPE;
  result_champion uuid;
  result_runner_up uuid;
  result_third_place uuid;
  champion_hit boolean := false;
  runner_up_hit boolean := false;
  third_place_hit boolean := false;
  podium_hit boolean := false;
  total integer := 0;
BEGIN
  SELECT * INTO rules
  FROM public.pool_scoring_rules
  WHERE pool_id = _prediction.pool_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, '{}'::jsonb;
    RETURN;
  END IF;

  result_champion := NULLIF(rules.special_results->>'champion_team_id', '')::uuid;
  result_runner_up := NULLIF(rules.special_results->>'runner_up_team_id', '')::uuid;
  result_third_place := NULLIF(rules.special_results->>'third_place_team_id', '')::uuid;

  champion_hit := result_champion IS NOT NULL
    AND _prediction.champion_team_id IS NOT DISTINCT FROM result_champion;
  runner_up_hit := result_runner_up IS NOT NULL
    AND _prediction.runner_up_team_id IS NOT DISTINCT FROM result_runner_up;
  third_place_hit := result_third_place IS NOT NULL
    AND _prediction.third_place_team_id IS NOT DISTINCT FROM result_third_place;
  podium_hit := champion_hit AND runner_up_hit AND third_place_hit;

  IF champion_hit THEN
    total := total + COALESCE((rules.special_points->>'champion')::int, 60);
  END IF;
  IF runner_up_hit THEN
    total := total + COALESCE((rules.special_points->>'runner_up')::int, 35);
  END IF;
  IF third_place_hit THEN
    total := total + COALESCE((rules.special_points->>'third_place')::int, 25);
  END IF;
  IF podium_hit THEN
    total := total + COALESCE((rules.special_points->>'perfect_podium')::int, 30);
  END IF;

  RETURN QUERY SELECT total, jsonb_build_object(
    'champion_hit', champion_hit,
    'runner_up_hit', runner_up_hit,
    'third_place_hit', third_place_hit,
    'perfect_podium', podium_hit,
    'points', total
  );
END;
$$;

DO $$
DECLARE
  target_pool_id uuid;
BEGIN
  FOR target_pool_id IN SELECT id FROM public.pool_settings LOOP
    PERFORM private.recalculate_special_predictions(target_pool_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION private.zero_match_bet_points(_match_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  affected integer := 0;
BEGIN
  UPDATE public.bets
  SET points = 0,
      knockout_points_breakdown = CASE
        WHEN knockout_points_breakdown IS NULL THEN '{}'::jsonb
        ELSE knockout_points_breakdown || jsonb_build_object('points', 0, 'reset_reason', 'match_not_scoreable')
      END
  WHERE match_id = _match_id;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION private.recalculate_match_points(_match_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  m record;
  b record;
  rules public.pool_scoring_rules%ROWTYPE;
  stage_key text;
  actual_home integer;
  actual_away integer;
  actual_outcome text;
  predicted_home integer;
  predicted_away integer;
  predicted_outcome text;
  exact_hit boolean;
  result_hit boolean;
  qualified_hit boolean;
  method_hit boolean;
  combo_hit boolean;
  base_points integer;
  phase_weight numeric;
  team_multiplier numeric;
  home_multiplier numeric;
  away_multiplier numeric;
  calculated_points integer;
  breakdown jsonb;
  updated_count integer := 0;
  point_label text;
BEGIN
  SELECT
    matches.*,
    home_team.external_key AS home_external_key,
    away_team.external_key AS away_external_key
  INTO m
  FROM public.matches
  LEFT JOIN public.teams home_team ON home_team.id = matches.home_team_id
  LEFT JOIN public.teams away_team ON away_team.id = matches.away_team_id
  WHERE matches.id = _match_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF m.deleted_at IS NOT NULL OR m.status IN ('scheduled', 'open', 'locked', 'live', 'canceled') THEN
    RETURN private.zero_match_bet_points(_match_id);
  END IF;

  IF m.status NOT IN ('closed', 'scored') THEN
    RETURN 0;
  END IF;

  SELECT psr.*
  INTO rules
  FROM public.pool_scoring_rules psr
  JOIN public.pool_settings ps ON ps.id = psr.pool_id
  WHERE ps.slug = 'world-cup-2026'
  LIMIT 1;

  FOR b IN
    SELECT *
    FROM public.bets
    WHERE match_id = _match_id
  LOOP
    breakdown := '{}'::jsonb;

    IF private.is_knockout_stage(m.stage) THEN
      stage_key := private.normalize_knockout_stage(m.stage);
      actual_home := COALESCE(m.regulation_home_score, m.home_score);
      actual_away := COALESCE(m.regulation_away_score, m.away_score);
      predicted_home := COALESCE(b.regulation_home_score, b.home_score);
      predicted_away := COALESCE(b.regulation_away_score, b.away_score);

      actual_outcome := CASE
        WHEN actual_home > actual_away THEN 'home'
        WHEN actual_away > actual_home THEN 'away'
        ELSE 'draw'
      END;
      predicted_outcome := CASE
        WHEN predicted_home > predicted_away THEN 'home'
        WHEN predicted_away > predicted_home THEN 'away'
        ELSE 'draw'
      END;

      exact_hit := actual_home = predicted_home AND actual_away = predicted_away;
      result_hit := actual_outcome = predicted_outcome;
      qualified_hit := m.qualified_team_id IS NOT NULL
        AND b.predicted_qualified_team_id IS NOT DISTINCT FROM m.qualified_team_id;
      method_hit := m.qualification_method IS NOT NULL
        AND b.predicted_qualification_method IS NOT DISTINCT FROM m.qualification_method;
      combo_hit := exact_hit AND qualified_hit AND method_hit;

      base_points := 0;
      IF exact_hit THEN
        base_points := base_points + COALESCE((rules.base_points->>'exact_score')::int, 3);
      ELSIF result_hit THEN
        base_points := base_points + COALESCE((rules.base_points->>'regulation_result')::int, 1);
      END IF;
      IF qualified_hit THEN
        base_points := base_points + COALESCE((rules.base_points->>'qualified_team')::int, 2);
      END IF;
      IF method_hit THEN
        base_points := base_points + COALESCE((rules.base_points->>'qualification_method')::int, 1);
      END IF;
      IF combo_hit THEN
        base_points := base_points + COALESCE((rules.base_points->>'perfect_combo')::int, 1);
      END IF;

      phase_weight := COALESCE((rules.stage_weights->>stage_key)::numeric, 1);
      home_multiplier := GREATEST(
        COALESCE((rules.team_multipliers->>(m.home_team_id::text))::numeric, 1),
        COALESCE((rules.team_multipliers->>COALESCE(m.home_external_key, ''))::numeric, 1)
      );
      away_multiplier := GREATEST(
        COALESCE((rules.team_multipliers->>(m.away_team_id::text))::numeric, 1),
        COALESCE((rules.team_multipliers->>COALESCE(m.away_external_key, ''))::numeric, 1)
      );
      team_multiplier := GREATEST(home_multiplier, away_multiplier, 1);
      calculated_points := ROUND(base_points * phase_weight * team_multiplier)::int;
      breakdown := jsonb_build_object(
        'stage', stage_key,
        'exact_score', exact_hit,
        'regulation_result', result_hit,
        'qualified_team', qualified_hit,
        'qualification_method', method_hit,
        'perfect_combo', combo_hit,
        'base_points', base_points,
        'phase_weight', phase_weight,
        'team_multiplier', team_multiplier,
        'points', calculated_points
      );
    ELSE
      calculated_points := public.calc_bet_points(m.home_score, m.away_score, b.home_score, b.away_score);
    END IF;

    UPDATE public.bets
    SET points = calculated_points,
        locked_at = COALESCE(locked_at, now()),
        knockout_points_breakdown = CASE
          WHEN private.is_knockout_stage(m.stage) THEN breakdown
          ELSE knockout_points_breakdown
        END
    WHERE id = b.id;

    updated_count := updated_count + 1;

    IF calculated_points > 0
       AND to_regprocedure('private.insert_notification(uuid,text,text,text,jsonb)') IS NOT NULL THEN
      point_label := CASE WHEN calculated_points = 1 THEN 'ponto' ELSE 'pontos' END;
      PERFORM private.insert_notification(
        b.user_id,
        'bet_scored',
        'Palpite pontuado',
        format('Seu palpite somou %s %s nesta partida.', calculated_points, point_label),
        jsonb_build_object(
          'match_id', _match_id,
          'bet_id', b.id,
          'points', calculated_points,
          'dedupe_key', 'bet_scored:' || b.id::text || ':' || _match_id::text
        )
      );
    END IF;
  END LOOP;

  PERFORM private.resolve_knockout_bracket(_match_id);
  RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_match_score(
  _match_id uuid,
  _new_home_score integer,
  _new_away_score integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  m public.matches%ROWTYPE;
  qualified uuid;
  method text;
BEGIN
  IF _new_home_score IS NULL OR _new_away_score IS NULL
     OR _new_home_score < 0 OR _new_home_score > 99
     OR _new_away_score < 0 OR _new_away_score > 99 THEN
    RAISE EXCEPTION 'Invalid score';
  END IF;

  SELECT * INTO m
  FROM public.matches
  WHERE id = _match_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF private.is_knockout_stage(m.stage) THEN
    IF m.home_team_id IS NULL OR m.away_team_id IS NULL THEN
      RAISE EXCEPTION 'Knockout match teams are not defined';
    END IF;

    IF _new_home_score > _new_away_score THEN
      qualified := m.home_team_id;
      method := 'regulation';
    ELSIF _new_away_score > _new_home_score THEN
      qualified := m.away_team_id;
      method := 'regulation';
    ELSE
      IF m.qualified_team_id NOT IN (m.home_team_id, m.away_team_id) THEN
        RAISE EXCEPTION 'Tied knockout score requires an existing qualified team';
      END IF;
      IF m.qualification_method NOT IN ('extra_time', 'penalties') THEN
        RAISE EXCEPTION 'Tied knockout score requires extra time or penalties';
      END IF;
      qualified := m.qualified_team_id;
      method := m.qualification_method;
    END IF;
  END IF;

  UPDATE public.matches
  SET home_score = _new_home_score,
      away_score = _new_away_score,
      regulation_home_score = CASE WHEN private.is_knockout_stage(stage) THEN _new_home_score ELSE NULL END,
      regulation_away_score = CASE WHEN private.is_knockout_stage(stage) THEN _new_away_score ELSE NULL END,
      qualified_team_id = CASE WHEN private.is_knockout_stage(stage) THEN qualified ELSE NULL END,
      qualification_method = CASE WHEN private.is_knockout_stage(stage) THEN method ELSE NULL END,
      manual_override = true,
      updated_at = now()
  WHERE id = _match_id;

  IF m.status IN ('closed', 'scored') THEN
    RETURN private.recalculate_match_points(_match_id);
  END IF;

  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_match_status(
  _match_id uuid,
  _new_status text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  allowed_statuses text[] := ARRAY['scheduled', 'open', 'locked', 'live', 'closed', 'scored', 'canceled'];
BEGIN
  IF _new_status IS NULL OR NOT (_new_status = ANY(allowed_statuses)) THEN
    RAISE EXCEPTION 'Invalid match status';
  END IF;

  UPDATE public.matches
  SET status = _new_status,
      updated_at = now()
  WHERE id = _match_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF _new_status IN ('closed', 'scored') THEN
    RETURN private.recalculate_match_points(_match_id);
  END IF;

  RETURN private.zero_match_bet_points(_match_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_soft_delete_match(_match_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  UPDATE public.matches
  SET deleted_at = COALESCE(deleted_at, now()),
      status = 'canceled',
      updated_at = now()
  WHERE id = _match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  RETURN private.zero_match_bet_points(_match_id);
END;
$$;

CREATE OR REPLACE FUNCTION private.get_match_bet_trends()
RETURNS TABLE (
  match_id uuid,
  total_bets integer,
  home_pct integer,
  draw_pct integer,
  away_pct integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.match_id,
    COUNT(*)::int AS total_bets,
    ROUND(COUNT(*) FILTER (WHERE b.home_score > b.away_score) * 100.0 / NULLIF(COUNT(*), 0))::int AS home_pct,
    ROUND(COUNT(*) FILTER (WHERE b.home_score = b.away_score) * 100.0 / NULLIF(COUNT(*), 0))::int AS draw_pct,
    ROUND(COUNT(*) FILTER (WHERE b.home_score < b.away_score) * 100.0 / NULLIF(COUNT(*), 0))::int AS away_pct
  FROM public.bets b
  JOIN public.matches m ON m.id = b.match_id
  WHERE m.deleted_at IS NULL
  GROUP BY b.match_id
$$;

CREATE OR REPLACE FUNCTION private.get_ranking_free()
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
    SELECT id AS pool_id, free_ranking_starts_at
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
      COALESCE(SUM(CASE WHEN m.status IN ('closed', 'scored') THEN b.points ELSE 0 END), 0)::int AS total_points,
      COALESCE(SUM(CASE
        WHEN m.status IN ('closed', 'scored')
          AND b.points > 0
          AND COALESCE(m.regulation_home_score, m.home_score) = COALESCE(b.regulation_home_score, b.home_score)
          AND COALESCE(m.regulation_away_score, m.away_score) = COALESCE(b.regulation_away_score, b.away_score)
        THEN 1 ELSE 0 END
      ), 0)::int AS exact_scores_count,
      COALESCE(SUM(CASE
        WHEN m.status IN ('closed', 'scored') AND b.points > 0 THEN 1 ELSE 0 END
      ), 0)::int AS outcome_hits_count,
      COALESCE(SUM(CASE
        WHEN m.status IN ('closed', 'scored')
          AND private.is_knockout_stage(m.stage)
          AND (b.knockout_points_breakdown->>'qualified_team')::boolean
        THEN 1 ELSE 0 END
      ), 0)::int AS knockout_qualified_count,
      COALESCE(SUM(CASE
        WHEN m.status IN ('closed', 'scored')
          AND private.is_knockout_stage(m.stage)
          AND (b.knockout_points_breakdown->>'perfect_combo')::boolean
        THEN 1 ELSE 0 END
      ), 0)::int AS knockout_combo_count,
      0::int AS special_points,
      COUNT(b.id) FILTER (WHERE m.id IS NOT NULL)::int AS bets_count
    FROM public.profiles p
    LEFT JOIN public.bets b ON b.user_id = p.id
    LEFT JOIN public.matches m ON m.id = b.match_id
      AND m.deleted_at IS NULL
      AND (
        (SELECT free_ranking_starts_at FROM settings) IS NULL
        OR m.kickoff_at >= (SELECT free_ranking_starts_at FROM settings)
      )
    WHERE p.status = 'active'
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
    WHERE e.status IN ('active', 'confirmed', 'paid')
    ORDER BY e.user_id, COALESCE(e.activated_at, e.requested_at, e.created_at)
  ),
  aggregates AS (
    SELECT
      p.id AS user_id,
      p.display_name,
      p.nickname,
      p.avatar_url,
      (
        COALESCE(SUM(CASE WHEN m.status IN ('closed', 'scored') THEN b.points ELSE 0 END), 0)
        + COALESCE(MAX(sp.points), 0)
      )::int AS total_points,
      COALESCE(SUM(CASE
        WHEN m.status IN ('closed', 'scored')
          AND b.points > 0
          AND COALESCE(m.regulation_home_score, m.home_score) = COALESCE(b.regulation_home_score, b.home_score)
          AND COALESCE(m.regulation_away_score, m.away_score) = COALESCE(b.regulation_away_score, b.away_score)
        THEN 1 ELSE 0 END
      ), 0)::int AS exact_scores_count,
      COALESCE(SUM(CASE
        WHEN m.status IN ('closed', 'scored') AND b.points > 0 THEN 1 ELSE 0 END
      ), 0)::int AS outcome_hits_count,
      COALESCE(SUM(CASE
        WHEN m.status IN ('closed', 'scored')
          AND private.is_knockout_stage(m.stage)
          AND (b.knockout_points_breakdown->>'qualified_team')::boolean
        THEN 1 ELSE 0 END
      ), 0)::int AS knockout_qualified_count,
      COALESCE(SUM(CASE
        WHEN m.status IN ('closed', 'scored')
          AND private.is_knockout_stage(m.stage)
          AND (b.knockout_points_breakdown->>'perfect_combo')::boolean
        THEN 1 ELSE 0 END
      ), 0)::int AS knockout_combo_count,
      COALESCE(MAX(sp.points), 0)::int AS special_points,
      COUNT(b.id) FILTER (WHERE m.id IS NOT NULL)::int AS bets_count,
      MIN(sp.submitted_at) AS special_submitted_at,
      MIN(active_members.confirmed_at) AS confirmed_at
    FROM active_members
    JOIN public.profiles p
      ON p.id = active_members.user_id
      AND p.status = 'active'
    LEFT JOIN public.bets b ON b.user_id = p.id
    LEFT JOIN public.matches m
      ON m.id = b.match_id
      AND m.deleted_at IS NULL
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

CREATE OR REPLACE VIEW public.ranking_free
WITH (security_invoker = true)
AS SELECT * FROM private.get_ranking_free();

CREATE OR REPLACE VIEW public.ranking_pool
WITH (security_invoker = true)
AS SELECT * FROM private.get_ranking_pool();

CREATE OR REPLACE VIEW public.ranking
WITH (security_invoker = true)
AS SELECT * FROM public.ranking_free;

CREATE OR REPLACE VIEW public.match_bet_trends
WITH (security_invoker = true)
AS SELECT * FROM private.get_match_bet_trends();

GRANT SELECT ON public.ranking, public.ranking_free, public.ranking_pool, public.match_bet_trends
TO authenticated, service_role;

REVOKE ALL ON FUNCTION private.zero_match_bet_points(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_match_score(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_match_status(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_soft_delete_match(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.zero_match_bet_points(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_match_score(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_match_status(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_soft_delete_match(uuid) TO service_role;

COMMIT;
