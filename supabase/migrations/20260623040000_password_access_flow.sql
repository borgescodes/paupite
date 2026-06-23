-- Etapas 1 e 2: primeiro acesso, reset obrigatório e senha temporária.

-- O SQL Editor/Lovable não executa com auth.uid().
-- Esta configuração faz a trigger de hierarquia tratar esta migration como contexto trusted/service.
SELECT set_config('request.jwt.claim.role', 'service_role', false);


ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_access_completed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_password_reset_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS temporary_password_set_at timestamptz NULL;

-- Não forçar troca do usuário fundador já ativo.
UPDATE public.profiles
SET must_change_password = false,
    temporary_password_set_at = NULL,
    updated_at = now()
WHERE lower(email) = 'borgescodes@gmail.com'
  AND role = 'superadmin';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  requested_role text := NEW.raw_user_meta_data->>'role';
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    display_name,
    nickname,
    role,
    status,
    must_change_password
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'nickname', split_part(NEW.email, '@', 1)),
    CASE WHEN requested_role IN ('admin', 'player') THEN requested_role ELSE 'player' END,
    'invited',
    true
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
  is_service boolean := jwt_role = 'service_role';
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

REVOKE EXECUTE ON FUNCTION public.enforce_profile_hierarchy() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_profile_hierarchy() TO service_role;

-- Limpa o contexto especial usado apenas para aplicar esta migration.
SELECT set_config('request.jwt.claim.role', '', false);
