BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

-- pool_settings: stub -> MVP
INSERT INTO public.pool_settings (slug, title, status, terms)
VALUES ('world-cup-2026', 'Bolão Copa 2026', 'draft', 'Termos a definir.')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.pool_settings
  ADD COLUMN IF NOT EXISTS competition_id uuid REFERENCES public.competitions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS enrollment_opens_at timestamptz,
  ADD COLUMN IF NOT EXISTS enrollment_closes_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS enrollments_mode text DEFAULT 'closed',
  ADD COLUMN IF NOT EXISTS coming_soon_message text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pool_settings_enrollments_mode_check'
  ) THEN
    ALTER TABLE public.pool_settings
      ADD CONSTRAINT pool_settings_enrollments_mode_check
      CHECK (enrollments_mode IN ('open', 'coming_soon', 'closed'));
  END IF;
END $$;

-- enrollments: stub -> MVP
ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS pool_id uuid,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS note text;

UPDATE public.enrollments
SET pool_id = (
  SELECT id
  FROM public.pool_settings
  WHERE slug = 'world-cup-2026'
  LIMIT 1
)
WHERE pool_id IS NULL;

UPDATE public.enrollments
SET status = CASE
  WHEN status IN ('confirmed', 'paid') THEN 'active'
  WHEN status = 'pending' THEN 'requested'
  ELSE status
END;

UPDATE public.enrollments
SET terms_accepted_at = COALESCE(terms_accepted_at, requested_at, created_at, now())
WHERE terms_accepted_at IS NULL;

ALTER TABLE public.enrollments
  ALTER COLUMN pool_id SET NOT NULL,
  ALTER COLUMN terms_accepted_at SET NOT NULL;

ALTER TABLE public.enrollments
  DROP CONSTRAINT IF EXISTS enrollments_user_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'enrollments_pool_id_fkey'
  ) THEN
    ALTER TABLE public.enrollments
      ADD CONSTRAINT enrollments_pool_id_fkey
      FOREIGN KEY (pool_id) REFERENCES public.pool_settings(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'enrollments_pool_user_unique'
  ) THEN
    ALTER TABLE public.enrollments
      ADD CONSTRAINT enrollments_pool_user_unique UNIQUE (pool_id, user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'enrollments_status_check'
  ) THEN
    ALTER TABLE public.enrollments
      ADD CONSTRAINT enrollments_status_check
      CHECK (status IN ('requested', 'payment_pending', 'active', 'rejected', 'cancelled'));
  END IF;
END $$;

-- payments: stub -> MVP
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS paid_amount_cents integer,
  ADD COLUMN IF NOT EXISTS order_nsu text,
  ADD COLUMN IF NOT EXISTS transaction_nsu text,
  ADD COLUMN IF NOT EXISTS invoice_slug text,
  ADD COLUMN IF NOT EXISTS capture_method text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.payments
SET provider = 'manual'
WHERE provider IS NULL OR provider = 'stub';

UPDATE public.payments
SET order_nsu = 'legacy-' || id::text
WHERE order_nsu IS NULL OR btrim(order_nsu) = '';

ALTER TABLE public.payments
  ALTER COLUMN order_nsu SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_order_nsu_unique'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_order_nsu_unique UNIQUE (order_nsu);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_provider_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_provider_check
      CHECK (provider IN ('manual', 'infinitepay'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_status_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_status_check
      CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'refunded'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS payments_transaction_nsu_unique
  ON public.payments(transaction_nsu)
  WHERE transaction_nsu IS NOT NULL;

-- prize_requests: stub -> MVP
ALTER TABLE public.prize_requests
  ADD COLUMN IF NOT EXISTS pool_id uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS note text;

UPDATE public.prize_requests
SET pool_id = (
  SELECT id
  FROM public.pool_settings
  WHERE slug = 'world-cup-2026'
  LIMIT 1
)
WHERE pool_id IS NULL;

UPDATE public.prize_requests
SET status = CASE
  WHEN status = 'pending' THEN 'requested'
  ELSE status
END;

ALTER TABLE public.prize_requests
  ALTER COLUMN pool_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prize_requests_pool_id_fkey'
  ) THEN
    ALTER TABLE public.prize_requests
      ADD CONSTRAINT prize_requests_pool_id_fkey
      FOREIGN KEY (pool_id) REFERENCES public.pool_settings(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prize_requests_pool_user_unique'
  ) THEN
    ALTER TABLE public.prize_requests
      ADD CONSTRAINT prize_requests_pool_user_unique UNIQUE (pool_id, user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prize_requests_status_check'
  ) THEN
    ALTER TABLE public.prize_requests
      ADD CONSTRAINT prize_requests_status_check
      CHECK (status IN ('requested', 'approved', 'paid', 'rejected'));
  END IF;
END $$;

-- índices
CREATE INDEX IF NOT EXISTS enrollments_user_idx
  ON public.enrollments(user_id);

CREATE INDEX IF NOT EXISTS enrollments_pool_status_idx
  ON public.enrollments(pool_id, status);

CREATE INDEX IF NOT EXISTS payments_enrollment_idx
  ON public.payments(enrollment_id);

-- remover policies stub abertas
DROP POLICY IF EXISTS "pool_settings_read_auth" ON public.pool_settings;
DROP POLICY IF EXISTS "pool_settings_write_admin" ON public.pool_settings;
DROP POLICY IF EXISTS "enrollments_own" ON public.enrollments;
DROP POLICY IF EXISTS "payments_own" ON public.payments;
DROP POLICY IF EXISTS "prize_requests_own" ON public.prize_requests;

-- garantir RLS
ALTER TABLE public.pool_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prize_requests ENABLE ROW LEVEL SECURITY;

-- DML direto bloqueado para authenticated
REVOKE INSERT, UPDATE, DELETE ON public.pool_settings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.enrollments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.prize_requests FROM authenticated;

GRANT SELECT ON public.pool_settings, public.enrollments, public.payments, public.prize_requests TO authenticated;
GRANT ALL ON public.pool_settings, public.enrollments, public.payments, public.prize_requests TO service_role;

COMMIT;
