SELECT set_config('request.jwt.claim.role', 'service_role', false);

CREATE OR REPLACE FUNCTION private.is_active_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id
      AND status = 'active'
      AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION private.is_active_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id
      AND status = 'active'
      AND role = 'superadmin'
  );
$$;

CREATE OR REPLACE FUNCTION private.can_select_profile(
  _actor_id uuid,
  _target_id uuid,
  _target_role text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT
    _actor_id = _target_id
    OR private.is_active_superadmin(_actor_id)
    OR (
      private.is_active_admin(_actor_id)
      AND _target_role = 'player'
    );
$$;

CREATE OR REPLACE FUNCTION private.profile_self_update_is_safe(
  _actor_id uuid,
  _role text,
  _status text,
  _email text,
  _created_at timestamptz,
  _must_change_password boolean,
  _first_access_completed_at timestamptz,
  _last_password_reset_at timestamptz,
  _temporary_password_set_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _actor_id
      AND p.role = _role
      AND p.status = _status
      AND p.email = _email
      AND p.created_at = _created_at
      AND COALESCE(p.must_change_password, false) = COALESCE(_must_change_password, false)
      AND p.first_access_completed_at IS NOT DISTINCT FROM _first_access_completed_at
      AND p.last_password_reset_at IS NOT DISTINCT FROM _last_password_reset_at
      AND p.temporary_password_set_at IS NOT DISTINCT FROM _temporary_password_set_at
  );
$$;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_select_admin_players ON public.profiles;
DROP POLICY IF EXISTS profiles_select_superadmin_all ON public.profiles;
DROP POLICY IF EXISTS profiles_select_hierarchy ON public.profiles;

CREATE POLICY profiles_select_hierarchy
ON public.profiles
FOR SELECT
TO authenticated
USING (
  private.can_select_profile(auth.uid(), id, role)
);

DROP POLICY IF EXISTS profiles_update_own_visual ON public.profiles;

CREATE POLICY profiles_update_own_visual
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND private.profile_self_update_is_safe(
    auth.uid(),
    role,
    status,
    email,
    created_at,
    must_change_password,
    first_access_completed_at,
    last_password_reset_at,
    temporary_password_set_at
  )
);

GRANT EXECUTE ON FUNCTION private.is_active_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_active_superadmin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_select_profile(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.profile_self_update_is_safe(
  uuid,
  text,
  text,
  text,
  timestamptz,
  boolean,
  timestamptz,
  timestamptz,
  timestamptz
) TO authenticated, service_role;

SELECT set_config('request.jwt.claim.role', '', false);
