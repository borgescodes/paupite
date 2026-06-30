BEGIN;

DROP FUNCTION IF EXISTS public.get_public_profile_closed_bets(uuid);

CREATE OR REPLACE FUNCTION public.get_public_profile_closed_bets(_user_id uuid)
RETURNS TABLE (
  match_id uuid,
  status text,
  home text,
  away text,
  home_country_code text,
  away_country_code text,
  final_home integer,
  final_away integer,
  guess_home integer,
  guess_away integer,
  points integer,
  kickoff_at timestamptz,
  qualification_method text,
  qualified_team text,
  predicted_qualification_method text,
  predicted_qualified_team text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id AS match_id,
    CASE
      WHEN m.status IN ('finished', 'closed', 'scored') THEN 'finished'
      WHEN m.status = 'live' OR m.kickoff_at <= now() THEN 'live'
      ELSE 'scheduled'
    END AS status,
    COALESCE(ht.short_name, ht.name, 'Casa') AS home,
    COALESCE(at.short_name, at.name, 'Fora') AS away,
    ht.country_code AS home_country_code,
    at.country_code AS away_country_code,
    COALESCE(m.home_score, 0)::integer AS final_home,
    COALESCE(m.away_score, 0)::integer AS final_away,
    COALESCE(b.home_score, 0)::integer AS guess_home,
    COALESCE(b.away_score, 0)::integer AS guess_away,
    COALESCE(b.points, 0)::integer AS points,
    m.kickoff_at,
    m.qualification_method,
    COALESCE(qt.short_name, qt.name) AS qualified_team,
    b.predicted_qualification_method,
    COALESCE(pqt.short_name, pqt.name) AS predicted_qualified_team
  FROM public.bets b
  JOIN public.matches m ON m.id = b.match_id
  LEFT JOIN public.teams ht ON ht.id = m.home_team_id
  LEFT JOIN public.teams at ON at.id = m.away_team_id
  LEFT JOIN public.teams qt ON qt.id = m.qualified_team_id
  LEFT JOIN public.teams pqt ON pqt.id = b.predicted_qualified_team_id
  JOIN public.profiles p ON p.id = b.user_id
  WHERE b.user_id = _user_id
    AND p.status = 'active'
    AND (m.kickoff_at AT TIME ZONE 'America/Santarem')::date >= DATE '2026-06-28'
    AND (
      m.status IN ('live', 'finished', 'closed', 'scored')
      OR m.kickoff_at <= now()
    )
  ORDER BY m.kickoff_at DESC
  LIMIT 20;
$$;

REVOKE ALL ON FUNCTION public.get_public_profile_closed_bets(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_profile_closed_bets(uuid) TO authenticated, service_role;

COMMIT;
