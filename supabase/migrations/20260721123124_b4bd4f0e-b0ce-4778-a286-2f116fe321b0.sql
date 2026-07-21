
-- 1. Competitions: archived metadata
ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id);

-- 2. Helper: competition archived?
CREATE OR REPLACE FUNCTION private.is_competition_archived(_competition_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT status = 'archived' FROM public.competitions WHERE id = _competition_id),
    false
  )
$$;

REVOKE ALL ON FUNCTION private.is_competition_archived(uuid) FROM PUBLIC, anon, authenticated;

-- 3. Block match writes while archived (except trusted contexts)
CREATE OR REPLACE FUNCTION private.block_matches_when_archived()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private
AS $$
DECLARE
  trusted boolean :=
    COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR current_user IN ('postgres', 'supabase_admin', 'service_role');
  comp_id uuid;
BEGIN
  IF trusted THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  comp_id := COALESCE(NEW.competition_id, OLD.competition_id);
  IF comp_id IS NOT NULL AND private.is_competition_archived(comp_id) THEN
    RAISE EXCEPTION 'Competição arquivada — edição de partidas bloqueada';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_block_matches_when_archived ON public.matches;
CREATE TRIGGER trg_block_matches_when_archived
  BEFORE UPDATE OR DELETE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION private.block_matches_when_archived();

-- 4. Block bet writes while archived (except trusted contexts)
CREATE OR REPLACE FUNCTION private.block_bets_when_archived()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private
AS $$
DECLARE
  trusted boolean :=
    COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR current_user IN ('postgres', 'supabase_admin', 'service_role');
  comp_id uuid;
BEGIN
  IF trusted THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT competition_id INTO comp_id
  FROM public.matches
  WHERE id = COALESCE(NEW.match_id, OLD.match_id);
  IF comp_id IS NOT NULL AND private.is_competition_archived(comp_id) THEN
    RAISE EXCEPTION 'Competição arquivada — palpites bloqueados';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_block_bets_when_archived ON public.bets;
CREATE TRIGGER trg_block_bets_when_archived
  BEFORE INSERT OR UPDATE OR DELETE ON public.bets
  FOR EACH ROW EXECUTE FUNCTION private.block_bets_when_archived();

-- 5. Archive / unarchive RPCs (superadmin only, idempotent)
CREATE OR REPLACE FUNCTION public.admin_archive_competition(_competition_id uuid)
RETURNS public.competitions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_role text;
  actor_status text;
  result public.competitions%ROWTYPE;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT role, status INTO actor_role, actor_status
  FROM public.profiles WHERE id = actor;

  IF actor_status IS DISTINCT FROM 'active' OR actor_role IS DISTINCT FROM 'superadmin' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.competitions
    SET status = 'archived',
        archived_at = COALESCE(archived_at, now()),
        archived_by = COALESCE(archived_by, actor),
        updated_at = now()
  WHERE id = _competition_id
  RETURNING * INTO result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'competition_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (actor, 'competition.archive', 'competitions', result.id::text,
          jsonb_build_object('archived_at', result.archived_at));

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unarchive_competition(_competition_id uuid)
RETURNS public.competitions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_role text;
  actor_status text;
  result public.competitions%ROWTYPE;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT role, status INTO actor_role, actor_status
  FROM public.profiles WHERE id = actor;

  IF actor_status IS DISTINCT FROM 'active' OR actor_role IS DISTINCT FROM 'superadmin' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.competitions
    SET status = 'active',
        archived_at = NULL,
        archived_by = NULL,
        updated_at = now()
  WHERE id = _competition_id
  RETURNING * INTO result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'competition_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (actor, 'competition.unarchive', 'competitions', result.id::text, '{}'::jsonb);

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_archive_competition(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_unarchive_competition(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_archive_competition(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unarchive_competition(uuid) TO authenticated;

-- 6. Retrospective views tracking
CREATE TABLE IF NOT EXISTS public.user_retrospective_views (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  first_viewed_at timestamptz NOT NULL DEFAULT now(),
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, competition_id)
);

GRANT SELECT, INSERT, UPDATE ON public.user_retrospective_views TO authenticated;
GRANT ALL ON public.user_retrospective_views TO service_role;
ALTER TABLE public.user_retrospective_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_retrospective_views"
  ON public.user_retrospective_views
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. Tournament feedback (one row per user + competition)
CREATE TABLE IF NOT EXISTS public.tournament_feedback (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  tournament_suggestion text,
  improvement_suggestion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, competition_id)
);

GRANT SELECT, INSERT, UPDATE ON public.tournament_feedback TO authenticated;
GRANT ALL ON public.tournament_feedback TO service_role;
ALTER TABLE public.tournament_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_feedback_manage"
  ON public.tournament_feedback
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admins_read_all_feedback"
  ON public.tournament_feedback
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role IN ('admin', 'superadmin')
    )
  );

DROP TRIGGER IF EXISTS trg_tournament_feedback_updated_at ON public.tournament_feedback;
CREATE TRIGGER trg_tournament_feedback_updated_at
  BEFORE UPDATE ON public.tournament_feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
