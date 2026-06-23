REVOKE EXECUTE ON FUNCTION private.can_select_profile(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.is_active_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.is_active_superadmin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_profile_hierarchy() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.can_select_profile(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION private.is_active_admin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.is_active_superadmin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_profile_hierarchy() TO service_role;