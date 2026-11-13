-- =============================================================================
-- Sécurité : rôles, droits, Row Level Security, contraintes métier, registre
-- de points protégé.
--
-- Trois rôles :
--   revio_owner  : propriétaire du schéma (exécute les migrations)
--   revio_app    : l'application ; soumis à la RLS, droits réduits
--   revio_system : BYPASSRLS ; authentification, admin Revio, jobs
--
-- Le commerçant courant est transmis par transaction :
--   SELECT set_config('app.merchant_id', '<uuid>', true);
-- Sans ce réglage, revio_app ne voit AUCUNE ligne.
--
-- IMPORTANT : toute nouvelle table doit recevoir ici (ou dans sa migration)
-- ses GRANT, ENABLE/FORCE ROW LEVEL SECURITY et sa policy.
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'revio_app') THEN
    CREATE ROLE revio_app NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'revio_system') THEN
    CREATE ROLE revio_system NOLOGIN BYPASSRLS;
  END IF;
END $$;

CREATE FUNCTION app_current_merchant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.merchant_id', true), '')::uuid
$$;

GRANT USAGE ON SCHEMA public TO revio_app, revio_system;
GRANT EXECUTE ON FUNCTION app_current_merchant() TO revio_app, revio_system;

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO revio_system;
REVOKE ALL ON "_prisma_migrations" FROM revio_app, revio_system;

GRANT SELECT, UPDATE ON merchants TO revio_app;
GRANT SELECT ON users TO revio_app;
-- user_sessions : aucun droit pour revio_app (authentification = rôle système)
GRANT SELECT, UPDATE ON devices TO revio_app;
GRANT SELECT, INSERT, UPDATE ON customers TO revio_app;              -- pas de DELETE : effacement = anonymisation
GRANT SELECT, INSERT, UPDATE, DELETE ON customer_identifiers TO revio_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON phone_verifications TO revio_app;
GRANT SELECT, INSERT ON legal_documents TO revio_app;
GRANT SELECT, INSERT ON consents TO revio_app;                       -- append-only
GRANT SELECT, INSERT, UPDATE ON rules TO revio_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON tier_levels TO revio_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON rewards TO revio_app;
GRANT SELECT, INSERT, UPDATE ON redemptions TO revio_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON wheel_prizes TO revio_app;
GRANT SELECT, INSERT ON wheel_spins TO revio_app;
GRANT SELECT, INSERT ON point_transactions TO revio_app;             -- append-only
GRANT SELECT, INSERT, UPDATE ON kiosk_sessions TO revio_app;
GRANT SELECT, INSERT ON audit_log TO revio_app;                      -- append-only
GRANT SELECT, INSERT, UPDATE ON data_requests TO revio_app;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON merchants
  USING (id = app_current_merchant()) WITH CHECK (id = app_current_merchant());

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY;
-- aucune policy : invisible pour revio_app

ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON legal_documents FOR SELECT
  USING (merchant_id IS NULL OR merchant_id = app_current_merchant());
CREATE POLICY tenant_write ON legal_documents FOR INSERT
  WITH CHECK (merchant_id = app_current_merchant());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'devices', 'customers', 'customer_identifiers', 'phone_verifications',
    'consents', 'rules', 'tier_levels', 'rewards', 'redemptions', 'wheel_prizes',
    'wheel_spins', 'point_transactions', 'kiosk_sessions', 'audit_log', 'data_requests'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (merchant_id = app_current_merchant()) WITH CHECK (merchant_id = app_current_merchant())',
      t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Registre de points : les champs qui portent la valeur sont immuables,
-- pour tous les rôles. (Seules les clés étrangères peuvent passer à NULL.)
-- ---------------------------------------------------------------------------
CREATE FUNCTION forbid_ledger_rewrite() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Les lignes de % sont immuables : créez un mouvement correctif', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END $$;

CREATE TRIGGER point_transactions_immutable
  BEFORE UPDATE OF merchant_id, customer_id, type, points, purchase_amount_cents, reason, occurred_at, created_at
  ON point_transactions FOR EACH ROW EXECUTE FUNCTION forbid_ledger_rewrite();

CREATE TRIGGER consents_immutable
  BEFORE UPDATE OF merchant_id, customer_id, type, granted, text_version, legal_document_id, created_at
  ON consents FOR EACH ROW EXECUTE FUNCTION forbid_ledger_rewrite();

CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OF merchant_id, action, entity_type, entity_id, reason, metadata, created_at
  ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_ledger_rewrite();

-- ---------------------------------------------------------------------------
-- Contraintes métier
-- ---------------------------------------------------------------------------
ALTER TABLE point_transactions
  ADD CONSTRAINT points_sign CHECK (
    CASE type
      WHEN 'EARN' THEN points >= 0
      WHEN 'TIER_BONUS' THEN points > 0
      WHEN 'WHEEL_BONUS' THEN points > 0
      WHEN 'REDEEM' THEN points < 0
      WHEN 'EXPIRATION' THEN points < 0
      ELSE points <> 0
    END),
  ADD CONSTRAINT adjustment_reason CHECK (
    type <> 'ADJUSTMENT' OR (reason IS NOT NULL AND length(btrim(reason)) >= 3)),
  ADD CONSTRAINT purchase_amount_positive CHECK (purchase_amount_cents IS NULL OR purchase_amount_cents >= 0);

ALTER TABLE rules
  ADD CONSTRAINT points_per_euro_range CHECK (points_per_euro >= 0 AND points_per_euro <= 1000),
  ADD CONSTRAINT points_per_visit_range CHECK (points_per_visit >= 0),
  ADD CONSTRAINT min_purchase_range CHECK (min_purchase_cents >= 0),
  ADD CONSTRAINT pin_attempts_range CHECK (pin_max_attempts BETWEEN 3 AND 10),
  ADD CONSTRAINT expiry_range CHECK (points_expiry_months BETWEEN 1 AND 60),
  ADD CONSTRAINT reminder_range CHECK (expiry_reminder_days BETWEEN 0 AND 90),
  -- Conservation plafonnée : 36 mois d'inactivité au maximum
  ADD CONSTRAINT retention_cap CHECK (inactivity_retention_months BETWEEN 1 AND 36),
  ADD CONSTRAINT tier_window_range CHECK (tier_window_months BETWEEN 1 AND 36),
  ADD CONSTRAINT daily_cap_range CHECK (daily_points_cap IS NULL OR daily_points_cap > 0),
  ADD CONSTRAINT adjustment_alert_range CHECK (adjustment_alert_daily_count > 0),
  ADD CONSTRAINT kiosk_reset_range CHECK (kiosk_reset_seconds BETWEEN 5 AND 120);

ALTER TABLE rewards
  ADD CONSTRAINT reward_cost_positive CHECK (points_cost > 0),
  ADD CONSTRAINT reward_stock_positive CHECK (stock IS NULL OR stock >= 0);

ALTER TABLE wheel_prizes
  ADD CONSTRAINT wheel_weight_positive CHECK (weight > 0),
  ADD CONSTRAINT wheel_prize_payload CHECK (
    (type = 'NOTHING') OR
    (type = 'POINTS' AND points IS NOT NULL AND points > 0) OR
    (type = 'REWARD' AND reward_id IS NOT NULL));

ALTER TABLE tier_levels
  ADD CONSTRAINT tier_min_points CHECK (min_points >= 0),
  ADD CONSTRAINT tier_bonus_range CHECK (bonus_percent BETWEEN 0 AND 100);

ALTER TABLE customers
  ADD CONSTRAINT pin_attempts_positive CHECK (pin_failed_attempts >= 0);

ALTER TABLE users
  ADD CONSTRAINT email_lowercase CHECK (email = lower(email)),
  ADD CONSTRAINT admin_has_no_merchant CHECK (
    (role = 'REVIO_ADMIN' AND merchant_id IS NULL) OR (role <> 'REVIO_ADMIN' AND merchant_id IS NOT NULL));

-- Textes modèles Revio (merchant_id NULL) : une seule version par type
CREATE UNIQUE INDEX legal_documents_global_version_key
  ON legal_documents (type, version) WHERE merchant_id IS NULL;
