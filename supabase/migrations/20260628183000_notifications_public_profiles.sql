BEGIN;

DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;

CREATE POLICY notifications_delete_own
ON public.notifications
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

GRANT DELETE ON TABLE public.notifications TO authenticated;

GRANT SELECT ON TABLE public.special_predictions TO authenticated;

GRANT INSERT (
  pool_id,
  user_id,
  champion_team_id,
  runner_up_team_id,
  third_place_team_id,
  top_scorer
)
ON TABLE public.special_predictions TO authenticated;

GRANT UPDATE (
  pool_id,
  user_id,
  champion_team_id,
  runner_up_team_id,
  third_place_team_id,
  top_scorer
)
ON TABLE public.special_predictions TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_profile_closed_bets(_user_id uuid)
RETURNS TABLE (
  match_id uuid,
  home text,
  away text,
  home_country_code text,
  away_country_code text,
  final_home integer,
  final_away integer,
  guess_home integer,
  guess_away integer,
  points integer,
  kickoff_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id AS match_id,
    COALESCE(ht.short_name, ht.name, 'Casa') AS home,
    COALESCE(at.short_name, at.name, 'Fora') AS away,
    ht.country_code AS home_country_code,
    at.country_code AS away_country_code,
    COALESCE(m.home_score, 0)::integer AS final_home,
    COALESCE(m.away_score, 0)::integer AS final_away,
    COALESCE(b.home_score, 0)::integer AS guess_home,
    COALESCE(b.away_score, 0)::integer AS guess_away,
    COALESCE(b.points, 0)::integer AS points,
    m.kickoff_at
  FROM public.bets b
  JOIN public.matches m ON m.id = b.match_id
  LEFT JOIN public.teams ht ON ht.id = m.home_team_id
  LEFT JOIN public.teams at ON at.id = m.away_team_id
  JOIN public.profiles p ON p.id = b.user_id
  WHERE b.user_id = _user_id
    AND p.status = 'active'
    AND m.status IN ('finished', 'closed')
  ORDER BY m.kickoff_at DESC
  LIMIT 20;
$$;

REVOKE ALL ON FUNCTION public.get_public_profile_closed_bets(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_profile_closed_bets(uuid) TO authenticated, service_role;

COMMIT;
