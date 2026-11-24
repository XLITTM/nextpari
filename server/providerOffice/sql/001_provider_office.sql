-- REVIEW ONLY. DO NOT APPLY until the owner approves.
-- This file is outside supabase/migrations, so `supabase db push` cannot pick it up.
-- Do not run it against production from this pull request.
-- Target: the existing NextPari brand database. It does not create a project,
-- does not copy players, and does not grant OddsPapi access to RYXO.
--
-- Rollback: DROP SCHEMA provider_office CASCADE; DROP ROLE provider_office_reader;

BEGIN;

CREATE SCHEMA IF NOT EXISTS provider_office;

CREATE TABLE IF NOT EXISTS provider_office.providers (
    id UUID PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    legal_entity TEXT NOT NULL,
    product TEXT NOT NULL,
    status TEXT NOT NULL,
    CONSTRAINT providers_product_check CHECK (product IN ('sportsbook', 'casino', 'statistics')),
    CONSTRAINT providers_status_check CHECK (status IN ('active', 'inactive', 'planned'))
);

CREATE TABLE IF NOT EXISTS provider_office.contracts (
    id UUID PRIMARY KEY,
    version INTEGER NOT NULL,
    provider_id UUID NOT NULL REFERENCES provider_office.providers (id),
    reporting_currency TEXT NOT NULL,
    commencement_date DATE NOT NULL,
    monthly_fee NUMERIC(20, 2) NOT NULL,
    revenue_share_bps INTEGER NOT NULL,
    payment_day INTEGER NOT NULL,
    period_start_day INTEGER NOT NULL,
    period_end_day INTEGER NOT NULL,
    initial_term_months INTEGER NOT NULL,
    termination_notice_months INTEGER NOT NULL,
    reporting_deadline_business_days INTEGER NOT NULL,
    top_up_deadline_days INTEGER NOT NULL,
    reporting_access_deadline_business_days INTEGER NOT NULL,
    reporting_access_retention_days INTEGER NOT NULL,
    covered_brand_codes TEXT[] NOT NULL,
    status TEXT NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    CONSTRAINT contracts_version_unique UNIQUE (provider_id, version),
    CONSTRAINT contracts_fee_nonnegative CHECK (monthly_fee >= 0),
    CONSTRAINT contracts_share_check CHECK (revenue_share_bps BETWEEN 0 AND 10000),
    CONSTRAINT contracts_status_check CHECK (status IN ('active', 'expired', 'revoked'))
);

CREATE TABLE IF NOT EXISTS provider_office.assignments (
    provider_id UUID NOT NULL REFERENCES provider_office.providers (id),
    contract_id UUID NOT NULL REFERENCES provider_office.contracts (id),
    brand_code TEXT NOT NULL,
    access TEXT NOT NULL,
    scopes TEXT[] NOT NULL,
    status TEXT NOT NULL,
    PRIMARY KEY (provider_id, brand_code, contract_id),
    CONSTRAINT assignments_access_check CHECK (access = 'read'),
    CONSTRAINT assignments_status_check CHECK (status IN ('active', 'revoked')),
    CONSTRAINT assignments_brand_check CHECK (brand_code ~ '^[0-9]{3}$')
);

CREATE TABLE IF NOT EXISTS provider_office.users (
    id UUID PRIMARY KEY,
    provider_id UUID NOT NULL REFERENCES provider_office.providers (id),
    status TEXT NOT NULL,
    mfa_enrolled BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT provider_users_status_check CHECK (status IN ('invited', 'active', 'disabled'))
);

CREATE TABLE IF NOT EXISTS provider_office.invitations (
    id UUID PRIMARY KEY,
    provider_id UUID NOT NULL REFERENCES provider_office.providers (id),
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS provider_office.sessions (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES provider_office.users (id),
    provider_id UUID NOT NULL,
    aal TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS provider_office.exchange_rates (
    id UUID PRIMARY KEY,
    pair TEXT NOT NULL,
    rate NUMERIC(20, 8) NOT NULL,
    source TEXT NOT NULL,
    effective_date DATE NOT NULL,
    status TEXT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT exchange_rates_source_check CHECK (source IN ('usdt-p2p')),
    CONSTRAINT exchange_rates_status_check CHECK (status IN ('unverified', 'verified'))
);

CREATE TABLE IF NOT EXISTS provider_office.snapshots (
    provider_id UUID NOT NULL,
    brand_code TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    rate NUMERIC(20, 8) NOT NULL,
    usd_ggr NUMERIC(20, 2) NOT NULL,
    total_monthly_fee NUMERIC(20, 2) NOT NULL,
    payload JSONB NOT NULL,
    closed_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    PRIMARY KEY (provider_id, brand_code, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS provider_office.invoices (
    id UUID PRIMARY KEY,
    provider_id UUID NOT NULL,
    brand_code TEXT NOT NULL,
    period_start DATE NOT NULL,
    currency TEXT NOT NULL,
    amount NUMERIC(20, 2) NOT NULL,
    status TEXT NOT NULL,
    issued_on DATE,
    CONSTRAINT invoices_status_check CHECK (status IN ('draft', 'issued', 'void'))
);

CREATE TABLE IF NOT EXISTS provider_office.audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    provider_id UUID,
    brand_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS provider_office.test_exclusions (
    player_user_id UUID PRIMARY KEY
);

INSERT INTO provider_office.providers (id, key, legal_entity, product, status)
VALUES
    ('10000000-0000-4000-8000-0000000000a1', 'oddspapi', '55 Tech Limited', 'sportsbook', 'active'),
    ('10000000-0000-4000-8000-0000000000a2', 'softaggregator', 'SoftAggregator', 'casino', 'inactive'),
    ('10000000-0000-4000-8000-0000000000a3', 'sports-statistics', 'Future statistics API', 'statistics', 'planned')
ON CONFLICT (id) DO NOTHING;

INSERT INTO provider_office.contracts (
    id, version, provider_id, reporting_currency, commencement_date, monthly_fee, revenue_share_bps,
    payment_day, period_start_day, period_end_day, initial_term_months, termination_notice_months,
    reporting_deadline_business_days, top_up_deadline_days, reporting_access_deadline_business_days,
    reporting_access_retention_days, covered_brand_codes, status, effective_from
)
VALUES (
    '10000000-0000-4000-8000-0000000000c1', 1, '10000000-0000-4000-8000-0000000000a1', 'USD',
    DATE '2026-11-23', 3000.00, 1000, 23, 23, 22, 12, 2, 5, 7, 5, 30,
    ARRAY['001']::TEXT[], 'active', DATE '2026-11-23'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO provider_office.assignments (provider_id, contract_id, brand_code, access, scopes, status)
VALUES (
    '10000000-0000-4000-8000-0000000000a1',
    '10000000-0000-4000-8000-0000000000c1',
    '001',
    'read',
    ARRAY['sportsbook_ggr']::TEXT[],
    'active'
)
ON CONFLICT DO NOTHING;

-- No player identity, wallet, deposit, or withdrawal columns.
CREATE OR REPLACE VIEW provider_office.settled_sports_facts
WITH (security_barrier = true) AS
SELECT
    b.id::text AS bet_id,
    b.stake::text AS stake,
    b.last_payout_amount::text AS payout,
    b.currency,
    b.status,
    b.settlement_state,
    b.mode,
    b.settled_at,
    ARRAY[]::text[] AS sports
FROM private.sports_bets AS b
WHERE b.status IN ('settled', 'cancelled')
  AND b.settlement_state IN ('winner', 'loser', 'refund', 'half_lost', 'half_won', 'cancelled')
  AND NOT EXISTS (
      SELECT 1
      FROM provider_office.test_exclusions AS excluded
      WHERE excluded.player_user_id = b.player_user_id
  );

ALTER TABLE provider_office.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_office.providers FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_office.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_office.contracts FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_office.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_office.assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_office.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_office.users FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_office.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_office.invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_office.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_office.sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_office.exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_office.exchange_rates FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_office.snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_office.snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_office.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_office.invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_office.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_office.audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_office.test_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_office.test_exclusions FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'provider_office_reader') THEN
        CREATE ROLE provider_office_reader NOLOGIN NOBYPASSRLS;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA provider_office TO provider_office_reader;
GRANT SELECT ON provider_office.settled_sports_facts TO provider_office_reader;
GRANT SELECT ON provider_office.providers, provider_office.contracts, provider_office.assignments TO provider_office_reader;

CREATE POLICY provider_office_reader_providers ON provider_office.providers
    FOR SELECT TO provider_office_reader
    USING (id::text = current_setting('app.provider_id', true));

CREATE POLICY provider_office_reader_contracts ON provider_office.contracts
    FOR SELECT TO provider_office_reader
    USING (provider_id::text = current_setting('app.provider_id', true));

CREATE POLICY provider_office_reader_assignments ON provider_office.assignments
    FOR SELECT TO provider_office_reader
    USING (
        provider_id::text = current_setting('app.provider_id', true)
        AND brand_code = current_setting('app.brand_code', true)
    );

REVOKE ALL ON SCHEMA provider_office FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA provider_office FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA provider_office TO provider_office_reader;
GRANT SELECT ON provider_office.settled_sports_facts TO provider_office_reader;
GRANT SELECT ON provider_office.providers, provider_office.contracts, provider_office.assignments TO provider_office_reader;

COMMIT;
