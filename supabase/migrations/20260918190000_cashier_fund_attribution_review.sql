BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 066
-- CASHIER FUND ATTRIBUTION + GAMEPLAY PROVENANCE
-- + PRE-WITHDRAWAL SECURITY REVIEW
--
-- Sequence: after 061 (betconstruct_wallet_core).
-- Repository-only. NOT applied by this change.
-- Enforcement DEFAULT OFF.
-- Does NOT rewrite private.apply_wallet_entry.
-- Does NOT mutate existing balances.
-- Does NOT activate staging cashiers.
-- ============================================================

-- REQUIRED ACCEPTANCE (enforcement ON, tests):
-- A deposits 2000, player loses 2000 (A=0).
-- B deposits 500, player stakes 500, settlement credits 10000.
-- Because the winning stake was 100% B:
--   A attribution = 0
--   B attribution = 10000
-- Clean withdrawal of 10000 through B (no cross-cashier review).


-- ============================================================
-- 1. FEATURE FLAG + CUTOVER STATE
-- ============================================================

CREATE TABLE IF NOT EXISTS private.fund_attribution_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1,
    enforcement_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT fund_attribution_settings_singleton CHECK (id = 1)
);

INSERT INTO private.fund_attribution_settings (id, enforcement_enabled)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;

REVOKE ALL ON TABLE private.fund_attribution_settings FROM PUBLIC;
REVOKE ALL ON TABLE private.fund_attribution_settings FROM anon, authenticated;
GRANT SELECT, UPDATE ON TABLE private.fund_attribution_settings TO service_role;


CREATE TABLE IF NOT EXISTS private.player_fund_attribution_state (
    wallet_id UUID NOT NULL
        REFERENCES private.wallet_accounts (wallet_id)
        ON DELETE RESTRICT,
    currency TEXT NOT NULL,
    state TEXT NOT NULL,
    cutover_wallet_entry_no BIGINT,
    initialized_at TIMESTAMPTZ,
    last_reconciled_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    PRIMARY KEY (wallet_id, currency),
    CONSTRAINT player_fund_attribution_state_check
        CHECK (state IN ('not_initialized', 'active', 'inconsistent'))
);

REVOKE ALL ON TABLE private.player_fund_attribution_state FROM PUBLIC;
REVOKE ALL ON TABLE private.player_fund_attribution_state FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE private.player_fund_attribution_state TO service_role;


-- ============================================================
-- 2. ATTRIBUTION PROJECTION + LEDGER + STAKE SNAPSHOTS
-- ============================================================

CREATE TABLE IF NOT EXISTS private.player_fund_attribution (
    wallet_id UUID NOT NULL
        REFERENCES private.wallet_accounts (wallet_id)
        ON DELETE RESTRICT,
    currency TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_cashier_id UUID
        REFERENCES public.cashiers (id)
        ON DELETE RESTRICT,
    available_minor NUMERIC(40, 0) NOT NULL DEFAULT 0,
    reserved_minor NUMERIC(40, 0) NOT NULL DEFAULT 0,
    version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT player_fund_attribution_kind_check
        CHECK (source_kind IN ('cashier', 'treasury', 'house', 'legacy', 'bonus')),
    CONSTRAINT player_fund_attribution_cashier_shape
        CHECK (
            (source_kind = 'cashier' AND source_cashier_id IS NOT NULL)
            OR (source_kind <> 'cashier' AND source_cashier_id IS NULL)
        ),
    CONSTRAINT player_fund_attribution_non_negative
        CHECK (available_minor >= 0 AND reserved_minor >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS player_fund_attribution_cashier_uidx
    ON private.player_fund_attribution (wallet_id, currency, source_kind, source_cashier_id)
    WHERE source_cashier_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS player_fund_attribution_noncashier_uidx
    ON private.player_fund_attribution (wallet_id, currency, source_kind)
    WHERE source_cashier_id IS NULL;

CREATE INDEX IF NOT EXISTS player_fund_attribution_wallet_idx
    ON private.player_fund_attribution (wallet_id, currency);

REVOKE ALL ON TABLE private.player_fund_attribution FROM PUBLIC;
REVOKE ALL ON TABLE private.player_fund_attribution FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE private.player_fund_attribution TO service_role;


CREATE TABLE IF NOT EXISTS private.player_fund_attribution_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL
        REFERENCES private.wallet_accounts (wallet_id)
        ON DELETE RESTRICT,
    currency TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_cashier_id UUID,
    available_delta_minor NUMERIC(40, 0) NOT NULL,
    reserved_delta_minor NUMERIC(40, 0) NOT NULL,
    entry_key TEXT NOT NULL,
    reference_type TEXT,
    reference_id TEXT,
    wallet_ledger_entry_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT player_fund_attribution_ledger_kind_check
        CHECK (source_kind IN ('cashier', 'treasury', 'house', 'legacy', 'bonus')),
    CONSTRAINT player_fund_attribution_ledger_key_check
        CHECK (char_length(BTRIM(entry_key)) BETWEEN 1 AND 250)
);

CREATE UNIQUE INDEX IF NOT EXISTS player_fund_attribution_ledger_key_uidx
    ON private.player_fund_attribution_ledger (entry_key);

CREATE INDEX IF NOT EXISTS player_fund_attribution_ledger_wallet_idx
    ON private.player_fund_attribution_ledger (wallet_id, created_at DESC);

REVOKE ALL ON TABLE private.player_fund_attribution_ledger FROM PUBLIC;
REVOKE ALL ON TABLE private.player_fund_attribution_ledger FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE private.player_fund_attribution_ledger TO service_role;
REVOKE UPDATE, DELETE ON TABLE private.player_fund_attribution_ledger FROM service_role;


CREATE TABLE IF NOT EXISTS private.player_stake_attribution (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL
        REFERENCES private.wallet_accounts (wallet_id)
        ON DELETE RESTRICT,
    currency TEXT NOT NULL,
    stake_scope TEXT NOT NULL,
    stake_ref TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_cashier_id UUID,
    stake_minor NUMERIC(40, 0) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT player_stake_attribution_kind_check
        CHECK (source_kind IN ('cashier', 'treasury', 'house', 'legacy', 'bonus')),
    CONSTRAINT player_stake_attribution_positive
        CHECK (stake_minor > 0),
    CONSTRAINT player_stake_attribution_scope_check
        CHECK (char_length(BTRIM(stake_scope)) BETWEEN 1 AND 64),
    CONSTRAINT player_stake_attribution_ref_check
        CHECK (char_length(BTRIM(stake_ref)) BETWEEN 1 AND 250)
);

CREATE UNIQUE INDEX IF NOT EXISTS player_stake_attribution_part_uidx
    ON private.player_stake_attribution (
        stake_scope,
        stake_ref,
        source_kind,
        COALESCE(source_cashier_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

CREATE INDEX IF NOT EXISTS player_stake_attribution_lookup_idx
    ON private.player_stake_attribution (stake_scope, stake_ref);

REVOKE ALL ON TABLE private.player_stake_attribution FROM PUBLIC;
REVOKE ALL ON TABLE private.player_stake_attribution FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE private.player_stake_attribution TO service_role;
REVOKE UPDATE, DELETE ON TABLE private.player_stake_attribution FROM service_role;


CREATE TABLE IF NOT EXISTS private.player_fund_hold_parts (
    hold_ref TEXT NOT NULL,
    wallet_id UUID NOT NULL,
    currency TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_cashier_id UUID,
    reserved_minor NUMERIC(40, 0) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT player_fund_hold_parts_positive CHECK (reserved_minor > 0),
    CONSTRAINT player_fund_hold_parts_kind_check
        CHECK (source_kind IN ('cashier', 'treasury', 'house', 'legacy', 'bonus'))
);

CREATE UNIQUE INDEX IF NOT EXISTS player_fund_hold_parts_uidx
    ON private.player_fund_hold_parts (
        hold_ref,
        source_kind,
        COALESCE(source_cashier_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

REVOKE ALL ON TABLE private.player_fund_hold_parts FROM PUBLIC;
REVOKE ALL ON TABLE private.player_fund_hold_parts FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE private.player_fund_hold_parts TO service_role;


-- ============================================================
-- 3. PAYOUT DESTINATIONS (server-authoritative)
-- ============================================================

CREATE TABLE IF NOT EXISTS private.cashier_payout_destinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_token TEXT NOT NULL,
    legacy_cashier_id UUID NOT NULL
        REFERENCES public.cashiers (id)
        ON DELETE RESTRICT,
    city TEXT NOT NULL,
    label TEXT NOT NULL,
    is_selectable BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT cashier_payout_destinations_token_check
        CHECK (char_length(BTRIM(public_token)) BETWEEN 8 AND 64),
    CONSTRAINT cashier_payout_destinations_city_check
        CHECK (char_length(BTRIM(city)) BETWEEN 1 AND 80),
    CONSTRAINT cashier_payout_destinations_label_check
        CHECK (char_length(BTRIM(label)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS cashier_payout_destinations_token_uidx
    ON private.cashier_payout_destinations (public_token);

CREATE INDEX IF NOT EXISTS cashier_payout_destinations_cashier_idx
    ON private.cashier_payout_destinations (legacy_cashier_id);

REVOKE ALL ON TABLE private.cashier_payout_destinations FROM PUBLIC;
REVOKE ALL ON TABLE private.cashier_payout_destinations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE private.cashier_payout_destinations TO service_role;


-- ============================================================
-- 4. WITHDRAWAL REVIEW
-- ============================================================

CREATE TABLE IF NOT EXISTS private.withdrawal_attribution_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    withdrawal_id UUID NOT NULL
        REFERENCES private.player_withdrawal_requests (id)
        ON DELETE RESTRICT,
    cash_payout_id UUID
        REFERENCES private.cashier_player_payout_requests (id)
        ON DELETE RESTRICT,
    payout_destination_id UUID
        REFERENCES private.cashier_payout_destinations (id)
        ON DELETE RESTRICT,
    selected_legacy_cashier_id UUID NOT NULL
        REFERENCES public.cashiers (id)
        ON DELETE RESTRICT,
    currency TEXT NOT NULL,
    requested_amount NUMERIC(20, 8) NOT NULL,
    selected_cashier_amount NUMERIC(20, 8) NOT NULL,
    cross_cashier_amount NUMERIC(20, 8) NOT NULL,
    review_status TEXT NOT NULL,
    signal_details JSONB NOT NULL DEFAULT '{}'::jsonb,
    attribution_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    started_at TIMESTAMPTZ,
    decided_at TIMESTAMPTZ,
    decided_by UUID,
    decided_role TEXT,
    decision_reason TEXT,
    version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT withdrawal_attribution_reviews_status_check
        CHECK (review_status IN ('required', 'under_review', 'approved', 'rejected')),
    CONSTRAINT withdrawal_attribution_reviews_role_check
        CHECK (decided_role IS NULL OR decided_role IN ('security', 'owner'))
);

CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_attribution_reviews_wd_uidx
    ON private.withdrawal_attribution_reviews (withdrawal_id);

CREATE INDEX IF NOT EXISTS withdrawal_attribution_reviews_status_idx
    ON private.withdrawal_attribution_reviews (review_status, created_at DESC);

REVOKE ALL ON TABLE private.withdrawal_attribution_reviews FROM PUBLIC;
REVOKE ALL ON TABLE private.withdrawal_attribution_reviews FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE private.withdrawal_attribution_reviews TO service_role;


CREATE TABLE IF NOT EXISTS private.withdrawal_attribution_review_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL
        REFERENCES private.withdrawal_attribution_reviews (id)
        ON DELETE RESTRICT,
    withdrawal_id UUID NOT NULL,
    actor_role TEXT NOT NULL,
    actor_user_id UUID,
    previous_status TEXT,
    new_status TEXT NOT NULL,
    decision TEXT,
    internal_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT withdrawal_attribution_review_audit_role_check
        CHECK (actor_role IN ('system', 'security', 'owner'))
);

CREATE INDEX IF NOT EXISTS withdrawal_attribution_review_audit_review_idx
    ON private.withdrawal_attribution_review_audit (review_id, created_at);

REVOKE ALL ON TABLE private.withdrawal_attribution_review_audit FROM PUBLIC;
REVOKE ALL ON TABLE private.withdrawal_attribution_review_audit FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE private.withdrawal_attribution_review_audit TO service_role;
REVOKE UPDATE, DELETE ON TABLE private.withdrawal_attribution_review_audit FROM service_role;


ALTER TABLE private.player_withdrawal_requests
    ADD COLUMN IF NOT EXISTS payout_destination_id UUID
        REFERENCES private.cashier_payout_destinations (id)
        ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS selected_legacy_cashier_id UUID
        REFERENCES public.cashiers (id)
        ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS player_notice_code TEXT;

ALTER TABLE private.cashier_player_payout_requests
    ALTER COLUMN secret_code DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS selected_legacy_cashier_id UUID
        REFERENCES public.cashiers (id)
        ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS payout_destination_id UUID
        REFERENCES private.cashier_payout_destinations (id)
        ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS code_issued_at TIMESTAMPTZ;

DROP INDEX IF EXISTS private.cashier_player_payout_code_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS cashier_player_payout_secret_code_live_uidx
    ON private.cashier_player_payout_requests (secret_code)
    WHERE secret_code IS NOT NULL;


-- ============================================================
-- 5. HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION private.fund_attribution_enforcement_enabled()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $fn$
    SELECT COALESCE(
        (SELECT s.enforcement_enabled FROM private.fund_attribution_settings AS s WHERE s.id = 1),
        FALSE
    );
$fn$;

REVOKE ALL ON FUNCTION private.fund_attribution_enforcement_enabled() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.fund_attribution_enforcement_enabled() TO service_role;

-- Exact player-facing rejection copy. Hex keeps the file encoding-safe.
CREATE OR REPLACE FUNCTION private.player_cashier_proportion_reject_notice()
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
    SELECT convert_from(decode(
        'd092d18bd0b2d0bed0b420d0bed182d0bad0bbd0bed0bdd191d0bd2e20d0a1d183d0bcd0bcd0b020d0b2d18bd0b2d0bed0b4d0b020d0b4d0bed0bbd0b6d0bdd0b020d0b1d18bd182d18c20d0bfd180d0bed0bfd0bed180d186d0b8d0bed0bdd0b0d0bbd18cd0bdd0b020d181d183d0bcd0bcd0b520d0bfd0bed0bfd0bed0bbd0bdd0b5d0bdd0b8d0b920d187d0b5d180d0b5d0b720d0b2d18bd0b1d180d0b0d0bdd0bdd183d18e20d0bad0b0d181d181d1832e20d094d0bbd18f20d0b4d0bed0bfd0bed0bbd0bdd0b8d182d0b5d0bbd18cd0bdd0bed0b920d0b8d0bdd184d0bed180d0bcd0b0d186d0b8d0b820d0bed0b1d180d0b0d182d0b8d182d0b5d181d18c20d0b220d0bfd0bed0b4d0b4d0b5d180d0b6d0bad1832e',
        'hex'
    ), 'UTF8');
$fn$;
REVOKE ALL ON FUNCTION private.player_cashier_proportion_reject_notice() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.player_cashier_proportion_reject_notice() TO service_role;


CREATE OR REPLACE FUNCTION private.set_fund_attribution_enforcement(p_enabled BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
BEGIN
    UPDATE private.fund_attribution_settings
    SET enforcement_enabled = COALESCE(p_enabled, FALSE),
        updated_at = pg_catalog.now()
    WHERE id = 1;
    RETURN private.fund_attribution_enforcement_enabled();
END;
$fn$;

REVOKE ALL ON FUNCTION private.set_fund_attribution_enforcement(BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.set_fund_attribution_enforcement(BOOLEAN) TO service_role;


CREATE OR REPLACE FUNCTION private.currency_amount_to_minor(p_display TEXT, p_amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_code TEXT;
    v_scale INTEGER;
    v_factor NUMERIC;
    v_minor NUMERIC(40, 0);
BEGIN
    v_code := private.require_supported_display_currency(p_display);
    PERFORM private.require_currency_amount_scale(v_code, p_amount);
    SELECT c.display_scale INTO v_scale
    FROM private.supported_currencies AS c
    WHERE c.code = v_code;
    v_scale := COALESCE(v_scale, 2);
    v_factor := 10::NUMERIC ^ v_scale;
    v_minor := trunc(p_amount * v_factor);
    IF v_minor IS DISTINCT FROM (p_amount * v_factor) THEN
        RAISE EXCEPTION 'CURRENCY_AMOUNT_SCALE_INVALID';
    END IF;
    RETURN v_minor;
END;
$fn$;

REVOKE ALL ON FUNCTION private.currency_amount_to_minor(TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.currency_amount_to_minor(TEXT, NUMERIC) TO service_role;


CREATE OR REPLACE FUNCTION private.currency_minor_to_amount(p_display TEXT, p_minor NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_code TEXT;
    v_scale INTEGER;
    v_factor NUMERIC;
BEGIN
    v_code := private.require_supported_display_currency(p_display);
    SELECT c.display_scale INTO v_scale
    FROM private.supported_currencies AS c
    WHERE c.code = v_code;
    v_scale := COALESCE(v_scale, 2);
    v_factor := 10::NUMERIC ^ v_scale;
    IF p_minor IS NULL OR trunc(p_minor) IS DISTINCT FROM p_minor THEN
        RAISE EXCEPTION 'CURRENCY_AMOUNT_SCALE_INVALID';
    END IF;
    RETURN trunc(COALESCE(p_minor, 0)) / v_factor;
END;
$fn$;

REVOKE ALL ON FUNCTION private.currency_minor_to_amount(TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.currency_minor_to_amount(TEXT, NUMERIC) TO service_role;


CREATE OR REPLACE FUNCTION private.attribution_bucket_key(p_kind TEXT, p_cashier UUID)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
    SELECT p_kind || ':' || COALESCE(p_cashier::TEXT, 'none');
$fn$;

REVOKE ALL ON FUNCTION private.attribution_bucket_key(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.attribution_bucket_key(TEXT, UUID) TO service_role;


CREATE OR REPLACE FUNCTION private.apply_fund_attribution_delta(
    p_wallet_id UUID,
    p_currency TEXT,
    p_source_kind TEXT,
    p_source_cashier_id UUID,
    p_available_delta NUMERIC,
    p_reserved_delta NUMERIC,
    p_entry_key TEXT,
    p_reference_type TEXT,
    p_reference_id TEXT,
    p_wallet_ledger_entry_key TEXT,
    p_metadata JSONB
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_existing TEXT;
    v_avail NUMERIC(40, 0);
    v_res NUMERIC(40, 0);
BEGIN
    IF p_available_delta = 0 AND p_reserved_delta = 0 THEN
        RETURN;
    END IF;

    SELECT l.entry_key
    INTO v_existing
    FROM private.player_fund_attribution_ledger AS l
    WHERE l.entry_key = p_entry_key;

    IF FOUND THEN
        -- Replay is valid only when the immutable accounting identity matches.
        -- Metadata is informational and is not part of this bind.
        -- Do not update or overwrite the original ledger row.
        IF EXISTS (
            SELECT 1
            FROM private.player_fund_attribution_ledger AS l
            WHERE l.entry_key = p_entry_key
              AND l.wallet_id IS NOT DISTINCT FROM p_wallet_id
              AND l.currency IS NOT DISTINCT FROM p_currency
              AND l.source_kind IS NOT DISTINCT FROM p_source_kind
              AND l.source_cashier_id IS NOT DISTINCT FROM p_source_cashier_id
              AND l.available_delta_minor IS NOT DISTINCT FROM p_available_delta
              AND l.reserved_delta_minor IS NOT DISTINCT FROM p_reserved_delta
              AND l.reference_type IS NOT DISTINCT FROM p_reference_type
              AND l.reference_id IS NOT DISTINCT FROM p_reference_id
              AND l.wallet_ledger_entry_key IS NOT DISTINCT FROM p_wallet_ledger_entry_key
        ) THEN
            RETURN;
        END IF;
        RAISE EXCEPTION 'ATTRIBUTION_IDEMPOTENCY_CONFLICT';
    END IF;

    INSERT INTO private.player_fund_attribution (
        wallet_id, currency, source_kind, source_cashier_id,
        available_minor, reserved_minor
    )
    VALUES (
        p_wallet_id, p_currency, p_source_kind, p_source_cashier_id,
        0, 0
    )
    ON CONFLICT DO NOTHING;

    SELECT a.available_minor, a.reserved_minor
    INTO v_avail, v_res
    FROM private.player_fund_attribution AS a
    WHERE a.wallet_id = p_wallet_id
      AND a.currency = p_currency
      AND a.source_kind = p_source_kind
      AND a.source_cashier_id IS NOT DISTINCT FROM p_source_cashier_id
    FOR UPDATE;

    v_avail := COALESCE(v_avail, 0) + p_available_delta;
    v_res := COALESCE(v_res, 0) + p_reserved_delta;
    IF v_avail < 0 OR v_res < 0 THEN
        RAISE EXCEPTION 'ATTRIBUTION_BUCKET_UNDERFLOW';
    END IF;

    UPDATE private.player_fund_attribution
    SET available_minor = v_avail,
        reserved_minor = v_res,
        version = version + 1,
        updated_at = pg_catalog.now()
    WHERE wallet_id = p_wallet_id
      AND currency = p_currency
      AND source_kind = p_source_kind
      AND source_cashier_id IS NOT DISTINCT FROM p_source_cashier_id;

    INSERT INTO private.player_fund_attribution_ledger (
        wallet_id, currency, source_kind, source_cashier_id,
        available_delta_minor, reserved_delta_minor, entry_key,
        reference_type, reference_id, wallet_ledger_entry_key, metadata
    )
    VALUES (
        p_wallet_id, p_currency, p_source_kind, p_source_cashier_id,
        p_available_delta, p_reserved_delta, p_entry_key,
        p_reference_type, p_reference_id, p_wallet_ledger_entry_key,
        COALESCE(p_metadata, '{}'::jsonb)
            - 'Hash' - 'hash' - 'AuthToken' - 'token' - 'password'
    );
END;
$fn$;

REVOKE ALL ON FUNCTION private.apply_fund_attribution_delta(UUID, TEXT, TEXT, UUID, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.apply_fund_attribution_delta(UUID, TEXT, TEXT, UUID, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;


CREATE OR REPLACE FUNCTION private.mark_fund_attribution_inconsistent(p_wallet_id UUID, p_currency TEXT)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
BEGIN
    INSERT INTO private.player_fund_attribution_state (wallet_id, currency, state, updated_at)
    VALUES (p_wallet_id, p_currency, 'inconsistent', pg_catalog.now())
    ON CONFLICT (wallet_id, currency) DO UPDATE
    SET state = 'inconsistent',
        version = private.player_fund_attribution_state.version + 1,
        updated_at = pg_catalog.now();
END;
$fn$;

REVOKE ALL ON FUNCTION private.mark_fund_attribution_inconsistent(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.mark_fund_attribution_inconsistent(UUID, TEXT) TO service_role;


CREATE OR REPLACE FUNCTION private.assert_attribution_matches_wallet(p_wallet_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_currency TEXT;
    v_available NUMERIC;
    v_locked NUMERIC;
    v_display TEXT;
    v_sum_avail NUMERIC(40, 0);
    v_sum_res NUMERIC(40, 0);
    v_need_avail NUMERIC(40, 0);
    v_need_res NUMERIC(40, 0);
    v_state TEXT;
BEGIN
    SELECT a.currency, a.available_balance, a.locked_balance
    INTO v_currency, v_available, v_locked
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = p_wallet_id
    FOR UPDATE;

    IF v_currency IS NULL THEN
        RAISE EXCEPTION 'PLAYER_WALLET_NOT_FOUND';
    END IF;
    v_display := COALESCE(private.wallet_display_currency(v_currency), 'TMT');

    SELECT s.state INTO v_state
    FROM private.player_fund_attribution_state AS s
    WHERE s.wallet_id = p_wallet_id
      AND s.currency = v_currency;

    IF v_state IS NULL OR v_state = 'not_initialized' THEN
        RETURN 'not_initialized';
    END IF;

    SELECT COALESCE(SUM(b.available_minor), 0), COALESCE(SUM(b.reserved_minor), 0)
    INTO v_sum_avail, v_sum_res
    FROM private.player_fund_attribution AS b
    WHERE b.wallet_id = p_wallet_id
      AND b.currency = v_currency;

    v_need_avail := private.currency_amount_to_minor(v_display, v_available);
    v_need_res := private.currency_amount_to_minor(v_display, v_locked);

    IF v_sum_avail IS DISTINCT FROM v_need_avail OR v_sum_res IS DISTINCT FROM v_need_res THEN
        PERFORM private.mark_fund_attribution_inconsistent(p_wallet_id, v_currency);
        RETURN 'inconsistent';
    END IF;

    UPDATE private.player_fund_attribution_state
    SET last_reconciled_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE wallet_id = p_wallet_id
      AND currency = v_currency
      AND state = 'active';

    RETURN COALESCE(v_state, 'active');
END;
$fn$;

REVOKE ALL ON FUNCTION private.assert_attribution_matches_wallet(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.assert_attribution_matches_wallet(UUID) TO service_role;


CREATE OR REPLACE FUNCTION private.ensure_fund_attribution_initialized(
    p_wallet_id UUID,
    p_pre_available NUMERIC,
    p_pre_locked NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_currency TEXT;
    v_display TEXT;
    v_state TEXT;
    v_avail NUMERIC(40, 0);
    v_locked NUMERIC(40, 0);
    v_entry BIGINT;
BEGIN
    SELECT a.currency
    INTO v_currency
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = p_wallet_id
    FOR UPDATE;
    IF v_currency IS NULL THEN
        RAISE EXCEPTION 'PLAYER_WALLET_NOT_FOUND';
    END IF;
    v_display := COALESCE(private.wallet_display_currency(v_currency), 'TMT');

    INSERT INTO private.player_fund_attribution_state (wallet_id, currency, state)
    VALUES (p_wallet_id, v_currency, 'not_initialized')
    ON CONFLICT (wallet_id, currency) DO NOTHING;

    SELECT s.state INTO v_state
    FROM private.player_fund_attribution_state AS s
    WHERE s.wallet_id = p_wallet_id
      AND s.currency = v_currency
    FOR UPDATE;

    IF v_state IS DISTINCT FROM 'not_initialized' THEN
        RETURN;
    END IF;

    v_avail := private.currency_amount_to_minor(v_display, GREATEST(COALESCE(p_pre_available, 0), 0));
    v_locked := private.currency_amount_to_minor(v_display, GREATEST(COALESCE(p_pre_locked, 0), 0));

    SELECT COALESCE(MAX(l.entry_no), 0)
    INTO v_entry
    FROM private.wallet_ledger AS l
    WHERE l.wallet_id = p_wallet_id;

    IF v_avail > 0 THEN
        PERFORM private.apply_fund_attribution_delta(
            p_wallet_id, v_currency, 'legacy', NULL,
            v_avail, 0,
            'attr-cutover-avail:' || p_wallet_id::TEXT || ':' || v_currency,
            'cutover', p_wallet_id::TEXT, NULL,
            jsonb_build_object('phase', 'legacy_available')
        );
    END IF;
    IF v_locked > 0 THEN
        PERFORM private.apply_fund_attribution_delta(
            p_wallet_id, v_currency, 'legacy', NULL,
            0, v_locked,
            'attr-cutover-locked:' || p_wallet_id::TEXT || ':' || v_currency,
            'cutover', p_wallet_id::TEXT, NULL,
            jsonb_build_object('phase', 'legacy_reserved')
        );
    END IF;

    UPDATE private.player_fund_attribution_state
    SET state = 'active',
        cutover_wallet_entry_no = v_entry,
        initialized_at = pg_catalog.now(),
        version = version + 1,
        updated_at = pg_catalog.now()
    WHERE wallet_id = p_wallet_id
      AND currency = v_currency;
END;
$fn$;

REVOKE ALL ON FUNCTION private.ensure_fund_attribution_initialized(UUID, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.ensure_fund_attribution_initialized(UUID, NUMERIC, NUMERIC) TO service_role;


CREATE OR REPLACE FUNCTION private.attribution_part_cashier_id(p_item JSONB)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
    SELECT CASE jsonb_typeof(p_item -> 'source_cashier_id')
        WHEN 'string' THEN NULLIF(p_item ->> 'source_cashier_id', '')::UUID
        ELSE NULL
    END;
$fn$;

REVOKE ALL ON FUNCTION private.attribution_part_cashier_id(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.attribution_part_cashier_id(JSONB) TO service_role;


CREATE OR REPLACE FUNCTION private.attribution_allocate_largest_remainder(
    p_parts JSONB,
    p_amount_minor NUMERIC
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $fn$
    -- Deterministic largest-remainder (Hamilton) in exact integer NUMERIC minor units.
    -- Intermediates stay NUMERIC so amount × weight cannot overflow BIGINT.
    -- Same input always yields the same attribution output. No floating point.
    WITH src AS (
        SELECT
            t.value ->> 'source_kind' AS source_kind,
            private.attribution_part_cashier_id(t.value) AS source_cashier_id,
            trunc(COALESCE((t.value ->> 'weight_minor')::NUMERIC, 0)) AS weight_minor
        FROM jsonb_array_elements(COALESCE(p_parts, '[]'::jsonb)) AS t(value)
    ),
    tot AS (
        SELECT COALESCE(SUM(weight_minor), 0) AS total_weight
        FROM src
    ),
    floors AS (
        SELECT
            s.source_kind,
            s.source_cashier_id,
            s.weight_minor,
            CASE
                WHEN t.total_weight <= 0 OR COALESCE(p_amount_minor, 0) <= 0 THEN 0::NUMERIC
                ELSE trunc((trunc(p_amount_minor) * s.weight_minor) / t.total_weight)
            END AS floor_minor,
            CASE
                WHEN t.total_weight <= 0 OR COALESCE(p_amount_minor, 0) <= 0 THEN 0::NUMERIC
                ELSE (trunc(p_amount_minor) * s.weight_minor)
                     - trunc((trunc(p_amount_minor) * s.weight_minor) / t.total_weight) * t.total_weight
            END AS remainder_minor
        FROM src AS s
        CROSS JOIN tot AS t
    ),
    leftover AS (
        SELECT trunc(COALESCE(p_amount_minor, 0)) - COALESCE(SUM(floor_minor), 0) AS extra
        FROM floors
    ),
    ranked AS (
        SELECT
            f.*,
            ROW_NUMBER() OVER (
                ORDER BY f.remainder_minor DESC, f.source_kind, COALESCE(f.source_cashier_id::TEXT, '')
            ) AS rn
        FROM floors AS f
    ),
    allocated AS (
        SELECT
            r.source_kind,
            r.source_cashier_id,
            r.floor_minor + CASE WHEN r.rn <= l.extra THEN 1 ELSE 0 END AS allocated_minor
        FROM ranked AS r
        CROSS JOIN leftover AS l
    )
    SELECT COALESCE(
        jsonb_agg(jsonb_build_object(
            'source_kind', a.source_kind,
            'source_cashier_id', to_jsonb(a.source_cashier_id),
            'allocated_minor', a.allocated_minor
        ) ORDER BY a.source_kind, COALESCE(a.source_cashier_id::TEXT, '')),
        '[]'::jsonb
    )
    FROM allocated AS a
    WHERE a.allocated_minor > 0;
$fn$;

REVOKE ALL ON FUNCTION private.attribution_allocate_largest_remainder(JSONB, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.attribution_allocate_largest_remainder(JSONB, NUMERIC) TO service_role;


CREATE OR REPLACE FUNCTION private.current_attribution_weights(
    p_wallet_id UUID,
    p_currency TEXT,
    p_exclude_cashier UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_parts JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'source_kind', b.source_kind,
        'source_cashier_id', to_jsonb(b.source_cashier_id),
        'weight_minor', b.available_minor
    ) ORDER BY b.source_kind, COALESCE(b.source_cashier_id::TEXT, '')), '[]'::jsonb)
    INTO v_parts
    FROM private.player_fund_attribution AS b
    WHERE b.wallet_id = p_wallet_id
      AND b.currency = p_currency
      AND b.available_minor > 0
      AND (
          p_exclude_cashier IS NULL
          OR NOT (b.source_kind = 'cashier' AND b.source_cashier_id IS NOT DISTINCT FROM p_exclude_cashier)
      );
    RETURN COALESCE(v_parts, '[]'::jsonb);
END;
$fn$;

REVOKE ALL ON FUNCTION private.current_attribution_weights(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.current_attribution_weights(UUID, TEXT, UUID) TO service_role;


CREATE OR REPLACE FUNCTION private.attribution_consume_available(
    p_wallet_id UUID,
    p_currency TEXT,
    p_amount_minor NUMERIC,
    p_entry_prefix TEXT,
    p_reference_type TEXT,
    p_reference_id TEXT,
    p_wallet_ledger_entry_key TEXT,
    p_snapshot BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_weights JSONB;
    v_alloc JSONB;
    v_item JSONB;
    v_kind TEXT;
    v_cashier UUID;
    v_amt NUMERIC(40, 0);
    v_parts JSONB := '[]'::jsonb;
BEGIN
    IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
        RETURN '[]'::jsonb;
    END IF;
    v_weights := private.current_attribution_weights(p_wallet_id, p_currency, NULL);
    BEGIN
        v_alloc := private.attribution_allocate_largest_remainder(v_weights, p_amount_minor);
    EXCEPTION
        WHEN OTHERS THEN
            PERFORM private.mark_fund_attribution_inconsistent(p_wallet_id, p_currency);
            RAISE;
    END;

    FOR v_item IN SELECT value FROM jsonb_array_elements(v_alloc)
    LOOP
        v_kind := v_item->>'source_kind';
        v_cashier := private.attribution_part_cashier_id(v_item);
        v_amt := trunc((v_item->>'allocated_minor')::NUMERIC);
        PERFORM private.apply_fund_attribution_delta(
            p_wallet_id, p_currency, v_kind, v_cashier,
            -v_amt, 0,
            p_entry_prefix || ':' || private.attribution_bucket_key(v_kind, v_cashier),
            p_reference_type, p_reference_id, p_wallet_ledger_entry_key,
            jsonb_build_object('phase', 'consume')
        );
        IF p_snapshot AND v_amt > 0 THEN
            INSERT INTO private.player_stake_attribution (
                wallet_id, currency, stake_scope, stake_ref,
                source_kind, source_cashier_id, stake_minor
            )
            VALUES (
                p_wallet_id, p_currency, p_reference_type, p_reference_id,
                v_kind, v_cashier, v_amt
            )
            ON CONFLICT DO NOTHING;
        END IF;
        v_parts := v_parts || jsonb_build_array(jsonb_build_object(
            'source_kind', v_kind,
            'source_cashier_id', to_jsonb(v_cashier),
            'allocated_minor', v_amt
        ));
    END LOOP;
    RETURN v_parts;
END;
$fn$;

REVOKE ALL ON FUNCTION private.attribution_consume_available(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.attribution_consume_available(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO service_role;


CREATE OR REPLACE FUNCTION private.attribution_credit_from_snapshot(
    p_wallet_id UUID,
    p_currency TEXT,
    p_amount_minor NUMERIC,
    p_stake_scope TEXT,
    p_stake_ref TEXT,
    p_entry_prefix TEXT,
    p_wallet_ledger_entry_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_weights JSONB;
    v_alloc JSONB;
    v_item JSONB;
    v_kind TEXT;
    v_cashier UUID;
    v_amt NUMERIC(40, 0);
BEGIN
    IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
        RETURN;
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'source_kind', s.source_kind,
        'source_cashier_id', to_jsonb(s.source_cashier_id),
        'weight_minor', s.stake_minor
    ) ORDER BY s.source_kind, COALESCE(s.source_cashier_id::TEXT, '')), '[]'::jsonb)
    INTO v_weights
    FROM private.player_stake_attribution AS s
    WHERE s.stake_scope = p_stake_scope
      AND s.stake_ref = p_stake_ref;

    IF v_weights = '[]'::jsonb THEN
        PERFORM private.apply_fund_attribution_delta(
            p_wallet_id, p_currency, 'house', NULL,
            p_amount_minor, 0,
            p_entry_prefix || ':house',
            p_stake_scope, p_stake_ref, p_wallet_ledger_entry_key,
            jsonb_build_object('phase', 'uncorrelated_credit')
        );
        PERFORM private.mark_fund_attribution_inconsistent(p_wallet_id, p_currency);
        RETURN;
    END IF;

    v_alloc := private.attribution_allocate_largest_remainder(v_weights, p_amount_minor);
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_alloc)
    LOOP
        v_kind := v_item->>'source_kind';
        v_cashier := private.attribution_part_cashier_id(v_item);
        v_amt := trunc((v_item->>'allocated_minor')::NUMERIC);
        PERFORM private.apply_fund_attribution_delta(
            p_wallet_id, p_currency, v_kind, v_cashier,
            v_amt, 0,
            p_entry_prefix || ':' || private.attribution_bucket_key(v_kind, v_cashier),
            p_stake_scope, p_stake_ref, p_wallet_ledger_entry_key,
            jsonb_build_object('phase', 'credit_from_snapshot')
        );
    END LOOP;
END;
$fn$;

REVOKE ALL ON FUNCTION private.attribution_credit_from_snapshot(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.attribution_credit_from_snapshot(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO service_role;


CREATE OR REPLACE FUNCTION private.attribution_consume_from_snapshot(
    p_wallet_id UUID,
    p_currency TEXT,
    p_amount_minor NUMERIC,
    p_stake_scope TEXT,
    p_stake_ref TEXT,
    p_entry_prefix TEXT,
    p_wallet_ledger_entry_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_weights JSONB;
    v_alloc JSONB;
    v_item JSONB;
    v_kind TEXT;
    v_cashier UUID;
    v_amt NUMERIC(40, 0);
BEGIN
    IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
        RETURN;
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'source_kind', s.source_kind,
        'source_cashier_id', to_jsonb(s.source_cashier_id),
        'weight_minor', s.stake_minor
    ) ORDER BY s.source_kind, COALESCE(s.source_cashier_id::TEXT, '')), '[]'::jsonb)
    INTO v_weights
    FROM private.player_stake_attribution AS s
    WHERE s.stake_scope = p_stake_scope
      AND s.stake_ref = p_stake_ref;

    IF v_weights = '[]'::jsonb THEN
        PERFORM private.attribution_consume_available(
            p_wallet_id, p_currency, p_amount_minor,
            p_entry_prefix, p_stake_scope, p_stake_ref, p_wallet_ledger_entry_key, FALSE
        );
        PERFORM private.mark_fund_attribution_inconsistent(p_wallet_id, p_currency);
        RETURN;
    END IF;

    v_alloc := private.attribution_allocate_largest_remainder(v_weights, p_amount_minor);
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_alloc)
    LOOP
        v_kind := v_item->>'source_kind';
        v_cashier := private.attribution_part_cashier_id(v_item);
        v_amt := trunc((v_item->>'allocated_minor')::NUMERIC);
        PERFORM private.apply_fund_attribution_delta(
            p_wallet_id, p_currency, v_kind, v_cashier,
            -v_amt, 0,
            p_entry_prefix || ':' || private.attribution_bucket_key(v_kind, v_cashier),
            p_stake_scope, p_stake_ref, p_wallet_ledger_entry_key,
            jsonb_build_object('phase', 'consume_from_snapshot')
        );
    END LOOP;
END;
$fn$;

REVOKE ALL ON FUNCTION private.attribution_consume_from_snapshot(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.attribution_consume_from_snapshot(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO service_role;


CREATE OR REPLACE FUNCTION private.attribution_reserve_withdrawal(
    p_wallet_id UUID,
    p_currency TEXT,
    p_amount_minor NUMERIC,
    p_selected_cashier UUID,
    p_hold_ref TEXT,
    p_entry_prefix TEXT,
    p_wallet_ledger_entry_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_selected NUMERIC(40, 0) := 0;
    v_take NUMERIC(40, 0);
    v_rest NUMERIC(40, 0);
    v_weights JSONB;
    v_alloc JSONB;
    v_item JSONB;
    v_kind TEXT;
    v_cashier UUID;
    v_amt NUMERIC(40, 0);
    v_parts JSONB := '[]'::jsonb;
BEGIN
    IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
        RETURN jsonb_build_object('selected_minor', 0, 'parts', '[]'::jsonb);
    END IF;

    IF p_selected_cashier IS NOT NULL THEN
        SELECT b.available_minor
        INTO v_selected
        FROM private.player_fund_attribution AS b
        WHERE b.wallet_id = p_wallet_id
          AND b.currency = p_currency
          AND b.source_kind = 'cashier'
          AND b.source_cashier_id = p_selected_cashier
        FOR UPDATE;
        v_selected := COALESCE(v_selected, 0);
        v_take := LEAST(v_selected, p_amount_minor);
        IF v_take > 0 THEN
            PERFORM private.apply_fund_attribution_delta(
                p_wallet_id, p_currency, 'cashier', p_selected_cashier,
                -v_take, v_take,
                p_entry_prefix || ':selected',
                'withdrawal_hold', p_hold_ref, p_wallet_ledger_entry_key,
                jsonb_build_object('phase', 'reserve_selected')
            );
            INSERT INTO private.player_fund_hold_parts (
                hold_ref, wallet_id, currency, source_kind, source_cashier_id, reserved_minor
            ) VALUES (
                p_hold_ref, p_wallet_id, p_currency, 'cashier', p_selected_cashier, v_take
            );
            v_parts := v_parts || jsonb_build_array(jsonb_build_object(
                'source_kind', 'cashier',
                'source_cashier_id', to_jsonb(p_selected_cashier),
                'reserved_minor', v_take
            ));
        END IF;
        v_rest := p_amount_minor - v_take;
    ELSE
        v_rest := p_amount_minor;
    END IF;

    IF v_rest > 0 THEN
        v_weights := private.current_attribution_weights(p_wallet_id, p_currency, p_selected_cashier);
        v_alloc := private.attribution_allocate_largest_remainder(v_weights, v_rest);
        FOR v_item IN SELECT value FROM jsonb_array_elements(v_alloc)
        LOOP
            v_kind := v_item->>'source_kind';
            v_cashier := private.attribution_part_cashier_id(v_item);
            v_amt := trunc((v_item->>'allocated_minor')::NUMERIC);
            PERFORM private.apply_fund_attribution_delta(
                p_wallet_id, p_currency, v_kind, v_cashier,
                -v_amt, v_amt,
                p_entry_prefix || ':' || private.attribution_bucket_key(v_kind, v_cashier),
                'withdrawal_hold', p_hold_ref, p_wallet_ledger_entry_key,
                jsonb_build_object('phase', 'reserve_other')
            );
            INSERT INTO private.player_fund_hold_parts (
                hold_ref, wallet_id, currency, source_kind, source_cashier_id, reserved_minor
            ) VALUES (
                p_hold_ref, p_wallet_id, p_currency, v_kind, v_cashier, v_amt
            );
            v_parts := v_parts || jsonb_build_array(jsonb_build_object(
                'source_kind', v_kind,
                'source_cashier_id', to_jsonb(v_cashier),
                'reserved_minor', v_amt
            ));
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'selected_minor', COALESCE(v_take, 0),
        'cross_minor', COALESCE(v_rest, 0),
        'parts', v_parts
    );
END;
$fn$;

REVOKE ALL ON FUNCTION private.attribution_reserve_withdrawal(UUID, TEXT, NUMERIC, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.attribution_reserve_withdrawal(UUID, TEXT, NUMERIC, UUID, TEXT, TEXT, TEXT) TO service_role;


CREATE OR REPLACE FUNCTION private.attribution_release_hold(
    p_hold_ref TEXT,
    p_entry_prefix TEXT,
    p_wallet_ledger_entry_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_row RECORD;
BEGIN
    FOR v_row IN
        SELECT h.*
        FROM private.player_fund_hold_parts AS h
        WHERE h.hold_ref = p_hold_ref
        FOR UPDATE
    LOOP
        PERFORM private.apply_fund_attribution_delta(
            v_row.wallet_id, v_row.currency, v_row.source_kind, v_row.source_cashier_id,
            v_row.reserved_minor, -v_row.reserved_minor,
            p_entry_prefix || ':' || private.attribution_bucket_key(v_row.source_kind, v_row.source_cashier_id),
            'withdrawal_release', p_hold_ref, p_wallet_ledger_entry_key,
            jsonb_build_object('phase', 'release')
        );
    END LOOP;
    DELETE FROM private.player_fund_hold_parts WHERE hold_ref = p_hold_ref;
END;
$fn$;

REVOKE ALL ON FUNCTION private.attribution_release_hold(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.attribution_release_hold(TEXT, TEXT, TEXT) TO service_role;


CREATE OR REPLACE FUNCTION private.attribution_complete_hold(
    p_hold_ref TEXT,
    p_entry_prefix TEXT,
    p_wallet_ledger_entry_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_row RECORD;
BEGIN
    FOR v_row IN
        SELECT h.*
        FROM private.player_fund_hold_parts AS h
        WHERE h.hold_ref = p_hold_ref
        FOR UPDATE
    LOOP
        PERFORM private.apply_fund_attribution_delta(
            v_row.wallet_id, v_row.currency, v_row.source_kind, v_row.source_cashier_id,
            0, -v_row.reserved_minor,
            p_entry_prefix || ':' || private.attribution_bucket_key(v_row.source_kind, v_row.source_cashier_id),
            'withdrawal_complete', p_hold_ref, p_wallet_ledger_entry_key,
            jsonb_build_object('phase', 'complete')
        );
    END LOOP;
    DELETE FROM private.player_fund_hold_parts WHERE hold_ref = p_hold_ref;
END;
$fn$;

REVOKE ALL ON FUNCTION private.attribution_complete_hold(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.attribution_complete_hold(TEXT, TEXT, TEXT) TO service_role;


CREATE OR REPLACE FUNCTION private.attribution_resolve_hold_ref(
    p_reference_type TEXT,
    p_reference_id TEXT,
    p_entry_key TEXT,
    p_metadata JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_ref TEXT;
    v_type TEXT;
    v_meta_payout TEXT;
    v_payout TEXT;
    v_transfer UUID;
BEGIN
    v_type := NULLIF(BTRIM(COALESCE(p_reference_type, '')), '');
    v_ref := NULLIF(BTRIM(COALESCE(p_reference_id, '')), '');

    IF v_type = 'cashier_player_payout' AND v_ref IS NOT NULL THEN
        RETURN v_ref;
    END IF;
    IF v_type = 'player_withdrawal' AND v_ref IS NOT NULL THEN
        RETURN v_ref;
    END IF;

    v_meta_payout := NULLIF(BTRIM(COALESCE(p_metadata->>'payout_id', '')), '');
    IF v_meta_payout IS NOT NULL THEN
        RETURN v_meta_payout;
    END IF;

    IF v_type = 'operational_transfer' AND v_ref IS NOT NULL THEN
        BEGIN
            v_transfer := v_ref::UUID;
            SELECT NULLIF(BTRIM(COALESCE(t.metadata->>'payout_id', '')), '')
            INTO v_payout
            FROM private.operational_transfers AS t
            WHERE t.id = v_transfer;
            IF v_payout IS NOT NULL THEN
                RETURN v_payout;
            END IF;
            SELECT p.id::TEXT
            INTO v_payout
            FROM private.cashier_player_payout_requests AS p
            WHERE p.operational_transfer_id = v_transfer
            LIMIT 1;
            IF v_payout IS NOT NULL THEN
                RETURN v_payout;
            END IF;
        EXCEPTION
            WHEN invalid_text_representation THEN
                NULL;
        END;
    END IF;

    IF v_ref IS NOT NULL AND EXISTS (
        SELECT 1 FROM private.player_fund_hold_parts AS h WHERE h.hold_ref = v_ref
    ) THEN
        RETURN v_ref;
    END IF;

    IF p_entry_key IS NOT NULL AND EXISTS (
        SELECT 1 FROM private.player_fund_hold_parts AS h WHERE h.hold_ref = p_entry_key
    ) THEN
        RETURN p_entry_key;
    END IF;

    RETURN COALESCE(v_ref, p_entry_key);
END;
$fn$;

REVOKE ALL ON FUNCTION private.attribution_resolve_hold_ref(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.attribution_resolve_hold_ref(TEXT, TEXT, TEXT, JSONB) TO service_role;


-- ============================================================
-- 6. WALLET LEDGER DUAL-WRITE (no apply_wallet_entry rewrite)
-- Native sports CASINO_* rows with reference_type sports_bet are stored
-- as SPORTS_BET / SPORTS_WIN / SPORTS_REFUND before CHECK / AFTER trigger.
-- ============================================================

DO $sports_ops$
DECLARE
    v_vals TEXT[];
    v_tok TEXT;
    v_sql TEXT;
    v_cons TEXT := 'wallet_ledger_operation_type_check';
    v_defaults TEXT[] := ARRAY[
        'CASH_DEPOSIT',
        'TREASURY_FUNDING',
        'WITHDRAWAL_HOLD',
        'WITHDRAWAL_RELEASE',
        'WITHDRAWAL_COMPLETE',
        'CASINO_BET',
        'CASINO_WIN',
        'CASINO_REFUND',
        'OPENING_BALANCE',
        'OWNER_DEBIT',
        'CASH_DEPOSIT_REVERSAL'
    ];
BEGIN
    PERFORM pg_catalog.set_config('search_path', '', true);
    SELECT COALESCE((
        SELECT ARRAY(
            SELECT (pg_catalog.regexp_matches(pg_catalog.pg_get_constraintdef(c.oid), '''([A-Z_]+)''', 'g'))[1]
            FROM pg_catalog.pg_constraint AS c
            INNER JOIN pg_catalog.pg_class AS t ON t.oid = c.conrelid
            INNER JOIN pg_catalog.pg_namespace AS n ON n.oid = t.relnamespace
            WHERE n.nspname = 'private'
              AND t.relname = 'wallet_ledger'
              AND c.conname = v_cons
        )
    ), v_defaults)
    INTO v_vals;

    IF v_vals IS NULL OR pg_catalog.array_length(v_vals, 1) IS NULL THEN
        v_vals := v_defaults;
    END IF;

    FOREACH v_tok IN ARRAY ARRAY['SPORTS_BET', 'SPORTS_WIN', 'SPORTS_REFUND']
    LOOP
        IF NOT v_tok = ANY (v_vals) THEN
            v_vals := pg_catalog.array_append(v_vals, v_tok);
        END IF;
    END LOOP;

    v_sql := pg_catalog.format('ALTER TABLE private.wallet_ledger DROP CONSTRAINT IF EXISTS %I', v_cons);
    EXECUTE v_sql;
    v_sql := pg_catalog.format(
        'ALTER TABLE private.wallet_ledger ADD CONSTRAINT %I CHECK (operation_type IN (%s))',
        v_cons,
        (
            SELECT pg_catalog.string_agg(pg_catalog.quote_literal(x), ', ' ORDER BY x)
            FROM pg_catalog.unnest(v_vals) AS x
        )
    );
    EXECUTE v_sql;
END
$sports_ops$;


CREATE OR REPLACE FUNCTION private.wallet_ledger_native_sports_operation()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
BEGIN
    IF NEW.reference_type IS DISTINCT FROM 'sports_bet' THEN
        RETURN NEW;
    END IF;
    IF NEW.operation_type = 'CASINO_BET' THEN
        NEW.operation_type := 'SPORTS_BET';
    ELSIF NEW.operation_type = 'CASINO_WIN' THEN
        NEW.operation_type := 'SPORTS_WIN';
    ELSIF NEW.operation_type = 'CASINO_REFUND' THEN
        NEW.operation_type := 'SPORTS_REFUND';
    END IF;
    RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION private.wallet_ledger_native_sports_operation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.wallet_ledger_native_sports_operation() TO service_role;

DROP TRIGGER IF EXISTS wallet_ledger_native_sports_operation ON private.wallet_ledger;
CREATE TRIGGER wallet_ledger_native_sports_operation
    BEFORE INSERT ON private.wallet_ledger
    FOR EACH ROW
    EXECUTE FUNCTION private.wallet_ledger_native_sports_operation();


CREATE OR REPLACE FUNCTION private.sports_credit(
    p_wallet UUID,
    p_amount NUMERIC,
    p_op TEXT,
    p_idempotency TEXT,
    p_bet UUID,
    p_actor TEXT,
    p_meta JSONB
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_ledger UUID;
    v_amount NUMERIC(20, 2);
    v_op TEXT;
BEGIN
    v_amount := private.game_money(p_amount);
    IF v_amount <= 0 THEN
        RETURN NULL;
    END IF;
    v_op := CASE p_op
        WHEN 'CASINO_WIN' THEN 'SPORTS_WIN'
        WHEN 'CASINO_REFUND' THEN 'SPORTS_REFUND'
        ELSE p_op
    END;
    IF v_op NOT IN ('SPORTS_WIN', 'SPORTS_REFUND') THEN
        RAISE EXCEPTION 'SPORTS_CREDIT_OPERATION_INVALID';
    END IF;
    SELECT e.ledger_id
    INTO v_ledger
    FROM private.apply_wallet_entry(
        p_wallet,
        v_amount,
        0,
        v_op,
        'casino',
        p_idempotency,
        'sports_bet',
        p_bet::TEXT,
        'system',
        p_actor,
        p_meta
    ) AS e;
    RETURN v_ledger;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.sports_debit(
    p_wallet UUID,
    p_amount NUMERIC,
    p_idempotency TEXT,
    p_bet UUID,
    p_actor TEXT,
    p_meta JSONB
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_ledger UUID;
    v_amount NUMERIC(20, 2);
BEGIN
    v_amount := private.game_money(p_amount);
    IF v_amount <= 0 THEN
        RETURN NULL;
    END IF;
    SELECT e.ledger_id
    INTO v_ledger
    FROM private.apply_wallet_entry(
        p_wallet,
        -v_amount,
        0,
        'SPORTS_BET',
        'casino',
        p_idempotency,
        'sports_bet',
        p_bet::TEXT,
        'system',
        p_actor,
        p_meta
    ) AS e;
    RETURN v_ledger;
END;
$fn$;

REVOKE ALL ON FUNCTION private.sports_credit(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.sports_credit(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT, JSONB) TO service_role;
REVOKE ALL ON FUNCTION private.sports_debit(UUID, NUMERIC, TEXT, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.sports_debit(UUID, NUMERIC, TEXT, UUID, TEXT, JSONB) TO service_role;


CREATE OR REPLACE FUNCTION private.fund_attribution_on_wallet_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_currency TEXT;
    v_display TEXT;
    v_pre_avail NUMERIC;
    v_pre_locked NUMERIC;
    v_avail NUMERIC;
    v_locked NUMERIC;
    v_op TEXT;
    v_minor NUMERIC(40, 0);
    v_cashier UUID;
    v_scope TEXT;
    v_ref TEXT;
    v_related TEXT;
    v_hold_ref TEXT;
    v_state TEXT;
    v_has_snapshot BOOLEAN;
BEGIN
    v_op := NEW.operation_type;
    IF v_op IS NULL THEN
        RETURN NEW;
    END IF;

    IF v_op = 'OPENING_BALANCE' THEN
        RETURN NEW;
    END IF;

    IF v_op IN ('WITHDRAWAL_HOLD', 'WITHDRAWAL_RELEASE', 'WITHDRAWAL_COMPLETE') THEN
        SELECT a.currency, a.available_balance, a.locked_balance
        INTO v_currency, v_avail, v_locked
        FROM private.wallet_accounts AS a
        WHERE a.wallet_id = NEW.wallet_id;
        IF v_currency IS NULL THEN
            RETURN NEW;
        END IF;
        v_display := COALESCE(private.wallet_display_currency(v_currency), 'TMT');
        v_pre_avail := v_avail - COALESCE(NEW.available_delta, 0);
        v_pre_locked := v_locked - COALESCE(NEW.locked_delta, 0);
        PERFORM private.ensure_fund_attribution_initialized(NEW.wallet_id, v_pre_avail, v_pre_locked);

        SELECT s.state INTO v_state
        FROM private.player_fund_attribution_state AS s
        WHERE s.wallet_id = NEW.wallet_id
          AND s.currency = v_currency;
        IF v_state IS DISTINCT FROM 'active' AND v_state IS DISTINCT FROM 'inconsistent' THEN
            RETURN NEW;
        END IF;

        v_hold_ref := private.attribution_resolve_hold_ref(
            NEW.reference_type, NEW.reference_id, NEW.entry_key, NEW.metadata
        );
        IF v_hold_ref IS NULL THEN
            RETURN NEW;
        END IF;

        IF v_op = 'WITHDRAWAL_HOLD' THEN
            -- Cash selected-cashier-first reserve runs BEFORE this HOLD.
            -- Existing parts make this trigger idempotent (no double reserve).
            IF EXISTS (
                SELECT 1 FROM private.player_fund_hold_parts AS h WHERE h.hold_ref = v_hold_ref
            ) THEN
                RETURN NEW;
            END IF;
            v_minor := private.currency_amount_to_minor(v_display, ABS(COALESCE(NEW.available_delta, 0)));
            PERFORM private.attribution_reserve_withdrawal(
                NEW.wallet_id, v_currency, v_minor, NULL,
                v_hold_ref, 'attr-hold:' || v_hold_ref, NEW.entry_key
            );
            RETURN NEW;
        END IF;

        IF v_op = 'WITHDRAWAL_RELEASE' THEN
            PERFORM private.attribution_release_hold(
                v_hold_ref,
                'attr-release:' || NEW.entry_key,
                NEW.entry_key
            );
            RETURN NEW;
        END IF;

        PERFORM private.attribution_complete_hold(
            v_hold_ref,
            'attr-complete:' || NEW.entry_key,
            NEW.entry_key
        );
        RETURN NEW;
    END IF;

    SELECT a.currency, a.available_balance, a.locked_balance
    INTO v_currency, v_avail, v_locked
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = NEW.wallet_id;

    IF v_currency IS NULL THEN
        RETURN NEW;
    END IF;
    v_display := COALESCE(private.wallet_display_currency(v_currency), 'TMT');
    v_pre_avail := v_avail - COALESCE(NEW.available_delta, 0);
    v_pre_locked := v_locked - COALESCE(NEW.locked_delta, 0);
    PERFORM private.ensure_fund_attribution_initialized(NEW.wallet_id, v_pre_avail, v_pre_locked);

    v_scope := COALESCE(NULLIF(BTRIM(NEW.reference_type), ''), 'wallet');
    v_ref := COALESCE(NULLIF(BTRIM(NEW.reference_id), ''), NEW.entry_key);

    IF v_op = 'CASH_DEPOSIT' THEN
        v_minor := private.currency_amount_to_minor(v_display, NEW.available_delta);
        SELECT oa.legacy_cashier_id
        INTO v_cashier
        FROM private.operational_transfers AS t
        INNER JOIN private.operational_accounts AS oa ON oa.id = t.from_account_id
        WHERE t.id = NULLIF(NEW.reference_id, '')::UUID
        LIMIT 1;
        IF v_cashier IS NULL THEN
            PERFORM private.apply_fund_attribution_delta(
                NEW.wallet_id, v_currency, 'house', NULL, v_minor, 0,
                'attr:' || NEW.entry_key || ':house',
                v_scope, v_ref, NEW.entry_key,
                jsonb_build_object('phase', 'deposit_uncorrelated')
            );
            PERFORM private.mark_fund_attribution_inconsistent(NEW.wallet_id, v_currency);
        ELSE
            PERFORM private.apply_fund_attribution_delta(
                NEW.wallet_id, v_currency, 'cashier', v_cashier, v_minor, 0,
                'attr:' || NEW.entry_key || ':cashier',
                v_scope, v_ref, NEW.entry_key,
                jsonb_build_object('phase', 'cashier_deposit')
            );
        END IF;
        RETURN NEW;
    END IF;

    IF v_op = 'TREASURY_FUNDING' THEN
        v_minor := private.currency_amount_to_minor(v_display, NEW.available_delta);
        PERFORM private.apply_fund_attribution_delta(
            NEW.wallet_id, v_currency, 'treasury', NULL, v_minor, 0,
            'attr:' || NEW.entry_key || ':treasury',
            v_scope, v_ref, NEW.entry_key,
            jsonb_build_object('phase', 'treasury_credit')
        );
        RETURN NEW;
    END IF;

    IF v_op IN ('CASH_DEPOSIT_REVERSAL', 'OWNER_DEBIT') THEN
        v_minor := private.currency_amount_to_minor(v_display, ABS(NEW.available_delta));
        IF v_op = 'CASH_DEPOSIT_REVERSAL' THEN
            SELECT oa.legacy_cashier_id
            INTO v_cashier
            FROM private.operational_transfers AS t
            INNER JOIN private.operational_accounts AS oa ON oa.id = t.to_account_id
            WHERE t.id = NULLIF(NEW.reference_id, '')::UUID
            LIMIT 1;
            IF v_cashier IS NOT NULL THEN
                PERFORM private.apply_fund_attribution_delta(
                    NEW.wallet_id, v_currency, 'cashier', v_cashier, -v_minor, 0,
                    'attr:' || NEW.entry_key || ':cashier',
                    v_scope, v_ref, NEW.entry_key,
                    jsonb_build_object('phase', 'cashier_reversal')
                );
                RETURN NEW;
            END IF;
        END IF;
        PERFORM private.attribution_consume_available(
            NEW.wallet_id, v_currency, v_minor,
            'attr:' || NEW.entry_key,
            v_scope, v_ref, NEW.entry_key, FALSE
        );
        RETURN NEW;
    END IF;

    -- Native sports place: consume current mix and freeze an immutable stake snapshot.
    -- Native sports re-settlement debit (existing snapshot): consume using that snapshot,
    -- never current wallet percentages.
    IF v_op = 'SPORTS_BET' AND COALESCE(NEW.available_delta, 0) < 0 THEN
        v_minor := private.currency_amount_to_minor(v_display, ABS(NEW.available_delta));
        SELECT EXISTS (
            SELECT 1
            FROM private.player_stake_attribution AS s
            WHERE s.stake_scope = v_scope
              AND s.stake_ref = v_ref
        ) INTO v_has_snapshot;
        IF v_has_snapshot THEN
            PERFORM private.attribution_consume_from_snapshot(
                NEW.wallet_id, v_currency, v_minor,
                v_scope, v_ref,
                'attr:' || NEW.entry_key,
                NEW.entry_key
            );
        ELSE
            PERFORM private.attribution_consume_available(
                NEW.wallet_id, v_currency, v_minor,
                'attr:' || NEW.entry_key,
                v_scope, v_ref, NEW.entry_key, TRUE
            );
        END IF;
        RETURN NEW;
    END IF;

    -- Native sports settlement/refund credits the ORIGINAL stake snapshot.
    IF v_op IN ('SPORTS_WIN', 'SPORTS_REFUND') AND COALESCE(NEW.available_delta, 0) > 0 THEN
        v_minor := private.currency_amount_to_minor(v_display, NEW.available_delta);
        PERFORM private.attribution_credit_from_snapshot(
            NEW.wallet_id, v_currency, v_minor,
            v_scope, v_ref,
            'attr:' || NEW.entry_key,
            NEW.entry_key
        );
        RETURN NEW;
    END IF;

    IF v_op = 'CASINO_BET' AND COALESCE(NEW.available_delta, 0) < 0 THEN
        v_minor := private.currency_amount_to_minor(v_display, ABS(NEW.available_delta));
        PERFORM private.attribution_consume_available(
            NEW.wallet_id, v_currency, v_minor,
            'attr:' || NEW.entry_key,
            v_scope, v_ref, NEW.entry_key, TRUE
        );
        RETURN NEW;
    END IF;

    IF v_op IN ('CASINO_WIN', 'CASINO_REFUND') AND COALESCE(NEW.available_delta, 0) > 0 THEN
        v_minor := private.currency_amount_to_minor(v_display, NEW.available_delta);
        v_related := NULLIF(BTRIM(COALESCE(NEW.metadata->>'related_transaction_id', '')), '');
        IF v_related IS NULL AND to_regclass('private.betconstruct_transactions') IS NOT NULL THEN
            -- BetConstruct sports BetResulted and casino Deposit insert the
            -- provider row AFTER the wallet credit. related_transaction_id is
            -- therefore often unavailable here. Do not guess latest cashier.
            -- Uncorrelated credits fail closed to house + inconsistent.
            SELECT t.related_transaction_id
            INTO v_related
            FROM private.betconstruct_transactions AS t
            WHERE t.external_transaction_id = v_ref
            ORDER BY t.created_at DESC
            LIMIT 1;
        END IF;
        PERFORM private.attribution_credit_from_snapshot(
            NEW.wallet_id, v_currency, v_minor,
            v_scope, COALESCE(v_related, v_ref),
            'attr:' || NEW.entry_key,
            NEW.entry_key
        );
        RETURN NEW;
    END IF;

    -- Unknown credits are never assigned to a cashier. Unknown debits consume
    -- current mix fail-closed (no silent recolor).
    IF COALESCE(NEW.available_delta, 0) > 0 THEN
        v_minor := private.currency_amount_to_minor(v_display, NEW.available_delta);
        PERFORM private.apply_fund_attribution_delta(
            NEW.wallet_id, v_currency, 'house', NULL, v_minor, 0,
            'attr:' || NEW.entry_key || ':house',
            v_scope, v_ref, NEW.entry_key,
            jsonb_build_object('phase', 'uncategorized_credit')
        );
    ELSIF COALESCE(NEW.available_delta, 0) < 0 THEN
        v_minor := private.currency_amount_to_minor(v_display, ABS(NEW.available_delta));
        PERFORM private.attribution_consume_available(
            NEW.wallet_id, v_currency, v_minor,
            'attr:' || NEW.entry_key,
            v_scope, v_ref, NEW.entry_key, FALSE
        );
    END IF;

    RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION private.fund_attribution_on_wallet_ledger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.fund_attribution_on_wallet_ledger() TO service_role;

DROP TRIGGER IF EXISTS wallet_ledger_fund_attribution ON private.wallet_ledger;
CREATE TRIGGER wallet_ledger_fund_attribution
    AFTER INSERT ON private.wallet_ledger
    FOR EACH ROW
    EXECUTE FUNCTION private.fund_attribution_on_wallet_ledger();


CREATE OR REPLACE FUNCTION private.resolve_live_payout_destination(
    p_public_token TEXT,
    p_storage_currency TEXT
)
RETURNS TABLE (
    destination_id UUID,
    public_token TEXT,
    legacy_cashier_id UUID,
    city TEXT,
    label TEXT
)
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_token TEXT;
    v_row private.cashier_payout_destinations%ROWTYPE;
    v_ops UUID;
BEGIN
    v_token := NULLIF(BTRIM(COALESCE(p_public_token, '')), '');
    IF v_token IS NULL THEN
        RAISE EXCEPTION 'PAYOUT_DESTINATION_REQUIRED';
    END IF;

    SELECT d.*
    INTO v_row
    FROM private.cashier_payout_destinations AS d
    WHERE d.public_token = v_token
    FOR UPDATE;

    IF NOT FOUND OR v_row.is_selectable IS NOT TRUE THEN
        RAISE EXCEPTION 'PAYOUT_DESTINATION_NOT_FOUND';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.cashiers AS c
        WHERE c.id = v_row.legacy_cashier_id
          AND c.is_active IS TRUE
    ) THEN
        RAISE EXCEPTION 'PAYOUT_DESTINATION_NOT_ACTIVE';
    END IF;

    SELECT a.id
    INTO v_ops
    FROM private.operational_accounts AS a
    WHERE a.legacy_cashier_id = v_row.legacy_cashier_id
      AND a.account_type = 'cashier'
      AND a.currency = p_storage_currency
      AND a.status = 'active'
      AND a.migration_state = 'active'
    LIMIT 1;

    IF v_ops IS NULL THEN
        RAISE EXCEPTION 'PAYOUT_DESTINATION_NOT_ACTIVE';
    END IF;

    destination_id := v_row.id;
    public_token := v_row.public_token;
    legacy_cashier_id := v_row.legacy_cashier_id;
    city := v_row.city;
    label := v_row.label;
    RETURN NEXT;
END;
$fn$;

REVOKE ALL ON FUNCTION private.resolve_live_payout_destination(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.resolve_live_payout_destination(TEXT, TEXT) TO service_role;


CREATE OR REPLACE FUNCTION public.player_list_cash_payout_destinations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_active RECORD;
    v_rows jsonb;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    SELECT * INTO v_active FROM private.player_active_wallet(v_uid);
    IF v_active.wallet_id IS NULL THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', d.public_token,
        'city', d.city,
        'label', d.label
    ) ORDER BY d.city, d.label), '[]'::jsonb)
    INTO v_rows
    FROM private.cashier_payout_destinations AS d
    INNER JOIN public.cashiers AS c ON c.id = d.legacy_cashier_id
    INNER JOIN private.operational_accounts AS a
        ON a.legacy_cashier_id = d.legacy_cashier_id
       AND a.account_type = 'cashier'
       AND a.currency = v_active.storage_currency
    WHERE d.is_selectable IS TRUE
      AND c.is_active IS TRUE
      AND a.status = 'active'
      AND a.migration_state = 'active';

    RETURN jsonb_build_object(
        'ok', true,
        'rows', COALESCE(v_rows, '[]'::jsonb)
    );
END;
$fn$;

REVOKE ALL ON FUNCTION public.player_list_cash_payout_destinations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_list_cash_payout_destinations() TO authenticated;


CREATE OR REPLACE FUNCTION private.issue_cashier_payout_code(p_payout_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_code TEXT;
    v_i INTEGER;
BEGIN
    FOR v_i IN 1..32 LOOP
        v_code := private.cashier_new_payout_code();
        BEGIN
            UPDATE private.cashier_player_payout_requests
            SET secret_code = v_code,
                code_issued_at = COALESCE(code_issued_at, pg_catalog.now())
            WHERE id = p_payout_id
              AND secret_code IS NULL
              AND status = 'pending';
            IF FOUND THEN
                RETURN v_code;
            END IF;
            SELECT r.secret_code INTO v_code
            FROM private.cashier_player_payout_requests AS r
            WHERE r.id = p_payout_id;
            RETURN v_code;
        EXCEPTION
            WHEN unique_violation THEN
                v_code := NULL;
        END;
    END LOOP;
    RAISE EXCEPTION 'PAYOUT_CODE_UNAVAILABLE';
END;
$fn$;

REVOKE ALL ON FUNCTION private.issue_cashier_payout_code(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.issue_cashier_payout_code(UUID) TO service_role;


CREATE OR REPLACE FUNCTION private.withdrawal_review_append_audit(
    p_review_id UUID,
    p_withdrawal_id UUID,
    p_actor_role TEXT,
    p_actor_user_id UUID,
    p_previous TEXT,
    p_new TEXT,
    p_decision TEXT,
    p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
BEGIN
    INSERT INTO private.withdrawal_attribution_review_audit (
        review_id, withdrawal_id, actor_role, actor_user_id,
        previous_status, new_status, decision, internal_reason
    )
    VALUES (
        p_review_id, p_withdrawal_id, p_actor_role, p_actor_user_id,
        p_previous, p_new, p_decision, NULLIF(BTRIM(COALESCE(p_reason, '')), '')
    );
END;
$fn$;

REVOKE ALL ON FUNCTION private.withdrawal_review_append_audit(UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.withdrawal_review_append_audit(UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;


CREATE OR REPLACE FUNCTION private.cashier_attribution_available_minor(
    p_wallet_id UUID,
    p_currency TEXT,
    p_cashier_id UUID
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = ''
AS $fn$
    SELECT COALESCE((
        SELECT b.available_minor
        FROM private.player_fund_attribution AS b
        WHERE b.wallet_id = p_wallet_id
          AND b.currency = p_currency
          AND b.source_kind = 'cashier'
          AND b.source_cashier_id = p_cashier_id
    ), 0);
$fn$;

REVOKE ALL ON FUNCTION private.cashier_attribution_available_minor(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.cashier_attribution_available_minor(UUID, TEXT, UUID) TO service_role;


-- ============================================================
-- 8. ACTIVE-WALLET CASH HOLD + PRE-PIN ATTRIBUTION GATE
-- ============================================================

DROP FUNCTION IF EXISTS public.player_request_cashier_payout(NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.player_request_cashier_payout(
    p_amount NUMERIC,
    p_idempotency_key TEXT,
    p_selected_cashier_id UUID DEFAULT NULL,
    p_payout_destination_id UUID DEFAULT NULL,
    p_issue_code BOOLEAN DEFAULT TRUE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_key TEXT;
    v_hold_key TEXT;
    v_amount NUMERIC;
    v_wallet UUID;
    v_public TEXT;
    v_currency TEXT;
    v_display TEXT;
    v_status TEXT;
    v_existing private.cashier_player_payout_requests%ROWTYPE;
    v_code TEXT;
    v_id UUID;
    v_minor NUMERIC(40, 0);
    v_hold JSONB;
    v_pre_avail NUMERIC;
    v_pre_locked NUMERIC;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

    PERFORM private.cashier_require_platform_ops_active();
    v_key := private.owner_require_idempotency_key(p_idempotency_key);
    v_hold_key := 'payout-hold:' || v_uid::TEXT || ':' || v_key;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'AMOUNT_NOT_POSITIVE';
    END IF;

    -- CASH withdrawal MUST use the active wallet, never profiles.wallet_id.
    SELECT w.wallet_id, w.public_id, w.currency
    INTO v_wallet, v_public, v_currency
    FROM private.withdrawal_lock_player_wallet(v_uid) AS w;
    IF v_wallet IS NULL THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;
    v_display := COALESCE(private.wallet_display_currency(v_currency), 'TMT');
    PERFORM private.require_currency_amount_scale(v_display, p_amount);
    v_amount := p_amount;

    SELECT r.*
    INTO v_existing
    FROM private.cashier_player_payout_requests AS r
    WHERE r.hold_idempotency_key = v_hold_key
    FOR UPDATE;
    IF FOUND THEN
        PERFORM private.cashier_match_hold_idempotency(v_existing, v_wallet, v_amount, v_currency);
        RETURN private.cashier_payout_hold_duplicate_json(v_existing);
    END IF;

    SELECT a.status, a.available_balance, a.locked_balance
    INTO v_status, v_pre_avail, v_pre_locked
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = v_wallet
    FOR UPDATE;
    IF v_status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'PLAYER_WALLET_NOT_ACTIVE';
    END IF;

    INSERT INTO private.cashier_player_payout_requests (
        secret_code, player_public_id, wallet_id, currency, amount, status,
        expires_at, hold_idempotency_key, selected_legacy_cashier_id, payout_destination_id
    )
    VALUES (
        NULL, v_public, v_wallet, v_currency, v_amount, 'pending',
        pg_catalog.now() + INTERVAL '24 hours', v_hold_key,
        p_selected_cashier_id, p_payout_destination_id
    )
    RETURNING id INTO v_id;

    -- Reserve attribution BEFORE Wallet Ledger HOLD so the AFTER trigger
    -- sees existing hold_parts and does not double-reserve the same cash HOLD.
    v_minor := private.currency_amount_to_minor(v_display, v_amount);
    PERFORM private.ensure_fund_attribution_initialized(v_wallet, v_pre_avail, v_pre_locked);
    v_hold := private.attribution_reserve_withdrawal(
        v_wallet, v_currency, v_minor, p_selected_cashier_id,
        v_id::TEXT, 'attr-hold:' || v_id::TEXT, v_hold_key
    );

    PERFORM 1 FROM private.apply_wallet_entry(
        v_wallet, -v_amount, v_amount, 'WITHDRAWAL_HOLD', 'mobcash', v_hold_key,
        'cashier_player_payout', v_id::TEXT, 'player', v_uid::TEXT,
        jsonb_build_object('phase', 'hold')
    );

    IF p_issue_code IS TRUE THEN
        v_code := private.issue_cashier_payout_code(v_id);
    END IF;

    RETURN jsonb_build_object(
        'ok', true, 'is_duplicate', false, 'id', v_id, 'code', v_code,
        'amount', v_amount, 'currency', v_currency, 'status', 'pending',
        'expires_at', pg_catalog.now() + INTERVAL '24 hours',
        'player_public_id', v_public, 'attribution_hold', v_hold
    );
EXCEPTION
    WHEN unique_violation THEN
        SELECT r.* INTO v_existing
        FROM private.cashier_player_payout_requests AS r
        WHERE r.hold_idempotency_key = v_hold_key
        FOR UPDATE;
        IF NOT FOUND THEN RAISE; END IF;
        PERFORM private.cashier_match_hold_idempotency(v_existing, v_wallet, v_amount, v_currency);
        RETURN private.cashier_payout_hold_duplicate_json(v_existing);
END;
$fn$;

REVOKE ALL ON FUNCTION public.player_request_cashier_payout(NUMERIC, TEXT, UUID, UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_request_cashier_payout(NUMERIC, TEXT, UUID, UUID, BOOLEAN) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_request_cashier_payout(NUMERIC, TEXT, UUID, UUID, BOOLEAN) TO service_role;


CREATE OR REPLACE FUNCTION private.withdrawal_public_json(
    p_row private.player_withdrawal_requests,
    p_payout private.cashier_player_payout_requests,
    p_include_code BOOLEAN
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_status TEXT;
    v_review TEXT;
    v_notice TEXT;
    v_code TEXT;
    v_reason TEXT;
BEGIN
    v_status := private.withdrawal_effective_status(p_row, p_payout);
    SELECT r.review_status INTO v_review
    FROM private.withdrawal_attribution_reviews AS r
    WHERE r.withdrawal_id = p_row.id;
    v_notice := p_row.player_notice_code;
    IF v_review IN ('required', 'under_review') THEN
        v_status := 'pending';
        v_notice := COALESCE(NULLIF(v_notice, ''), 'under_review');
        v_code := NULL;
    ELSIF p_include_code AND p_row.method = 'cash' AND v_status = 'pending' THEN
        v_code := p_payout.secret_code;
    END IF;
    v_reason := p_row.rejection_reason;
    IF v_notice = 'rejected_cashier_proportion' THEN
        v_reason := private.player_cashier_proportion_reject_notice();
    END IF;
    RETURN jsonb_build_object(
        'id', p_row.id,
        'player_public_id', p_row.player_public_id,
        'method', p_row.method,
        'method_label', p_row.method_label,
        'amount', p_row.amount,
        'currency', COALESCE(private.wallet_display_currency(p_row.currency), 'TMT'),
        'status', v_status,
        'requested_at', p_row.requested_at,
        'created_at', p_row.created_at,
        'approved_at', p_row.approved_at,
        'paid_at', COALESCE(p_row.paid_at, p_payout.paid_at),
        'rejected_at', p_row.rejected_at,
        'rejection_reason', v_reason,
        'cash_pickup_city', p_row.cash_pickup_city,
        'cash_pickup_point', p_row.cash_pickup_point,
        'pin_code', v_code,
        'destination_ref', p_row.destination_ref,
        'cashier_id', p_payout.paid_by_legacy_cashier_id,
        'player_notice_code', v_notice,
        'is_duplicate', false
    );
END;
$fn$;


DROP FUNCTION IF EXISTS public.player_create_withdrawal(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.player_create_withdrawal(
    p_method TEXT,
    p_amount NUMERIC,
    p_idempotency_key TEXT,
    p_method_label TEXT,
    p_destination_ref TEXT DEFAULT NULL,
    p_cash_pickup_city TEXT DEFAULT NULL,
    p_cash_pickup_point TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_payout_destination_id TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_key TEXT;
    v_method TEXT;
    v_label TEXT;
    v_amount NUMERIC;
    v_player RECORD;
    v_existing private.player_withdrawal_requests%ROWTYPE;
    v_payout private.cashier_player_payout_requests%ROWTYPE;
    v_hold jsonb;
    v_dest TEXT;
    v_city TEXT;
    v_point TEXT;
    v_display TEXT;
    v_limits_configured BOOLEAN;
    v_enforce BOOLEAN;
    v_dest_id UUID := NULL;
    v_dest_cashier UUID := NULL;
    v_minor NUMERIC(40, 0);
    v_selected_avail NUMERIC(40, 0) := 0;
    v_need_review BOOLEAN := FALSE;
    v_issue_code BOOLEAN := TRUE;
    v_notice TEXT;
    v_review_id UUID;
    v_signals JSONB := '{}'::jsonb;
    v_snapshot JSONB := '[]'::jsonb;
    v_state TEXT;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

    v_method := lower(NULLIF(BTRIM(COALESCE(p_method, '')), ''));
    IF v_method IS NULL OR v_method NOT IN ('cash', 'card', 'crypto', 'ewallet', 'other') THEN
        RAISE EXCEPTION 'WITHDRAWAL_METHOD_INVALID';
    END IF;
    IF v_method = 'card' THEN RAISE EXCEPTION 'CARD_WITHDRAWAL_PROVIDER_REQUIRED'; END IF;

    v_key := private.owner_require_idempotency_key(p_idempotency_key);
    v_label := NULLIF(BTRIM(COALESCE(p_method_label, '')), '');
    IF v_label IS NULL THEN RAISE EXCEPTION 'METHOD_LABEL_REQUIRED'; END IF;
    IF char_length(v_label) > 120 THEN RAISE EXCEPTION 'METHOD_LABEL_TOO_LONG'; END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'AMOUNT_NOT_POSITIVE'; END IF;
    v_amount := p_amount;
    v_enforce := private.fund_attribution_enforcement_enabled();
    v_city := NULLIF(BTRIM(COALESCE(p_cash_pickup_city, '')), '');
    v_point := NULLIF(BTRIM(COALESCE(p_cash_pickup_point, '')), '');
    IF v_method = 'cash' THEN
        v_dest := NULL;
    ELSE
        v_dest := private.withdrawal_sanitize_destination(v_method, p_destination_ref);
        v_city := NULL;
        v_point := NULL;
    END IF;

    SELECT r.* INTO v_existing
    FROM private.player_withdrawal_requests AS r
    WHERE r.player_auth_user_id = v_uid AND r.idempotency_key = v_key
    FOR UPDATE;
    IF FOUND THEN
        IF v_existing.amount IS DISTINCT FROM v_amount
           OR v_existing.method IS DISTINCT FROM v_method
           OR v_existing.destination_ref IS DISTINCT FROM v_dest
           OR v_existing.cash_pickup_city IS DISTINCT FROM v_city
           OR v_existing.cash_pickup_point IS DISTINCT FROM v_point THEN
            RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
        END IF;
        IF v_existing.cash_payout_id IS NOT NULL THEN
            SELECT p.* INTO v_payout FROM private.cashier_player_payout_requests AS p WHERE p.id = v_existing.cash_payout_id;
        END IF;
        RETURN private.withdrawal_public_json(v_existing, v_payout, true)
            || jsonb_build_object('ok', true, 'is_duplicate', true);
    END IF;

    SELECT w.wallet_id, w.public_id, w.currency
    INTO v_player
    FROM private.withdrawal_lock_player_wallet(v_uid) AS w;
    v_display := COALESCE(private.wallet_display_currency(v_player.currency), 'TMT');
    PERFORM private.require_currency_amount_scale(v_display, p_amount);
    v_amount := p_amount;
    v_minor := private.currency_amount_to_minor(v_display, v_amount);

    SELECT c.limits_configured INTO v_limits_configured
    FROM private.supported_currencies AS c WHERE c.code = v_display;
    IF v_display = 'TMT' AND COALESCE(v_limits_configured, FALSE) IS NOT TRUE
       AND v_method = 'cash' AND p_amount < 40 THEN
        RAISE EXCEPTION 'CASH_WITHDRAWAL_BELOW_MIN';
    END IF;
    PERFORM private.require_player_withdrawal_allowed(v_uid);
    PERFORM private.require_player_min_amount(v_display, p_amount, 'withdrawal');

    IF v_method = 'cash' THEN
        IF v_enforce THEN
            SELECT d.destination_id, d.legacy_cashier_id, d.city, d.label
            INTO v_dest_id, v_dest_cashier, v_city, v_point
            FROM private.resolve_live_payout_destination(p_payout_destination_id, v_player.currency) AS d;
            PERFORM private.ensure_fund_attribution_initialized(
                v_player.wallet_id,
                (SELECT a.available_balance FROM private.wallet_accounts AS a WHERE a.wallet_id = v_player.wallet_id),
                (SELECT a.locked_balance FROM private.wallet_accounts AS a WHERE a.wallet_id = v_player.wallet_id)
            );
            v_state := private.assert_attribution_matches_wallet(v_player.wallet_id);
            v_selected_avail := private.cashier_attribution_available_minor(
                v_player.wallet_id, v_player.currency, v_dest_cashier
            );
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'source_kind', b.source_kind,
                'source_cashier_id', to_jsonb(b.source_cashier_id),
                'available_minor', b.available_minor,
                'reserved_minor', b.reserved_minor
            ) ORDER BY b.source_kind, COALESCE(b.source_cashier_id::TEXT, '')), '[]'::jsonb)
            INTO v_snapshot
            FROM private.player_fund_attribution AS b
            WHERE b.wallet_id = v_player.wallet_id AND b.currency = v_player.currency;
            v_need_review := (v_minor > COALESCE(v_selected_avail, 0)) OR v_state IS DISTINCT FROM 'active';
            IF v_need_review THEN
                v_issue_code := FALSE;
                v_notice := 'under_review';
                v_signals := jsonb_build_object(
                    'requested_exceeds_selected', v_minor > COALESCE(v_selected_avail, 0),
                    'tiny_selected_cashier_share',
                        COALESCE(v_selected_avail, 0) > 0
                        AND COALESCE(v_selected_avail, 0) * 20 < v_minor,
                    'legacy_or_noncashier_required', EXISTS (
                        SELECT 1 FROM private.player_fund_attribution AS b
                        WHERE b.wallet_id = v_player.wallet_id
                          AND b.currency = v_player.currency
                          AND b.source_kind IN ('legacy', 'treasury', 'house', 'bonus')
                          AND b.available_minor > 0
                    ),
                    'inconsistent', v_state IS DISTINCT FROM 'active',
                    'no_first_free_payout', true
                );
            END IF;
        ELSE
            -- Enforcement OFF: preserve legacy city/point cash flow. Destination
            -- and selected cashier stay NULL unless an optional destination token
            -- is supplied. Never dereference an unassigned RECORD.
            IF v_city IS NULL OR v_point IS NULL THEN RAISE EXCEPTION 'CASH_PICKUP_REQUIRED'; END IF;
            IF NULLIF(BTRIM(COALESCE(p_payout_destination_id, '')), '') IS NOT NULL THEN
                SELECT d.destination_id, d.legacy_cashier_id, d.city, d.label
                INTO v_dest_id, v_dest_cashier, v_city, v_point
                FROM private.resolve_live_payout_destination(p_payout_destination_id, v_player.currency) AS d;
            END IF;
        END IF;

        v_hold := public.player_request_cashier_payout(
            v_amount, v_key, v_dest_cashier, v_dest_id, v_issue_code
        );
        SELECT p.* INTO v_payout
        FROM private.cashier_player_payout_requests AS p
        WHERE p.id = (v_hold ->> 'id')::uuid
        FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'PAYOUT_NOT_FOUND'; END IF;
    END IF;

    INSERT INTO private.player_withdrawal_requests (
        player_auth_user_id, player_public_id, wallet_id, method, method_label, amount, currency,
        status, cash_pickup_city, cash_pickup_point, cash_payout_id, destination_ref, idempotency_key,
        metadata, payout_destination_id, selected_legacy_cashier_id, player_notice_code
    )
    VALUES (
        v_uid, v_player.public_id, v_player.wallet_id, v_method, v_label, v_amount, v_player.currency,
        'pending', v_city, v_point, v_payout.id, v_dest, v_key,
        COALESCE(p_metadata, '{}'::jsonb) - 'wallet_id' - 'walletId' - 'auth_user_id' - 'player_id'
            - 'balance' - 'status' - 'cashier_id' - 'network_id' - 'manager_id',
        v_dest_id, v_dest_cashier, v_notice
    )
    RETURNING * INTO v_existing;

    IF v_method <> 'cash' THEN
        -- Non-cash HOLD uses the withdrawal id as hold identity so RELEASE/COMPLETE
        -- restore/consume the same parts. Attribution trigger reserves proportionally.
        -- Do not open cashier review merely because attribution exists.
        PERFORM 1 FROM private.apply_wallet_entry(
            v_player.wallet_id, -v_amount, v_amount, 'WITHDRAWAL_HOLD', 'withdrawal',
            'wd-hold:' || v_existing.id::TEXT, 'player_withdrawal', v_existing.id::TEXT,
            'player', v_uid::TEXT, jsonb_build_object('phase', 'hold', 'method', v_method)
        );
    END IF;

    IF v_need_review THEN
        INSERT INTO private.withdrawal_attribution_reviews (
            withdrawal_id, cash_payout_id, payout_destination_id, selected_legacy_cashier_id,
            currency, requested_amount, selected_cashier_amount, cross_cashier_amount,
            review_status, signal_details, attribution_snapshot
        )
        VALUES (
            v_existing.id, v_payout.id, v_dest_id, v_dest_cashier,
            v_player.currency, v_amount,
            private.currency_minor_to_amount(v_display, COALESCE(v_selected_avail, 0)),
            private.currency_minor_to_amount(v_display, GREATEST(v_minor - COALESCE(v_selected_avail, 0), 0)),
            'required', v_signals, v_snapshot
        )
        RETURNING id INTO v_review_id;
        PERFORM private.withdrawal_review_append_audit(
            v_review_id, v_existing.id, 'system', NULL, NULL, 'required', 'created', NULL
        );
    END IF;

    RETURN private.withdrawal_public_json(v_existing, v_payout, true)
        || jsonb_build_object(
            'ok', true,
            'is_duplicate', COALESCE((v_hold ->> 'is_duplicate')::boolean, false),
            'code', CASE WHEN v_method = 'cash' AND v_issue_code THEN v_payout.secret_code ELSE NULL END
        );
EXCEPTION
    WHEN unique_violation THEN
        SELECT r.* INTO v_existing
        FROM private.player_withdrawal_requests AS r
        WHERE r.player_auth_user_id = v_uid AND r.idempotency_key = v_key
        FOR UPDATE;
        IF NOT FOUND THEN RAISE; END IF;
        IF v_existing.cash_payout_id IS NOT NULL THEN
            SELECT p.* INTO v_payout FROM private.cashier_player_payout_requests AS p WHERE p.id = v_existing.cash_payout_id;
        END IF;
        RETURN private.withdrawal_public_json(v_existing, v_payout, true)
            || jsonb_build_object('ok', true, 'is_duplicate', true);
END;
$fn$;

REVOKE ALL ON FUNCTION public.player_create_withdrawal(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_create_withdrawal(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) TO authenticated;


-- ============================================================
-- 9. CASHIER CONFIRM / LOOKUP GATES
-- ============================================================

CREATE OR REPLACE FUNCTION public.cashier_confirm_player_payout(
    p_code TEXT,
    p_idempotency_key TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_code TEXT;
    v_key TEXT;
    v_req private.cashier_player_payout_requests%ROWTYPE;
    v_storage TEXT;
    v_op UUID;
    v_engine_key TEXT;
    v_result RECORD;
    v_review TEXT;
    v_enforce BOOLEAN;
BEGIN
    SELECT c.auth_user_id, c.network_id, c.legacy_cashier_id
    INTO v_ctx FROM private.get_current_cashier_context_locked() AS c;
    v_code := lower(NULLIF(BTRIM(COALESCE(p_code, '')), ''));
    IF v_code IS NULL OR v_code !~ '^[0-9a-f]{16}$' THEN RAISE EXCEPTION 'PAYOUT_CODE_INVALID'; END IF;
    v_key := private.owner_require_idempotency_key(p_idempotency_key);
    v_enforce := private.fund_attribution_enforcement_enabled();

    SELECT r.* INTO v_req FROM private.cashier_player_payout_requests AS r
    WHERE r.secret_code = v_code AND r.status = 'pending' FOR UPDATE;
    IF NOT FOUND THEN
        SELECT r.* INTO v_req FROM private.cashier_player_payout_requests AS r
        WHERE r.secret_code = v_code ORDER BY r.created_at DESC LIMIT 1 FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'PAYOUT_NOT_FOUND'; END IF;
    END IF;

    IF v_req.status = 'paid' THEN
        IF v_req.confirm_idempotency_key IS NOT DISTINCT FROM v_key
           AND v_req.paid_by_staff_auth_id IS NOT DISTINCT FROM v_ctx.auth_user_id THEN
            RETURN jsonb_build_object('ok', true, 'is_duplicate', true,
                'transfer_id', v_req.operational_transfer_id, 'amount', v_req.amount,
                'currency', private.operational_display_currency(v_req.currency),
                'player_public_id', v_req.player_public_id, 'payout_id', v_req.id, 'status', 'paid');
        END IF;
        RAISE EXCEPTION 'PAYOUT_ALREADY_PAID';
    END IF;
    IF v_req.status = 'cancelled' THEN RAISE EXCEPTION 'PAYOUT_CANCELLED'; END IF;
    IF v_req.status = 'expired' THEN RAISE EXCEPTION 'PAYOUT_EXPIRED'; END IF;
    IF v_req.status = 'pending' AND v_req.expires_at <= pg_catalog.now() THEN
        PERFORM private.expire_cashier_player_payout(v_req.id);
        RETURN jsonb_build_object('ok', false, 'error', 'PAYOUT_EXPIRED', 'status', 'expired',
            'payout_id', v_req.id, 'is_duplicate', false);
    END IF;
    IF v_req.status IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'PAYOUT_NOT_PENDING'; END IF;
    IF v_req.secret_code IS NULL THEN RAISE EXCEPTION 'PAYOUT_UNAVAILABLE'; END IF;

    SELECT r.review_status INTO v_review
    FROM private.withdrawal_attribution_reviews AS r
    WHERE r.cash_payout_id = v_req.id FOR UPDATE;
    IF v_enforce THEN
        IF v_review IN ('required', 'under_review', 'rejected') THEN RAISE EXCEPTION 'PAYOUT_UNAVAILABLE'; END IF;
        IF v_req.selected_legacy_cashier_id IS NOT NULL
           AND v_req.selected_legacy_cashier_id IS DISTINCT FROM v_ctx.legacy_cashier_id THEN
            RAISE EXCEPTION 'PAYOUT_UNAVAILABLE';
        END IF;
    END IF;

    v_storage := private.wallet_storage_currency(v_req.currency);
    IF v_storage IS NULL THEN RAISE EXCEPTION 'CURRENCY_UNSUPPORTED'; END IF;
    BEGIN
        v_op := private.resolve_cashier_currency_account(v_ctx.legacy_cashier_id, v_ctx.network_id, v_storage, TRUE);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'CASHIER_CURRENCY_ACCOUNT_REQUIRED' THEN RAISE EXCEPTION 'CASHIER_CURRENCY_ACCOUNT_REQUIRED'; END IF;
        RAISE;
    END;
    PERFORM private.cashier_require_own_ops_active(v_op);
    PERFORM private.cashier_revalidate_legacy_cashier(v_ctx.legacy_cashier_id, v_ctx.network_id);
    IF NOT private.wallet_currencies_match(v_req.currency, v_storage) THEN RAISE EXCEPTION 'CURRENCY_MISMATCH'; END IF;

    v_engine_key := 'cashier-payout:' || v_req.id::TEXT;
    SELECT e.transfer_id, e.is_duplicate, e.from_balance_after, e.to_balance_after, e.player_balance_after
    INTO v_result
    FROM private.apply_operational_transfer(
        'PLAYER_TO_CASHIER', v_req.amount, v_storage, v_engine_key, NULL, v_op, v_req.wallet_id,
        v_ctx.auth_user_id, 'cashier',
        jsonb_build_object('payout_id', v_req.id, 'player_public_id', v_req.player_public_id)
    ) AS e;

    UPDATE private.cashier_player_payout_requests
    SET status = 'paid', paid_at = pg_catalog.now(), paid_by_legacy_cashier_id = v_ctx.legacy_cashier_id,
        paid_by_staff_auth_id = v_ctx.auth_user_id, operational_transfer_id = v_result.transfer_id,
        confirm_idempotency_key = v_key
    WHERE id = v_req.id AND status = 'pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'PAYOUT_ALREADY_PAID'; END IF;
    PERFORM private.cashier_revalidate_legacy_cashier(v_ctx.legacy_cashier_id, v_ctx.network_id);
    IF v_result.is_duplicate IS NOT TRUE THEN
        PERFORM private.append_staff_audit('CASHIER_PAID_PLAYER', 'player', v_req.player_public_id, 'cashier_self',
            jsonb_build_object('transfer_id', v_result.transfer_id, 'payout_id', v_req.id, 'amount', v_req.amount,
                'currency', private.operational_display_currency(v_storage), 'player_public_id', v_req.player_public_id));
    END IF;
    RETURN jsonb_build_object('ok', true, 'is_duplicate', v_result.is_duplicate, 'transfer_id', v_result.transfer_id,
        'amount', v_req.amount, 'currency', private.operational_display_currency(v_storage),
        'cashier_balance_after', v_result.to_balance_after, 'player_balance_after', v_result.player_balance_after,
        'player_public_id', v_req.player_public_id, 'payout_id', v_req.id, 'status', 'paid');
END;
$fn$;


CREATE OR REPLACE FUNCTION public.cashier_lookup_player_payout(p_code TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_code TEXT;
    v_req private.cashier_player_payout_requests%ROWTYPE;
    v_status TEXT;
    v_review TEXT;
BEGIN
    PERFORM 1 FROM private.get_current_cashier_context() AS c;
    v_code := lower(NULLIF(BTRIM(COALESCE(p_code, '')), ''));
    IF v_code IS NULL OR v_code !~ '^[0-9a-f]{16}$' THEN RAISE EXCEPTION 'PAYOUT_CODE_INVALID'; END IF;
    SELECT r.* INTO v_req FROM private.cashier_player_payout_requests AS r
    WHERE r.secret_code = v_code
    ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'PAYOUT_NOT_FOUND'; END IF;
    v_status := v_req.status;
    IF v_status = 'pending' AND v_req.expires_at <= pg_catalog.now() THEN v_status := 'expired'; END IF;
    SELECT r.review_status INTO v_review FROM private.withdrawal_attribution_reviews AS r WHERE r.cash_payout_id = v_req.id;
    IF private.fund_attribution_enforcement_enabled() AND (
        v_req.secret_code IS NULL OR v_review IN ('required', 'under_review', 'rejected')
    ) THEN
        v_status := 'unavailable';
    END IF;
    RETURN jsonb_build_object('ok', true, 'player_public_id', v_req.player_public_id, 'amount', v_req.amount,
        'currency', private.operational_display_currency(v_req.currency), 'status', v_status, 'expires_at', v_req.expires_at);
END;
$fn$;

REVOKE ALL ON FUNCTION public.cashier_confirm_player_payout(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cashier_confirm_player_payout(TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.cashier_lookup_player_payout(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cashier_lookup_player_payout(TEXT) TO authenticated;


-- ============================================================
-- 10. SECURITY / OWNER REVIEW RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION private.withdrawal_review_staff_json(
    p_row private.withdrawal_attribution_reviews,
    p_wd private.player_withdrawal_requests
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_dest RECORD;
    v_cashier TEXT;
    v_audit jsonb;
BEGIN
    SELECT d.city, d.label, d.public_token INTO v_dest
    FROM private.cashier_payout_destinations AS d WHERE d.id = p_row.payout_destination_id;
    SELECT c.full_name INTO v_cashier FROM public.cashiers AS c WHERE c.id = p_row.selected_legacy_cashier_id;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', a.id, 'actor_role', a.actor_role, 'previous_status', a.previous_status,
        'new_status', a.new_status, 'decision', a.decision, 'internal_reason', a.internal_reason,
        'created_at', a.created_at
    ) ORDER BY a.created_at), '[]'::jsonb)
    INTO v_audit FROM private.withdrawal_attribution_review_audit AS a WHERE a.review_id = p_row.id;
    RETURN jsonb_build_object(
        'id', p_row.id, 'withdrawal_id', p_row.withdrawal_id, 'player_public_id', p_wd.player_public_id,
        'amount', p_row.requested_amount,
        'currency', COALESCE(private.wallet_display_currency(p_row.currency), 'TMT'),
        'status', p_row.review_status,
        'selected_cashier', jsonb_build_object(
            'legacy_cashier_id', p_row.selected_legacy_cashier_id, 'display_name', v_cashier,
            'city', v_dest.city, 'label', v_dest.label, 'destination_token', v_dest.public_token
        ),
        'selected_cashier_amount', p_row.selected_cashier_amount,
        'cross_cashier_amount', p_row.cross_cashier_amount,
        'attribution_snapshot', p_row.attribution_snapshot,
        'signals', p_row.signal_details,
        'created_at', p_row.created_at, 'started_at', p_row.started_at, 'decided_at', p_row.decided_at,
        'decided_role', p_row.decided_role, 'decision_reason', p_row.decision_reason,
        'audit', COALESCE(v_audit, '[]'::jsonb)
    );
END;
$fn$;

REVOKE ALL ON FUNCTION private.withdrawal_review_staff_json(private.withdrawal_attribution_reviews, private.player_withdrawal_requests) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.withdrawal_review_staff_json(private.withdrawal_attribution_reviews, private.player_withdrawal_requests) TO service_role;


CREATE OR REPLACE FUNCTION private.withdrawal_review_summary()
RETURNS jsonb
LANGUAGE sql STABLE SET search_path = ''
AS $fn$
    SELECT jsonb_build_object(
        'ok', true,
        'new', COUNT(*) FILTER (WHERE r.review_status = 'required'),
        'under_review', COUNT(*) FILTER (WHERE r.review_status = 'under_review'),
        'active', COUNT(*) FILTER (WHERE r.review_status IN ('required', 'under_review'))
    )
    FROM private.withdrawal_attribution_reviews AS r;
$fn$;
REVOKE ALL ON FUNCTION private.withdrawal_review_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.withdrawal_review_summary() TO service_role;


CREATE OR REPLACE FUNCTION private.withdrawal_review_list(p_status TEXT, p_limit INTEGER, p_offset INTEGER)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path = ''
AS $fn$
DECLARE
    v_status TEXT;
    v_limit INTEGER;
    v_offset INTEGER;
    v_rows jsonb;
    v_total INTEGER;
BEGIN
    v_status := NULLIF(BTRIM(COALESCE(p_status, '')), '');
    IF v_status IS NOT NULL AND v_status NOT IN ('required', 'under_review', 'approved', 'rejected') THEN
        RAISE EXCEPTION 'STATUS_INVALID';
    END IF;
    v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 0), 200);
    v_offset := GREATEST(COALESCE(p_offset, 0), 0);
    SELECT COUNT(*)::INTEGER INTO v_total FROM private.withdrawal_attribution_reviews AS r
    WHERE v_status IS NULL OR r.review_status = v_status;
    SELECT COALESCE(jsonb_agg(private.withdrawal_review_staff_json(r, w) ORDER BY r.created_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT r.* FROM private.withdrawal_attribution_reviews AS r
        WHERE v_status IS NULL OR r.review_status = v_status
        ORDER BY r.created_at DESC LIMIT v_limit OFFSET v_offset
    ) AS r
    INNER JOIN private.player_withdrawal_requests AS w ON w.id = r.withdrawal_id;
    RETURN jsonb_build_object('ok', true, 'rows', COALESCE(v_rows, '[]'::jsonb), 'total', v_total);
END;
$fn$;
REVOKE ALL ON FUNCTION private.withdrawal_review_list(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.withdrawal_review_list(TEXT, INTEGER, INTEGER) TO service_role;


CREATE OR REPLACE FUNCTION private.withdrawal_review_get(p_review_id UUID)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path = ''
AS $fn$
DECLARE
    v_row private.withdrawal_attribution_reviews%ROWTYPE;
    v_wd private.player_withdrawal_requests%ROWTYPE;
BEGIN
    IF p_review_id IS NULL THEN RAISE EXCEPTION 'REVIEW_NOT_FOUND'; END IF;
    SELECT r.* INTO v_row FROM private.withdrawal_attribution_reviews AS r WHERE r.id = p_review_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'REVIEW_NOT_FOUND'; END IF;
    SELECT w.* INTO v_wd FROM private.player_withdrawal_requests AS w WHERE w.id = v_row.withdrawal_id;
    RETURN jsonb_build_object('ok', true) || private.withdrawal_review_staff_json(v_row, v_wd);
END;
$fn$;
REVOKE ALL ON FUNCTION private.withdrawal_review_get(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.withdrawal_review_get(UUID) TO service_role;


CREATE OR REPLACE FUNCTION private.withdrawal_review_start(p_review_id UUID, p_actor_role TEXT, p_actor_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path = ''
AS $fn$
DECLARE
    v_row private.withdrawal_attribution_reviews%ROWTYPE;
    v_wd private.player_withdrawal_requests%ROWTYPE;
    v_prev TEXT;
BEGIN
    IF p_actor_role NOT IN ('security', 'owner') THEN RAISE EXCEPTION 'SECURITY_REQUIRED'; END IF;
    SELECT r.* INTO v_row FROM private.withdrawal_attribution_reviews AS r WHERE r.id = p_review_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'REVIEW_NOT_FOUND'; END IF;
    v_prev := v_row.review_status;
    IF v_row.review_status IN ('approved', 'rejected') THEN RAISE EXCEPTION 'REVIEW_NOT_PENDING'; END IF;
    IF v_row.review_status IS DISTINCT FROM 'under_review' THEN
        UPDATE private.withdrawal_attribution_reviews
        SET review_status = 'under_review', started_at = COALESCE(started_at, pg_catalog.now()), version = version + 1
        WHERE id = p_review_id RETURNING * INTO v_row;
        PERFORM private.withdrawal_review_append_audit(v_row.id, v_row.withdrawal_id, p_actor_role, p_actor_user_id, v_prev, 'under_review', 'start', NULL);
    END IF;
    SELECT w.* INTO v_wd FROM private.player_withdrawal_requests AS w WHERE w.id = v_row.withdrawal_id;
    RETURN jsonb_build_object('ok', true) || private.withdrawal_review_staff_json(v_row, v_wd);
END;
$fn$;
REVOKE ALL ON FUNCTION private.withdrawal_review_start(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.withdrawal_review_start(UUID, TEXT, UUID) TO service_role;


CREATE OR REPLACE FUNCTION private.withdrawal_review_decide(
    p_review_id UUID, p_decision TEXT, p_reason TEXT, p_idempotency_key TEXT, p_actor_role TEXT, p_actor_user_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path = ''
AS $fn$
DECLARE
    v_row private.withdrawal_attribution_reviews%ROWTYPE;
    v_wd private.player_withdrawal_requests%ROWTYPE;
    v_payout private.cashier_player_payout_requests%ROWTYPE;
    v_decision TEXT;
    v_reason TEXT;
    v_key TEXT;
    v_prev TEXT;
    v_notice TEXT;
BEGIN
    IF p_actor_role NOT IN ('security', 'owner') THEN RAISE EXCEPTION 'SECURITY_REQUIRED'; END IF;
    v_decision := lower(NULLIF(BTRIM(COALESCE(p_decision, '')), ''));
    IF v_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'REVIEW_DECISION_INVALID'; END IF;
    v_reason := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
    IF v_reason IS NULL THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
    IF char_length(v_reason) > 500 THEN RAISE EXCEPTION 'REASON_TOO_LONG'; END IF;
    v_key := private.owner_require_idempotency_key(p_idempotency_key);

    SELECT r.* INTO v_row FROM private.withdrawal_attribution_reviews AS r WHERE r.id = p_review_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'REVIEW_NOT_FOUND'; END IF;
    SELECT w.* INTO v_wd FROM private.player_withdrawal_requests AS w WHERE w.id = v_row.withdrawal_id FOR UPDATE;
    IF v_wd.cash_payout_id IS NOT NULL THEN
        SELECT p.* INTO v_payout FROM private.cashier_player_payout_requests AS p WHERE p.id = v_wd.cash_payout_id FOR UPDATE;
    END IF;
    IF v_row.review_status = 'approved' AND v_decision = 'approve' THEN
        RETURN jsonb_build_object('ok', true, 'is_duplicate', true) || private.withdrawal_review_staff_json(v_row, v_wd);
    END IF;
    IF v_row.review_status = 'rejected' AND v_decision = 'reject' THEN
        RETURN jsonb_build_object('ok', true, 'is_duplicate', true) || private.withdrawal_review_staff_json(v_row, v_wd);
    END IF;
    IF v_row.review_status IN ('approved', 'rejected') THEN RAISE EXCEPTION 'REVIEW_NOT_PENDING'; END IF;
    v_prev := v_row.review_status;

    IF v_decision = 'approve' THEN
        UPDATE private.withdrawal_attribution_reviews
        SET review_status = 'approved', decided_at = pg_catalog.now(), decided_by = p_actor_user_id,
            decided_role = p_actor_role, decision_reason = v_reason, version = version + 1
        WHERE id = p_review_id RETURNING * INTO v_row;
        IF v_payout.id IS NOT NULL AND v_payout.secret_code IS NULL AND v_payout.status = 'pending' THEN
            PERFORM private.issue_cashier_payout_code(v_payout.id);
        END IF;
        UPDATE private.player_withdrawal_requests SET player_notice_code = NULL WHERE id = v_wd.id RETURNING * INTO v_wd;
        PERFORM private.withdrawal_review_append_audit(v_row.id, v_wd.id, p_actor_role, p_actor_user_id, v_prev, 'approved', 'approve', v_reason);
    ELSE
        v_notice := private.player_cashier_proportion_reject_notice();
        IF v_payout.status = 'pending' THEN
            PERFORM private.release_cashier_player_payout_hold(v_payout, 'cancelled', p_actor_role, p_actor_user_id::TEXT);
        END IF;
        UPDATE private.player_withdrawal_requests
        SET status = 'rejected', rejected_at = pg_catalog.now(), rejected_by_staff_auth_id = p_actor_user_id,
            rejection_reason = v_notice, player_notice_code = 'rejected_cashier_proportion', reject_idempotency_key = v_key
        WHERE id = v_wd.id RETURNING * INTO v_wd;
        UPDATE private.withdrawal_attribution_reviews
        SET review_status = 'rejected', decided_at = pg_catalog.now(), decided_by = p_actor_user_id,
            decided_role = p_actor_role, decision_reason = v_reason, version = version + 1
        WHERE id = p_review_id RETURNING * INTO v_row;
        PERFORM private.withdrawal_review_append_audit(v_row.id, v_wd.id, p_actor_role, p_actor_user_id, v_prev, 'rejected', 'reject', v_reason);
    END IF;
    RETURN jsonb_build_object('ok', true, 'is_duplicate', false) || private.withdrawal_review_staff_json(v_row, v_wd);
END;
$fn$;
REVOKE ALL ON FUNCTION private.withdrawal_review_decide(UUID, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.withdrawal_review_decide(UUID, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;


CREATE OR REPLACE FUNCTION public.security_withdrawal_review_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$ BEGIN PERFORM private.get_current_security_context(); RETURN private.withdrawal_review_summary(); END; $fn$;
CREATE OR REPLACE FUNCTION public.security_list_withdrawal_reviews(p_status TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$ BEGIN PERFORM private.get_current_security_context(); RETURN private.withdrawal_review_list(p_status, p_limit, p_offset); END; $fn$;
CREATE OR REPLACE FUNCTION public.security_get_withdrawal_review(p_review_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$ BEGIN PERFORM private.get_current_security_context(); RETURN private.withdrawal_review_get(p_review_id); END; $fn$;
CREATE OR REPLACE FUNCTION public.security_start_withdrawal_review(p_review_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$ DECLARE v_ctx RECORD; BEGIN
    SELECT s.auth_user_id INTO v_ctx FROM private.get_current_security_context() AS s;
    RETURN private.withdrawal_review_start(p_review_id, 'security', v_ctx.auth_user_id);
END; $fn$;
CREATE OR REPLACE FUNCTION public.security_approve_withdrawal_review(p_review_id UUID, p_reason TEXT, p_idempotency_key TEXT)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$ DECLARE v_ctx RECORD; BEGIN
    SELECT s.auth_user_id INTO v_ctx FROM private.get_current_security_context() AS s;
    RETURN private.withdrawal_review_decide(p_review_id, 'approve', p_reason, p_idempotency_key, 'security', v_ctx.auth_user_id);
END; $fn$;
CREATE OR REPLACE FUNCTION public.security_reject_withdrawal_review(p_review_id UUID, p_reason TEXT, p_idempotency_key TEXT)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$ DECLARE v_ctx RECORD; BEGIN
    SELECT s.auth_user_id INTO v_ctx FROM private.get_current_security_context() AS s;
    RETURN private.withdrawal_review_decide(p_review_id, 'reject', p_reason, p_idempotency_key, 'security', v_ctx.auth_user_id);
END; $fn$;

CREATE OR REPLACE FUNCTION public.owner_withdrawal_review_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$ BEGIN PERFORM private.get_current_owner_context(); RETURN private.withdrawal_review_summary(); END; $fn$;
CREATE OR REPLACE FUNCTION public.owner_list_withdrawal_reviews(p_status TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$ BEGIN PERFORM private.get_current_owner_context(); RETURN private.withdrawal_review_list(p_status, p_limit, p_offset); END; $fn$;
CREATE OR REPLACE FUNCTION public.owner_get_withdrawal_review(p_review_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$ BEGIN PERFORM private.get_current_owner_context(); RETURN private.withdrawal_review_get(p_review_id); END; $fn$;
CREATE OR REPLACE FUNCTION public.owner_start_withdrawal_review(p_review_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$ DECLARE v_ctx RECORD; BEGIN
    SELECT o.auth_user_id INTO v_ctx FROM private.get_current_owner_context() AS o;
    RETURN private.withdrawal_review_start(p_review_id, 'owner', v_ctx.auth_user_id);
END; $fn$;
CREATE OR REPLACE FUNCTION public.owner_approve_withdrawal_review(p_review_id UUID, p_reason TEXT, p_idempotency_key TEXT)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$ DECLARE v_ctx RECORD; BEGIN
    SELECT o.auth_user_id INTO v_ctx FROM private.get_current_owner_context() AS o;
    RETURN private.withdrawal_review_decide(p_review_id, 'approve', p_reason, p_idempotency_key, 'owner', v_ctx.auth_user_id);
END; $fn$;
CREATE OR REPLACE FUNCTION public.owner_reject_withdrawal_review(p_review_id UUID, p_reason TEXT, p_idempotency_key TEXT)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$ DECLARE v_ctx RECORD; BEGIN
    SELECT o.auth_user_id INTO v_ctx FROM private.get_current_owner_context() AS o;
    RETURN private.withdrawal_review_decide(p_review_id, 'reject', p_reason, p_idempotency_key, 'owner', v_ctx.auth_user_id);
END; $fn$;


CREATE OR REPLACE FUNCTION private.fund_attribution_reconciliation(p_limit INTEGER DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path = ''
AS $fn$
DECLARE v_limit INTEGER; v_rows jsonb;
BEGIN
    v_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 0), 200);
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'wallet_id', a.wallet_id, 'currency', a.currency,
        'wallet_available', a.available_balance, 'wallet_locked', a.locked_balance,
        'attribution_available_minor', COALESCE(x.avail, 0),
        'attribution_reserved_minor', COALESCE(x.reserved, 0),
        'state', COALESCE(s.state, 'not_initialized')
    ) ORDER BY a.wallet_id), '[]'::jsonb)
    INTO v_rows
    FROM private.wallet_accounts AS a
    LEFT JOIN private.player_fund_attribution_state AS s ON s.wallet_id = a.wallet_id AND s.currency = a.currency
    LEFT JOIN LATERAL (
        SELECT SUM(b.available_minor) AS avail, SUM(b.reserved_minor) AS reserved
        FROM private.player_fund_attribution AS b
        WHERE b.wallet_id = a.wallet_id AND b.currency = a.currency
    ) AS x ON TRUE
    WHERE COALESCE(s.state, 'not_initialized') IN ('inconsistent', 'not_initialized')
       OR COALESCE(x.avail, 0) IS DISTINCT FROM private.currency_amount_to_minor(COALESCE(private.wallet_display_currency(a.currency), 'TMT'), a.available_balance)
       OR COALESCE(x.reserved, 0) IS DISTINCT FROM private.currency_amount_to_minor(COALESCE(private.wallet_display_currency(a.currency), 'TMT'), a.locked_balance)
    LIMIT v_limit;
    RETURN jsonb_build_object('ok', true, 'rows', COALESCE(v_rows, '[]'::jsonb));
END;
$fn$;
REVOKE ALL ON FUNCTION private.fund_attribution_reconciliation(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.fund_attribution_reconciliation(INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.owner_fund_attribution_reconciliation(p_limit INTEGER DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$ BEGIN PERFORM private.get_current_owner_context(); RETURN private.fund_attribution_reconciliation(p_limit); END; $fn$;
CREATE OR REPLACE FUNCTION public.security_fund_attribution_reconciliation(p_limit INTEGER DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$ BEGIN PERFORM private.get_current_security_context(); RETURN private.fund_attribution_reconciliation(p_limit); END; $fn$;

REVOKE ALL ON FUNCTION public.security_withdrawal_review_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_withdrawal_review_summary() TO authenticated;
REVOKE ALL ON FUNCTION public.security_list_withdrawal_reviews(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_list_withdrawal_reviews(TEXT, INTEGER, INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.security_get_withdrawal_review(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_get_withdrawal_review(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.security_start_withdrawal_review(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_start_withdrawal_review(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.security_approve_withdrawal_review(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_approve_withdrawal_review(UUID, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.security_reject_withdrawal_review(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_reject_withdrawal_review(UUID, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.owner_withdrawal_review_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_withdrawal_review_summary() TO authenticated;
REVOKE ALL ON FUNCTION public.owner_list_withdrawal_reviews(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_list_withdrawal_reviews(TEXT, INTEGER, INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.owner_get_withdrawal_review(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_get_withdrawal_review(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.owner_start_withdrawal_review(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_start_withdrawal_review(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.owner_approve_withdrawal_review(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_approve_withdrawal_review(UUID, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.owner_reject_withdrawal_review(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_reject_withdrawal_review(UUID, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.owner_fund_attribution_reconciliation(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_fund_attribution_reconciliation(INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.security_fund_attribution_reconciliation(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_fund_attribution_reconciliation(INTEGER) TO authenticated;

COMMENT ON TABLE private.player_fund_attribution IS
'INTERNAL money-lineage projection. Not a second player balance. Wallet Ledger remains canonical.';
COMMENT ON FUNCTION public.security_approve_withdrawal_review(UUID, TEXT, TEXT) IS
'Security may authorize a reviewed cash withdrawal. Does not complete payout or move money.';

COMMIT;

