
-- Stub tables for pool features (kept to satisfy code references; not wired to real payments)
CREATE TABLE IF NOT EXISTS public.pool_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL DEFAULT 'Bolão da Copa',
  status text NOT NULL DEFAULT 'draft',
  entry_fee_cents integer NOT NULL DEFAULT 0,
  minimum_participants integer NOT NULL DEFAULT 0,
  prize_percentage integer NOT NULL DEFAULT 0,
  prize_description text,
  terms text NOT NULL DEFAULT '',
  free_ranking_starts_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pool_settings TO authenticated;
GRANT ALL ON public.pool_settings TO service_role;
ALTER TABLE public.pool_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pool_settings_read_auth" ON public.pool_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "pool_settings_write_admin" ON public.pool_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','superadmin') AND p.status='active'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','superadmin') AND p.status='active'));

INSERT INTO public.pool_settings (slug, title, status, terms)
VALUES ('world-cup-2026', 'Bolão Copa 2026', 'draft', 'Termos a definir.')
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  terms_accepted_at timestamptz,
  requested_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrollments TO authenticated;
GRANT ALL ON public.enrollments TO service_role;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enrollments_own" ON public.enrollments FOR ALL TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','superadmin') AND p.status='active'))
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','superadmin') AND p.status='active'));

CREATE TABLE IF NOT EXISTS public.prize_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prize_requests TO authenticated;
GRANT ALL ON public.prize_requests TO service_role;
ALTER TABLE public.prize_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prize_requests_own" ON public.prize_requests FOR ALL TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','superadmin') AND p.status='active'))
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','superadmin') AND p.status='active'));

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  provider text NOT NULL DEFAULT 'stub',
  checkout_url text,
  receipt_url text,
  amount_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_own" ON public.payments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.enrollments e WHERE e.id = enrollment_id AND (e.user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','superadmin') AND p.status='active'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.enrollments e WHERE e.id = enrollment_id AND (e.user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','superadmin') AND p.status='active'))));

-- Views: ranking_free / ranking_pool mirror the existing ranking view as stubs
CREATE OR REPLACE VIEW public.ranking_free WITH (security_invoker = true) AS
  SELECT * FROM public.ranking;
GRANT SELECT ON public.ranking_free TO authenticated;

CREATE OR REPLACE VIEW public.ranking_pool WITH (security_invoker = true) AS
  SELECT * FROM public.ranking;
GRANT SELECT ON public.ranking_pool TO authenticated;

CREATE OR REPLACE VIEW public.pool_public_summary WITH (security_invoker = true) AS
  SELECT
    s.id,
    s.title,
    s.status,
    s.entry_fee_cents,
    s.minimum_participants,
    s.prize_percentage,
    s.prize_description,
    s.terms,
    COALESCE((SELECT count(*) FROM public.enrollments e WHERE e.status = 'confirmed'), 0)::int AS participants_count,
    COALESCE((SELECT count(*) FROM public.enrollments e WHERE e.status = 'confirmed') * s.entry_fee_cents * s.prize_percentage / 100, 0)::int AS estimated_prize_cents
  FROM public.pool_settings s
  WHERE s.slug = 'world-cup-2026';
GRANT SELECT ON public.pool_public_summary TO authenticated;
