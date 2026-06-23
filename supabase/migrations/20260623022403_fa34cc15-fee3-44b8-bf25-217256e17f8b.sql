
-- =========================================================
-- ENUMS / ROLES
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'player');

-- =========================================================
-- updated_at trigger helper
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  nickname text,
  avatar_url text,
  favorite_country_code text,
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('admin', 'player')),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- has_role helper (security definer, evita recursão em RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role = 'admin');
$$;

-- RLS profiles
CREATE POLICY "profiles_select_all_authenticated"
ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_update_own_safe_fields"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  AND status = (SELECT p.status FROM public.profiles p WHERE p.id = auth.uid())
  AND email = (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
);

CREATE POLICY "profiles_admin_all"
ON public.profiles FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Trigger para criar profile automaticamente quando admin cria usuário via edge function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, nickname, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'nickname', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'player'),
    'invited'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- COMPETITIONS
-- =========================================================
CREATE TABLE public.competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  season text,
  status text NOT NULL DEFAULT 'upcoming',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.competitions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.competitions TO authenticated;
GRANT ALL ON public.competitions TO service_role;
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_competitions_updated_at BEFORE UPDATE ON public.competitions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "competitions_select_auth" ON public.competitions
FOR SELECT TO authenticated USING (true);
CREATE POLICY "competitions_admin_write" ON public.competitions
FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- =========================================================
-- TEAMS
-- =========================================================
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text,
  country_code text,
  flag_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_teams_updated_at BEFORE UPDATE ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "teams_select_auth" ON public.teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "teams_admin_write" ON public.teams FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- =========================================================
-- MATCHES
-- =========================================================
CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid REFERENCES public.competitions(id) ON DELETE CASCADE,
  stage text,
  group_name text,
  home_team_id uuid REFERENCES public.teams(id),
  away_team_id uuid REFERENCES public.teams(id),
  kickoff_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','finished','closed')),
  home_score int NOT NULL DEFAULT 0,
  away_score int NOT NULL DEFAULT 0,
  update_mode text NOT NULL DEFAULT 'manual_live' CHECK (update_mode IN ('manual_live','post_match_api','api_live')),
  manual_override boolean NOT NULL DEFAULT false,
  api_provider text,
  api_match_id text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_matches_updated_at BEFORE UPDATE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "matches_select_auth" ON public.matches FOR SELECT TO authenticated USING (true);
CREATE POLICY "matches_admin_write" ON public.matches FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX idx_matches_kickoff ON public.matches(kickoff_at);
CREATE INDEX idx_matches_competition ON public.matches(competition_id);

-- =========================================================
-- BETS
-- =========================================================
CREATE TABLE public.bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  home_score int NOT NULL,
  away_score int NOT NULL,
  points int NOT NULL DEFAULT 0,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, match_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bets TO authenticated;
GRANT ALL ON public.bets TO service_role;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_bets_updated_at BEFORE UPDATE ON public.bets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper: kickoff já passou?
CREATE OR REPLACE FUNCTION public.match_kickoff_passed(_match_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT kickoff_at <= now() FROM public.matches WHERE id = _match_id), true);
$$;

-- Player vê todos os palpites? Spec: "usuário pode ler apenas seus próprios palpites".
-- Mas ranking precisa contar palpites de todos. Mantemos a regra estrita: cada um vê o seu;
-- admin vê todos. Ranking usa view com security definer.
CREATE POLICY "bets_select_own" ON public.bets
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "bets_insert_own_before_kickoff" ON public.bets
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND NOT public.match_kickoff_passed(match_id)
);

CREATE POLICY "bets_update_own_before_kickoff" ON public.bets
FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND NOT public.match_kickoff_passed(match_id))
WITH CHECK (user_id = auth.uid() AND NOT public.match_kickoff_passed(match_id));

CREATE POLICY "bets_admin_all" ON public.bets
FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- =========================================================
-- SCORE RULES
-- =========================================================
CREATE TABLE public.score_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exact_score_points int NOT NULL DEFAULT 5,
  outcome_points int NOT NULL DEFAULT 3,
  goal_difference_bonus int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.score_rules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.score_rules TO authenticated;
GRANT ALL ON public.score_rules TO service_role;
ALTER TABLE public.score_rules ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_score_rules_updated_at BEFORE UPDATE ON public.score_rules
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "score_rules_select_auth" ON public.score_rules
FOR SELECT TO authenticated USING (true);
CREATE POLICY "score_rules_admin_write" ON public.score_rules
FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.score_rules (exact_score_points, outcome_points, goal_difference_bonus)
VALUES (5, 3, 1);

-- =========================================================
-- POINTS CALCULATION
-- =========================================================
CREATE OR REPLACE FUNCTION public.calc_bet_points(
  _home_actual int, _away_actual int,
  _home_bet int, _away_bet int
) RETURNS int
LANGUAGE plpgsql STABLE SET search_path = public
AS $$
DECLARE
  r public.score_rules%ROWTYPE;
  pts int := 0;
  actual_outcome text;
  bet_outcome text;
BEGIN
  SELECT * INTO r FROM public.score_rules ORDER BY created_at ASC LIMIT 1;
  IF r IS NULL THEN
    r.exact_score_points := 5; r.outcome_points := 3; r.goal_difference_bonus := 1;
  END IF;

  IF _home_actual = _home_bet AND _away_actual = _away_bet THEN
    RETURN r.exact_score_points + r.goal_difference_bonus; -- exato implica saldo
  END IF;

  actual_outcome := CASE WHEN _home_actual > _away_actual THEN 'H'
                         WHEN _home_actual < _away_actual THEN 'A'
                         ELSE 'D' END;
  bet_outcome := CASE WHEN _home_bet > _away_bet THEN 'H'
                      WHEN _home_bet < _away_bet THEN 'A'
                      ELSE 'D' END;

  IF actual_outcome = bet_outcome THEN
    pts := r.outcome_points;
    IF (_home_actual - _away_actual) = (_home_bet - _away_bet) THEN
      pts := pts + r.goal_difference_bonus;
    END IF;
  END IF;

  RETURN pts;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_match_points(_match_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  m public.matches%ROWTYPE;
  updated_count int := 0;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  UPDATE public.bets b
  SET points = public.calc_bet_points(m.home_score, m.away_score, b.home_score, b.away_score),
      locked_at = COALESCE(b.locked_at, now())
  WHERE b.match_id = _match_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_match_points(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.recalculate_match_points(uuid) TO authenticated, service_role;

-- =========================================================
-- RANKING VIEW
-- =========================================================
CREATE OR REPLACE VIEW public.ranking AS
SELECT
  p.id AS user_id,
  p.display_name,
  p.nickname,
  p.avatar_url,
  COALESCE(SUM(b.points), 0)::int AS total_points,
  COALESCE(SUM(CASE WHEN b.points > 0 AND m.home_score = b.home_score AND m.away_score = b.away_score THEN 1 ELSE 0 END), 0)::int AS exact_scores_count,
  COALESCE(SUM(CASE WHEN b.points > 0 THEN 1 ELSE 0 END), 0)::int AS outcome_hits_count,
  COALESCE(COUNT(b.id), 0)::int AS bets_count,
  RANK() OVER (ORDER BY COALESCE(SUM(b.points),0) DESC)::int AS rank_position
FROM public.profiles p
LEFT JOIN public.bets b ON b.user_id = p.id
LEFT JOIN public.matches m ON m.id = b.match_id AND m.status = 'closed'
WHERE p.status <> 'disabled'
GROUP BY p.id, p.display_name, p.nickname, p.avatar_url;

GRANT SELECT ON public.ranking TO authenticated, service_role;

-- =========================================================
-- REALTIME
-- =========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
