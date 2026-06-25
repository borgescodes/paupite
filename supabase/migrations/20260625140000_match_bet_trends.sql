-- Aggregated bet trends per match for MegaBrain display
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
  FROM bets b
  GROUP BY b.match_id
$$;

REVOKE ALL ON FUNCTION private.get_match_bet_trends() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_match_bet_trends() TO authenticated, service_role;

DROP VIEW IF EXISTS public.match_bet_trends;
CREATE VIEW public.match_bet_trends WITH (security_invoker = true) AS
SELECT * FROM private.get_match_bet_trends();
GRANT SELECT ON public.match_bet_trends TO authenticated, service_role;
