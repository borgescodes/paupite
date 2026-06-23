
-- 1. Private schema for helper / privileged functions
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- 2. Drop policies that depend on the helpers so we can move them
DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
DROP POLICY IF EXISTS profiles_select_all_authenticated ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own_safe_fields ON public.profiles;
DROP POLICY IF EXISTS matches_admin_write ON public.matches;
DROP POLICY IF EXISTS matches_select_auth ON public.matches;
DROP POLICY IF EXISTS bets_select_own ON public.bets;
DROP POLICY IF EXISTS bets_insert_own_before_kickoff ON public.bets;
DROP POLICY IF EXISTS bets_update_own_before_kickoff ON public.bets;
DROP POLICY IF EXISTS bets_admin_all ON public.bets;
DROP POLICY IF EXISTS competitions_select_auth ON public.competitions;
DROP POLICY IF EXISTS competitions_admin_write ON public.competitions;
DROP POLICY IF EXISTS teams_select_auth ON public.teams;
DROP POLICY IF EXISTS teams_admin_write ON public.teams;
DROP POLICY IF EXISTS score_rules_select_auth ON public.score_rules;
DROP POLICY IF EXISTS score_rules_admin_write ON public.score_rules;

-- 3. Drop the ranking view (depends on functions/tables we are changing)
DROP VIEW IF EXISTS public.ranking;

-- 4. Move SECURITY DEFINER helpers out of public
ALTER FUNCTION public.is_admin(uuid) SET SCHEMA private;
ALTER FUNCTION public.has_role(uuid, text) SET SCHEMA private;
ALTER FUNCTION public.match_kickoff_passed(uuid) SET SCHEMA private;
ALTER FUNCTION public.recalculate_match_points(uuid) SET SCHEMA private;

-- 5. Lock down execute privileges
REVOKE ALL ON FUNCTION private.is_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_role(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.match_kickoff_passed(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.recalculate_match_points(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.match_kickoff_passed(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.recalculate_match_points(uuid) TO service_role;

-- handle_new_user is a trigger function; keep in public but revoke direct execute
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 6. Recreate RLS policies referencing private.* helpers
-- profiles: only owner reads own row; admins read all
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR private.is_admin(auth.uid()));
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
CREATE POLICY profiles_admin_all ON public.profiles
  FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()));

-- matches
CREATE POLICY matches_select_auth ON public.matches
  FOR SELECT TO authenticated USING (true);
CREATE POLICY matches_admin_write ON public.matches
  FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()));

-- bets
CREATE POLICY bets_select_own ON public.bets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_admin(auth.uid()));
CREATE POLICY bets_insert_own_before_kickoff ON public.bets
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND NOT private.match_kickoff_passed(match_id));
CREATE POLICY bets_update_own_before_kickoff ON public.bets
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND NOT private.match_kickoff_passed(match_id))
  WITH CHECK (user_id = auth.uid() AND NOT private.match_kickoff_passed(match_id));
CREATE POLICY bets_admin_all ON public.bets
  FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()));

-- competitions / teams / score_rules
CREATE POLICY competitions_select_auth ON public.competitions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY competitions_admin_write ON public.competitions
  FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY teams_select_auth ON public.teams
  FOR SELECT TO authenticated USING (true);
CREATE POLICY teams_admin_write ON public.teams
  FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY score_rules_select_auth ON public.score_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY score_rules_admin_write ON public.score_rules
  FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()));

-- 7. Ranking: definer aggregator in private, exposed via security-invoker view in public
CREATE OR REPLACE FUNCTION private.get_ranking()
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
  SELECT
    p.id,
    p.display_name,
    p.nickname,
    p.avatar_url,
    COALESCE(SUM(b.points), 0)::int,
    COALESCE(SUM(CASE WHEN b.points > 0 AND m.home_score = b.home_score AND m.away_score = b.away_score THEN 1 ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN b.points > 0 THEN 1 ELSE 0 END), 0)::int,
    COALESCE(COUNT(b.id), 0)::int,
    RANK() OVER (ORDER BY COALESCE(SUM(b.points), 0) DESC)::int
  FROM public.profiles p
  LEFT JOIN public.bets b ON b.user_id = p.id
  LEFT JOIN public.matches m ON m.id = b.match_id AND m.status = 'closed'
  WHERE p.status <> 'disabled'
  GROUP BY p.id, p.display_name, p.nickname, p.avatar_url;
$$;
REVOKE ALL ON FUNCTION private.get_ranking() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_ranking() TO authenticated, service_role;

CREATE VIEW public.ranking
WITH (security_invoker = true) AS
SELECT * FROM private.get_ranking();

GRANT SELECT ON public.ranking TO authenticated;

-- 8. Remove profiles from realtime so emails aren't broadcast
ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles;
