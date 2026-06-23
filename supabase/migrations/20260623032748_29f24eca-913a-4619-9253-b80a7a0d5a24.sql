DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('superadmin', 'admin', 'player'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check CHECK (status IN ('invited', 'active', 'disabled'));

UPDATE public.profiles
SET role = 'superadmin', status = 'active', updated_at = now()
WHERE lower(email) = 'borgescodes@gmail.com';

DROP INDEX IF EXISTS public.profiles_single_superadmin_idx;
CREATE UNIQUE INDEX profiles_single_superadmin_idx
ON public.profiles ((role))
WHERE role = 'superadmin';

CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
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
      AND role IN ('admin', 'superadmin')
  );
$$;

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

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role text)
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
      AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION private.can_select_profile(_actor_id uuid, _target_id uuid, _target_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _actor_id = _target_id
    OR private.is_active_superadmin(_actor_id)
    OR (private.is_active_admin(_actor_id) AND _target_role = 'player');
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  requested_role text := NEW.raw_user_meta_data->>'role';
BEGIN
  INSERT INTO public.profiles (id, email, display_name, nickname, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'nickname', split_part(NEW.email, '@', 1)),
    CASE WHEN requested_role IN ('admin', 'player') THEN requested_role ELSE 'player' END,
    'invited'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_profile_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, private
AS $function$
DECLARE
  actor_id uuid := auth.uid();
  actor_role text;
  actor_status text;
  jwt_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
  is_service boolean := jwt_role = 'service_role' OR current_user IN ('postgres', 'supabase_admin');
  existing_superadmins integer;
BEGIN
  NEW.updated_at := now();

  IF NEW.role NOT IN ('superadmin', 'admin', 'player') THEN
    RAISE EXCEPTION 'Invalid profile role';
  END IF;
  IF NEW.status NOT IN ('invited', 'active', 'disabled') THEN
    RAISE EXCEPTION 'Invalid profile status';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'superadmin' THEN
      SELECT count(*) INTO existing_superadmins
      FROM public.profiles
      WHERE role = 'superadmin';
      IF existing_superadmins > 0 THEN
        RAISE EXCEPTION 'Only one superadmin is allowed';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.role = 'superadmin' AND NEW.role <> 'superadmin' THEN
    RAISE EXCEPTION 'Superadmin cannot be demoted';
  END IF;
  IF OLD.role = 'superadmin' AND NEW.status <> 'active' THEN
    RAISE EXCEPTION 'Superadmin cannot be disabled';
  END IF;
  IF NEW.role = 'superadmin' AND OLD.role <> 'superadmin' THEN
    SELECT count(*) INTO existing_superadmins
    FROM public.profiles
    WHERE role = 'superadmin' AND id <> OLD.id;
    IF existing_superadmins > 0 THEN
      RAISE EXCEPTION 'Only one superadmin is allowed';
    END IF;
  END IF;

  IF is_service THEN
    RETURN NEW;
  END IF;

  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user is required';
  END IF;

  SELECT role, status INTO actor_role, actor_status
  FROM public.profiles
  WHERE id = actor_id;

  IF actor_status <> 'active' THEN
    RAISE EXCEPTION 'Only active users can update profiles';
  END IF;

  IF actor_id = OLD.id THEN
    IF NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Users cannot change their own role or status';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Users cannot change their own email';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Users cannot change profile creation date';
    END IF;
    RETURN NEW;
  END IF;

  IF actor_role = 'admin' THEN
    IF OLD.role <> 'player' OR NEW.role <> 'player' THEN
      RAISE EXCEPTION 'Admins can manage only players';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Admins cannot change user emails';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Admins cannot change profile creation date';
    END IF;
    RETURN NEW;
  END IF;

  IF actor_role = 'superadmin' THEN
    IF OLD.role = 'superadmin' OR NEW.role = 'superadmin' THEN
      RAISE EXCEPTION 'Superadmin profile cannot be changed from the admin panel';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Superadmins cannot change user emails';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Superadmins cannot change profile creation date';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Players can update only their own visual profile';
END;
$function$;

DROP TRIGGER IF EXISTS enforce_profile_hierarchy_before_write ON public.profiles;
CREATE TRIGGER enforce_profile_hierarchy_before_write
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profile_hierarchy();

CREATE POLICY profiles_select_hierarchy
ON public.profiles
FOR SELECT
TO authenticated
USING (private.can_select_profile(auth.uid(), id, role));

CREATE POLICY profiles_update_own_visual
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY profiles_admin_manage_players
ON public.profiles
FOR UPDATE
TO authenticated
USING (private.is_active_admin(auth.uid()) AND id <> auth.uid() AND role = 'player')
WITH CHECK (private.is_active_admin(auth.uid()) AND id <> auth.uid() AND role = 'player');

CREATE POLICY profiles_superadmin_manage_admins_players
ON public.profiles
FOR UPDATE
TO authenticated
USING (private.is_active_superadmin(auth.uid()) AND id <> auth.uid() AND role IN ('admin', 'player'))
WITH CHECK (private.is_active_superadmin(auth.uid()) AND id <> auth.uid() AND role IN ('admin', 'player'));

REVOKE EXECUTE ON FUNCTION public.enforce_profile_hierarchy() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_profile_hierarchy() TO service_role;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_active_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_active_superadmin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_select_profile(uuid, uuid, text) TO authenticated, service_role;