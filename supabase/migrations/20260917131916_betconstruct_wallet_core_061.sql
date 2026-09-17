BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 061
-- BETCONSTRUCT WALLET CORE — OFFLINE / FAIL-CLOSED FOUNDATION
-- Sequence: after 060 (owned games math hardening).
--
-- Repository only. DO NOT APPLY from this change.
-- Schema/functions/indexes only.
-- MUST NOT: change player/treasury balances, insert Wallet Ledger
-- money rows, seed provider transactions, seed players, enable
-- BetConstruct, or store SharedKeys.
--
-- Wallet Ledger (private.apply_wallet_entry) remains player-money truth.
-- Provider Ledger remains GGR/accounting only and never moves money.
--
-- Provider ledger 046 uniqueness UNIQUE(provider_key, external_transaction_id)
-- is preserved. Dual-leg casino WithdrawAndDeposit and sports result
-- corrections use economic-leg suffixes on provider_ledger.external_transaction_id:
--   {canonicalId}:bet | {canonicalId}:win | {canonicalId}:payout | {canonicalId}:rollback
-- Canonical BetConstruct transaction ids live in private.betconstruct_transactions.
-- ============================================================


CREATE SEQUENCE IF NOT EXISTS private.betconstruct_platform_transaction_id_seq
    AS BIGINT
    INCREMENT BY 1
    MINVALUE 1
    NO MAXVALUE
    START WITH 1
    NO CYCLE;

COMMENT ON SEQUENCE private.betconstruct_platform_transaction_id_seq IS
'Stable Int64 platform transaction ids for BetConstruct casino responses. Never a UUID. Values are not reused.';


CREATE TABLE IF NOT EXISTS private.betconstruct_session_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product TEXT NOT NULL,
    token_digest TEXT NOT NULL,
    player_auth_user_id UUID NOT NULL,
    player_public_id TEXT NOT NULL,
    wallet_id UUID NOT NULL REFERENCES private.wallet_accounts(wallet_id) ON DELETE RESTRICT,
    display_currency TEXT NOT NULL,
    provider_player_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT betconstruct_session_product_check
        CHECK (product IN ('sportsbook', 'casino')),
    CONSTRAINT betconstruct_session_digest_check
        CHECK (char_length(token_digest) = 64 AND token_digest ~ '^[0-9a-f]+$'),
    CONSTRAINT betconstruct_session_public_id_check
        CHECK (player_public_id ~ '^[0-9]{6}$'),
    CONSTRAINT betconstruct_session_currency_check
        CHECK (display_currency ~ '^[A-Z]{3}$'),
    CONSTRAINT betconstruct_session_token_digest_uidx
        UNIQUE (token_digest)
);

COMMENT ON TABLE private.betconstruct_session_bindings IS
'Opaque AuthToken digest -> immutable player/wallet/currency binding. Raw token is never stored. Expired rows remain for settlement lookup and are not deleted.';

COMMENT ON COLUMN private.betconstruct_session_bindings.token_digest IS
'SHA-256 hex digest of the raw AuthToken. Incoming tokens are hashed then looked up. Never persist the raw token.';

COMMENT ON COLUMN private.betconstruct_session_bindings.display_currency IS
'Provider/display currency bound at launch. TMT maps to wallet storage TMTM. Immutable; a currency switch creates a new binding.';

CREATE INDEX IF NOT EXISTS betconstruct_session_player_idx
    ON private.betconstruct_session_bindings (player_auth_user_id, product, created_at DESC);

CREATE INDEX IF NOT EXISTS betconstruct_session_wallet_idx
    ON private.betconstruct_session_bindings (wallet_id);

CREATE UNIQUE INDEX IF NOT EXISTS betconstruct_session_casino_player_uidx
    ON private.betconstruct_session_bindings (provider_player_id)
    WHERE product = 'casino' AND provider_player_id IS NOT NULL AND revoked_at IS NULL;


CREATE TABLE IF NOT EXISTS private.betconstruct_sports_bets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bet_id BIGINT NOT NULL,
    player_auth_user_id UUID NOT NULL,
    player_public_id TEXT NOT NULL,
    wallet_id UUID NOT NULL REFERENCES private.wallet_accounts(wallet_id) ON DELETE RESTRICT,
    display_currency TEXT NOT NULL,
    stake NUMERIC(20, 2) NOT NULL,
    placed_transaction_id TEXT NOT NULL,
    latest_result_amount NUMERIC(20, 2) NOT NULL DEFAULT 0,
    latest_result_state TEXT,
    latest_result_transaction_id TEXT,
    rolled_back_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT betconstruct_sports_bets_public_id_check
        CHECK (player_public_id ~ '^[0-9]{6}$'),
    CONSTRAINT betconstruct_sports_bets_currency_check
        CHECK (display_currency ~ '^[A-Z]{3}$'),
    CONSTRAINT betconstruct_sports_bets_stake_check
        CHECK (stake > 0 AND stake = ROUND(stake, 2)),
    CONSTRAINT betconstruct_sports_bets_result_amount_check
        CHECK (latest_result_amount >= 0 AND latest_result_amount = ROUND(latest_result_amount, 2)),
    CONSTRAINT betconstruct_sports_bets_bet_id_uidx
        UNIQUE (bet_id),
    CONSTRAINT betconstruct_sports_bets_placed_tx_uidx
        UNIQUE (placed_transaction_id)
);

COMMENT ON TABLE private.betconstruct_sports_bets IS
'Canonical BetConstruct sportsbook bets. Settlement always uses this original wallet/currency, never the player''s later active wallet. latest_result_amount is the last final Amount from BetResulted (not a delta).';

CREATE INDEX IF NOT EXISTS betconstruct_sports_bets_player_idx
    ON private.betconstruct_sports_bets (player_auth_user_id, created_at DESC);


CREATE TABLE IF NOT EXISTS private.betconstruct_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product TEXT NOT NULL,
    method TEXT NOT NULL,
    external_transaction_id TEXT,
    related_transaction_id TEXT,
    bet_id BIGINT,
    provider_player_id INTEGER,
    player_auth_user_id UUID NOT NULL,
    wallet_id UUID NOT NULL REFERENCES private.wallet_accounts(wallet_id) ON DELETE RESTRICT,
    display_currency TEXT NOT NULL,
    amount NUMERIC(20, 2) NOT NULL DEFAULT 0,
    request_fingerprint TEXT NOT NULL,
    platform_transaction_id BIGINT,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    processed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT betconstruct_tx_product_check
        CHECK (product IN ('sportsbook', 'casino')),
    CONSTRAINT betconstruct_tx_currency_check
        CHECK (display_currency ~ '^[A-Z]{3}$'),
    CONSTRAINT betconstruct_tx_amount_scale_check
        CHECK (amount = ROUND(amount, 2)),
    CONSTRAINT betconstruct_tx_status_check
        CHECK (status IN ('accepted', 'conflict', 'rolled_back', 'ignored')),
    CONSTRAINT betconstruct_tx_platform_id_positive
        CHECK (platform_transaction_id IS NULL OR platform_transaction_id > 0)
);

COMMENT ON TABLE private.betconstruct_transactions IS
'BetConstruct financial idempotency for sportsbook and casino. Duplicate exact fingerprints replay. Conflicting payload for the same financial id never moves money again. platform_transaction_id is a stable Int64 for casino.';

CREATE UNIQUE INDEX IF NOT EXISTS betconstruct_tx_financial_uidx
    ON private.betconstruct_transactions (product, method, external_transaction_id)
    WHERE external_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS betconstruct_tx_platform_uidx
    ON private.betconstruct_transactions (platform_transaction_id)
    WHERE platform_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS betconstruct_tx_related_idx
    ON private.betconstruct_transactions (product, related_transaction_id)
    WHERE related_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS betconstruct_tx_wallet_idx
    ON private.betconstruct_transactions (wallet_id, created_at DESC);


CREATE TABLE IF NOT EXISTS private.betconstruct_callback_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product TEXT NOT NULL,
    method TEXT NOT NULL,
    external_transaction_id TEXT,
    provider_bet_id BIGINT,
    payload_hash TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    processing_status TEXT NOT NULL,
    response_code TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    processed_at TIMESTAMPTZ,
    sanitized_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT betconstruct_callback_product_check
        CHECK (product IN ('sportsbook', 'casino')),
    CONSTRAINT betconstruct_callback_hash_check
        CHECK (char_length(payload_hash) = 64 AND payload_hash ~ '^[0-9a-f]+$'),
    CONSTRAINT betconstruct_callback_status_check
        CHECK (processing_status IN ('received', 'accepted', 'rejected', 'ignored', 'conflict'))
);

COMMENT ON TABLE private.betconstruct_callback_events IS
'Append-only sanitized BetConstruct callback inbox. Never stores SharedKey, passwords, service-role keys, raw AuthTokens, or signatures.';

CREATE INDEX IF NOT EXISTS betconstruct_callback_received_idx
    ON private.betconstruct_callback_events (product, method, received_at DESC);

CREATE INDEX IF NOT EXISTS betconstruct_callback_tx_idx
    ON private.betconstruct_callback_events (external_transaction_id)
    WHERE external_transaction_id IS NOT NULL;


CREATE OR REPLACE FUNCTION private.betconstruct_token_digest(p_token TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
    SELECT encode(extensions.digest(convert_to(BTRIM(COALESCE(p_token, '')), 'UTF8'), 'sha256'), 'hex');
$fn$;

COMMENT ON FUNCTION private.betconstruct_token_digest(TEXT) IS
'SHA-256 hex digest of a raw AuthToken. The raw token is an argument only and must not be inserted into tables.';


CREATE OR REPLACE FUNCTION private.betconstruct_provider_player_id(p_public_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_id TEXT;
    v_num BIGINT;
BEGIN
    v_id := BTRIM(COALESCE(p_public_id, ''));
    IF v_id !~ '^[0-9]{6}$' THEN
        RAISE EXCEPTION 'BETCONSTRUCT_PLAYER_ID_INVALID';
    END IF;
    v_num := v_id::BIGINT;
    IF v_num < 0 OR v_num > 2147483647 THEN
        RAISE EXCEPTION 'BETCONSTRUCT_PLAYER_ID_INVALID';
    END IF;
    RETURN v_num::INTEGER;
END;
$fn$;

COMMENT ON FUNCTION private.betconstruct_provider_player_id(TEXT) IS
'Maps canonical 6-digit Nextpari public player id to BetConstruct Int32 PlayerId. Reverse lookup must pad back to 6 digits so 000006 and integer 6 stay unambiguous.';


CREATE OR REPLACE FUNCTION private.betconstruct_display_currency(p_code TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
    SELECT CASE pg_catalog.upper(BTRIM(COALESCE(p_code, '')))
        WHEN 'TMTM' THEN 'TMT'
        WHEN 'TMT' THEN 'TMT'
        WHEN 'USD' THEN 'USD'
        WHEN 'TRY' THEN 'TRY'
        WHEN 'UZS' THEN 'UZS'
        WHEN 'RUB' THEN 'RUB'
        WHEN 'KZT' THEN 'KZT'
        ELSE NULL
    END;
$fn$;


CREATE OR REPLACE FUNCTION private.betconstruct_next_platform_transaction_id()
RETURNS BIGINT
LANGUAGE sql
VOLATILE
SET search_path = ''
AS $fn$
    SELECT pg_catalog.nextval('private.betconstruct_platform_transaction_id_seq');
$fn$;


CREATE OR REPLACE FUNCTION private.betconstruct_sanitize_metadata(p_metadata JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_meta JSONB;
BEGIN
    v_meta := COALESCE(p_metadata, '{}'::jsonb);
    RETURN v_meta
        - 'Hash' - 'hash'
        - 'PublicKey' - 'publicKey' - 'public_key'
        - 'SharedKey' - 'sharedKey' - 'shared_key'
        - 'AuthToken' - 'authToken' - 'Token' - 'token'
        - 'password' - 'Password'
        - 'service_role' - 'serviceRoleKey'
        - 'signature' - 'Signature';
END;
$fn$;


-- Sole Wallet Ledger door for BetConstruct money. No direct balance UPDATE.
-- New-play debits (CASINO_BET) honor wallet block. Settlement credits/refunds
-- still apply so restricted/blocked players are not stranded.
CREATE OR REPLACE FUNCTION private.betconstruct_apply_wallet_entry(
    p_wallet_id UUID,
    p_signed_amount NUMERIC,
    p_operation TEXT,
    p_idempotency TEXT,
    p_ref_type TEXT,
    p_ref_id TEXT,
    p_actor TEXT,
    p_metadata JSONB,
    p_allow_blocked BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_status TEXT;
    v_amount NUMERIC(20, 2);
    v_op TEXT;
    v_key TEXT;
    v_ledger UUID;
BEGIN
    v_op := BTRIM(COALESCE(p_operation, ''));
    IF v_op NOT IN ('CASINO_BET', 'CASINO_WIN', 'CASINO_REFUND') THEN
        RAISE EXCEPTION 'BETCONSTRUCT_WALLET_OPERATION_INVALID';
    END IF;
    v_amount := ROUND(COALESCE(p_signed_amount, 0), 2);
    IF v_amount = 0 THEN
        RETURN NULL;
    END IF;
    IF v_op = 'CASINO_BET' AND v_amount >= 0 THEN
        RAISE EXCEPTION 'BETCONSTRUCT_WALLET_DEBIT_INVALID';
    END IF;
    IF v_op IN ('CASINO_WIN', 'CASINO_REFUND') AND v_amount <= 0 THEN
        RAISE EXCEPTION 'BETCONSTRUCT_WALLET_CREDIT_INVALID';
    END IF;
    v_key := NULLIF(BTRIM(COALESCE(p_idempotency, '')), '');
    IF v_key IS NULL THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
    END IF;

    SELECT a.status
    INTO v_status
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = p_wallet_id
    FOR UPDATE;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'WALLET_ACCOUNT_NOT_FOUND';
    END IF;
    IF v_status IS DISTINCT FROM 'active' AND p_allow_blocked IS NOT TRUE THEN
        IF v_status = 'blocked' THEN
            RAISE EXCEPTION 'WALLET_BLOCKED';
        END IF;
        IF v_status = 'closed' THEN
            RAISE EXCEPTION 'WALLET_CLOSED';
        END IF;
        RAISE EXCEPTION 'WALLET_BLOCKED';
    END IF;

    SELECT e.ledger_id
    INTO v_ledger
    FROM private.apply_wallet_entry(
        p_wallet_id,
        v_amount,
        0,
        v_op,
        'casino',
        v_key,
        COALESCE(NULLIF(BTRIM(p_ref_type), ''), 'betconstruct'),
        COALESCE(NULLIF(BTRIM(p_ref_id), ''), v_key),
        'system',
        COALESCE(NULLIF(BTRIM(p_actor), ''), 'betconstruct'),
        private.betconstruct_sanitize_metadata(p_metadata)
    ) AS e;

    RETURN v_ledger;
END;
$fn$;

COMMENT ON FUNCTION private.betconstruct_apply_wallet_entry(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN) IS
'BetConstruct adapter over canonical private.apply_wallet_entry. Never UPDATEs wallet balances directly. Provider ledger is not written here.';


REVOKE ALL ON SEQUENCE private.betconstruct_platform_transaction_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE private.betconstruct_platform_transaction_id_seq FROM anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE private.betconstruct_platform_transaction_id_seq TO service_role;

REVOKE ALL ON TABLE private.betconstruct_session_bindings FROM PUBLIC;
REVOKE ALL ON TABLE private.betconstruct_session_bindings FROM anon, authenticated;
REVOKE ALL ON TABLE private.betconstruct_sports_bets FROM PUBLIC;
REVOKE ALL ON TABLE private.betconstruct_sports_bets FROM anon, authenticated;
REVOKE ALL ON TABLE private.betconstruct_transactions FROM PUBLIC;
REVOKE ALL ON TABLE private.betconstruct_transactions FROM anon, authenticated;
REVOKE ALL ON TABLE private.betconstruct_callback_events FROM PUBLIC;
REVOKE ALL ON TABLE private.betconstruct_callback_events FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE private.betconstruct_session_bindings TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE private.betconstruct_sports_bets TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE private.betconstruct_transactions TO service_role;
GRANT SELECT, INSERT ON TABLE private.betconstruct_callback_events TO service_role;
REVOKE UPDATE, DELETE ON TABLE private.betconstruct_callback_events FROM service_role;
REVOKE DELETE ON TABLE private.betconstruct_session_bindings FROM service_role;
REVOKE DELETE ON TABLE private.betconstruct_sports_bets FROM service_role;
REVOKE DELETE ON TABLE private.betconstruct_transactions FROM service_role;

REVOKE ALL ON FUNCTION private.betconstruct_token_digest(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.betconstruct_token_digest(TEXT) TO service_role;

REVOKE ALL ON FUNCTION private.betconstruct_provider_player_id(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.betconstruct_provider_player_id(TEXT) TO service_role;

REVOKE ALL ON FUNCTION private.betconstruct_display_currency(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.betconstruct_display_currency(TEXT) TO service_role;

REVOKE ALL ON FUNCTION private.betconstruct_next_platform_transaction_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.betconstruct_next_platform_transaction_id() TO service_role;

REVOKE ALL ON FUNCTION private.betconstruct_sanitize_metadata(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.betconstruct_sanitize_metadata(JSONB) TO service_role;

REVOKE ALL ON FUNCTION private.betconstruct_apply_wallet_entry(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.betconstruct_apply_wallet_entry(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN) TO service_role;

COMMIT;
