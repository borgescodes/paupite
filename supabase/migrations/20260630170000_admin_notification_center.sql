-- Central de Controle de Notificações (superadmin)
-- Estende o sistema de notificações existente com campanhas/relatório.
-- Não altera RLS, policies ou colunas já existentes de public.notifications.
-- campaign_id é nullable: notificações antigas continuam válidas.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Tabela de campanhas (governança + relatório)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SET NULL para não bloquear remoção de usuário (fluxo de reset não é tocado).
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  target_mode text NOT NULL,
  action_label text,
  action_url text,
  internal_route text,
  total_sent integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_campaigns_created_idx
  ON public.notification_campaigns(created_at DESC);

-- ---------------------------------------------------------------------------
-- 2) Vínculo opcional notifications -> notification_campaigns
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS campaign_id uuid
    REFERENCES public.notification_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS notifications_campaign_idx
  ON public.notifications(campaign_id)
  WHERE campaign_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) Segurança: campanhas só são lidas/escritas via service_role (Edge Function).
--    O relatório do superadmin é servido pela function admin-notifications,
--    evitando expor leitura cruzada de notificações de outros usuários.
-- ---------------------------------------------------------------------------
ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.notification_campaigns FROM anon, authenticated;
GRANT ALL ON TABLE public.notification_campaigns TO service_role;

COMMIT;
