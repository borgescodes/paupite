-- Pau Pite MVP: RBAC final, partidas operacionais, bolão, pagamentos,
-- perfil/badges, importação, prêmios, auditoria e rankings separados.
-- Migration aditiva: preserva profiles, competitions, teams, matches, bets e score_rules.

BEGIN;

SELECT set_config('request.jwt.claim.role', 'service_role', true);

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Helpers de autorização sem recursão de RLS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_active_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND status = 'active' AND role = 'admin'
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
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND status = 'active' AND role = 'superadmin'
  );
$$;

CREATE OR REPLACE FUNCTION private.is_active_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private
AS $$
  SELECT private.is_active_admin(_user_id) OR private.is_active_superadmin(_user_id);
$$;

REVOKE ALL ON FUNCTION private.is_active_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_active_superadmin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_active_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_active_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_active_superadmin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_active_staff(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.profile_self_update_is_safe(
  _actor_id uuid,
  _role text,
  _status text,
  _email text,
  _created_at timestamptz,
  _must_change_password boolean,
  _first_access_completed_at timestamptz,
  _last_password_reset_at timestamptz,
  _temporary_password_set_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _actor_id
      AND p.role = _role
      AND p.status = _status
      AND p.email = _email
      AND p.created_at = _created_at
      AND COALESCE(p.must_change_password, false) = COALESCE(_must_change_password, false)
      AND p.first_access_completed_at IS NOT DISTINCT FROM _first_access_completed_at
      AND p.last_password_reset_at IS NOT DISTINCT FROM _last_password_reset_at
      AND p.temporary_password_set_at IS NOT DISTINCT FROM _temporary_password_set_at
  );
$$;

REVOKE ALL ON FUNCTION private.profile_self_update_is_safe(
  uuid, text, text, text, timestamptz, boolean, timestamptz, timestamptz, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.profile_self_update_is_safe(
  uuid, text, text, text, timestamptz, boolean, timestamptz, timestamptz, timestamptz
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.match_kickoff_passed(_match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT kickoff_at <= now() FROM public.matches WHERE id = _match_id),
    true
  );
$$;
REVOKE ALL ON FUNCTION private.match_kickoff_passed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.match_kickoff_passed(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Perfis: leitura hierárquica, edição visual própria e gestão apenas superadmin
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_manage_players ON public.profiles;
DROP POLICY IF EXISTS profiles_superadmin_manage_admins_players ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_select_admin_players ON public.profiles;
DROP POLICY IF EXISTS profiles_select_superadmin_all ON public.profiles;
DROP POLICY IF EXISTS profiles_select_hierarchy ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own_visual ON public.profiles;
DROP POLICY IF EXISTS profiles_superadmin_manage_non_superadmins ON public.profiles;

CREATE POLICY profiles_select_own
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid());

CREATE POLICY profiles_select_admin_players
ON public.profiles FOR SELECT TO authenticated
USING (role = 'player' AND private.is_active_admin(auth.uid()));

CREATE POLICY profiles_select_superadmin_all
ON public.profiles FOR SELECT TO authenticated
USING (private.is_active_superadmin(auth.uid()));

CREATE POLICY profiles_update_own_visual
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND private.profile_self_update_is_safe(
    auth.uid(),
    role,
    status,
    email,
    created_at,
    must_change_password,
    first_access_completed_at,
    last_password_reset_at,
    temporary_password_set_at
  )
);

CREATE POLICY profiles_superadmin_manage_non_superadmins
ON public.profiles FOR UPDATE TO authenticated
USING (
  role <> 'superadmin'
  AND private.is_active_superadmin(auth.uid())
)
WITH CHECK (
  role IN ('admin', 'player')
  AND private.is_active_superadmin(auth.uid())
);

-- ---------------------------------------------------------------------------
-- Partidas e times: campos operacionais/importação
-- ---------------------------------------------------------------------------
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS external_key text;

CREATE UNIQUE INDEX IF NOT EXISTS teams_external_key_unique
  ON public.teams(external_key)
  WHERE external_key IS NOT NULL;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS external_key text,
  ADD COLUMN IF NOT EXISTS match_number integer,
  ADD COLUMN IF NOT EXISTS venue text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text;

CREATE UNIQUE INDEX IF NOT EXISTS matches_external_key_unique
  ON public.matches(external_key)
  WHERE external_key IS NOT NULL;

DROP POLICY IF EXISTS teams_admin_write ON public.teams;
DROP POLICY IF EXISTS teams_staff_write ON public.teams;
CREATE POLICY teams_staff_write
ON public.teams FOR ALL TO authenticated
USING (private.is_active_staff(auth.uid()))
WITH CHECK (private.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS matches_admin_write ON public.matches;
DROP POLICY IF EXISTS matches_staff_insert ON public.matches;
DROP POLICY IF EXISTS matches_staff_update ON public.matches;
DROP POLICY IF EXISTS matches_superadmin_delete ON public.matches;

CREATE POLICY matches_staff_insert
ON public.matches FOR INSERT TO authenticated
WITH CHECK (private.is_active_staff(auth.uid()));

CREATE POLICY matches_staff_update
ON public.matches FOR UPDATE TO authenticated
USING (private.is_active_staff(auth.uid()))
WITH CHECK (private.is_active_staff(auth.uid()));

CREATE POLICY matches_superadmin_delete
ON public.matches FOR DELETE TO authenticated
USING (private.is_active_superadmin(auth.uid()));

-- Partidas são mutadas pelas Edge Functions auditadas; RLS permanece como
-- barreira adicional para ambientes que reativem grants no futuro.
REVOKE INSERT, UPDATE, DELETE ON public.matches FROM authenticated;
GRANT SELECT ON public.matches TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_match_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_role text;
  actor_status text;
  trusted boolean :=
    COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR current_user IN ('postgres', 'supabase_admin', 'service_role');
BEGIN
  IF trusted THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  SELECT role, status INTO actor_role, actor_status
  FROM public.profiles
  WHERE id = actor_id;

  IF actor_status <> 'active' OR actor_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Only active staff can manage matches';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF actor_role <> 'superadmin' THEN
      RAISE EXCEPTION 'Only superadmin can delete matches';
    END IF;
    IF EXISTS (SELECT 1 FROM public.bets WHERE match_id = OLD.id) THEN
      RAISE EXCEPTION 'Matches with bets cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.home_team_id IS NOT NULL
     AND NEW.away_team_id IS NOT NULL
     AND NEW.home_team_id = NEW.away_team_id THEN
    RAISE EXCEPTION 'A team cannot play against itself';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.kickoff_at <= now() THEN
      RAISE EXCEPTION 'New matches must be scheduled in the future';
    END IF;
    IF NEW.status <> 'scheduled' OR NEW.home_score <> 0 OR NEW.away_score <> 0 THEN
      RAISE EXCEPTION 'New matches must start scheduled with a 0-0 score';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'closed' AND actor_role <> 'superadmin' THEN
    RAISE EXCEPTION 'Only superadmin can change a closed match';
  END IF;

  IF NEW.kickoff_at > now() THEN
    IF NEW.status <> 'scheduled' THEN
      RAISE EXCEPTION 'A future match must remain scheduled';
    END IF;
    IF NEW.home_score <> 0 OR NEW.away_score <> 0 THEN
      RAISE EXCEPTION 'Official scores cannot be entered before kickoff';
    END IF;
  END IF;

  IF (NEW.home_score IS DISTINCT FROM OLD.home_score
      OR NEW.away_score IS DISTINCT FROM OLD.away_score)
     AND OLD.kickoff_at > now() THEN
    RAISE EXCEPTION 'Official scores cannot be entered before kickoff';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_match_permissions ON public.matches;
CREATE TRIGGER trg_enforce_match_permissions
BEFORE INSERT OR UPDATE OR DELETE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.enforce_match_permissions();

REVOKE ALL ON FUNCTION public.enforce_match_permissions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_match_permissions() TO service_role;

-- Regras de pontuação são controle exclusivo do superadmin.
DROP POLICY IF EXISTS score_rules_admin_write ON public.score_rules;
DROP POLICY IF EXISTS score_rules_superadmin_write ON public.score_rules;
CREATE POLICY score_rules_superadmin_write
ON public.score_rules FOR ALL TO authenticated
USING (private.is_active_superadmin(auth.uid()))
WITH CHECK (private.is_active_superadmin(auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.score_rules FROM authenticated;
GRANT SELECT ON public.score_rules TO authenticated;

-- Players nunca definem pontos, locked_at, usuário ou partida via payload.
DROP POLICY IF EXISTS bets_admin_all ON public.bets;
DROP POLICY IF EXISTS bets_select_own ON public.bets;
DROP POLICY IF EXISTS bets_insert_own_before_kickoff ON public.bets;
DROP POLICY IF EXISTS bets_update_own_before_kickoff ON public.bets;

CREATE POLICY bets_select_own
ON public.bets FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY bets_insert_own_before_kickoff
ON public.bets FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND NOT private.match_kickoff_passed(match_id)
);

CREATE POLICY bets_update_own_before_kickoff
ON public.bets FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  AND NOT private.match_kickoff_passed(match_id)
)
WITH CHECK (
  user_id = auth.uid()
  AND NOT private.match_kickoff_passed(match_id)
);

CREATE OR REPLACE FUNCTION public.enforce_player_bet_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  trusted boolean :=
    COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR current_user IN ('postgres', 'supabase_admin', 'service_role');
BEGIN
  IF trusted THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR NEW.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Players can write only their own bets';
  END IF;
  IF private.match_kickoff_passed(NEW.match_id) THEN
    RAISE EXCEPTION 'Betting is closed for this match';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.points <> 0 OR NEW.locked_at IS NOT NULL THEN
      RAISE EXCEPTION 'Players cannot define points or lock state';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.match_id IS DISTINCT FROM OLD.match_id
     OR NEW.points IS DISTINCT FROM OLD.points
     OR NEW.locked_at IS DISTINCT FROM OLD.locked_at THEN
    RAISE EXCEPTION 'Players can update only the predicted score';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_player_bet_integrity ON public.bets;
CREATE TRIGGER trg_enforce_player_bet_integrity
BEFORE INSERT OR UPDATE ON public.bets
FOR EACH ROW EXECUTE FUNCTION public.enforce_player_bet_integrity();

REVOKE ALL ON FUNCTION public.enforce_player_bet_integrity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_player_bet_integrity() TO service_role;

-- ---------------------------------------------------------------------------
-- Bolão oficial
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pool_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE DEFAULT 'world-cup-2026',
  competition_id uuid REFERENCES public.competitions(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Bolão da Copa 2026',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'closed', 'archived')),
  entry_fee_cents integer NOT NULL DEFAULT 0 CHECK (entry_fee_cents >= 0),
  minimum_participants integer NOT NULL DEFAULT 1 CHECK (minimum_participants > 0),
  prize_percentage integer NOT NULL DEFAULT 80 CHECK (prize_percentage BETWEEN 0 AND 100),
  prize_description text,
  terms text NOT NULL DEFAULT 'Ao participar, você aceita as regras e os critérios de pontuação do Pau Pite.',
  free_ranking_starts_at timestamptz,
  enrollment_opens_at timestamptz,
  enrollment_closes_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.pool_settings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'payment_pending', 'active', 'rejected', 'cancelled')),
  terms_accepted_at timestamptz NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  confirmed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pool_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('manual', 'infinitepay')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'refunded')),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  paid_amount_cents integer,
  order_nsu text NOT NULL UNIQUE,
  transaction_nsu text,
  invoice_slug text,
  checkout_url text,
  receipt_url text,
  capture_method text,
  paid_at timestamptz,
  confirmed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payments_transaction_nsu_unique
  ON public.payments(transaction_nsu)
  WHERE transaction_nsu IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.profile_badges (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  favorite_team_codes text[] NOT NULL DEFAULT '{}',
  favorite_clubs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(favorite_team_codes) <= 2),
  CHECK (jsonb_typeof(favorite_clubs) = 'array'),
  CHECK (jsonb_array_length(favorite_clubs) <= 2)
);

CREATE TABLE IF NOT EXISTS public.prize_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.pool_settings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'paid', 'rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  paid_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pool_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.match_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source_version text,
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS enrollments_user_idx ON public.enrollments(user_id);
CREATE INDEX IF NOT EXISTS enrollments_pool_status_idx ON public.enrollments(pool_id, status);
CREATE INDEX IF NOT EXISTS payments_enrollment_idx ON public.payments(enrollment_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON public.audit_logs(created_at DESC);

DROP TRIGGER IF EXISTS trg_pool_settings_updated_at ON public.pool_settings;
CREATE TRIGGER trg_pool_settings_updated_at BEFORE UPDATE ON public.pool_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_enrollments_updated_at ON public.enrollments;
CREATE TRIGGER trg_enrollments_updated_at BEFORE UPDATE ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_profile_badges_updated_at ON public.profile_badges;
CREATE TRIGGER trg_profile_badges_updated_at BEFORE UPDATE ON public.profile_badges
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_prize_requests_updated_at ON public.prize_requests;
CREATE TRIGGER trg_prize_requests_updated_at BEFORE UPDATE ON public.prize_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.pool_settings (slug, competition_id)
SELECT 'world-cup-2026', c.id
FROM public.competitions c
ORDER BY c.created_at
LIMIT 1
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.pool_settings (slug)
SELECT 'world-cup-2026'
WHERE NOT EXISTS (SELECT 1 FROM public.pool_settings WHERE slug = 'world-cup-2026');

ALTER TABLE public.pool_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prize_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.pool_settings, public.enrollments, public.payments,
  public.profile_badges, public.prize_requests, public.match_imports, public.audit_logs
TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.profile_badges TO authenticated;
GRANT ALL ON public.pool_settings, public.enrollments, public.payments,
  public.profile_badges, public.prize_requests, public.match_imports, public.audit_logs
TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.audit_logs_id_seq TO service_role;

DROP POLICY IF EXISTS pool_settings_select_auth ON public.pool_settings;
DROP POLICY IF EXISTS pool_settings_superadmin_write ON public.pool_settings;
DROP POLICY IF EXISTS enrollments_select_own ON public.enrollments;
DROP POLICY IF EXISTS enrollments_superadmin_select ON public.enrollments;
DROP POLICY IF EXISTS payments_select_own ON public.payments;
DROP POLICY IF EXISTS payments_superadmin_select ON public.payments;
DROP POLICY IF EXISTS profile_badges_select_auth ON public.profile_badges;
DROP POLICY IF EXISTS profile_badges_insert_own ON public.profile_badges;
DROP POLICY IF EXISTS profile_badges_update_own ON public.profile_badges;
DROP POLICY IF EXISTS profile_badges_delete_own ON public.profile_badges;
DROP POLICY IF EXISTS prize_requests_select_own ON public.prize_requests;
DROP POLICY IF EXISTS prize_requests_superadmin_select ON public.prize_requests;
DROP POLICY IF EXISTS match_imports_superadmin_select ON public.match_imports;
DROP POLICY IF EXISTS audit_logs_superadmin_select ON public.audit_logs;

CREATE POLICY pool_settings_select_auth
ON public.pool_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY pool_settings_superadmin_write
ON public.pool_settings FOR ALL TO authenticated
USING (private.is_active_superadmin(auth.uid()))
WITH CHECK (private.is_active_superadmin(auth.uid()));

CREATE POLICY enrollments_select_own
ON public.enrollments FOR SELECT TO authenticated
USING (user_id = auth.uid());
CREATE POLICY enrollments_superadmin_select
ON public.enrollments FOR SELECT TO authenticated
USING (private.is_active_superadmin(auth.uid()));

CREATE POLICY payments_select_own
ON public.payments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.id = enrollment_id AND e.user_id = auth.uid()
  )
);
CREATE POLICY payments_superadmin_select
ON public.payments FOR SELECT TO authenticated
USING (private.is_active_superadmin(auth.uid()));

CREATE POLICY profile_badges_select_auth
ON public.profile_badges FOR SELECT TO authenticated USING (true);
CREATE POLICY profile_badges_insert_own
ON public.profile_badges FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY profile_badges_update_own
ON public.profile_badges FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY profile_badges_delete_own
ON public.profile_badges FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY prize_requests_select_own
ON public.prize_requests FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY prize_requests_superadmin_select
ON public.prize_requests FOR SELECT TO authenticated
USING (private.is_active_superadmin(auth.uid()));

CREATE POLICY match_imports_superadmin_select
ON public.match_imports FOR SELECT TO authenticated
USING (private.is_active_superadmin(auth.uid()));

CREATE POLICY audit_logs_superadmin_select
ON public.audit_logs FOR SELECT TO authenticated
USING (private.is_active_superadmin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Rankings: os mesmos bets alimentam a Resenha e o Bolão.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.ranking;
DROP VIEW IF EXISTS public.ranking_free;
DROP VIEW IF EXISTS public.ranking_pool;

CREATE OR REPLACE FUNCTION private.get_ranking_free()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  nickname text,
  avatar_url text,
  total_points integer,
  exact_scores_count integer,
  outcome_hits_count integer,
  bets_count integer,
  rank_position integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH settings AS (
    SELECT free_ranking_starts_at
    FROM public.pool_settings
    WHERE slug = 'world-cup-2026'
    LIMIT 1
  ),
  aggregates AS (
    SELECT
      p.id AS user_id,
      p.display_name,
      p.nickname,
      p.avatar_url,
      COALESCE(SUM(CASE WHEN m.status = 'closed' THEN b.points ELSE 0 END), 0)::int AS total_points,
      COALESCE(SUM(CASE
        WHEN m.status = 'closed'
          AND b.points > 0
          AND m.home_score = b.home_score
          AND m.away_score = b.away_score
        THEN 1 ELSE 0 END), 0)::int AS exact_scores_count,
      COALESCE(SUM(CASE WHEN m.status = 'closed' AND b.points > 0 THEN 1 ELSE 0 END), 0)::int AS outcome_hits_count,
      COUNT(b.id) FILTER (WHERE m.id IS NOT NULL)::int AS bets_count
    FROM public.profiles p
    LEFT JOIN public.bets b ON b.user_id = p.id
    LEFT JOIN public.matches m ON m.id = b.match_id
      AND (
        (SELECT free_ranking_starts_at FROM settings) IS NULL
        OR m.kickoff_at >= (SELECT free_ranking_starts_at FROM settings)
      )
    WHERE p.status = 'active'
    GROUP BY p.id, p.display_name, p.nickname, p.avatar_url
  )
  SELECT
    a.*,
    RANK() OVER (
      ORDER BY a.total_points DESC, a.exact_scores_count DESC, a.outcome_hits_count DESC, a.bets_count DESC
    )::int AS rank_position
  FROM aggregates a;
$$;

CREATE OR REPLACE FUNCTION private.get_ranking_pool()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  nickname text,
  avatar_url text,
  total_points integer,
  exact_scores_count integer,
  outcome_hits_count integer,
  bets_count integer,
  rank_position integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH active_members AS (
    SELECT e.user_id
    FROM public.enrollments e
    JOIN public.pool_settings ps ON ps.id = e.pool_id
    WHERE ps.slug = 'world-cup-2026' AND e.status = 'active'
  ),
  aggregates AS (
    SELECT
      p.id AS user_id,
      p.display_name,
      p.nickname,
      p.avatar_url,
      COALESCE(SUM(CASE WHEN m.status = 'closed' THEN b.points ELSE 0 END), 0)::int AS total_points,
      COALESCE(SUM(CASE
        WHEN m.status = 'closed'
          AND b.points > 0
          AND m.home_score = b.home_score
          AND m.away_score = b.away_score
        THEN 1 ELSE 0 END), 0)::int AS exact_scores_count,
      COALESCE(SUM(CASE WHEN m.status = 'closed' AND b.points > 0 THEN 1 ELSE 0 END), 0)::int AS outcome_hits_count,
      COUNT(b.id)::int AS bets_count
    FROM active_members am
    JOIN public.profiles p ON p.id = am.user_id AND p.status = 'active'
    LEFT JOIN public.bets b ON b.user_id = p.id
    LEFT JOIN public.matches m ON m.id = b.match_id
    GROUP BY p.id, p.display_name, p.nickname, p.avatar_url
  )
  SELECT
    a.*,
    RANK() OVER (
      ORDER BY a.total_points DESC, a.exact_scores_count DESC, a.outcome_hits_count DESC, a.bets_count DESC
    )::int AS rank_position
  FROM aggregates a;
$$;

REVOKE ALL ON FUNCTION private.get_ranking_free() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.get_ranking_pool() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_ranking_free() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_ranking_pool() TO authenticated, service_role;

CREATE VIEW public.ranking_free WITH (security_invoker = true) AS
SELECT * FROM private.get_ranking_free();

CREATE VIEW public.ranking_pool WITH (security_invoker = true) AS
SELECT * FROM private.get_ranking_pool();

CREATE VIEW public.ranking WITH (security_invoker = true) AS
SELECT * FROM public.ranking_free;

GRANT SELECT ON public.ranking, public.ranking_free, public.ranking_pool
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.get_pool_public_summary()
RETURNS TABLE (
  id uuid,
  title text,
  status text,
  entry_fee_cents integer,
  minimum_participants integer,
  prize_percentage integer,
  prize_description text,
  terms text,
  free_ranking_starts_at timestamptz,
  enrollment_opens_at timestamptz,
  enrollment_closes_at timestamptz,
  participants_count integer,
  estimated_prize_cents integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ps.id,
    ps.title,
    ps.status,
    ps.entry_fee_cents,
    ps.minimum_participants,
    ps.prize_percentage,
    ps.prize_description,
    ps.terms,
    ps.free_ranking_starts_at,
    ps.enrollment_opens_at,
    ps.enrollment_closes_at,
    COUNT(e.id) FILTER (WHERE e.status = 'active')::int,
    (
      COUNT(e.id) FILTER (WHERE e.status = 'active')
      * ps.entry_fee_cents
      * ps.prize_percentage
      / 100
    )::int
  FROM public.pool_settings ps
  LEFT JOIN public.enrollments e ON e.pool_id = ps.id
  WHERE ps.slug = 'world-cup-2026'
  GROUP BY ps.id;
$$;

REVOKE ALL ON FUNCTION private.get_pool_public_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_pool_public_summary() TO authenticated, service_role;
DROP VIEW IF EXISTS public.pool_public_summary;
CREATE VIEW public.pool_public_summary WITH (security_invoker = true) AS
SELECT * FROM private.get_pool_public_summary();
GRANT SELECT ON public.pool_public_summary TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Storage de avatares: pasta obrigatória por auth.uid().
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;

CREATE POLICY avatars_public_read
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY avatars_insert_own
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY avatars_update_own
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY avatars_delete_own
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

SELECT set_config('request.jwt.claim.role', '', true);

COMMIT;
