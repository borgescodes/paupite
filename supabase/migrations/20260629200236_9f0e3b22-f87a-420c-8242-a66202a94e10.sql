
-- Enable RLS on backup tables (no policies = no access via API)
ALTER TABLE public.pool_delete_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_reset_backup ENABLE ROW LEVEL SECURITY;

-- Revoke execute on admin SECURITY DEFINER functions from clients
REVOKE EXECUTE ON FUNCTION public.admin_set_match_status(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_update_match_score(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_soft_delete_match(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_recalculate_match_points(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_refresh_ranking_position_snapshots() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_set_match_status(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_match_score(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_soft_delete_match(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_recalculate_match_points(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_refresh_ranking_position_snapshots() TO service_role;
