BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Schema: bracket metadata, knockout guesses and special pool predictions.
-- ---------------------------------------------------------------------------
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS bracket_source_home text,
  ADD COLUMN IF NOT EXISTS bracket_source_away text,
  ADD COLUMN IF NOT EXISTS bracket_home_source_match_number integer,
  ADD COLUMN IF NOT EXISTS bracket_home_source_result text,
  ADD COLUMN IF NOT EXISTS bracket_away_source_match_number integer,
  ADD COLUMN IF NOT EXISTS bracket_away_source_result text,
  ADD COLUMN IF NOT EXISTS qualification_method text,
  ADD COLUMN IF NOT EXISTS qualified_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS regulation_home_score integer,
  ADD COLUMN IF NOT EXISTS regulation_away_score integer;

ALTER TABLE public.bets
  ADD COLUMN IF NOT EXISTS regulation_home_score integer,
  ADD COLUMN IF NOT EXISTS regulation_away_score integer,
  ADD COLUMN IF NOT EXISTS predicted_qualified_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS predicted_qualification_method text,
  ADD COLUMN IF NOT EXISTS knockout_points_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS special_points_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_bracket_home_result_check') THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_bracket_home_result_check
      CHECK (bracket_home_source_result IS NULL OR bracket_home_source_result IN ('winner', 'loser'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_bracket_away_result_check') THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_bracket_away_result_check
      CHECK (bracket_away_source_result IS NULL OR bracket_away_source_result IN ('winner', 'loser'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_qualification_method_check') THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_qualification_method_check
      CHECK (qualification_method IS NULL OR qualification_method IN ('regulation', 'extra_time', 'penalties'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_regulation_score_check') THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_regulation_score_check
      CHECK (
        (regulation_home_score IS NULL OR regulation_home_score BETWEEN 0 AND 99)
        AND (regulation_away_score IS NULL OR regulation_away_score BETWEEN 0 AND 99)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bets_predicted_qualification_method_check') THEN
    ALTER TABLE public.bets
      ADD CONSTRAINT bets_predicted_qualification_method_check
      CHECK (
        predicted_qualification_method IS NULL
        OR predicted_qualification_method IN ('regulation', 'extra_time', 'penalties')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bets_regulation_score_check') THEN
    ALTER TABLE public.bets
      ADD CONSTRAINT bets_regulation_score_check
      CHECK (
        (regulation_home_score IS NULL OR regulation_home_score BETWEEN 0 AND 99)
        AND (regulation_away_score IS NULL OR regulation_away_score BETWEEN 0 AND 99)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS matches_match_number_idx
  ON public.matches(match_number);

CREATE INDEX IF NOT EXISTS matches_bracket_home_source_idx
  ON public.matches(bracket_home_source_match_number)
  WHERE bracket_home_source_match_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS matches_bracket_away_source_idx
  ON public.matches(bracket_away_source_match_number)
  WHERE bracket_away_source_match_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pool_scoring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.pool_settings(id) ON DELETE CASCADE,
  stage_weights jsonb NOT NULL,
  base_points jsonb NOT NULL,
  team_multipliers jsonb NOT NULL DEFAULT '{}'::jsonb,
  special_points jsonb NOT NULL,
  special_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  specials_lock_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pool_scoring_rules
  ADD COLUMN IF NOT EXISTS stage_weights jsonb,
  ADD COLUMN IF NOT EXISTS base_points jsonb,
  ADD COLUMN IF NOT EXISTS team_multipliers jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS special_points jsonb,
  ADD COLUMN IF NOT EXISTS special_results jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS specials_lock_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.pool_scoring_rules
SET stage_weights = COALESCE(
      stage_weights,
      '{"round_of_32":1,"round_of_16":2,"quarterfinal":3,"semifinal":4,"third_place":3,"final":6}'::jsonb
    ),
    base_points = COALESCE(
      base_points,
      '{"exact_score":3,"regulation_result":1,"qualified_team":2,"qualification_method":1,"perfect_combo":1}'::jsonb
    ),
    team_multipliers = COALESCE(team_multipliers, '{}'::jsonb),
    special_points = COALESCE(
      special_points,
      '{"champion":60,"runner_up":35,"third_place":25,"top_scorer":40,"perfect_podium":30}'::jsonb
    ),
    special_results = COALESCE(special_results, '{}'::jsonb),
    created_at = COALESCE(created_at, now()),
    updated_at = COALESCE(updated_at, now());

ALTER TABLE public.pool_scoring_rules
  ALTER COLUMN stage_weights SET NOT NULL,
  ALTER COLUMN base_points SET NOT NULL,
  ALTER COLUMN team_multipliers SET NOT NULL,
  ALTER COLUMN team_multipliers SET DEFAULT '{}'::jsonb,
  ALTER COLUMN special_points SET NOT NULL,
  ALTER COLUMN special_results SET NOT NULL,
  ALTER COLUMN special_results SET DEFAULT '{}'::jsonb,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pool_scoring_rules_pool_unique') THEN
    ALTER TABLE public.pool_scoring_rules
      ADD CONSTRAINT pool_scoring_rules_pool_unique UNIQUE (pool_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.special_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.pool_settings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  champion_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  runner_up_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  third_place_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  top_scorer text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  points integer NOT NULL DEFAULT 0,
  points_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.special_predictions
  ADD COLUMN IF NOT EXISTS champion_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS runner_up_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS third_place_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS top_scorer text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS points integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_breakdown jsonb DEFAULT '{}'::jsonb;

UPDATE public.special_predictions
SET submitted_at = COALESCE(submitted_at, now()),
    updated_at = COALESCE(updated_at, now()),
    points = COALESCE(points, 0),
    points_breakdown = COALESCE(points_breakdown, '{}'::jsonb);

ALTER TABLE public.special_predictions
  ALTER COLUMN submitted_at SET NOT NULL,
  ALTER COLUMN submitted_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN points SET NOT NULL,
  ALTER COLUMN points SET DEFAULT 0,
  ALTER COLUMN points_breakdown SET NOT NULL,
  ALTER COLUMN points_breakdown SET DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'special_predictions_pool_user_unique') THEN
    ALTER TABLE public.special_predictions
      ADD CONSTRAINT special_predictions_pool_user_unique UNIQUE (pool_id, user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS special_predictions_user_pool_idx
  ON public.special_predictions(user_id, pool_id);

CREATE INDEX IF NOT EXISTS special_predictions_pool_points_idx
  ON public.special_predictions(pool_id, points DESC);

INSERT INTO public.pool_scoring_rules (
  pool_id,
  stage_weights,
  base_points,
  team_multipliers,
  special_points,
  special_results,
  specials_lock_at
)
SELECT
  id,
  '{"round_of_32":1,"round_of_16":2,"quarterfinal":3,"semifinal":4,"third_place":3,"final":6}'::jsonb,
  '{"exact_score":3,"regulation_result":1,"qualified_team":2,"qualification_method":1,"perfect_combo":1}'::jsonb,
  '{}'::jsonb,
  '{"champion":60,"runner_up":35,"third_place":25,"top_scorer":40,"perfect_podium":30}'::jsonb,
  '{}'::jsonb,
  '2026-06-28 15:55:00-03'::timestamptz
FROM public.pool_settings
WHERE slug = 'world-cup-2026'
ON CONFLICT (pool_id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.special_predictions_open(_pool_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT COALESCE((
    SELECT specials_lock_at IS NULL OR now() < specials_lock_at
    FROM public.pool_scoring_rules
    WHERE pool_id = _pool_id
    LIMIT 1
  ), false);
$$;

DROP TRIGGER IF EXISTS trg_pool_scoring_rules_updated_at ON public.pool_scoring_rules;
CREATE TRIGGER trg_pool_scoring_rules_updated_at
BEFORE UPDATE ON public.pool_scoring_rules
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS and grants for the new tables.
-- ---------------------------------------------------------------------------
ALTER TABLE public.pool_scoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.special_predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pool_scoring_rules_select_auth ON public.pool_scoring_rules;
DROP POLICY IF EXISTS pool_scoring_rules_staff_write ON public.pool_scoring_rules;
DROP POLICY IF EXISTS special_predictions_select_own ON public.special_predictions;
DROP POLICY IF EXISTS special_predictions_staff_select ON public.special_predictions;
DROP POLICY IF EXISTS special_predictions_insert_own_open ON public.special_predictions;
DROP POLICY IF EXISTS special_predictions_update_own_open ON public.special_predictions;
DROP POLICY IF EXISTS special_predictions_staff_all ON public.special_predictions;

CREATE POLICY pool_scoring_rules_select_auth
ON public.pool_scoring_rules FOR SELECT TO authenticated
USING (true);

CREATE POLICY pool_scoring_rules_staff_write
ON public.pool_scoring_rules FOR ALL TO authenticated
USING (private.is_active_staff(auth.uid()))
WITH CHECK (private.is_active_staff(auth.uid()));

CREATE POLICY special_predictions_select_own
ON public.special_predictions FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY special_predictions_staff_select
ON public.special_predictions FOR SELECT TO authenticated
USING (private.is_active_staff(auth.uid()));

CREATE POLICY special_predictions_insert_own_open
ON public.special_predictions FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND private.special_predictions_open(pool_id)
);

CREATE POLICY special_predictions_update_own_open
ON public.special_predictions FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  AND private.special_predictions_open(pool_id)
)
WITH CHECK (
  user_id = auth.uid()
  AND private.special_predictions_open(pool_id)
);

CREATE POLICY special_predictions_staff_all
ON public.special_predictions FOR ALL TO authenticated
USING (private.is_active_staff(auth.uid()))
WITH CHECK (private.is_active_staff(auth.uid()));

REVOKE ALL ON TABLE public.pool_scoring_rules FROM anon, authenticated;
REVOKE ALL ON TABLE public.special_predictions FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pool_scoring_rules TO authenticated;
GRANT SELECT ON TABLE public.special_predictions TO authenticated;
GRANT INSERT (pool_id, user_id, champion_team_id, runner_up_team_id, third_place_team_id, top_scorer)
  ON TABLE public.special_predictions TO authenticated;
GRANT UPDATE (champion_team_id, runner_up_team_id, third_place_team_id, top_scorer)
  ON TABLE public.special_predictions TO authenticated;
GRANT ALL ON TABLE public.pool_scoring_rules, public.special_predictions TO service_role;

-- ---------------------------------------------------------------------------
-- Helpers: stages, lock checks, prediction scoring and bracket resolution.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.normalize_knockout_stage(_stage text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _stage
    WHEN 'quarter_finals' THEN 'quarterfinal'
    WHEN 'quarter-finals' THEN 'quarterfinal'
    WHEN 'semi_finals' THEN 'semifinal'
    WHEN 'semi-finals' THEN 'semifinal'
    ELSE _stage
  END;
$$;

CREATE OR REPLACE FUNCTION private.is_knockout_stage(_stage text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT private.normalize_knockout_stage(_stage) IN (
    'round_of_32',
    'round_of_16',
    'quarterfinal',
    'semifinal',
    'third_place',
    'final'
  );
$$;

CREATE OR REPLACE FUNCTION private.normalized_special_text(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(btrim(COALESCE(_value, '')), '\s+', ' ', 'g'));
$$;

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
  result_top_scorer text;
  champion_hit boolean := false;
  runner_up_hit boolean := false;
  third_place_hit boolean := false;
  top_scorer_hit boolean := false;
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
  result_top_scorer := rules.special_results->>'top_scorer';

  champion_hit := result_champion IS NOT NULL
    AND _prediction.champion_team_id IS NOT DISTINCT FROM result_champion;
  runner_up_hit := result_runner_up IS NOT NULL
    AND _prediction.runner_up_team_id IS NOT DISTINCT FROM result_runner_up;
  third_place_hit := result_third_place IS NOT NULL
    AND _prediction.third_place_team_id IS NOT DISTINCT FROM result_third_place;
  top_scorer_hit := private.normalized_special_text(result_top_scorer) <> ''
    AND private.normalized_special_text(_prediction.top_scorer)
      = private.normalized_special_text(result_top_scorer);
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
  IF top_scorer_hit THEN
    total := total + COALESCE((rules.special_points->>'top_scorer')::int, 40);
  END IF;
  IF podium_hit THEN
    total := total + COALESCE((rules.special_points->>'perfect_podium')::int, 30);
  END IF;

  RETURN QUERY SELECT total, jsonb_build_object(
    'champion_hit', champion_hit,
    'runner_up_hit', runner_up_hit,
    'third_place_hit', third_place_hit,
    'top_scorer_hit', top_scorer_hit,
    'perfect_podium', podium_hit,
    'points', total
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.set_special_prediction_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  scored record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.submitted_at := OLD.submitted_at;
    NEW.locked_at := OLD.locked_at;
  END IF;

  NEW.updated_at := now();
  NEW.top_scorer := NULLIF(btrim(COALESCE(NEW.top_scorer, '')), '');

  IF NOT private.special_predictions_open(NEW.pool_id) THEN
    NEW.locked_at := COALESCE(NEW.locked_at, now());
  END IF;

  SELECT * INTO scored
  FROM private.special_prediction_points(NEW);

  NEW.points := COALESCE(scored.points, 0);
  NEW.points_breakdown := COALESCE(scored.breakdown, '{}'::jsonb);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_special_prediction_points ON public.special_predictions;
CREATE TRIGGER trg_set_special_prediction_points
BEFORE INSERT OR UPDATE ON public.special_predictions
FOR EACH ROW EXECUTE FUNCTION private.set_special_prediction_points();

CREATE OR REPLACE FUNCTION private.recalculate_special_predictions(_pool_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  item record;
  scored record;
  updated_count integer := 0;
BEGIN
  FOR item IN
    SELECT *
    FROM public.special_predictions
    WHERE pool_id = _pool_id
  LOOP
    SELECT * INTO scored
    FROM private.special_prediction_points(item);

    UPDATE public.special_predictions
    SET points = COALESCE(scored.points, 0),
        points_breakdown = COALESCE(scored.breakdown, '{}'::jsonb),
        updated_at = now()
    WHERE id = item.id;

    updated_count := updated_count + 1;
  END LOOP;

  RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION private.recalculate_special_predictions_on_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  PERFORM private.recalculate_special_predictions(NEW.pool_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_special_predictions_on_rules ON public.pool_scoring_rules;
CREATE TRIGGER trg_recalculate_special_predictions_on_rules
AFTER UPDATE OF special_points, special_results ON public.pool_scoring_rules
FOR EACH ROW EXECUTE FUNCTION private.recalculate_special_predictions_on_rules();

CREATE OR REPLACE FUNCTION public.enforce_player_bet_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  trusted boolean :=
    COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR current_user IN ('postgres', 'supabase_admin', 'service_role');
  match_row record;
  regulation_home integer;
  regulation_away integer;
  knockout boolean := false;
BEGIN
  IF trusted THEN
    RETURN NEW;
  END IF;

  SELECT id, kickoff_at, stage, home_team_id, away_team_id
  INTO match_row
  FROM public.matches
  WHERE id = NEW.match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF auth.uid() IS NULL OR NEW.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Players can write only their own bets';
  END IF;
  IF match_row.kickoff_at <= now() THEN
    RAISE EXCEPTION 'Betting is closed for this match';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.points <> 0 OR NEW.locked_at IS NOT NULL THEN
      RAISE EXCEPTION 'Players cannot define points or lock state';
    END IF;
  ELSE
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.match_id IS DISTINCT FROM OLD.match_id
       OR NEW.points IS DISTINCT FROM OLD.points
       OR NEW.locked_at IS DISTINCT FROM OLD.locked_at
       OR NEW.knockout_points_breakdown IS DISTINCT FROM OLD.knockout_points_breakdown
       OR NEW.special_points_breakdown IS DISTINCT FROM OLD.special_points_breakdown THEN
      RAISE EXCEPTION 'Players can update only prediction fields';
    END IF;
  END IF;

  knockout := private.is_knockout_stage(match_row.stage);

  IF knockout THEN
    IF match_row.home_team_id IS NULL OR match_row.away_team_id IS NULL THEN
      RAISE EXCEPTION 'Knockout bets open only after both teams are defined';
    END IF;

    regulation_home := COALESCE(NEW.regulation_home_score, NEW.home_score);
    regulation_away := COALESCE(NEW.regulation_away_score, NEW.away_score);

    IF regulation_home IS NULL OR regulation_away IS NULL
       OR regulation_home < 0 OR regulation_home > 99
       OR regulation_away < 0 OR regulation_away > 99 THEN
      RAISE EXCEPTION 'Invalid regulation score';
    END IF;

    NEW.regulation_home_score := regulation_home;
    NEW.regulation_away_score := regulation_away;
    NEW.home_score := regulation_home;
    NEW.away_score := regulation_away;

    IF regulation_home > regulation_away THEN
      NEW.predicted_qualified_team_id := COALESCE(
        NEW.predicted_qualified_team_id,
        match_row.home_team_id
      );
      NEW.predicted_qualification_method := COALESCE(
        NEW.predicted_qualification_method,
        'regulation'
      );
      IF NEW.predicted_qualified_team_id IS DISTINCT FROM match_row.home_team_id
         OR NEW.predicted_qualification_method <> 'regulation' THEN
        RAISE EXCEPTION 'Knockout prediction conflicts with the regulation score';
      END IF;
    ELSIF regulation_away > regulation_home THEN
      NEW.predicted_qualified_team_id := COALESCE(
        NEW.predicted_qualified_team_id,
        match_row.away_team_id
      );
      NEW.predicted_qualification_method := COALESCE(
        NEW.predicted_qualification_method,
        'regulation'
      );
      IF NEW.predicted_qualified_team_id IS DISTINCT FROM match_row.away_team_id
         OR NEW.predicted_qualification_method <> 'regulation' THEN
        RAISE EXCEPTION 'Knockout prediction conflicts with the regulation score';
      END IF;
    ELSE
      IF NEW.predicted_qualified_team_id NOT IN (match_row.home_team_id, match_row.away_team_id) THEN
        RAISE EXCEPTION 'Choose a qualified team for a tied knockout score';
      END IF;
      IF NEW.predicted_qualification_method NOT IN ('extra_time', 'penalties') THEN
        RAISE EXCEPTION 'Tied knockout scores require extra time or penalties';
      END IF;
    END IF;
  ELSE
    IF NEW.predicted_qualified_team_id IS NOT NULL
       OR NEW.predicted_qualification_method IS NOT NULL
       OR NEW.regulation_home_score IS NOT NULL
       OR NEW.regulation_away_score IS NOT NULL THEN
      RAISE EXCEPTION 'Qualification fields are only available for knockout bets';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.resolve_knockout_bracket(_match_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  source record;
  winner uuid;
  loser uuid;
  affected integer := 0;
  updated_count integer := 0;
BEGIN
  SELECT
    id,
    match_number,
    stage,
    home_team_id,
    away_team_id,
    home_score,
    away_score,
    regulation_home_score,
    regulation_away_score,
    qualified_team_id
  INTO source
  FROM public.matches
  WHERE id = _match_id;

  IF NOT FOUND OR source.match_number IS NULL OR NOT private.is_knockout_stage(source.stage) THEN
    RETURN 0;
  END IF;

  winner := source.qualified_team_id;

  IF winner IS NULL THEN
    IF COALESCE(source.regulation_home_score, source.home_score) > COALESCE(source.regulation_away_score, source.away_score) THEN
      winner := source.home_team_id;
    ELSIF COALESCE(source.regulation_away_score, source.away_score) > COALESCE(source.regulation_home_score, source.home_score) THEN
      winner := source.away_team_id;
    END IF;
  END IF;

  IF winner IS NULL OR source.home_team_id IS NULL OR source.away_team_id IS NULL THEN
    RETURN 0;
  END IF;

  loser := CASE
    WHEN winner = source.home_team_id THEN source.away_team_id
    ELSE source.home_team_id
  END;

  UPDATE public.matches destination
  SET home_team_id = CASE
        WHEN destination.bracket_home_source_result = 'winner' THEN winner
        ELSE loser
      END,
      updated_at = now()
  WHERE destination.bracket_home_source_match_number = source.match_number
    AND (
      destination.home_team_id IS NULL
      OR destination.home_team_id IN (source.home_team_id, source.away_team_id)
    );

  GET DIAGNOSTICS affected = ROW_COUNT;
  updated_count := updated_count + affected;

  UPDATE public.matches destination
  SET away_team_id = CASE
        WHEN destination.bracket_away_source_result = 'winner' THEN winner
        ELSE loser
      END,
      updated_at = now()
  WHERE destination.bracket_away_source_match_number = source.match_number
    AND (
      destination.away_team_id IS NULL
      OR destination.away_team_id IN (source.home_team_id, source.away_team_id)
    );

  GET DIAGNOSTICS affected = ROW_COUNT;
  updated_count := updated_count + affected;
  RETURN updated_count;
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

-- ---------------------------------------------------------------------------
-- Ranking: include knockout and special tie-breakers without exposing emails.
-- ---------------------------------------------------------------------------
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
      COALESCE(SUM(CASE WHEN m.status = 'closed' THEN b.points ELSE 0 END), 0)::int AS total_points,
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
      0::int AS special_points,
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

REVOKE ALL ON FUNCTION private.normalize_knockout_stage(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_knockout_stage(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.special_predictions_open(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.special_prediction_points(public.special_predictions) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.set_special_prediction_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.recalculate_special_predictions(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.recalculate_special_predictions_on_rules() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_player_bet_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.resolve_knockout_bracket(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.recalculate_match_points(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.get_ranking_free() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.get_ranking_pool() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.special_predictions_open(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.recalculate_special_predictions(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.resolve_knockout_bracket(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.recalculate_match_points(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.get_ranking_free() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_ranking_pool() TO authenticated, service_role;

COMMIT;
