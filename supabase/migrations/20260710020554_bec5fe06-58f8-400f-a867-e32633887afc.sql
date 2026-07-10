
-- 1. Campos de bloqueio manual
ALTER TABLE public.pool_scoring_rules
  ADD COLUMN IF NOT EXISTS specials_manual_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS specials_manual_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS specials_manual_locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS specials_lock_reason text;

-- 2. Atualizar helper: bloqueado se manual OR (scheduled AND now >= scheduled)
CREATE OR REPLACE FUNCTION private.special_predictions_open(_pool_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT COALESCE((
    SELECT
      NOT specials_manual_locked
      AND (specials_lock_at IS NULL OR now() < specials_lock_at)
    FROM public.pool_scoring_rules
    WHERE pool_id = _pool_id
    LIMIT 1
  ), false);
$$;

-- 3. RPC: salvar palpites especiais (SECURITY DEFINER, valida na hora)
CREATE OR REPLACE FUNCTION public.save_special_predictions(
  _pool_id uuid,
  _champion_team_id uuid,
  _runner_up_team_id uuid,
  _third_place_team_id uuid
) RETURNS public.special_predictions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  actor uuid := auth.uid();
  result public.special_predictions%ROWTYPE;
  enrollment_status text;
  is_open boolean;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT status INTO enrollment_status
  FROM public.enrollments
  WHERE pool_id = _pool_id AND user_id = actor;

  IF enrollment_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'enrollment_not_active' USING ERRCODE = '22023';
  END IF;

  SELECT private.special_predictions_open(_pool_id) INTO is_open;
  IF NOT is_open THEN
    RAISE EXCEPTION 'special_predictions_locked' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.special_predictions AS sp (
    pool_id, user_id, champion_team_id, runner_up_team_id, third_place_team_id, top_scorer
  ) VALUES (
    _pool_id, actor, _champion_team_id, _runner_up_team_id, _third_place_team_id, NULL
  )
  ON CONFLICT (pool_id, user_id) DO UPDATE
  SET champion_team_id    = EXCLUDED.champion_team_id,
      runner_up_team_id   = EXCLUDED.runner_up_team_id,
      third_place_team_id = EXCLUDED.third_place_team_id,
      submitted_at        = now(),
      updated_at          = now()
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.save_special_predictions(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_special_predictions(uuid, uuid, uuid, uuid) TO authenticated;

-- 4. RPC admin: bloqueio manual / agendamento
CREATE OR REPLACE FUNCTION public.admin_set_special_predictions_lock(
  _pool_id uuid,
  _mode text,        -- 'lock_now' | 'unlock' | 'schedule' | 'clear_schedule'
  _lock_at timestamptz DEFAULT NULL,
  _reason text DEFAULT NULL
) RETURNS public.pool_scoring_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_role text;
  actor_status text;
  result public.pool_scoring_rules%ROWTYPE;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT role, status INTO actor_role, actor_status
  FROM public.profiles WHERE id = actor;

  IF actor_status <> 'active' OR actor_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF _mode = 'lock_now' THEN
    UPDATE public.pool_scoring_rules
      SET specials_manual_locked = true,
          specials_manual_locked_at = now(),
          specials_manual_locked_by = actor,
          specials_lock_reason = _reason,
          updated_at = now()
      WHERE pool_id = _pool_id
      RETURNING * INTO result;
  ELSIF _mode = 'unlock' THEN
    UPDATE public.pool_scoring_rules
      SET specials_manual_locked = false,
          specials_manual_locked_at = NULL,
          specials_manual_locked_by = NULL,
          specials_lock_reason = NULL,
          updated_at = now()
      WHERE pool_id = _pool_id
      RETURNING * INTO result;
  ELSIF _mode = 'schedule' THEN
    IF _lock_at IS NULL THEN
      RAISE EXCEPTION 'lock_at_required' USING ERRCODE = '22023';
    END IF;
    UPDATE public.pool_scoring_rules
      SET specials_lock_at = _lock_at,
          updated_at = now()
      WHERE pool_id = _pool_id
      RETURNING * INTO result;
  ELSIF _mode = 'clear_schedule' THEN
    UPDATE public.pool_scoring_rules
      SET specials_lock_at = NULL,
          updated_at = now()
      WHERE pool_id = _pool_id
      RETURNING * INTO result;
  ELSE
    RAISE EXCEPTION 'invalid_mode' USING ERRCODE = '22023';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pool_scoring_rules_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    actor,
    'special_predictions.' || _mode,
    'pool_scoring_rules',
    result.id::text,
    jsonb_build_object(
      'pool_id', _pool_id,
      'lock_at', _lock_at,
      'reason', _reason,
      'manual_locked', result.specials_manual_locked,
      'scheduled_lock_at', result.specials_lock_at
    )
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_special_predictions_lock(uuid, text, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_special_predictions_lock(uuid, text, timestamptz, text) TO authenticated;

-- 5. Habilitar realtime em pool_scoring_rules
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_class c ON pr.prrelid = c.oid
    JOIN pg_publication p ON pr.prpubid = p.oid
    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'pool_scoring_rules'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pool_scoring_rules';
  END IF;
END $$;
