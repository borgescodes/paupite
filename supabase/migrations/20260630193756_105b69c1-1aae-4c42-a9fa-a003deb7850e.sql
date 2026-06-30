ALTER TABLE public.notification_campaigns ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS notification_campaigns_not_deleted_idx
  ON public.notification_campaigns (created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS notifications_user_not_deleted_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE deleted_at IS NULL;