-- Allow knockout bets with a winner score decided by extra time.
-- Rule: non-tied knockout score must choose regulation or extra_time;
-- tied knockout score means penalties and requires qualified team.

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
      IF NEW.predicted_qualified_team_id IS DISTINCT FROM match_row.home_team_id THEN
        RAISE EXCEPTION 'Knockout prediction conflicts with the informed score';
      END IF;
      IF NEW.predicted_qualification_method IS NULL
         OR NEW.predicted_qualification_method NOT IN ('regulation', 'extra_time') THEN
        RAISE EXCEPTION 'Winner knockout scores require regulation or extra_time';
      END IF;
    ELSIF regulation_away > regulation_home THEN
      NEW.predicted_qualified_team_id := COALESCE(
        NEW.predicted_qualified_team_id,
        match_row.away_team_id
      );
      IF NEW.predicted_qualified_team_id IS DISTINCT FROM match_row.away_team_id THEN
        RAISE EXCEPTION 'Knockout prediction conflicts with the informed score';
      END IF;
      IF NEW.predicted_qualification_method IS NULL
         OR NEW.predicted_qualification_method NOT IN ('regulation', 'extra_time') THEN
        RAISE EXCEPTION 'Winner knockout scores require regulation or extra_time';
      END IF;
    ELSE
      IF NEW.predicted_qualified_team_id IS NULL
         OR NEW.predicted_qualified_team_id NOT IN (match_row.home_team_id, match_row.away_team_id) THEN
        RAISE EXCEPTION 'Choose a qualified team for a tied knockout score';
      END IF;
      NEW.predicted_qualification_method := COALESCE(
        NEW.predicted_qualification_method,
        'penalties'
      );
      IF NEW.predicted_qualification_method <> 'penalties' THEN
        RAISE EXCEPTION 'Tied knockout scores require penalties';
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
