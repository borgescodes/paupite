BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE public.notifications
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN type SET NOT NULL,
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN message SET NOT NULL,
  ALTER COLUMN data SET NOT NULL,
  ALTER COLUMN data SET DEFAULT '{}'::jsonb,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notifications_type_nonempty'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_type_nonempty CHECK (btrim(type) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notifications_title_nonempty'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_title_nonempty CHECK (btrim(title) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notifications_message_nonempty'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_message_nonempty CHECK (btrim(message) <> '');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications(user_id, read_at)
  WHERE read_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_type_dedupe_idx
  ON public.notifications(user_id, type, (data->>'dedupe_key'))
  WHERE data ? 'dedupe_key';

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
DROP POLICY IF EXISTS notifications_update_own_read_at ON public.notifications;
DROP POLICY IF EXISTS notifications_insert_service_role ON public.notifications;
DROP POLICY IF EXISTS notifications_delete_service_role ON public.notifications;

CREATE POLICY notifications_select_own
ON public.notifications
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY notifications_update_own_read_at
ON public.notifications
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY notifications_insert_service_role
ON public.notifications
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY notifications_delete_service_role
ON public.notifications
FOR DELETE
TO service_role
USING (true);

REVOKE ALL ON TABLE public.notifications FROM anon, authenticated;
GRANT SELECT, UPDATE(read_at) ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;

CREATE OR REPLACE FUNCTION private.insert_notification(
  _user_id uuid,
  _type text,
  _title text,
  _message text,
  _data jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  payload jsonb := COALESCE(_data, '{}'::jsonb);
  notification_id uuid;
BEGIN
  IF _user_id IS NULL
     OR btrim(COALESCE(_type, '')) = ''
     OR btrim(COALESCE(_title, '')) = ''
     OR btrim(COALESCE(_message, '')) = '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (_user_id, _type, _title, _message, payload)
  ON CONFLICT DO NOTHING
  RETURNING id INTO notification_id;

  IF notification_id IS NULL AND payload ? 'dedupe_key' THEN
    SELECT id INTO notification_id
    FROM public.notifications
    WHERE user_id = _user_id
      AND type = _type
      AND data->>'dedupe_key' = payload->>'dedupe_key'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  RETURN notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.notify_active_staff(
  _type text,
  _title text,
  _message text,
  _data jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  staff record;
BEGIN
  FOR staff IN
    SELECT id
    FROM public.profiles
    WHERE status = 'active'
      AND role IN ('admin', 'superadmin')
  LOOP
    PERFORM private.insert_notification(staff.id, _type, _title, _message, _data);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION private.notify_enrollment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  status_changed boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    status_changed := true;

    PERFORM private.insert_notification(
      NEW.user_id,
      'pool_welcome',
      'Bem-vindo ao bolão',
      'Sua entrada no Pau Pite foi registrada. Acompanhe o status da inscrição por aqui.',
      jsonb_build_object(
        'enrollment_id', NEW.id,
        'pool_id', NEW.pool_id,
        'dedupe_key', 'pool_welcome:' || NEW.id::text
      )
    );
  ELSE
    status_changed := OLD.status IS DISTINCT FROM NEW.status;
  END IF;

  IF status_changed THEN
    IF NEW.status = 'requested' THEN
      PERFORM private.notify_active_staff(
        'admin_enrollment_requested',
        'Nova solicitação de inscrição',
        'Há uma nova solicitação de inscrição aguardando análise.',
        jsonb_build_object(
          'enrollment_id', NEW.id,
          'pool_id', NEW.pool_id,
          'user_id', NEW.user_id,
          'dedupe_key', 'admin_enrollment_requested:' || NEW.id::text
        )
      );
    END IF;

    IF NEW.status = 'payment_pending' THEN
      PERFORM private.notify_active_staff(
        'admin_manual_action_required',
        'Ação manual pendente',
        'Há uma inscrição com pagamento aguardando acompanhamento manual.',
        jsonb_build_object(
          'enrollment_id', NEW.id,
          'pool_id', NEW.pool_id,
          'user_id', NEW.user_id,
          'dedupe_key', 'admin_enrollment_action:' || NEW.id::text
        )
      );
    END IF;

    IF NEW.status IN ('active', 'confirmed', 'paid') THEN
      PERFORM private.insert_notification(
        NEW.user_id,
        'enrollment_confirmed',
        'Inscrição confirmada',
        'Sua inscrição no bolão está ativa.',
        jsonb_build_object(
          'enrollment_id', NEW.id,
          'pool_id', NEW.pool_id,
          'status', NEW.status,
          'dedupe_key', 'enrollment_confirmed:' || NEW.id::text
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.notify_payment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  enrollment_row record;
  status_changed boolean := false;
BEGIN
  SELECT id, user_id, pool_id
  INTO enrollment_row
  FROM public.enrollments
  WHERE id = NEW.enrollment_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    status_changed := true;
  ELSE
    status_changed := OLD.status IS DISTINCT FROM NEW.status;
  END IF;

  IF status_changed THEN
    IF NEW.status = 'pending' THEN
      PERFORM private.notify_active_staff(
        'admin_manual_action_required',
        'Ação manual pendente',
        'Há um pagamento de inscrição aguardando confirmação.',
        jsonb_build_object(
          'payment_id', NEW.id,
          'enrollment_id', NEW.enrollment_id,
          'pool_id', enrollment_row.pool_id,
          'user_id', enrollment_row.user_id,
          'provider', NEW.provider,
          'dedupe_key', 'admin_payment_pending:' || NEW.id::text
        )
      );
    END IF;

    IF NEW.status = 'paid' THEN
      PERFORM private.insert_notification(
        enrollment_row.user_id,
        'payment_received',
        'Pagamento recebido',
        'Recebemos seu pagamento da inscrição no bolão.',
        jsonb_build_object(
          'payment_id', NEW.id,
          'enrollment_id', NEW.enrollment_id,
          'pool_id', enrollment_row.pool_id,
          'amount_cents', NEW.amount_cents,
          'provider', NEW.provider,
          'dedupe_key', 'payment_received:' || NEW.id::text
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.recalculate_match_points(_match_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  m public.matches%ROWTYPE;
  scored record;
  updated_count int := 0;
  point_label text;
BEGIN
  SELECT * INTO m
  FROM public.matches
  WHERE id = _match_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  FOR scored IN
    UPDATE public.bets b
    SET points = public.calc_bet_points(m.home_score, m.away_score, b.home_score, b.away_score),
        locked_at = COALESCE(b.locked_at, now())
    WHERE b.match_id = _match_id
    RETURNING b.id, b.user_id, b.points
  LOOP
    updated_count := updated_count + 1;

    IF scored.points > 0 THEN
      point_label := CASE WHEN scored.points = 1 THEN 'ponto' ELSE 'pontos' END;

      PERFORM private.insert_notification(
        scored.user_id,
        'bet_scored',
        'Palpite pontuado',
        format('Seu palpite somou %s %s nesta partida.', scored.points, point_label),
        jsonb_build_object(
          'match_id', _match_id,
          'bet_id', scored.id,
          'points', scored.points,
          'dedupe_key', 'bet_scored:' || scored.id::text || ':' || _match_id::text
        )
      );
    END IF;
  END LOOP;

  RETURN updated_count;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_enrollments ON public.enrollments;
CREATE TRIGGER trg_notifications_enrollments
AFTER INSERT OR UPDATE OF status
ON public.enrollments
FOR EACH ROW
EXECUTE FUNCTION private.notify_enrollment_change();

DROP TRIGGER IF EXISTS trg_notifications_payments ON public.payments;
CREATE TRIGGER trg_notifications_payments
AFTER INSERT OR UPDATE OF status
ON public.payments
FOR EACH ROW
EXECUTE FUNCTION private.notify_payment_change();

REVOKE ALL ON FUNCTION private.insert_notification(uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.notify_active_staff(text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.notify_enrollment_change()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.notify_payment_change()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.recalculate_match_points(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.insert_notification(uuid, text, text, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION private.notify_active_staff(text, text, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION private.recalculate_match_points(uuid)
  TO service_role;

COMMIT;
