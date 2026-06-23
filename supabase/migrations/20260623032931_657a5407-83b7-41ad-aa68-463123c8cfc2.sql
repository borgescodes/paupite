GRANT EXECUTE ON FUNCTION private.can_select_profile(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_active_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_active_superadmin(uuid) TO authenticated;