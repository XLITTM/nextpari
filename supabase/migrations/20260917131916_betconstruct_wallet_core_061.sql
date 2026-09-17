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
-- Provider Ledger remains GGR/accounting only and never moves player money.
--
-- Production money movement for one provider financial request is
-- public.betconstruct_apply_financial (service_role only). That single
-- PostgreSQL function/transaction commits or rolls back together:
--   idempotency state, BetConstruct transaction row, sports bet state,
--   Wallet Ledger entry/entries, Provider Ledger entry/entries.
-- Node remains responsible for signature, timestamp, request shape,
-- and provider error mapping. The browser has no financial authority.
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
    token_kind TEXT NOT NULL,
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
    CONSTRAINT betconstruct_session_token_kind_check
        CHECK (token_kind IN ('launch', 'session')),
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
'Opaque token digest -> immutable player/wallet/currency binding. token_kind is launch or session. Raw token is never stored. Session uniqueness is token identity, not PlayerId. Expired rows remain for settlement lookup and are not deleted or currency-mutated.';

COMMENT ON COLUMN private.betconstruct_session_bindings.token_digest IS
'SHA-256 hex digest of the exact raw token bytes. Incoming tokens are hashed then looked up. Never persist the raw token.';

COMMENT ON COLUMN private.betconstruct_session_bindings.token_kind IS
'launch = iframe AuthToken. session = Operator-issued casino Authentication token. Distinct values; a currency switch inserts a new row and never mutates an old binding.';

COMMENT ON COLUMN private.betconstruct_session_bindings.display_currency IS
'Provider/display currency bound at launch/session issue. TMT maps to wallet storage TMTM. Immutable.';

CREATE INDEX IF NOT EXISTS betconstruct_session_player_idx
    ON private.betconstruct_session_bindings (player_auth_user_id, product, created_at DESC);

CREATE INDEX IF NOT EXISTS betconstruct_session_wallet_idx
    ON private.betconstruct_session_bindings (wallet_id);

CREATE INDEX IF NOT EXISTS betconstruct_session_casino_player_idx
    ON private.betconstruct_session_bindings (provider_player_id)
    WHERE product = 'casino' AND provider_player_id IS NOT NULL;


CREATE TABLE IF NOT EXISTS private.betconstruct_sports_bets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bet_id BIGINT NOT NULL,
    player_auth_user_id UUID NOT NULL,
    player_public_id TEXT NOT NULL,
    wallet_id UUID NOT NULL REFERENCES private.wallet_accounts(wallet_id) ON DELETE RESTRICT,
    display_currency TEXT NOT NULL,
    stake NUMERIC NOT NULL,
    placed_transaction_id TEXT NOT NULL,
    latest_result_amount NUMERIC NOT NULL DEFAULT 0,
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
        CHECK (stake > 0),
    CONSTRAINT betconstruct_sports_bets_result_amount_check
        CHECK (latest_result_amount >= 0),
    CONSTRAINT betconstruct_sports_bets_bet_id_uidx
        UNIQUE (bet_id),
    CONSTRAINT betconstruct_sports_bets_placed_tx_uidx
        UNIQUE (placed_transaction_id)
);

COMMENT ON TABLE private.betconstruct_sports_bets IS
'Canonical BetConstruct sportsbook bets. Settlement always uses this original wallet/currency, never the player''s later active wallet. latest_result_amount is the last final Amount from BetResulted (not a delta). Amount scale is validated per display currency before insert; never silently rounded.';

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
    amount NUMERIC NOT NULL DEFAULT 0,
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
    CONSTRAINT betconstruct_tx_status_check
        CHECK (status IN ('accepted', 'conflict', 'rolled_back', 'ignored')),
    CONSTRAINT betconstruct_tx_platform_id_positive
        CHECK (platform_transaction_id IS NULL OR platform_transaction_id > 0)
);

COMMENT ON TABLE private.betconstruct_transactions IS
'BetConstruct financial idempotency for sportsbook and casino. Duplicate exact fingerprints replay. Conflicting payload for the same financial id never moves money again. Casino RGS ids are unique across Withdraw/Deposit/WithdrawAndDeposit; Rollback may reuse the original id. platform_transaction_id is a stable Int64 for casino.';

CREATE UNIQUE INDEX IF NOT EXISTS betconstruct_tx_financial_uidx
    ON private.betconstruct_transactions (product, method, external_transaction_id)
    WHERE external_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS betconstruct_tx_casino_rgs_uidx
    ON private.betconstruct_transactions (product, external_transaction_id)
    WHERE product = 'casino'
      AND method IN ('Withdraw', 'Deposit', 'WithdrawAndDeposit')
      AND external_transaction_id IS NOT NULL;

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
'Append-only sanitized BetConstruct callback inbox. Never stores SharedKey, passwords, service-role keys, raw AuthTokens, session tokens, or signatures.';

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
    SELECT encode(extensions.digest(convert_to(COALESCE(p_token, ''), 'UTF8'), 'sha256'), 'hex');
$fn$;

COMMENT ON FUNCTION private.betconstruct_token_digest(TEXT) IS
'SHA-256 hex digest of the exact raw token UTF-8 bytes. No trim, no case fold, no transformation. The raw token is an argument only and must not be inserted into tables.';


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


CREATE OR REPLACE FUNCTION private.betconstruct_parse_exact_amount(p_value JSONB)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_text TEXT;
BEGIN
    IF p_value IS NULL OR p_value = 'null'::jsonb THEN
        RAISE EXCEPTION 'AMOUNT_INVALID';
    END IF;
    v_text := p_value #>> '{}';
    IF v_text IS NULL OR v_text !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$' THEN
        RAISE EXCEPTION 'AMOUNT_INVALID';
    END IF;
    RETURN v_text::NUMERIC;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.betconstruct_parse_int64(p_value JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_text TEXT;
    v_kind TEXT;
BEGIN
    IF p_value IS NULL OR p_value = 'null'::jsonb THEN
        RAISE EXCEPTION 'TRANSACTION_ID_INVALID';
    END IF;
    v_kind := jsonb_typeof(p_value);
    v_text := p_value #>> '{}';
    IF v_kind NOT IN ('number', 'string') OR v_text IS NULL OR v_text !~ '^(0|[1-9][0-9]*)$' THEN
        RAISE EXCEPTION 'TRANSACTION_ID_INVALID';
    END IF;
    IF v_text::NUMERIC > 9223372036854775807 THEN
        RAISE EXCEPTION 'TRANSACTION_ID_INVALID';
    END IF;
    RETURN v_text;
END;
$fn$;

COMMENT ON FUNCTION private.betconstruct_parse_int64(JSONB) IS
'Canonical non-negative signed Int64 as a decimal string. Rejects fractions, scientific notation, and values above 9223372036854775807. Callers cast to BIGINT after validation.';


CREATE OR REPLACE FUNCTION private.betconstruct_require_amount_scale(
    p_display TEXT,
    p_amount NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
BEGIN
    IF p_amount IS NULL THEN
        RAISE EXCEPTION 'AMOUNT_INVALID';
    END IF;
    PERFORM private.require_currency_amount_scale(p_display, ABS(p_amount));
    RETURN p_amount;
END;
$fn$;


-- Sole Wallet Ledger door for BetConstruct money. No direct balance UPDATE.
-- New-play debits (CASINO_BET) honor wallet block. Settlement credits/refunds
-- still apply so restricted/blocked players are not stranded.
-- Provider amounts are validated at exact display scale. Never ROUND into validity.
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
    v_storage TEXT;
    v_display TEXT;
    v_amount NUMERIC;
    v_op TEXT;
    v_key TEXT;
    v_ledger UUID;
BEGIN
    v_op := BTRIM(COALESCE(p_operation, ''));
    IF v_op NOT IN ('CASINO_BET', 'CASINO_WIN', 'CASINO_REFUND') THEN
        RAISE EXCEPTION 'BETCONSTRUCT_WALLET_OPERATION_INVALID';
    END IF;
    v_amount := COALESCE(p_signed_amount, 0);
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

    SELECT a.status, a.currency
    INTO v_status, v_storage
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = p_wallet_id
    FOR UPDATE;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'WALLET_ACCOUNT_NOT_FOUND';
    END IF;
    v_display := private.betconstruct_display_currency(v_storage);
    IF v_display IS NULL THEN
        RAISE EXCEPTION 'CURRENCY_UNSUPPORTED';
    END IF;
    PERFORM private.require_currency_amount_scale(v_display, abs(v_amount));
    IF v_status IS DISTINCT FROM 'active' AND p_allow_blocked IS NOT TRUE THEN
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
'BetConstruct adapter over canonical private.apply_wallet_entry. Validates exact currency scale before ledger write. Never UPDATEs wallet balances directly. Never silently ROUNDs provider money. Provider ledger is not written here.';


CREATE OR REPLACE FUNCTION private.betconstruct_lock_financial(p_scope TEXT)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(COALESCE(p_scope, ''), 0)
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.betconstruct_session_by_digest(
    p_digest TEXT,
    p_product TEXT,
    p_token_kind TEXT,
    p_mode TEXT
)
RETURNS private.betconstruct_session_bindings
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_row private.betconstruct_session_bindings%ROWTYPE;
BEGIN
    SELECT s.*
    INTO v_row
    FROM private.betconstruct_session_bindings AS s
    WHERE s.token_digest = p_digest
    FOR UPDATE;
    IF NOT FOUND
       OR v_row.product IS DISTINCT FROM p_product
       OR v_row.token_kind IS DISTINCT FROM p_token_kind
       OR v_row.revoked_at IS NOT NULL THEN
        IF p_product = 'casino' THEN
            RAISE EXCEPTION 'INVALID_TOKEN';
        END IF;
        RAISE EXCEPTION 'TOKEN_INVALID';
    END IF;
    IF p_mode = 'new_play' AND pg_catalog.now() >= v_row.expires_at THEN
        IF p_product = 'casino' THEN
            RAISE EXCEPTION 'INVALID_TOKEN';
        END IF;
        RAISE EXCEPTION 'TOKEN_EXPIRED';
    END IF;
    RETURN v_row;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.betconstruct_sports_bet_placed(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_binding private.betconstruct_session_bindings%ROWTYPE;
    v_existing private.betconstruct_transactions%ROWTYPE;
    v_tx TEXT;
    v_bet_id BIGINT;
    v_amount NUMERIC;
    v_fp TEXT;
    v_balance NUMERIC;
BEGIN
    v_tx := private.betconstruct_parse_int64(p_payload -> 'transaction_id');
    v_bet_id := private.betconstruct_parse_int64(p_payload -> 'bet_id')::BIGINT;
    v_fp := NULLIF(p_payload ->> 'fingerprint', '');
    IF v_fp IS NULL THEN
        RAISE EXCEPTION 'TRANSACTION_ID_INVALID';
    END IF;
    PERFORM private.betconstruct_lock_financial('betconstruct:sportsbook:' || v_tx);
    v_binding := private.betconstruct_session_by_digest(
        p_payload ->> 'token_digest', 'sportsbook', 'launch', 'new_play'
    );
    v_amount := private.betconstruct_require_amount_scale(
        v_binding.display_currency,
        private.betconstruct_parse_exact_amount(p_payload -> 'amount')
    );
    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'AMOUNT_INVALID';
    END IF;
    SELECT t.*
    INTO v_existing
    FROM private.betconstruct_transactions AS t
    WHERE t.product = 'sportsbook' AND t.method = 'BetPlaced' AND t.external_transaction_id = v_tx
    FOR UPDATE;
    IF FOUND THEN
        IF v_existing.request_fingerprint IS DISTINCT FROM v_fp THEN
            RAISE EXCEPTION 'CONFLICT';
        END IF;
        RETURN jsonb_build_object(
            'ok', true,
            'replayed', true,
            'currency', v_binding.display_currency,
            'balance', private.game_current_balance(v_binding.wallet_id)
        );
    END IF;
    PERFORM private.betconstruct_apply_wallet_entry(
        v_binding.wallet_id, -v_amount, 'CASINO_BET', 'bc-sports-place:' || v_tx,
        'betconstruct', v_tx, 'betconstruct', jsonb_build_object('phase', 'BetPlaced'), FALSE
    );
    INSERT INTO private.betconstruct_sports_bets (
        bet_id, player_auth_user_id, player_public_id, wallet_id, display_currency,
        stake, placed_transaction_id, metadata
    ) VALUES (
        v_bet_id, v_binding.player_auth_user_id, v_binding.player_public_id, v_binding.wallet_id,
        v_binding.display_currency, v_amount, v_tx,
        private.betconstruct_sanitize_metadata(COALESCE(p_payload -> 'metadata', '{}'::jsonb))
    );
    INSERT INTO private.betconstruct_transactions (
        product, method, external_transaction_id, player_auth_user_id, wallet_id,
        display_currency, amount, request_fingerprint, status, processed_at, bet_id, metadata
    ) VALUES (
        'sportsbook', 'BetPlaced', v_tx, v_binding.player_auth_user_id, v_binding.wallet_id,
        v_binding.display_currency, v_amount, v_fp, 'accepted', pg_catalog.now(), v_bet_id,
        private.betconstruct_sanitize_metadata(COALESCE(p_payload -> 'metadata', '{}'::jsonb))
    );
    PERFORM private.ingest_provider_transaction(
        'betconstruct', 'sports', v_tx, NULL, 'stake', v_amount, v_binding.display_currency,
        COALESCE((p_payload ->> 'occurred_at')::TIMESTAMPTZ, pg_catalog.now()),
        jsonb_build_object('betId', v_bet_id)
    );
    v_balance := private.game_current_balance(v_binding.wallet_id);
    RETURN jsonb_build_object('ok', true, 'currency', v_binding.display_currency, 'balance', v_balance);
END;
$fn$;


CREATE OR REPLACE FUNCTION private.betconstruct_sports_bet_resulted(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_binding private.betconstruct_session_bindings%ROWTYPE;
    v_bet private.betconstruct_sports_bets%ROWTYPE;
    v_existing private.betconstruct_transactions%ROWTYPE;
    v_tx TEXT;
    v_bet_id BIGINT;
    v_final NUMERIC;
    v_delta NUMERIC;
    v_fp TEXT;
    v_prev_payout TEXT;
BEGIN
    v_tx := private.betconstruct_parse_int64(p_payload -> 'transaction_id');
    v_bet_id := private.betconstruct_parse_int64(p_payload -> 'bet_id')::BIGINT;
    v_fp := NULLIF(p_payload ->> 'fingerprint', '');
    PERFORM private.betconstruct_lock_financial('betconstruct:sportsbook:result:' || v_tx);
    v_binding := private.betconstruct_session_by_digest(
        p_payload ->> 'token_digest', 'sportsbook', 'launch', 'settlement'
    );
    SELECT b.*
    INTO v_bet
    FROM private.betconstruct_sports_bets AS b
    WHERE b.bet_id = v_bet_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'BET_NOT_FOUND';
    END IF;
    IF v_binding.player_auth_user_id IS DISTINCT FROM v_bet.player_auth_user_id
       OR v_binding.player_public_id IS DISTINCT FROM v_bet.player_public_id THEN
        RAISE EXCEPTION 'TOKEN_PLAYER_MISMATCH';
    END IF;
    v_final := private.betconstruct_require_amount_scale(
        v_bet.display_currency,
        private.betconstruct_parse_exact_amount(p_payload -> 'amount')
    );
    IF v_final < 0 THEN
        RAISE EXCEPTION 'AMOUNT_INVALID';
    END IF;
    SELECT t.*
    INTO v_existing
    FROM private.betconstruct_transactions AS t
    WHERE t.product = 'sportsbook' AND t.method = 'BetResulted' AND t.external_transaction_id = v_tx
    FOR UPDATE;
    IF FOUND THEN
        IF v_existing.request_fingerprint IS DISTINCT FROM v_fp THEN
            RAISE EXCEPTION 'CONFLICT';
        END IF;
        RETURN jsonb_build_object(
            'ok', true,
            'replayed', true,
            'currency', v_bet.display_currency,
            'balance', private.game_current_balance(v_bet.wallet_id)
        );
    END IF;
    v_delta := v_final - v_bet.latest_result_amount;
    IF v_delta > 0 THEN
        PERFORM private.betconstruct_apply_wallet_entry(
            v_bet.wallet_id, v_delta, 'CASINO_WIN', 'bc-sports-result:' || v_tx,
            'betconstruct', v_tx, 'betconstruct', jsonb_build_object('phase', 'BetResulted'), TRUE
        );
    ELSIF v_delta < 0 THEN
        -- BETCONSTRUCT_LIVE_BLOCKER_RESULT_CORRECTION_DEBT_POLICY
        PERFORM private.betconstruct_apply_wallet_entry(
            v_bet.wallet_id, v_delta, 'CASINO_BET', 'bc-sports-result:' || v_tx,
            'betconstruct', v_tx, 'betconstruct', jsonb_build_object('phase', 'BetResulted'), TRUE
        );
    END IF;
    v_prev_payout := NULLIF(v_bet.metadata ->> 'payoutExternalId', '');
    IF v_delta <> 0 AND v_bet.latest_result_amount > 0 AND v_prev_payout IS NOT NULL THEN
        PERFORM private.ingest_provider_transaction(
            'betconstruct', 'sports', v_tx || ':rollback', v_prev_payout, 'rollback',
            v_bet.latest_result_amount, v_bet.display_currency,
            COALESCE((p_payload ->> 'occurred_at')::TIMESTAMPTZ, pg_catalog.now()), '{}'::jsonb
        );
    END IF;
    IF v_final > 0 AND (v_delta <> 0 OR v_bet.latest_result_amount = 0) THEN
        PERFORM private.ingest_provider_transaction(
            'betconstruct', 'sports',
            CASE WHEN v_bet.latest_result_amount = 0 THEN v_tx ELSE v_tx || ':payout' END,
            v_bet.placed_transaction_id, 'payout', v_final, v_bet.display_currency,
            COALESCE((p_payload ->> 'occurred_at')::TIMESTAMPTZ, pg_catalog.now()), '{}'::jsonb
        );
        v_bet.metadata := v_bet.metadata || jsonb_build_object(
            'payoutExternalId',
            CASE WHEN v_bet.latest_result_amount = 0 THEN v_tx ELSE v_tx || ':payout' END
        );
    ELSIF v_final = 0 AND v_bet.latest_result_amount > 0 THEN
        v_bet.metadata := v_bet.metadata - 'payoutExternalId';
    END IF;
    UPDATE private.betconstruct_sports_bets
    SET latest_result_amount = v_final,
        latest_result_state = NULLIF(p_payload ->> 'bet_state', ''),
        latest_result_transaction_id = v_tx,
        metadata = v_bet.metadata,
        updated_at = pg_catalog.now()
    WHERE id = v_bet.id;
    INSERT INTO private.betconstruct_transactions (
        product, method, external_transaction_id, related_transaction_id, bet_id,
        player_auth_user_id, wallet_id, display_currency, amount, request_fingerprint,
        status, processed_at, metadata
    ) VALUES (
        'sportsbook', 'BetResulted', v_tx, v_bet.placed_transaction_id, v_bet_id,
        v_bet.player_auth_user_id, v_bet.wallet_id, v_bet.display_currency, v_final, v_fp,
        'accepted', pg_catalog.now(),
        private.betconstruct_sanitize_metadata(COALESCE(p_payload -> 'metadata', '{}'::jsonb))
    );
    RETURN jsonb_build_object(
        'ok', true,
        'currency', v_bet.display_currency,
        'balance', private.game_current_balance(v_bet.wallet_id)
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.betconstruct_sports_rollback(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_binding private.betconstruct_session_bindings%ROWTYPE;
    v_bet private.betconstruct_sports_bets%ROWTYPE;
    v_existing private.betconstruct_transactions%ROWTYPE;
    v_tx TEXT;
    v_fp TEXT;
BEGIN
    v_tx := private.betconstruct_parse_int64(p_payload -> 'transaction_id');
    v_fp := NULLIF(p_payload ->> 'fingerprint', '');
    PERFORM private.betconstruct_lock_financial('betconstruct:sportsbook:rollback:' || v_tx);
    v_binding := private.betconstruct_session_by_digest(
        p_payload ->> 'token_digest', 'sportsbook', 'launch', 'settlement'
    );
    SELECT b.*
    INTO v_bet
    FROM private.betconstruct_sports_bets AS b
    WHERE b.placed_transaction_id = v_tx
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', true, 'replayed', true);
    END IF;
    IF v_binding.player_auth_user_id IS DISTINCT FROM v_bet.player_auth_user_id
       OR v_binding.player_public_id IS DISTINCT FROM v_bet.player_public_id THEN
        RAISE EXCEPTION 'TOKEN_PLAYER_MISMATCH';
    END IF;
    SELECT t.*
    INTO v_existing
    FROM private.betconstruct_transactions AS t
    WHERE t.product = 'sportsbook' AND t.method = 'Rollback' AND t.external_transaction_id = v_tx
    FOR UPDATE;
    IF FOUND OR v_bet.rolled_back_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'ok', true, 'replayed', true, 'currency', v_bet.display_currency,
            'balance', private.game_current_balance(v_bet.wallet_id)
        );
    END IF;
    PERFORM private.betconstruct_apply_wallet_entry(
        v_bet.wallet_id, v_bet.stake, 'CASINO_REFUND', 'bc-sports-rollback:' || v_tx,
        'betconstruct', v_tx, 'betconstruct', jsonb_build_object('phase', 'Rollback'), TRUE
    );
    PERFORM private.ingest_provider_transaction(
        'betconstruct', 'sports', v_tx || ':rollback', v_tx, 'rollback',
        v_bet.stake, v_bet.display_currency,
        COALESCE((p_payload ->> 'occurred_at')::TIMESTAMPTZ, pg_catalog.now()), '{}'::jsonb
    );
    UPDATE private.betconstruct_sports_bets
    SET rolled_back_at = pg_catalog.now(), updated_at = pg_catalog.now()
    WHERE id = v_bet.id;
    UPDATE private.betconstruct_transactions
    SET status = 'rolled_back'
    WHERE product = 'sportsbook' AND method = 'BetPlaced' AND external_transaction_id = v_tx;
    INSERT INTO private.betconstruct_transactions (
        product, method, external_transaction_id, related_transaction_id, bet_id,
        player_auth_user_id, wallet_id, display_currency, amount, request_fingerprint,
        status, processed_at, metadata
    ) VALUES (
        'sportsbook', 'Rollback', v_tx, v_tx, v_bet.bet_id,
        v_bet.player_auth_user_id, v_bet.wallet_id, v_bet.display_currency, v_bet.stake, v_fp,
        'accepted', pg_catalog.now(),
        private.betconstruct_sanitize_metadata(COALESCE(p_payload -> 'metadata', '{}'::jsonb))
    );
    RETURN jsonb_build_object(
        'ok', true, 'currency', v_bet.display_currency,
        'balance', private.game_current_balance(v_bet.wallet_id)
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.betconstruct_casino_financial_lookup(p_rgs TEXT)
RETURNS private.betconstruct_transactions
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_row private.betconstruct_transactions%ROWTYPE;
BEGIN
    SELECT t.*
    INTO v_row
    FROM private.betconstruct_transactions AS t
    WHERE t.product = 'casino'
      AND t.method IN ('Withdraw', 'Deposit', 'WithdrawAndDeposit')
      AND t.external_transaction_id = p_rgs
    FOR UPDATE;
    RETURN v_row;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.betconstruct_casino_withdraw(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_binding private.betconstruct_session_bindings%ROWTYPE;
    v_existing private.betconstruct_transactions%ROWTYPE;
    v_rgs TEXT;
    v_amount NUMERIC;
    v_fp TEXT;
    v_platform BIGINT;
BEGIN
    v_rgs := private.betconstruct_parse_int64(p_payload -> 'rgs_transaction_id');
    v_fp := NULLIF(p_payload ->> 'fingerprint', '');
    PERFORM private.betconstruct_lock_financial('betconstruct:casino:' || v_rgs);
    v_binding := private.betconstruct_session_by_digest(
        p_payload ->> 'token_digest', 'casino', 'session', 'new_play'
    );
    PERFORM private.require_player_external_casino_allowed(v_binding.player_auth_user_id);
    v_amount := private.betconstruct_require_amount_scale(
        v_binding.display_currency,
        private.betconstruct_parse_exact_amount(p_payload -> 'withdraw_amount')
    );
    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'AMOUNT_INVALID';
    END IF;
    v_existing := private.betconstruct_casino_financial_lookup(v_rgs);
    IF v_existing.id IS NOT NULL THEN
        IF v_existing.method IS DISTINCT FROM 'Withdraw' THEN
            RAISE EXCEPTION 'TRANSACTION_METHOD_CONFLICT';
        END IF;
        IF v_existing.request_fingerprint IS DISTINCT FROM v_fp THEN
            RAISE EXCEPTION 'AMOUNT_INVALID';
        END IF;
        RAISE EXCEPTION 'TRANSACTION_ALREADY_COMPLETE';
    END IF;
    PERFORM private.betconstruct_apply_wallet_entry(
        v_binding.wallet_id, -v_amount, 'CASINO_BET', 'bc-casino-withdraw:' || v_rgs,
        'betconstruct', v_rgs, 'betconstruct', jsonb_build_object('phase', 'Withdraw'), FALSE
    );
    v_platform := private.betconstruct_next_platform_transaction_id();
    INSERT INTO private.betconstruct_transactions (
        product, method, external_transaction_id, player_auth_user_id, wallet_id,
        display_currency, amount, request_fingerprint, platform_transaction_id, status,
        processed_at, provider_player_id, metadata
    ) VALUES (
        'casino', 'Withdraw', v_rgs, v_binding.player_auth_user_id, v_binding.wallet_id,
        v_binding.display_currency, v_amount, v_fp, v_platform, 'accepted', pg_catalog.now(),
        v_binding.provider_player_id,
        private.betconstruct_sanitize_metadata(COALESCE(p_payload -> 'metadata', '{}'::jsonb))
    );
    PERFORM private.ingest_provider_transaction(
        'betconstruct', 'casino', v_rgs, NULL, 'bet', v_amount, v_binding.display_currency,
        COALESCE((p_payload ->> 'occurred_at')::TIMESTAMPTZ, pg_catalog.now()), '{}'::jsonb
    );
    RETURN jsonb_build_object(
        'ok', true,
        'currency', v_binding.display_currency,
        'balance', private.game_current_balance(v_binding.wallet_id),
        'platform_transaction_id', v_platform
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.betconstruct_casino_deposit(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_binding private.betconstruct_session_bindings%ROWTYPE;
    v_existing private.betconstruct_transactions%ROWTYPE;
    v_related_row private.betconstruct_transactions%ROWTYPE;
    v_rgs TEXT;
    v_related TEXT;
    v_amount NUMERIC;
    v_fp TEXT;
    v_platform BIGINT;
BEGIN
    v_rgs := private.betconstruct_parse_int64(p_payload -> 'rgs_transaction_id');
    v_fp := NULLIF(p_payload ->> 'fingerprint', '');
    IF p_payload -> 'related_transaction_id' IS NULL
       OR p_payload -> 'related_transaction_id' = 'null'::jsonb
       OR COALESCE(p_payload ->> 'related_transaction_id', '') = '' THEN
        v_related := NULL;
    ELSE
        v_related := private.betconstruct_parse_int64(p_payload -> 'related_transaction_id');
    END IF;
    PERFORM private.betconstruct_lock_financial('betconstruct:casino:' || v_rgs);
    v_binding := private.betconstruct_session_by_digest(
        p_payload ->> 'token_digest', 'casino', 'session', 'settlement'
    );
    v_amount := private.betconstruct_require_amount_scale(
        v_binding.display_currency,
        private.betconstruct_parse_exact_amount(p_payload -> 'deposit_amount')
    );
    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'AMOUNT_INVALID';
    END IF;
    IF v_related IS NOT NULL THEN
        v_related_row := private.betconstruct_casino_financial_lookup(v_related);
        IF v_related_row.id IS NULL
           OR (
                v_related_row.method IS DISTINCT FROM 'Withdraw'
                AND NOT (
                    v_related_row.method = 'WithdrawAndDeposit'
                    AND COALESCE((v_related_row.metadata ->> 'withdrawAmount')::NUMERIC, 0) > 0
                )
              ) THEN
            RAISE EXCEPTION 'TRANSACTION_NOT_FOUND';
        END IF;
        IF v_related_row.player_auth_user_id IS DISTINCT FROM v_binding.player_auth_user_id
           OR v_related_row.provider_player_id IS DISTINCT FROM v_binding.provider_player_id THEN
            RAISE EXCEPTION 'WRONG_PLAYER_ID';
        END IF;
        IF v_related_row.wallet_id IS DISTINCT FROM v_binding.wallet_id
           OR v_related_row.display_currency IS DISTINCT FROM v_binding.display_currency THEN
            RAISE EXCEPTION 'CURRENCY_MISMATCH';
        END IF;
    END IF;
    v_existing := private.betconstruct_casino_financial_lookup(v_rgs);
    IF v_existing.id IS NOT NULL THEN
        IF v_existing.method IS DISTINCT FROM 'Deposit' THEN
            RAISE EXCEPTION 'TRANSACTION_METHOD_CONFLICT';
        END IF;
        IF v_existing.request_fingerprint IS DISTINCT FROM v_fp THEN
            RAISE EXCEPTION 'AMOUNT_INVALID';
        END IF;
        RAISE EXCEPTION 'DEPOSIT_ALREADY_RECEIVED';
    END IF;
    PERFORM private.betconstruct_apply_wallet_entry(
        v_binding.wallet_id, v_amount, 'CASINO_WIN', 'bc-casino-deposit:' || v_rgs,
        'betconstruct', v_rgs, 'betconstruct', jsonb_build_object('phase', 'Deposit'), TRUE
    );
    v_platform := private.betconstruct_next_platform_transaction_id();
    INSERT INTO private.betconstruct_transactions (
        product, method, external_transaction_id, related_transaction_id, player_auth_user_id,
        wallet_id, display_currency, amount, request_fingerprint, platform_transaction_id,
        status, processed_at, provider_player_id, metadata
    ) VALUES (
        'casino', 'Deposit', v_rgs, v_related, v_binding.player_auth_user_id, v_binding.wallet_id,
        v_binding.display_currency, v_amount, v_fp, v_platform, 'accepted', pg_catalog.now(),
        v_binding.provider_player_id,
        private.betconstruct_sanitize_metadata(COALESCE(p_payload -> 'metadata', '{}'::jsonb))
    );
    PERFORM private.ingest_provider_transaction(
        'betconstruct', 'casino', v_rgs, v_related, 'win', v_amount, v_binding.display_currency,
        COALESCE((p_payload ->> 'occurred_at')::TIMESTAMPTZ, pg_catalog.now()), '{}'::jsonb
    );
    RETURN jsonb_build_object(
        'ok', true,
        'currency', v_binding.display_currency,
        'balance', private.game_current_balance(v_binding.wallet_id),
        'platform_transaction_id', v_platform
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.betconstruct_casino_withdraw_and_deposit(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_binding private.betconstruct_session_bindings%ROWTYPE;
    v_existing private.betconstruct_transactions%ROWTYPE;
    v_rgs TEXT;
    v_withdraw NUMERIC;
    v_deposit NUMERIC;
    v_fp TEXT;
    v_platform BIGINT;
BEGIN
    v_rgs := private.betconstruct_parse_int64(p_payload -> 'rgs_transaction_id');
    v_fp := NULLIF(p_payload ->> 'fingerprint', '');
    PERFORM private.betconstruct_lock_financial('betconstruct:casino:' || v_rgs);
    v_binding := private.betconstruct_session_by_digest(
        p_payload ->> 'token_digest', 'casino', 'session', 'new_play'
    );
    PERFORM private.require_player_external_casino_allowed(v_binding.player_auth_user_id);
    v_withdraw := private.betconstruct_require_amount_scale(
        v_binding.display_currency,
        private.betconstruct_parse_exact_amount(p_payload -> 'withdraw_amount')
    );
    v_deposit := private.betconstruct_require_amount_scale(
        v_binding.display_currency,
        private.betconstruct_parse_exact_amount(p_payload -> 'deposit_amount')
    );
    IF v_withdraw < 0 OR v_deposit < 0 OR (v_withdraw = 0 AND v_deposit = 0) THEN
        RAISE EXCEPTION 'AMOUNT_INVALID';
    END IF;
    v_existing := private.betconstruct_casino_financial_lookup(v_rgs);
    IF v_existing.id IS NOT NULL THEN
        IF v_existing.method IS DISTINCT FROM 'WithdrawAndDeposit' THEN
            RAISE EXCEPTION 'TRANSACTION_METHOD_CONFLICT';
        END IF;
        IF v_existing.request_fingerprint IS DISTINCT FROM v_fp THEN
            RAISE EXCEPTION 'AMOUNT_INVALID';
        END IF;
        RAISE EXCEPTION 'TRANSACTION_ALREADY_COMPLETE';
    END IF;
    IF v_withdraw > 0 THEN
        PERFORM private.betconstruct_apply_wallet_entry(
            v_binding.wallet_id, -v_withdraw, 'CASINO_BET', 'bc-casino-wad-bet:' || v_rgs,
            'betconstruct', v_rgs, 'betconstruct',
            jsonb_build_object('phase', 'WithdrawAndDeposit', 'leg', 'bet'), FALSE
        );
    END IF;
    IF v_deposit > 0 THEN
        PERFORM private.betconstruct_apply_wallet_entry(
            v_binding.wallet_id, v_deposit, 'CASINO_WIN', 'bc-casino-wad-win:' || v_rgs,
            'betconstruct', v_rgs, 'betconstruct',
            jsonb_build_object('phase', 'WithdrawAndDeposit', 'leg', 'win'), TRUE
        );
    END IF;
    v_platform := private.betconstruct_next_platform_transaction_id();
    INSERT INTO private.betconstruct_transactions (
        product, method, external_transaction_id, player_auth_user_id, wallet_id,
        display_currency, amount, request_fingerprint, platform_transaction_id, status,
        processed_at, provider_player_id, metadata
    ) VALUES (
        'casino', 'WithdrawAndDeposit', v_rgs, v_binding.player_auth_user_id, v_binding.wallet_id,
        v_binding.display_currency, v_deposit, v_fp, v_platform, 'accepted', pg_catalog.now(),
        v_binding.provider_player_id,
        jsonb_build_object('withdrawAmount', v_withdraw, 'depositAmount', v_deposit)
    );
    IF v_withdraw > 0 THEN
        PERFORM private.ingest_provider_transaction(
            'betconstruct', 'casino', v_rgs || ':bet', NULL, 'bet', v_withdraw,
            v_binding.display_currency,
            COALESCE((p_payload ->> 'occurred_at')::TIMESTAMPTZ, pg_catalog.now()), '{}'::jsonb
        );
    END IF;
    IF v_deposit > 0 THEN
        PERFORM private.ingest_provider_transaction(
            'betconstruct', 'casino', v_rgs || ':win',
            CASE WHEN v_withdraw > 0 THEN v_rgs || ':bet' ELSE NULL END,
            'win', v_deposit, v_binding.display_currency,
            COALESCE((p_payload ->> 'occurred_at')::TIMESTAMPTZ, pg_catalog.now()), '{}'::jsonb
        );
    END IF;
    RETURN jsonb_build_object(
        'ok', true,
        'currency', v_binding.display_currency,
        'balance', private.game_current_balance(v_binding.wallet_id),
        'platform_transaction_id', v_platform
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.betconstruct_casino_rollback(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_binding private.betconstruct_session_bindings%ROWTYPE;
    v_original private.betconstruct_transactions%ROWTYPE;
    v_existing private.betconstruct_transactions%ROWTYPE;
    v_win private.betconstruct_transactions%ROWTYPE;
    v_rgs TEXT;
    v_platform BIGINT;
    v_withdraw NUMERIC;
    v_deposit NUMERIC;
BEGIN
    v_rgs := private.betconstruct_parse_int64(p_payload -> 'rgs_transaction_id');
    PERFORM private.betconstruct_lock_financial('betconstruct:casino:rollback:' || v_rgs);
    v_binding := private.betconstruct_session_by_digest(
        p_payload ->> 'token_digest', 'casino', 'session', 'settlement'
    );
    v_original := private.betconstruct_casino_financial_lookup(v_rgs);
    IF v_original.id IS NULL
       OR (
            v_original.method IS DISTINCT FROM 'Withdraw'
            AND NOT (
                v_original.method = 'WithdrawAndDeposit'
                AND COALESCE((v_original.metadata ->> 'withdrawAmount')::NUMERIC, 0) > 0
            )
          ) THEN
        RAISE EXCEPTION 'TRANSACTION_NOT_FOUND';
    END IF;
    IF v_binding.player_auth_user_id IS DISTINCT FROM v_original.player_auth_user_id THEN
        RAISE EXCEPTION 'WRONG_PLAYER_ID';
    END IF;
    SELECT t.*
    INTO v_existing
    FROM private.betconstruct_transactions AS t
    WHERE t.product = 'casino' AND t.method = 'Rollback' AND t.external_transaction_id = v_rgs
    FOR UPDATE;
    IF FOUND OR v_original.status = 'rolled_back' THEN
        RETURN jsonb_build_object(
            'ok', true, 'replayed', true,
            'platform_transaction_id', COALESCE(v_existing.platform_transaction_id, v_original.platform_transaction_id),
            'currency', v_original.display_currency,
            'balance', private.game_current_balance(v_original.wallet_id)
        );
    END IF;
    IF v_original.method = 'Withdraw' THEN
        PERFORM private.betconstruct_apply_wallet_entry(
            v_original.wallet_id, v_original.amount, 'CASINO_REFUND',
            'bc-casino-rollback:' || v_rgs || ':' || v_rgs,
            'betconstruct', v_rgs, 'betconstruct', '{}'::jsonb, TRUE
        );
        PERFORM private.ingest_provider_transaction(
            'betconstruct', 'casino', v_rgs || ':rollback', v_rgs, 'rollback',
            v_original.amount, v_original.display_currency,
            COALESCE((p_payload ->> 'occurred_at')::TIMESTAMPTZ, pg_catalog.now()), '{}'::jsonb
        );
    ELSE
        v_withdraw := COALESCE((v_original.metadata ->> 'withdrawAmount')::NUMERIC, 0);
        v_deposit := COALESCE((v_original.metadata ->> 'depositAmount')::NUMERIC, 0);
        IF v_deposit > 0 THEN
            PERFORM private.betconstruct_apply_wallet_entry(
                v_original.wallet_id, -v_deposit, 'CASINO_BET',
                'bc-casino-rollback-win:' || v_rgs,
                'betconstruct', v_rgs, 'betconstruct', '{}'::jsonb, TRUE
            );
            PERFORM private.ingest_provider_transaction(
                'betconstruct', 'casino', v_rgs || ':rollback:win', v_rgs || ':win', 'rollback',
                v_deposit, v_original.display_currency,
                COALESCE((p_payload ->> 'occurred_at')::TIMESTAMPTZ, pg_catalog.now()), '{}'::jsonb
            );
        END IF;
        IF v_withdraw > 0 THEN
            PERFORM private.betconstruct_apply_wallet_entry(
                v_original.wallet_id, v_withdraw, 'CASINO_REFUND',
                'bc-casino-rollback-bet:' || v_rgs,
                'betconstruct', v_rgs, 'betconstruct', '{}'::jsonb, TRUE
            );
            PERFORM private.ingest_provider_transaction(
                'betconstruct', 'casino', v_rgs || ':rollback:bet', v_rgs || ':bet', 'rollback',
                v_withdraw, v_original.display_currency,
                COALESCE((p_payload ->> 'occurred_at')::TIMESTAMPTZ, pg_catalog.now()), '{}'::jsonb
            );
        END IF;
    END IF;
    UPDATE private.betconstruct_transactions SET status = 'rolled_back' WHERE id = v_original.id;
    FOR v_win IN
        SELECT t.*
        FROM private.betconstruct_transactions AS t
        WHERE t.product = 'casino'
          AND t.method = 'Deposit'
          AND t.related_transaction_id = v_rgs
          AND t.status = 'accepted'
        FOR UPDATE
    LOOP
        PERFORM private.betconstruct_apply_wallet_entry(
            v_win.wallet_id, -v_win.amount, 'CASINO_BET',
            'bc-casino-rollback:' || v_rgs || ':' || v_win.external_transaction_id,
            'betconstruct', v_win.external_transaction_id, 'betconstruct', '{}'::jsonb, TRUE
        );
        PERFORM private.ingest_provider_transaction(
            'betconstruct', 'casino', v_win.external_transaction_id || ':rollback',
            v_win.external_transaction_id, 'rollback', v_win.amount, v_win.display_currency,
            COALESCE((p_payload ->> 'occurred_at')::TIMESTAMPTZ, pg_catalog.now()), '{}'::jsonb
        );
        UPDATE private.betconstruct_transactions SET status = 'rolled_back' WHERE id = v_win.id;
    END LOOP;
    v_platform := private.betconstruct_next_platform_transaction_id();
    INSERT INTO private.betconstruct_transactions (
        product, method, external_transaction_id, related_transaction_id, player_auth_user_id,
        wallet_id, display_currency, amount, request_fingerprint, platform_transaction_id,
        status, processed_at, provider_player_id, metadata
    ) VALUES (
        'casino', 'Rollback', v_rgs, v_rgs, v_original.player_auth_user_id, v_original.wallet_id,
        v_original.display_currency, v_original.amount, COALESCE(p_payload ->> 'fingerprint', v_rgs),
        v_platform, 'accepted', pg_catalog.now(), v_original.provider_player_id,
        private.betconstruct_sanitize_metadata(COALESCE(p_payload -> 'metadata', '{}'::jsonb))
    );
    RETURN jsonb_build_object(
        'ok', true,
        'currency', v_original.display_currency,
        'balance', private.game_current_balance(v_original.wallet_id),
        'platform_transaction_id', v_platform
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.betconstruct_issue_casino_session(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_launch private.betconstruct_session_bindings%ROWTYPE;
    v_session UUID;
    v_expires TIMESTAMPTZ;
BEGIN
    v_launch := private.betconstruct_session_by_digest(
        p_payload ->> 'launch_token_digest', 'casino', 'launch', 'new_play'
    );
    PERFORM private.require_player_external_casino_allowed(v_launch.player_auth_user_id);
    v_expires := (p_payload ->> 'session_expires_at')::TIMESTAMPTZ;
    IF v_expires IS NULL OR v_expires <= pg_catalog.now() THEN
        RAISE EXCEPTION 'SESSION_EXPIRY_INVALID';
    END IF;
    IF v_expires > pg_catalog.now() + INTERVAL '24 hours' THEN
        RAISE EXCEPTION 'SESSION_EXPIRY_INVALID';
    END IF;
    INSERT INTO private.betconstruct_session_bindings (
        product, token_kind, token_digest, player_auth_user_id, player_public_id,
        wallet_id, display_currency, provider_player_id, expires_at, last_seen_at, metadata
    ) VALUES (
        'casino',
        'session',
        p_payload ->> 'session_token_digest',
        v_launch.player_auth_user_id,
        v_launch.player_public_id,
        v_launch.wallet_id,
        v_launch.display_currency,
        v_launch.provider_player_id,
        v_expires,
        pg_catalog.now(),
        '{}'::jsonb
    )
    RETURNING id INTO v_session;
    RETURN jsonb_build_object(
        'ok', true,
        'session_binding_id', v_session,
        'wallet_id', v_launch.wallet_id,
        'currency', v_launch.display_currency,
        'player_public_id', v_launch.player_public_id,
        'balance', private.game_current_balance(v_launch.wallet_id)
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.betconstruct_apply_financial(
    p_operation TEXT,
    p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_op TEXT;
BEGIN
    v_op := BTRIM(COALESCE(p_operation, ''));
    IF v_op = 'sports_bet_placed' THEN
        RETURN private.betconstruct_sports_bet_placed(p_payload);
    ELSIF v_op = 'sports_bet_resulted' THEN
        RETURN private.betconstruct_sports_bet_resulted(p_payload);
    ELSIF v_op = 'sports_rollback' THEN
        RETURN private.betconstruct_sports_rollback(p_payload);
    ELSIF v_op = 'casino_withdraw' THEN
        RETURN private.betconstruct_casino_withdraw(p_payload);
    ELSIF v_op = 'casino_deposit' THEN
        RETURN private.betconstruct_casino_deposit(p_payload);
    ELSIF v_op = 'casino_withdraw_and_deposit' THEN
        RETURN private.betconstruct_casino_withdraw_and_deposit(p_payload);
    ELSIF v_op = 'casino_rollback' THEN
        RETURN private.betconstruct_casino_rollback(p_payload);
    ELSIF v_op = 'casino_issue_session' THEN
        RETURN private.betconstruct_issue_casino_session(p_payload);
    END IF;
    RAISE EXCEPTION 'BETCONSTRUCT_OPERATION_INVALID';
END;
$fn$;


CREATE OR REPLACE FUNCTION public.betconstruct_apply_financial(
    p_operation TEXT,
    p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    RETURN private.betconstruct_apply_financial(p_operation, p_payload);
END;
$fn$;

COMMENT ON FUNCTION public.betconstruct_apply_financial(TEXT, JSONB) IS
'Service-role-only BetConstruct financial door. One PostgreSQL transaction per canonical sports/casino money operation. Browser/anon/authenticated cannot execute this.';


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

REVOKE ALL ON FUNCTION private.betconstruct_parse_exact_amount(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.betconstruct_parse_exact_amount(JSONB) TO service_role;

REVOKE ALL ON FUNCTION private.betconstruct_parse_int64(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.betconstruct_parse_int64(JSONB) TO service_role;

REVOKE ALL ON FUNCTION private.betconstruct_require_amount_scale(TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.betconstruct_require_amount_scale(TEXT, NUMERIC) TO service_role;

REVOKE ALL ON FUNCTION private.betconstruct_apply_wallet_entry(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.betconstruct_apply_wallet_entry(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION private.betconstruct_lock_financial(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.betconstruct_lock_financial(TEXT) TO service_role;

REVOKE ALL ON FUNCTION private.betconstruct_session_by_digest(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.betconstruct_session_by_digest(TEXT, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION private.betconstruct_sports_bet_placed(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.betconstruct_sports_bet_placed(JSONB) TO service_role;

REVOKE ALL ON FUNCTION private.betconstruct_sports_bet_resulted(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.betconstruct_sports_bet_resulted(JSONB) TO service_role;

REVOKE ALL ON FUNCTION private.betconstruct_sports_rollback(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.betconstruct_sports_rollback(JSONB) TO service_role;

REVOKE ALL ON FUNCTION private.betconstruct_casino_financial_lookup(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.betconstruct_casino_financial_lookup(TEXT) TO service_role;

REVOKE ALL ON FUNCTION private.betconstruct_casino_withdraw(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.betconstruct_casino_withdraw(JSONB) TO service_role;

REVOKE ALL ON FUNCTION private.betconstruct_casino_deposit(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.betconstruct_casino_deposit(JSONB) TO service_role;

REVOKE ALL ON FUNCTION private.betconstruct_casino_withdraw_and_deposit(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.betconstruct_casino_withdraw_and_deposit(JSONB) TO service_role;

REVOKE ALL ON FUNCTION private.betconstruct_casino_rollback(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.betconstruct_casino_rollback(JSONB) TO service_role;

REVOKE ALL ON FUNCTION private.betconstruct_issue_casino_session(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.betconstruct_issue_casino_session(JSONB) TO service_role;

REVOKE ALL ON FUNCTION private.betconstruct_apply_financial(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.betconstruct_apply_financial(TEXT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.betconstruct_apply_financial(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.betconstruct_apply_financial(TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.betconstruct_apply_financial(TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.betconstruct_apply_financial(TEXT, JSONB) TO service_role;

COMMIT;
