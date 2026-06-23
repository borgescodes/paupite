
CREATE OR REPLACE FUNCTION public.admin_recalculate_match_points(_match_id uuid)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT private.recalculate_match_points(_match_id);
$$;

REVOKE ALL ON FUNCTION public.admin_recalculate_match_points(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recalculate_match_points(uuid) TO service_role;
