-- Hardening pós-etapas 1 e 2: CORS/Edge Functions, RLS explícito para profiles
-- e redução de ruído/risco nas políticas apontadas pelo schema review.

SELECT set_config('request.jwt.claim.role', 'service_role', false);

-- 1) SELECT em profiles sem depender de função opaca para o scanner.
-- Player lê apenas o próprio profile.
-- Admin lê apenas players.
-- Superadmin lê todos.
DROP POLICY IF EXISTS profiles_select_hierarchy ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_select_admin_players ON public.profiles;
DROP POLICY IF EXISTS profiles_select_superadmin_all ON public.profiles;

CREATE POLICY profiles_select_own
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY profiles_select_admin_players
ON public.profiles
FOR SELECT
TO authenticated
USING (
  role = 'player'
  AND EXISTS (
    SELECT 1
    FROM public.profiles actor
    WHERE actor.id = auth.uid()
      AND actor.role = 'admin'
      AND actor.status = 'active'
  )
);

CREATE POLICY profiles_select_superadmin_all
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles actor
    WHERE actor.id = auth.uid()
      AND actor.role = 'superadmin'
      AND actor.status = 'active'
  )
);

-- 2) Recria a policy de edição do próprio perfil com invariantes explícitas.
-- O usuário comum continua editando apenas perfil visual pelo frontend.
-- Role/status/email/campos de workflow ficam protegidos por WITH CHECK + trigger.
DROP POLICY IF EXISTS profiles_update_own_visual ON public.profiles;

CREATE POLICY profiles_update_own_visual
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND role = (
    SELECT old_profile.role
    FROM public.profiles old_profile
    WHERE old_profile.id = auth.uid()
  )
  AND status = (
    SELECT old_profile.status
    FROM public.profiles old_profile
    WHERE old_profile.id = auth.uid()
  )
  AND email = (
    SELECT old_profile.email
    FROM public.profiles old_profile
    WHERE old_profile.id = auth.uid()
  )
  AND created_at = (
    SELECT old_profile.created_at
    FROM public.profiles old_profile
    WHERE old_profile.id = auth.uid()
  )
  AND COALESCE(must_change_password, false) = COALESCE((
    SELECT old_profile.must_change_password
    FROM public.profiles old_profile
    WHERE old_profile.id = auth.uid()
  ), false)
  AND first_access_completed_at IS NOT DISTINCT FROM (
    SELECT old_profile.first_access_completed_at
    FROM public.profiles old_profile
    WHERE old_profile.id = auth.uid()
  )
  AND last_password_reset_at IS NOT DISTINCT FROM (
    SELECT old_profile.last_password_reset_at
    FROM public.profiles old_profile
    WHERE old_profile.id = auth.uid()
  )
  AND temporary_password_set_at IS NOT DISTINCT FROM (
    SELECT old_profile.temporary_password_set_at
    FROM public.profiles old_profile
    WHERE old_profile.id = auth.uid()
  )
);

-- Mantém o trigger como barreira final, inclusive para tentativas manuais.
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

  IF NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
     OR NEW.first_access_completed_at IS DISTINCT FROM OLD.first_access_completed_at
     OR NEW.last_password_reset_at IS DISTINCT FROM OLD.last_password_reset_at
     OR NEW.temporary_password_set_at IS DISTINCT FROM OLD.temporary_password_set_at THEN
    RAISE EXCEPTION 'Password workflow fields can only be changed by trusted functions';
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

-- 3) Evita tentativa acidental de adicionar profiles ao realtime novamente.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication p
    JOIN pg_publication_rel pr ON pr.prpubid = p.oid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles;
  END IF;
END $$;

SELECT set_config('request.jwt.claim.role', '', false);
