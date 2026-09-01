BEGIN;

-- ============================================================
-- NEXTPARI PHASE 029
-- EXTENSIBLE CANONICAL REAL-MONEY GAME ENGINE
--
-- Written only. Do not execute this file against production.
--
-- PLAYER JWT
--   → public.player_game_start / action / get
--   → private.game_engine_*
--   → game adapter
--   → private.apply_wallet_entry (CASINO_BET / CASINO_WIN / CASINO_REFUND)
--
-- Browser never supplies userId, walletId, payout, result, or balance
-- as financial authority. Identity is only auth.uid().
--
-- Future Game #7:
--   1. INSERT private.game_catalog
--   2. implement private.game_adapter_* and register in the dispatcher
--   3. connect UI to the generic playerGames client
-- Wallet Core / game_rounds / BFF / ledger stay unchanged.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


-- ============================================================
-- 1. EXTENSIBLE GAME CATALOG
-- ============================================================

CREATE TABLE IF NOT EXISTS private.game_catalog (
    game_code TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    engine_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    currency TEXT NOT NULL DEFAULT 'TMTM',
    min_stake NUMERIC(20,2) NOT NULL DEFAULT 1,
    max_stake NUMERIC(20,2),
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),

    CONSTRAINT game_catalog_code_check
        CHECK (game_code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT game_catalog_engine_type_check
        CHECK (engine_type IN ('instant', 'stateful', 'crash', 'provider')),
    CONSTRAINT game_catalog_status_check
        CHECK (status IN ('active', 'disabled', 'maintenance')),
    CONSTRAINT game_catalog_currency_check
        CHECK (currency ~ '^[A-Z]{3,10}$'),
    CONSTRAINT game_catalog_min_stake_check
        CHECK (min_stake > 0 AND min_stake = ROUND(min_stake, 2)),
    CONSTRAINT game_catalog_max_stake_check
        CHECK (
            max_stake IS NULL
            OR (
                max_stake >= min_stake
                AND max_stake = ROUND(max_stake, 2)
            )
        )
);

COMMENT ON TABLE private.game_catalog IS
'Extensible game registry. Add a row to launch a new game; do not add a hardcoded six-game CHECK and do not redesign Wallet Core.';

INSERT INTO private.game_catalog (
    game_code, display_name, engine_type, status, currency, min_stake, max_stake, config
) VALUES
(
    'pharaoh', 'Pharaoh', 'instant', 'active', 'TMTM', 6, 2293.67,
    '{"tileCount":6,"symbols":[{"id":"cat","mult":10000,"w":1},{"id":"scroll","mult":1000,"w":2},{"id":"nemes","mult":200,"w":3},{"id":"pyramid","mult":100,"w":5},{"id":"ring","mult":50,"w":8},{"id":"ankh","mult":20,"w":12},{"id":"canopic","mult":10,"w":16},{"id":"lotus","mult":5,"w":20},{"id":"cylinder","mult":4,"w":24},{"id":"harp","mult":2,"w":28},{"id":"sistrum","mult":1,"w":32}]}'::jsonb
),
(
    'dice', 'Dice', 'instant', 'active', 'TMTM', 6, NULL,
    '{"winMultiplier":2}'::jsonb
),
(
    'blackjack', 'Blackjack', 'stateful', 'active', 'TMTM', 6, NULL,
    '{"dealerStandsAt":17,"actions":["hit","stand"]}'::jsonb
),
(
    'apples', 'Apples', 'stateful', 'active', 'TMTM', 1, NULL,
    '{"levels":[{"level":1,"multiplier":1.23,"good":4,"bad":1},{"level":2,"multiplier":1.54,"good":4,"bad":1},{"level":3,"multiplier":1.93,"good":4,"bad":1},{"level":4,"multiplier":2.41,"good":3,"bad":2},{"level":5,"multiplier":4.02,"good":3,"bad":2},{"level":6,"multiplier":6.71,"good":3,"bad":2},{"level":7,"multiplier":11.18,"good":2,"bad":3},{"level":8,"multiplier":27.92,"good":2,"bad":3},{"level":9,"multiplier":69.80,"good":1,"bad":4},{"level":10,"multiplier":349.00,"good":1,"bad":4}]}'::jsonb
),
(
    'crystal', 'Crystal', 'instant', 'active', 'TMTM', 6, NULL,
    '{"grid":7,"minCluster":5}'::jsonb
),
(
    'aviator', 'Aviator', 'crash', 'active', 'TMTM', 1, NULL,
    '{"houseEdge":0.04,"growthCoeff":0.06,"growthExp":1.7}'::jsonb
)
ON CONFLICT (game_code) DO UPDATE
SET
    display_name = EXCLUDED.display_name,
    engine_type = EXCLUDED.engine_type,
    min_stake = EXCLUDED.min_stake,
    max_stake = EXCLUDED.max_stake,
    config = EXCLUDED.config,
    updated_at = pg_catalog.now();


-- ============================================================
-- 2. GENERIC ROUND + ACTION TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS private.game_rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    wallet_id UUID NOT NULL REFERENCES private.wallet_accounts(wallet_id) ON DELETE RESTRICT,
    game_code TEXT NOT NULL REFERENCES private.game_catalog(game_code) ON DELETE RESTRICT,
    state TEXT NOT NULL,
    stake NUMERIC(20,2) NOT NULL,
    total_stake NUMERIC(20,2) NOT NULL,
    payout NUMERIC(20,2) NOT NULL DEFAULT 0,
    public_result JSONB NOT NULL DEFAULT '{}'::jsonb,
    private_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    server_seed TEXT NOT NULL,
    server_seed_hash TEXT NOT NULL,
    nonce BIGINT NOT NULL DEFAULT 0,
    start_idempotency_key TEXT NOT NULL,
    start_fingerprint TEXT NOT NULL,
    start_response JSONB,
    bet_ledger_id UUID,
    win_ledger_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    settled_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,

    CONSTRAINT game_rounds_state_check
        CHECK (state IN ('open', 'settled', 'cancelled')),
    CONSTRAINT game_rounds_stake_check
        CHECK (stake > 0 AND stake = ROUND(stake, 2)),
    CONSTRAINT game_rounds_total_stake_check
        CHECK (total_stake >= stake AND total_stake = ROUND(total_stake, 2)),
    CONSTRAINT game_rounds_payout_check
        CHECK (payout >= 0 AND payout = ROUND(payout, 2)),
    CONSTRAINT game_rounds_idempotency_check
        CHECK (char_length(BTRIM(start_idempotency_key)) BETWEEN 1 AND 250),
    CONSTRAINT game_rounds_settled_shape
        CHECK (
            (state <> 'settled' OR settled_at IS NOT NULL)
            AND (state <> 'cancelled' OR cancelled_at IS NOT NULL)
            AND (state <> 'open' OR (settled_at IS NULL AND cancelled_at IS NULL))
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS game_rounds_start_key_uidx
ON private.game_rounds (player_user_id, start_idempotency_key);

CREATE INDEX IF NOT EXISTS game_rounds_player_idx
ON private.game_rounds (player_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS game_rounds_wallet_idx
ON private.game_rounds (wallet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS game_rounds_game_idx
ON private.game_rounds (game_code, created_at DESC);

CREATE TABLE IF NOT EXISTS private.game_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES private.game_rounds(id) ON DELETE RESTRICT,
    seq BIGINT NOT NULL,
    action_type TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),

    CONSTRAINT game_actions_seq_check CHECK (seq > 0),
    CONSTRAINT game_actions_idempotency_check
        CHECK (char_length(BTRIM(idempotency_key)) BETWEEN 1 AND 250)
);

CREATE UNIQUE INDEX IF NOT EXISTS game_actions_round_key_uidx
ON private.game_actions (round_id, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS game_actions_round_seq_uidx
ON private.game_actions (round_id, seq);

CREATE INDEX IF NOT EXISTS game_actions_round_idx
ON private.game_actions (round_id, created_at);


REVOKE ALL ON TABLE private.game_catalog FROM PUBLIC;
REVOKE ALL ON TABLE private.game_catalog FROM anon, authenticated;
REVOKE ALL ON TABLE private.game_rounds FROM PUBLIC;
REVOKE ALL ON TABLE private.game_rounds FROM anon, authenticated;
REVOKE ALL ON TABLE private.game_actions FROM PUBLIC;
REVOKE ALL ON TABLE private.game_actions FROM anon, authenticated;
GRANT SELECT ON TABLE private.game_catalog TO service_role;
GRANT SELECT ON TABLE private.game_rounds TO service_role;
GRANT SELECT ON TABLE private.game_actions TO service_role;


CREATE OR REPLACE FUNCTION private.game_rounds_protect()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.state IN ('settled', 'cancelled') THEN
            RAISE EXCEPTION 'GAME_ROUND_IMMUTABLE';
        END IF;
        RAISE EXCEPTION 'GAME_ROUND_DELETE_FORBIDDEN';
    END IF;

    IF OLD.state IN ('settled', 'cancelled') THEN
        IF NEW.state IS DISTINCT FROM OLD.state
           OR NEW.stake IS DISTINCT FROM OLD.stake
           OR NEW.total_stake IS DISTINCT FROM OLD.total_stake
           OR NEW.payout IS DISTINCT FROM OLD.payout
           OR NEW.bet_ledger_id IS DISTINCT FROM OLD.bet_ledger_id
           OR NEW.win_ledger_id IS DISTINCT FROM OLD.win_ledger_id
           OR NEW.server_seed IS DISTINCT FROM OLD.server_seed
           OR NEW.player_user_id IS DISTINCT FROM OLD.player_user_id
           OR NEW.wallet_id IS DISTINCT FROM OLD.wallet_id
           OR NEW.game_code IS DISTINCT FROM OLD.game_code
           OR NEW.private_state IS DISTINCT FROM OLD.private_state
           OR NEW.public_result IS DISTINCT FROM OLD.public_result
        THEN
            RAISE EXCEPTION 'GAME_ROUND_IMMUTABLE';
        END IF;
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS game_rounds_protect_trg ON private.game_rounds;
CREATE TRIGGER game_rounds_protect_trg
BEFORE UPDATE OR DELETE ON private.game_rounds
FOR EACH ROW
EXECUTE FUNCTION private.game_rounds_protect();


-- ============================================================
-- 3. ENGINE HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION private.game_require_idempotency_key(p_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_key TEXT;
BEGIN
    v_key := NULLIF(BTRIM(COALESCE(p_key, '')), '');
    IF v_key IS NULL THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
    END IF;
    IF char_length(v_key) > 250 THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_TOO_LONG';
    END IF;
    RETURN v_key;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_money(p_value NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT ROUND(COALESCE(p_value, 0), 2);
$$;

CREATE OR REPLACE FUNCTION private.game_hmac(p_key TEXT, p_msg TEXT)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT extensions.hmac(
        convert_to(p_msg, 'UTF8'),
        convert_to(p_key, 'UTF8'),
        'sha256'
    );
$$;

CREATE OR REPLACE FUNCTION private.game_sha256_hex(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT encode(extensions.digest(convert_to(p_value, 'UTF8'), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION private.game_uniform01(p_seed TEXT, p_label TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_hex TEXT;
    v_int NUMERIC;
BEGIN
    v_hex := substr(encode(private.game_hmac(p_seed, p_label), 'hex'), 1, 13);
    v_int := ('x' || v_hex)::bit(52)::bigint::NUMERIC;
    RETURN v_int / POWER(2::NUMERIC, 52);
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_next_unit(p_round_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_round private.game_rounds%ROWTYPE;
    v_nonce BIGINT;
BEGIN
    SELECT r.*
    INTO v_round
    FROM private.game_rounds AS r
    WHERE r.id = p_round_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'GAME_ROUND_NOT_FOUND';
    END IF;

    v_nonce := v_round.nonce + 1;
    UPDATE private.game_rounds
    SET nonce = v_nonce, updated_at = pg_catalog.now()
    WHERE id = p_round_id;

    RETURN private.game_uniform01(
        v_round.server_seed,
        p_round_id::TEXT || ':' || v_nonce::TEXT
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_next_int(p_round_id UUID, p_max INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
BEGIN
    IF p_max IS NULL OR p_max < 1 THEN
        RAISE EXCEPTION 'GAME_RNG_BOUNDS_INVALID';
    END IF;
    RETURN FLOOR(private.game_next_unit(p_round_id) * p_max)::INTEGER;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_sanitize_options(p_options JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT COALESCE(p_options, '{}'::jsonb)
        - 'userId' - 'user_id' - 'walletId' - 'wallet_id'
        - 'publicId' - 'public_id' - 'balance' - 'payout'
        - 'result' - 'win' - 'multiplier' - 'crashPoint'
        - 'serverSeed' - 'deck' - 'board';
$$;

CREATE OR REPLACE FUNCTION private.game_fingerprint(p_parts JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT encode(
        extensions.digest(convert_to(COALESCE(p_parts, '{}'::jsonb)::TEXT, 'UTF8'), 'sha256'),
        'hex'
    );
$$;

CREATE OR REPLACE FUNCTION private.game_current_balance(p_wallet_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_bal NUMERIC(20,2);
BEGIN
    SELECT a.available_balance
    INTO v_bal
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = p_wallet_id;
    IF v_bal IS NULL THEN
        RAISE EXCEPTION 'WALLET_ACCOUNT_NOT_FOUND';
    END IF;
    RETURN v_bal;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_require_player_context()
RETURNS TABLE (
    user_id UUID,
    wallet_id UUID,
    wallet_status TEXT,
    migration_state TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_wallet UUID;
    v_status TEXT;
    v_mig TEXT;
    v_staff UUID;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

    SELECT s.auth_user_id
    INTO v_staff
    FROM private.staff_accounts AS s
    WHERE s.auth_user_id = v_uid
    LIMIT 1;
    IF v_staff IS NOT NULL THEN
        RAISE EXCEPTION 'STAFF_CANNOT_PLAY';
    END IF;

    SELECT p.wallet_id
    INTO v_wallet
    FROM public.profiles AS p
    WHERE p.id = v_uid
    FOR UPDATE;

    IF v_wallet IS NULL THEN
        RAISE EXCEPTION 'PLAYER_WALLET_MISSING';
    END IF;

    SELECT a.status, a.migration_state
    INTO v_status, v_mig
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = v_wallet
    FOR UPDATE;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'PLAYER_WALLET_MISSING';
    END IF;
    IF v_status = 'blocked' THEN
        RAISE EXCEPTION 'WALLET_BLOCKED';
    END IF;
    IF v_status = 'closed' THEN
        RAISE EXCEPTION 'WALLET_CLOSED';
    END IF;
    IF v_status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'PLAYER_WALLET_NOT_ACTIVE';
    END IF;
    IF v_mig NOT IN ('staging', 'active') THEN
        RAISE EXCEPTION 'PLAYER_WALLET_NOT_ACTIVE';
    END IF;

    RETURN QUERY SELECT v_uid, v_wallet, v_status, v_mig;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_require_catalog(p_game_code TEXT)
RETURNS private.game_catalog
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_code TEXT;
    v_row private.game_catalog%ROWTYPE;
BEGIN
    v_code := NULLIF(BTRIM(LOWER(COALESCE(p_game_code, ''))), '');
    IF v_code IS NULL THEN
        RAISE EXCEPTION 'GAME_CODE_REQUIRED';
    END IF;

    SELECT c.*
    INTO v_row
    FROM private.game_catalog AS c
    WHERE c.game_code = v_code
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'GAME_NOT_FOUND';
    END IF;
    IF v_row.status = 'disabled' THEN
        RAISE EXCEPTION 'GAME_DISABLED';
    END IF;
    IF v_row.status = 'maintenance' THEN
        RAISE EXCEPTION 'GAME_MAINTENANCE';
    END IF;
    IF v_row.status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'GAME_DISABLED';
    END IF;
    RETURN v_row;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_round_json(
    p_round private.game_rounds,
    p_balance NUMERIC,
    p_duplicate BOOLEAN,
    p_allowed JSONB DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
BEGIN
    RETURN jsonb_build_object(
        'ok', true,
        'isDuplicate', COALESCE(p_duplicate, false),
        'roundId', p_round.id,
        'gameCode', p_round.game_code,
        'state', p_round.state,
        'stake', p_round.stake,
        'totalStake', p_round.total_stake,
        'payout', p_round.payout,
        'balanceAfter', private.game_money(p_balance),
        'serverSeedHash', p_round.server_seed_hash,
        'serverSeed', CASE
            WHEN p_round.state = 'settled' THEN p_round.server_seed
            ELSE NULL
        END,
        'nonce', p_round.nonce,
        'publicResult', COALESCE(p_round.public_result, '{}'::jsonb),
        'allowedActions', COALESCE(p_allowed, '[]'::jsonb),
        'createdAt', p_round.created_at,
        'settledAt', p_round.settled_at
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_allowed_actions(p_round private.game_rounds)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
BEGIN
    IF p_round.state IS DISTINCT FROM 'open' THEN
        RETURN '[]'::jsonb;
    END IF;
    CASE p_round.game_code
        WHEN 'blackjack' THEN
            IF COALESCE(p_round.public_result->>'stage', '') = 'playerTurn' THEN
                RETURN '["hit","stand"]'::jsonb;
            END IF;
            RETURN '[]'::jsonb;
        WHEN 'apples' THEN
            IF COALESCE(p_round.public_result->>'phase', '') IN ('playing', 'cleared') THEN
                IF COALESCE((p_round.public_result->>'cashoutValue')::NUMERIC, 0) > 0
                   AND COALESCE(p_round.public_result->>'phase', '') IN ('playing', 'cleared') THEN
                    IF COALESCE(p_round.public_result->>'phase', '') = 'cleared' THEN
                        RETURN '["cashout"]'::jsonb;
                    END IF;
                    RETURN '["pick","cashout"]'::jsonb;
                END IF;
                RETURN '["pick"]'::jsonb;
            END IF;
            RETURN '[]'::jsonb;
        WHEN 'aviator' THEN
            RETURN '["cashout"]'::jsonb;
        ELSE
            RETURN '[]'::jsonb;
    END CASE;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_lock_round_owned(p_round_id UUID, p_user_id UUID)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_round private.game_rounds%ROWTYPE;
BEGIN
    IF p_round_id IS NULL THEN
        RAISE EXCEPTION 'GAME_ROUND_NOT_FOUND';
    END IF;

    SELECT r.*
    INTO v_round
    FROM private.game_rounds AS r
    WHERE r.id = p_round_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'GAME_ROUND_NOT_FOUND';
    END IF;
    IF v_round.player_user_id IS DISTINCT FROM p_user_id THEN
        RAISE EXCEPTION 'GAME_ROUND_NOT_OWNED';
    END IF;
    RETURN v_round;
END;
$fn$;


-- ============================================================
-- 4. WALLET CORE SETTLEMENT
-- ============================================================

CREATE OR REPLACE FUNCTION private.game_apply_bet(
    p_round private.game_rounds,
    p_amount NUMERIC,
    p_actor UUID
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_ledger UUID;
BEGIN
    IF private.game_money(p_amount) <= 0 THEN
        RAISE EXCEPTION 'STAKE_NOT_POSITIVE';
    END IF;

    SELECT e.ledger_id
    INTO v_ledger
    FROM private.apply_wallet_entry(
        p_round.wallet_id,
        -private.game_money(p_amount),
        0,
        'CASINO_BET',
        'casino',
        'casino-bet:' || p_round.id::TEXT,
        'game_round',
        p_round.id::TEXT,
        'player',
        p_actor::TEXT,
        jsonb_build_object('gameCode', p_round.game_code, 'phase', 'bet')
    ) AS e;

    UPDATE private.game_rounds
    SET bet_ledger_id = COALESCE(bet_ledger_id, v_ledger),
        updated_at = pg_catalog.now()
    WHERE id = p_round.id;

    RETURN v_ledger;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_settle_win(
    p_round_id UUID,
    p_payout NUMERIC,
    p_public JSONB,
    p_private JSONB,
    p_actor UUID
)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_round private.game_rounds%ROWTYPE;
    v_pay NUMERIC(20,2);
    v_ledger UUID;
BEGIN
    SELECT r.*
    INTO v_round
    FROM private.game_rounds AS r
    WHERE r.id = p_round_id
    FOR UPDATE;

    IF v_round.state IS DISTINCT FROM 'open' THEN
        RETURN v_round;
    END IF;

    v_pay := private.game_money(p_payout);
    IF v_pay < 0 THEN
        RAISE EXCEPTION 'PAYOUT_INVALID';
    END IF;

    IF v_pay > 0 THEN
        SELECT e.ledger_id
        INTO v_ledger
        FROM private.apply_wallet_entry(
            v_round.wallet_id,
            v_pay,
            0,
            'CASINO_WIN',
            'casino',
            'casino-win:' || v_round.id::TEXT,
            'game_round',
            v_round.id::TEXT,
            'player',
            p_actor::TEXT,
            jsonb_build_object('gameCode', v_round.game_code, 'phase', 'win')
        ) AS e;
    ELSE
        v_ledger := NULL;
    END IF;

    UPDATE private.game_rounds
    SET
        state = 'settled',
        payout = v_pay,
        public_result = COALESCE(p_public, public_result),
        private_state = COALESCE(p_private, private_state),
        win_ledger_id = v_ledger,
        settled_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_round_id
    RETURNING * INTO v_round;

    RETURN v_round;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_refund_round(
    p_round_id UUID,
    p_actor UUID
)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_round private.game_rounds%ROWTYPE;
    v_ledger UUID;
BEGIN
    SELECT r.*
    INTO v_round
    FROM private.game_rounds AS r
    WHERE r.id = p_round_id
    FOR UPDATE;

    IF v_round.state IS DISTINCT FROM 'open' THEN
        RAISE EXCEPTION 'GAME_ROUND_NOT_OPEN';
    END IF;
    IF v_round.bet_ledger_id IS NULL THEN
        RAISE EXCEPTION 'GAME_ROUND_NOT_OPEN';
    END IF;

    SELECT e.ledger_id
    INTO v_ledger
    FROM private.apply_wallet_entry(
        v_round.wallet_id,
        v_round.total_stake,
        0,
        'CASINO_REFUND',
        'casino',
        'casino-refund:' || v_round.id::TEXT,
        'game_round',
        v_round.id::TEXT,
        'player',
        p_actor::TEXT,
        jsonb_build_object('gameCode', v_round.game_code, 'phase', 'refund')
    ) AS e;

    UPDATE private.game_rounds
    SET
        state = 'cancelled',
        payout = 0,
        win_ledger_id = v_ledger,
        cancelled_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_round_id
    RETURNING * INTO v_round;

    RETURN v_round;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_adapter_pharaoh_start(p_round_id UUID, p_actor UUID)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_round private.game_rounds%ROWTYPE;
    v_symbols JSONB;
    v_total INTEGER := 0;
    v_roll INTEGER;
    v_acc INTEGER;
    v_i INTEGER;
    v_inner INTEGER;
    v_prize JSONB;
    v_tiles JSONB := '[]'::jsonb;
    v_tile JSONB;
    v_hits JSONB := '[]'::jsonb;
    v_match BOOLEAN := false;
    v_payout NUMERIC(20,2) := 0;
    v_mult NUMERIC;
BEGIN
    SELECT r.* INTO v_round FROM private.game_rounds AS r WHERE r.id = p_round_id FOR UPDATE;
    SELECT c.config->'symbols'
    INTO v_symbols
    FROM private.game_catalog AS c
    WHERE c.game_code = 'pharaoh';

    FOR v_i IN 0 .. jsonb_array_length(v_symbols) - 1 LOOP
        v_total := v_total + COALESCE((v_symbols->v_i->>'w')::INTEGER, 0);
    END LOOP;

    v_roll := private.game_next_int(p_round_id, v_total);
    v_acc := 0;
    FOR v_i IN 0 .. jsonb_array_length(v_symbols) - 1 LOOP
        v_acc := v_acc + COALESCE((v_symbols->v_i->>'w')::INTEGER, 0);
        IF v_roll < v_acc THEN
            v_prize := v_symbols->v_i;
            EXIT;
        END IF;
    END LOOP;
    IF v_prize IS NULL THEN
        v_prize := v_symbols->(jsonb_array_length(v_symbols) - 1);
    END IF;

    FOR v_i IN 1..6 LOOP
        v_tile := NULL;
        v_roll := private.game_next_int(p_round_id, v_total);
        v_acc := 0;
        FOR v_inner IN 0 .. jsonb_array_length(v_symbols) - 1 LOOP
            v_acc := v_acc + COALESCE((v_symbols->v_inner->>'w')::INTEGER, 0);
            IF v_roll < v_acc THEN
                v_tile := v_symbols->v_inner;
                EXIT;
            END IF;
        END LOOP;
        IF v_tile IS NULL THEN
            v_tile := v_symbols->(jsonb_array_length(v_symbols) - 1);
        END IF;
        v_tiles := v_tiles || jsonb_build_array(jsonb_build_object(
            'id', v_tile->>'id',
            'mult', (v_tile->>'mult')::NUMERIC
        ));
        IF (v_tile->>'id') = (v_prize->>'id') THEN
            v_hits := v_hits || to_jsonb(true);
            v_match := true;
        ELSE
            v_hits := v_hits || to_jsonb(false);
        END IF;
    END LOOP;

    v_mult := COALESCE((v_prize->>'mult')::NUMERIC, 0);
    IF v_match THEN
        v_payout := private.game_money(v_round.stake * v_mult);
    END IF;

    RETURN private.game_settle_win(
        p_round_id,
        v_payout,
        jsonb_build_object(
            'prize', jsonb_build_object('id', v_prize->>'id', 'mult', v_mult),
            'tiles', v_tiles,
            'hits', v_hits,
            'matched', v_match,
            'outcome', CASE WHEN v_match THEN 'win' ELSE 'lose' END
        ),
        jsonb_build_object('prize', v_prize, 'tiles', v_tiles),
        p_actor
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_adapter_dice_start(p_round_id UUID, p_actor UUID)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_round private.game_rounds%ROWTYPE;
    v_p1 INTEGER;
    v_p2 INTEGER;
    v_r1 INTEGER;
    v_r2 INTEGER;
    v_ps INTEGER;
    v_rs INTEGER;
    v_outcome TEXT;
    v_payout NUMERIC(20,2);
BEGIN
    SELECT r.* INTO v_round FROM private.game_rounds AS r WHERE r.id = p_round_id FOR UPDATE;
    v_p1 := private.game_next_int(p_round_id, 6) + 1;
    v_p2 := private.game_next_int(p_round_id, 6) + 1;
    v_r1 := private.game_next_int(p_round_id, 6) + 1;
    v_r2 := private.game_next_int(p_round_id, 6) + 1;
    v_ps := v_p1 + v_p2;
    v_rs := v_r1 + v_r2;
    IF v_ps > v_rs THEN
        v_outcome := 'win';
        v_payout := private.game_money(v_round.stake * 2);
    ELSIF v_ps = v_rs THEN
        v_outcome := 'draw';
        v_payout := private.game_money(v_round.stake);
    ELSE
        v_outcome := 'lose';
        v_payout := 0;
    END IF;

    RETURN private.game_settle_win(
        p_round_id,
        v_payout,
        jsonb_build_object(
            'playerDice', jsonb_build_array(v_p1, v_p2),
            'rivalDice', jsonb_build_array(v_r1, v_r2),
            'playerSum', v_ps,
            'rivalSum', v_rs,
            'outcome', v_outcome
        ),
        jsonb_build_object('outcome', v_outcome),
        p_actor
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_bj_card(p_idx INTEGER)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_suits TEXT[] := ARRAY['♠', '♥', '♦', '♣'];
    v_ranks TEXT[] := ARRAY['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    v_vals INTEGER[] := ARRAY[6, 7, 8, 9, 10, 2, 3, 4, 11];
    v_suit INTEGER;
    v_rank INTEGER;
BEGIN
    v_suit := (p_idx / 9);
    v_rank := (p_idx % 9);
    RETURN jsonb_build_object(
        'suit', v_suits[v_suit + 1],
        'rank', v_ranks[v_rank + 1],
        'value', v_vals[v_rank + 1],
        'isHidden', false
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_bj_score(p_hand JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_i INTEGER;
    v_sum INTEGER := 0;
    v_card JSONB;
BEGIN
    IF p_hand IS NULL THEN
        RETURN 0;
    END IF;
    FOR v_i IN 0 .. jsonb_array_length(p_hand) - 1 LOOP
        v_card := p_hand->v_i;
        IF COALESCE((v_card->>'isHidden')::BOOLEAN, false) THEN
            CONTINUE;
        END IF;
        v_sum := v_sum + COALESCE((v_card->>'value')::INTEGER, 0);
    END LOOP;
    RETURN v_sum;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_bj_golden(p_hand JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT jsonb_array_length(p_hand) = 2
       AND COALESCE(p_hand->0->>'rank', '') = 'A'
       AND COALESCE(p_hand->1->>'rank', '') = 'A';
$$;

CREATE OR REPLACE FUNCTION private.game_bj_shuffle(p_round_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_deck JSONB := '[]'::jsonb;
    v_i INTEGER;
    v_j INTEGER;
    v_a JSONB;
    v_b JSONB;
    v_arr JSONB[];
BEGIN
    v_arr := ARRAY[]::JSONB[];
    FOR v_i IN 0..35 LOOP
        v_arr := v_arr || private.game_bj_card(v_i);
    END LOOP;
    FOR v_i IN REVERSE 35..1 LOOP
        v_j := private.game_next_int(p_round_id, v_i + 1);
        v_a := v_arr[v_i + 1];
        v_b := v_arr[v_j + 1];
        v_arr[v_i + 1] := v_b;
        v_arr[v_j + 1] := v_a;
    END LOOP;
    FOREACH v_a IN ARRAY v_arr LOOP
        v_deck := v_deck || jsonb_build_array(v_a);
    END LOOP;
    RETURN v_deck;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_bj_draw(p_deck JSONB, p_hidden BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_card JSONB;
    v_rest JSONB;
BEGIN
    IF jsonb_array_length(p_deck) < 1 THEN
        RAISE EXCEPTION 'GAME_DECK_EMPTY';
    END IF;
    v_card := p_deck->0;
    v_card := jsonb_set(v_card, '{isHidden}', to_jsonb(COALESCE(p_hidden, false)));
    SELECT jsonb_agg(value)
    INTO v_rest
    FROM jsonb_array_elements(p_deck) WITH ORDINALITY AS t(value, ord)
    WHERE ord > 1;
    RETURN jsonb_build_object('card', v_card, 'deck', COALESCE(v_rest, '[]'::jsonb));
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_bj_public(p_player JSONB, p_dealer JSONB, p_stage TEXT, p_result TEXT)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
BEGIN
    RETURN jsonb_build_object(
        'playerHand', COALESCE(p_player, '[]'::jsonb),
        'dealerHand', COALESCE(p_dealer, '[]'::jsonb),
        'playerScore', private.game_bj_score(p_player),
        'dealerScore', private.game_bj_score(p_dealer),
        'stage', p_stage,
        'result', p_result,
        'golden', private.game_bj_golden(p_player)
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_bj_resolve(p_player JSONB, p_dealer JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_ps INTEGER;
    v_ds INTEGER;
    v_player JSONB;
    v_dealer JSONB;
BEGIN
    SELECT jsonb_agg(jsonb_set(value, '{isHidden}', 'false'::jsonb))
    INTO v_player
    FROM jsonb_array_elements(p_player) AS value;
    SELECT jsonb_agg(jsonb_set(value, '{isHidden}', 'false'::jsonb))
    INTO v_dealer
    FROM jsonb_array_elements(p_dealer) AS value;

    IF private.game_bj_golden(v_player) THEN
        RETURN 'golden';
    END IF;
    v_ps := private.game_bj_score(v_player);
    v_ds := private.game_bj_score(v_dealer);
    IF v_ps > 21 THEN
        RETURN 'lose';
    END IF;
    IF private.game_bj_golden(v_dealer) THEN
        RETURN 'lose';
    END IF;
    IF v_ds > 21 THEN
        RETURN 'win';
    END IF;
    IF v_ps > v_ds THEN
        RETURN 'win';
    END IF;
    IF v_ps = v_ds THEN
        RETURN 'push';
    END IF;
    RETURN 'lose';
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_bj_payout(p_stake NUMERIC, p_result TEXT)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE
        WHEN p_result IN ('golden', 'blackjack', 'win') THEN private.game_money(p_stake * 2)
        WHEN p_result = 'push' THEN private.game_money(p_stake)
        ELSE 0
    END;
$$;

CREATE OR REPLACE FUNCTION private.game_bj_reveal(p_hand JSONB)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT COALESCE(
        (SELECT jsonb_agg(jsonb_set(value, '{isHidden}', 'false'::jsonb))
         FROM jsonb_array_elements(p_hand) AS value),
        '[]'::jsonb
    );
$$;

CREATE OR REPLACE FUNCTION private.game_adapter_blackjack_finish(
    p_round_id UUID,
    p_player JSONB,
    p_dealer JSONB,
    p_deck JSONB,
    p_actor UUID
)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_round private.game_rounds%ROWTYPE;
    v_dealer JSONB := private.game_bj_reveal(p_dealer);
    v_drawn JSONB;
    v_result TEXT;
    v_pub JSONB;
BEGIN
    SELECT r.* INTO v_round FROM private.game_rounds AS r WHERE r.id = p_round_id FOR UPDATE;
    WHILE private.game_bj_score(v_dealer) < 17 LOOP
        v_drawn := private.game_bj_draw(p_deck, false);
        v_dealer := v_dealer || jsonb_build_array(v_drawn->'card');
        p_deck := v_drawn->'deck';
    END LOOP;
    v_result := private.game_bj_resolve(p_player, v_dealer);
    v_pub := private.game_bj_public(p_player, v_dealer, 'gameOver', v_result);
    RETURN private.game_settle_win(
        p_round_id,
        private.game_bj_payout(v_round.stake, v_result),
        v_pub,
        jsonb_build_object('deck', p_deck, 'playerHand', p_player, 'dealerHand', v_dealer, 'result', v_result),
        p_actor
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_adapter_blackjack_start(p_round_id UUID, p_actor UUID)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_deck JSONB;
    v_drawn JSONB;
    v_player JSONB := '[]'::jsonb;
    v_dealer JSONB := '[]'::jsonb;
    v_pub JSONB;
    v_round private.game_rounds%ROWTYPE;
BEGIN
    v_deck := private.game_bj_shuffle(p_round_id);

    v_drawn := private.game_bj_draw(v_deck, false);
    v_player := v_player || jsonb_build_array(v_drawn->'card');
    v_deck := v_drawn->'deck';

    v_drawn := private.game_bj_draw(v_deck, false);
    v_dealer := v_dealer || jsonb_build_array(v_drawn->'card');
    v_deck := v_drawn->'deck';

    v_drawn := private.game_bj_draw(v_deck, false);
    v_player := v_player || jsonb_build_array(v_drawn->'card');
    v_deck := v_drawn->'deck';

    v_drawn := private.game_bj_draw(v_deck, true);
    v_dealer := v_dealer || jsonb_build_array(v_drawn->'card');
    v_deck := v_drawn->'deck';

    IF private.game_bj_golden(v_player) OR private.game_bj_score(v_player) >= 21 THEN
        RETURN private.game_adapter_blackjack_finish(p_round_id, v_player, v_dealer, v_deck, p_actor);
    END IF;

    v_pub := private.game_bj_public(v_player, v_dealer, 'playerTurn', NULL);
    UPDATE private.game_rounds
    SET
        public_result = v_pub,
        private_state = jsonb_build_object(
            'deck', v_deck,
            'playerHand', v_player,
            'dealerHand', v_dealer
        ),
        updated_at = pg_catalog.now()
    WHERE id = p_round_id
    RETURNING * INTO v_round;
    RETURN v_round;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_adapter_blackjack_action(
    p_round_id UUID,
    p_action TEXT,
    p_options JSONB,
    p_actor UUID
)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_round private.game_rounds%ROWTYPE;
    v_deck JSONB;
    v_player JSONB;
    v_dealer JSONB;
    v_drawn JSONB;
    v_action TEXT;
BEGIN
    SELECT r.* INTO v_round FROM private.game_rounds AS r WHERE r.id = p_round_id FOR UPDATE;
    IF v_round.state IS DISTINCT FROM 'open' THEN
        RAISE EXCEPTION 'GAME_ROUND_NOT_OPEN';
    END IF;
    IF COALESCE(v_round.public_result->>'stage', '') IS DISTINCT FROM 'playerTurn' THEN
        RAISE EXCEPTION 'ACTION_NOT_ALLOWED';
    END IF;

    v_action := LOWER(BTRIM(p_action));
    v_deck := v_round.private_state->'deck';
    v_player := v_round.private_state->'playerHand';
    v_dealer := v_round.private_state->'dealerHand';

    IF v_action = 'hit' THEN
        v_drawn := private.game_bj_draw(v_deck, false);
        v_player := v_player || jsonb_build_array(v_drawn->'card');
        v_deck := v_drawn->'deck';
        IF private.game_bj_score(v_player) >= 21 OR private.game_bj_golden(v_player) THEN
            RETURN private.game_adapter_blackjack_finish(p_round_id, v_player, v_dealer, v_deck, p_actor);
        END IF;
        UPDATE private.game_rounds
        SET
            public_result = private.game_bj_public(v_player, v_dealer, 'playerTurn', NULL),
            private_state = jsonb_build_object('deck', v_deck, 'playerHand', v_player, 'dealerHand', v_dealer),
            updated_at = pg_catalog.now()
        WHERE id = p_round_id
        RETURNING * INTO v_round;
        RETURN v_round;
    END IF;

    IF v_action = 'stand' THEN
        RETURN private.game_adapter_blackjack_finish(p_round_id, v_player, v_dealer, v_deck, p_actor);
    END IF;

    RAISE EXCEPTION 'ACTION_NOT_ALLOWED';
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_apples_public(p_priv JSONB, p_phase TEXT)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_rows JSONB := '[]'::jsonb;
    v_row JSONB;
    v_cells JSONB;
    v_cell JSONB;
    v_out_cells JSONB;
    v_i INTEGER;
    v_j INTEGER;
    v_reveal BOOLEAN;
BEGIN
    v_reveal := p_phase IN ('lost');
    FOR v_i IN 0 .. jsonb_array_length(p_priv->'rows') - 1 LOOP
        v_row := p_priv->'rows'->v_i;
        v_out_cells := '[]'::jsonb;
        FOR v_j IN 0 .. jsonb_array_length(v_row->'cells') - 1 LOOP
            v_cell := v_row->'cells'->v_j;
            v_out_cells := v_out_cells || jsonb_build_array(jsonb_build_object(
                'id', v_cell->>'id',
                'revealed', COALESCE((v_cell->>'revealed')::BOOLEAN, false) OR v_reveal,
                'picked', COALESCE((v_cell->>'picked')::BOOLEAN, false),
                'kind', CASE
                    WHEN COALESCE((v_cell->>'revealed')::BOOLEAN, false) OR v_reveal
                    THEN v_cell->>'kind'
                    ELSE NULL
                END
            ));
        END LOOP;
        v_rows := v_rows || jsonb_build_array(jsonb_build_object(
            'level', (v_row->>'level')::INTEGER,
            'multiplier', (v_row->>'multiplier')::NUMERIC,
            'cells', v_out_cells
        ));
    END LOOP;

    RETURN jsonb_build_object(
        'rows', v_rows,
        'activeLevel', COALESCE((p_priv->>'activeLevel')::INTEGER, 1),
        'lastWonLevel', COALESCE((p_priv->>'lastWonLevel')::INTEGER, 0),
        'phase', p_phase,
        'cashoutValue', COALESCE((p_priv->>'cashoutValue')::NUMERIC, 0)
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_adapter_apples_start(p_round_id UUID, p_actor UUID)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_levels JSONB;
    v_rows JSONB := '[]'::jsonb;
    v_level JSONB;
    v_i INTEGER;
    v_k INTEGER;
    v_kinds TEXT[];
    v_j INTEGER;
    v_tmp TEXT;
    v_cells JSONB;
    v_priv JSONB;
    v_round private.game_rounds%ROWTYPE;
BEGIN
    SELECT c.config->'levels' INTO v_levels FROM private.game_catalog AS c WHERE c.game_code = 'apples';
    FOR v_i IN 0 .. jsonb_array_length(v_levels) - 1 LOOP
        v_level := v_levels->v_i;
        v_kinds := ARRAY[]::TEXT[];
        FOR v_k IN 1 .. COALESCE((v_level->>'good')::INTEGER, 0) LOOP
            v_kinds := v_kinds || 'good';
        END LOOP;
        FOR v_k IN 1 .. COALESCE((v_level->>'bad')::INTEGER, 0) LOOP
            v_kinds := v_kinds || 'bad';
        END LOOP;
        FOR v_k IN REVERSE COALESCE(array_length(v_kinds, 1), 0) .. 2 LOOP
            v_j := private.game_next_int(p_round_id, v_k) + 1;
            v_tmp := v_kinds[v_k];
            v_kinds[v_k] := v_kinds[v_j];
            v_kinds[v_j] := v_tmp;
        END LOOP;
        v_cells := '[]'::jsonb;
        FOR v_k IN 1 .. COALESCE(array_length(v_kinds, 1), 0) LOOP
            v_cells := v_cells || jsonb_build_array(jsonb_build_object(
                'id', (v_level->>'level') || '-' || (v_k - 1)::TEXT,
                'kind', v_kinds[v_k],
                'revealed', false,
                'picked', false
            ));
        END LOOP;
        v_rows := v_rows || jsonb_build_array(jsonb_build_object(
            'level', (v_level->>'level')::INTEGER,
            'multiplier', (v_level->>'multiplier')::NUMERIC,
            'cells', v_cells
        ));
    END LOOP;

    v_priv := jsonb_build_object(
        'rows', v_rows,
        'activeLevel', 1,
        'lastWonLevel', 0,
        'cashoutValue', 0
    );
    UPDATE private.game_rounds
    SET
        public_result = private.game_apples_public(v_priv, 'playing'),
        private_state = v_priv,
        updated_at = pg_catalog.now()
    WHERE id = p_round_id
    RETURNING * INTO v_round;
    RETURN v_round;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_adapter_apples_action(
    p_round_id UUID,
    p_action TEXT,
    p_options JSONB,
    p_actor UUID
)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_round private.game_rounds%ROWTYPE;
    v_priv JSONB;
    v_action TEXT;
    v_col INTEGER;
    v_level INTEGER;
    v_row JSONB;
    v_cell JSONB;
    v_cells JSONB;
    v_i INTEGER;
    v_kind TEXT;
    v_last INTEGER;
    v_mult NUMERIC;
    v_payout NUMERIC(20,2);
    v_phase TEXT;
BEGIN
    SELECT r.* INTO v_round FROM private.game_rounds AS r WHERE r.id = p_round_id FOR UPDATE;
    IF v_round.state IS DISTINCT FROM 'open' THEN
        RAISE EXCEPTION 'GAME_ROUND_NOT_OPEN';
    END IF;
    v_priv := v_round.private_state;
    v_action := LOWER(BTRIM(p_action));

    IF v_action = 'cashout' THEN
        v_payout := private.game_money(COALESCE((v_priv->>'cashoutValue')::NUMERIC, 0));
        IF v_payout <= 0 THEN
            RAISE EXCEPTION 'ACTION_NOT_ALLOWED';
        END IF;
        v_priv := jsonb_set(v_priv, '{phase}', '"cashed"'::jsonb);
        RETURN private.game_settle_win(
            p_round_id,
            v_payout,
            private.game_apples_public(v_priv, 'cashed') || jsonb_build_object('outcome', 'win'),
            v_priv,
            p_actor
        );
    END IF;

    IF v_action IS DISTINCT FROM 'pick' THEN
        RAISE EXCEPTION 'ACTION_NOT_ALLOWED';
    END IF;

    v_col := COALESCE((p_options->>'col')::INTEGER, (p_options->>'column')::INTEGER);
    IF v_col IS NULL OR v_col < 0 THEN
        RAISE EXCEPTION 'ACTION_NOT_ALLOWED';
    END IF;
    v_level := COALESCE((v_priv->>'activeLevel')::INTEGER, 1);
    v_row := v_priv->'rows'->(v_level - 1);
    IF v_row IS NULL THEN
        RAISE EXCEPTION 'ACTION_NOT_ALLOWED';
    END IF;
    v_cell := v_row->'cells'->v_col;
    IF v_cell IS NULL OR COALESCE((v_cell->>'revealed')::BOOLEAN, false) THEN
        RAISE EXCEPTION 'ACTION_NOT_ALLOWED';
    END IF;
    v_kind := v_cell->>'kind';
    v_cells := v_row->'cells';
    v_cells := jsonb_set(v_cells, ARRAY[v_col::TEXT], v_cell || jsonb_build_object('revealed', true, 'picked', true));
    v_row := jsonb_set(v_row, '{cells}', v_cells);
    v_priv := jsonb_set(v_priv, ARRAY['rows', (v_level - 1)::TEXT], v_row);

    IF v_kind = 'bad' THEN
        RETURN private.game_settle_win(
            p_round_id,
            0,
            private.game_apples_public(v_priv, 'lost') || jsonb_build_object('outcome', 'lose'),
            v_priv,
            p_actor
        );
    END IF;

    SELECT (value->>'multiplier')::NUMERIC
    INTO v_mult
    FROM jsonb_array_elements(v_priv->'rows') AS value
    WHERE (value->>'level')::INTEGER = v_level;
    v_last := v_level;
    v_priv := jsonb_set(v_priv, '{lastWonLevel}', to_jsonb(v_last));
    v_priv := jsonb_set(v_priv, '{cashoutValue}', to_jsonb(private.game_money(v_round.stake * v_mult)));
    IF v_level >= jsonb_array_length(v_priv->'rows') THEN
        v_phase := 'cleared';
    ELSE
        v_phase := 'playing';
        v_priv := jsonb_set(v_priv, '{activeLevel}', to_jsonb(v_level + 1));
    END IF;

    UPDATE private.game_rounds
    SET
        public_result = private.game_apples_public(v_priv, v_phase),
        private_state = v_priv,
        updated_at = pg_catalog.now()
    WHERE id = p_round_id
    RETURNING * INTO v_round;
    RETURN v_round;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_crystal_kind(p_round_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_roll INTEGER;
    v_acc INTEGER := 0;
    v_w INTEGER[] := ARRAY[18, 17, 17, 16, 15, 14, 3];
    v_k TEXT[] := ARRAY['green', 'cyan', 'red', 'blue', 'purple', 'orange', 'coin'];
    v_i INTEGER;
BEGIN
    v_roll := private.game_next_int(p_round_id, 100);
    FOR v_i IN 1..7 LOOP
        v_acc := v_acc + v_w[v_i];
        IF v_roll < v_acc THEN
            RETURN v_k[v_i];
        END IF;
    END LOOP;
    RETURN 'green';
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_crystal_mult(p_kind TEXT, p_size INTEGER)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
BEGIN
    IF p_size < 5 THEN
        RETURN 0;
    END IF;
    IF p_kind = 'coin' THEN
        IF p_size >= 10 THEN RETURN 20; END IF;
        IF p_size = 9 THEN RETURN 16; END IF;
        IF p_size = 8 THEN RETURN 12; END IF;
        IF p_size = 7 THEN RETURN 10; END IF;
        IF p_size = 6 THEN RETURN 8; END IF;
        RETURN 5;
    END IF;
    IF p_size >= 11 THEN RETURN 5; END IF;
    IF p_size = 10 THEN RETURN 4.5; END IF;
    IF p_size = 9 THEN RETURN 4; END IF;
    IF p_size = 8 THEN RETURN 3.5; END IF;
    IF p_size = 7 THEN RETURN 3; END IF;
    IF p_size = 6 THEN RETURN 2; END IF;
    RETURN 0.6;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_crystal_combo(p_idx INTEGER)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE
        WHEN p_idx <= 0 THEN 1
        WHEN p_idx = 1 THEN 2
        WHEN p_idx = 2 THEN 3
        ELSE 5
    END;
$$;

CREATE OR REPLACE FUNCTION private.game_adapter_crystal_start(p_round_id UUID, p_actor UUID)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_round private.game_rounds%ROWTYPE;
    v_board TEXT[];
    v_ids TEXT[];
    v_i INTEGER;
    v_seq INTEGER := 0;
    v_steps JSONB := '[]'::jsonb;
    v_total NUMERIC := 0;
    v_win_index INTEGER := 0;
    v_safety INTEGER;
    v_seen BOOLEAN[];
    v_kind TEXT;
    v_nbs INTEGER[];
    v_q INTEGER[];
    v_idx INTEGER;
    v_cur INTEGER;
    v_cluster INTEGER[];
    v_clusters JSONB;
    v_exploding BOOLEAN[];
    v_cluster_sum NUMERIC;
    v_size INTEGER;
    v_combo NUMERIC;
    v_step_win NUMERIC;
    v_next TEXT[];
    v_next_ids TEXT[];
    v_col INTEGER;
    v_row INTEGER;
    v_stack TEXT[];
    v_stack_ids TEXT[];
    v_nb INTEGER;
    v_has BOOLEAN;
    v_board_json JSONB;
    v_next_json JSONB;
    v_exp_json JSONB;
    v_start_json JSONB;
BEGIN
    SELECT r.* INTO v_round FROM private.game_rounds AS r WHERE r.id = p_round_id FOR UPDATE;
    v_board := ARRAY[]::TEXT[];
    v_ids := ARRAY[]::TEXT[];
    FOR v_i IN 1..49 LOOP
        v_seq := v_seq + 1;
        v_board := v_board || private.game_crystal_kind(p_round_id);
        v_ids := v_ids || ('g' || v_seq::TEXT);
    END LOOP;

    v_start_json := '[]'::jsonb;
    FOR v_i IN 1..49 LOOP
        v_start_json := v_start_json || jsonb_build_array(jsonb_build_object('id', v_ids[v_i], 'kind', v_board[v_i]));
    END LOOP;

    FOR v_safety IN 1..20 LOOP
        v_seen := ARRAY[]::BOOLEAN[];
        FOR v_i IN 1..49 LOOP
            v_seen := v_seen || false;
        END LOOP;
        v_clusters := '[]'::jsonb;
        v_exploding := ARRAY[]::BOOLEAN[];
        FOR v_i IN 1..49 LOOP
            v_exploding := v_exploding || false;
        END LOOP;
        v_has := false;
        v_cluster_sum := 0;

        FOR v_idx IN 1..49 LOOP
            IF v_seen[v_idx] THEN
                CONTINUE;
            END IF;
            v_kind := v_board[v_idx];
            v_q := ARRAY[v_idx];
            v_cluster := ARRAY[]::INTEGER[];
            v_seen[v_idx] := true;
            WHILE array_length(v_q, 1) IS NOT NULL LOOP
                v_cur := v_q[array_length(v_q, 1)];
                v_q := v_q[1:array_length(v_q, 1) - 1];
                v_cluster := v_cluster || v_cur;
                v_nbs := ARRAY[]::INTEGER[];
                IF v_cur > 7 THEN v_nbs := v_nbs || (v_cur - 7); END IF;
                IF v_cur <= 42 THEN v_nbs := v_nbs || (v_cur + 7); END IF;
                IF ((v_cur - 1) % 7) > 0 THEN v_nbs := v_nbs || (v_cur - 1); END IF;
                IF ((v_cur - 1) % 7) < 6 THEN v_nbs := v_nbs || (v_cur + 1); END IF;
                FOREACH v_nb IN ARRAY v_nbs LOOP
                    IF NOT v_seen[v_nb] AND v_board[v_nb] = v_kind THEN
                        v_seen[v_nb] := true;
                        v_q := v_q || v_nb;
                    END IF;
                END LOOP;
            END LOOP;
            v_size := COALESCE(array_length(v_cluster, 1), 0);
            IF v_size >= 5 THEN
                v_has := true;
                v_cluster_sum := v_cluster_sum + private.game_crystal_mult(v_kind, v_size);
                v_clusters := v_clusters || jsonb_build_array(jsonb_build_object(
                    'kind', v_kind,
                    'indices', to_jsonb(v_cluster),
                    'multiplier', private.game_crystal_mult(v_kind, v_size)
                ));
                FOREACH v_cur IN ARRAY v_cluster LOOP
                    v_exploding[v_cur] := true;
                END LOOP;
            END IF;
        END LOOP;

        IF NOT v_has THEN
            EXIT;
        END IF;

        v_combo := private.game_crystal_combo(v_win_index);
        v_step_win := private.game_money(v_round.stake * v_cluster_sum * v_combo);
        v_total := private.game_money(v_total + v_step_win);

        v_board_json := '[]'::jsonb;
        v_exp_json := '[]'::jsonb;
        FOR v_i IN 1..49 LOOP
            v_board_json := v_board_json || jsonb_build_array(jsonb_build_object('id', v_ids[v_i], 'kind', v_board[v_i]));
            v_exp_json := v_exp_json || to_jsonb(v_exploding[v_i]);
        END LOOP;

        v_next := ARRAY[]::TEXT[];
        v_next_ids := ARRAY[]::TEXT[];
        FOR v_i IN 1..49 LOOP
            v_next := array_append(v_next, NULL);
            v_next_ids := array_append(v_next_ids, NULL);
        END LOOP;
        FOR v_col IN 0..6 LOOP
            v_stack := ARRAY[]::TEXT[];
            v_stack_ids := ARRAY[]::TEXT[];
            FOR v_row IN REVERSE 6..0 LOOP
                v_i := v_row * 7 + v_col + 1;
                IF NOT v_exploding[v_i] THEN
                    v_stack := v_stack || v_board[v_i];
                    v_stack_ids := v_stack_ids || v_ids[v_i];
                END IF;
            END LOOP;
            FOR v_i IN 1 .. COALESCE(array_length(v_stack, 1), 0) LOOP
                v_idx := (6 - (v_i - 1)) * 7 + v_col + 1;
                v_next[v_idx] := v_stack[v_i];
                v_next_ids[v_idx] := v_stack_ids[v_i];
            END LOOP;
            FOR v_row IN 0 .. (6 - COALESCE(array_length(v_stack, 1), 0)) LOOP
                v_idx := v_row * 7 + v_col + 1;
                v_seq := v_seq + 1;
                v_next[v_idx] := private.game_crystal_kind(p_round_id);
                v_next_ids[v_idx] := 'g' || v_seq::TEXT;
            END LOOP;
        END LOOP;

        v_next_json := '[]'::jsonb;
        FOR v_i IN 1..49 LOOP
            v_next_json := v_next_json || jsonb_build_array(jsonb_build_object('id', v_next_ids[v_i], 'kind', v_next[v_i]));
        END LOOP;

        v_steps := v_steps || jsonb_build_array(jsonb_build_object(
            'board', v_board_json,
            'clusters', v_clusters,
            'exploding', v_exp_json,
            'combo', v_combo,
            'stepWin', v_step_win,
            'nextBoard', v_next_json
        ));
        v_board := v_next;
        v_ids := v_next_ids;
        v_win_index := v_win_index + 1;
    END LOOP;

    RETURN private.game_settle_win(
        p_round_id,
        v_total,
        jsonb_build_object(
            'startBoard', v_start_json,
            'steps', v_steps,
            'totalWin', v_total,
            'totalMultiplier', CASE WHEN v_round.stake > 0 THEN ROUND(v_total / v_round.stake, 2) ELSE 0 END,
            'outcome', CASE WHEN v_total > 0 THEN 'win' ELSE 'lose' END
        ),
        jsonb_build_object('totalWin', v_total),
        p_actor
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_aviator_multiplier(p_seconds NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
BEGIN
    IF p_seconds <= 0 THEN
        RETURN 1;
    END IF;
    RETURN ROUND(1 + 0.06 * POWER(p_seconds, 1.7), 4);
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_aviator_crash(p_seed TEXT, p_round_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_hex TEXT;
    v_e NUMERIC;
    v_raw NUMERIC;
BEGIN
    v_hex := substr(encode(private.game_hmac(p_seed, p_round_id::TEXT || ':crash:1'), 'hex'), 1, 13);
    v_e := LEAST(('x' || v_hex)::bit(52)::bigint::NUMERIC / POWER(2::NUMERIC, 52), 0.999999999999);
    v_raw := FLOOR(96 / (1 - v_e)) / 100.0;
    RETURN GREATEST(1.00, ROUND(v_raw, 2));
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_adapter_aviator_start(p_round_id UUID, p_options JSONB, p_actor UUID)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_round private.game_rounds%ROWTYPE;
    v_crash NUMERIC(20,2);
    v_auto NUMERIC(20,2);
    v_started TIMESTAMPTZ := pg_catalog.now();
BEGIN
    SELECT r.* INTO v_round FROM private.game_rounds AS r WHERE r.id = p_round_id FOR UPDATE;
    v_crash := private.game_aviator_crash(v_round.server_seed, p_round_id);
    v_auto := NULL;
    IF p_options ? 'autoCashout' THEN
        v_auto := private.game_money((p_options->>'autoCashout')::NUMERIC);
        IF v_auto IS NULL OR v_auto < 1.01 THEN
            v_auto := NULL;
        END IF;
    END IF;

    UPDATE private.game_rounds
    SET
        public_result = jsonb_build_object(
            'startedAt', v_started,
            'serverNow', v_started,
            'autoCashout', v_auto,
            'currentMultiplier', 1,
            'phase', 'flying'
        ),
        private_state = jsonb_build_object(
            'crashPoint', v_crash,
            'startedAt', v_started,
            'autoCashout', v_auto
        ),
        updated_at = v_started
    WHERE id = p_round_id
    RETURNING * INTO v_round;
    RETURN v_round;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_adapter_aviator_progress(p_round_id UUID, p_actor UUID)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_round private.game_rounds%ROWTYPE;
    v_started TIMESTAMPTZ;
    v_crash NUMERIC;
    v_auto NUMERIC;
    v_elapsed NUMERIC;
    v_mult NUMERIC;
    v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
    SELECT r.* INTO v_round FROM private.game_rounds AS r WHERE r.id = p_round_id FOR UPDATE;
    IF v_round.state IS DISTINCT FROM 'open' THEN
        RETURN v_round;
    END IF;
    v_started := (v_round.private_state->>'startedAt')::TIMESTAMPTZ;
    v_crash := (v_round.private_state->>'crashPoint')::NUMERIC;
    v_auto := (v_round.private_state->>'autoCashout')::NUMERIC;
    v_elapsed := EXTRACT(EPOCH FROM (v_now - v_started));
    v_mult := private.game_aviator_multiplier(v_elapsed);

    IF v_auto IS NOT NULL AND v_auto <= v_crash AND v_mult >= v_auto THEN
        RETURN private.game_settle_win(
            p_round_id,
            private.game_money(v_round.stake * v_auto),
            jsonb_build_object(
                'phase', 'cashed',
                'crashPoint', v_crash,
                'cashedAt', v_auto,
                'currentMultiplier', v_auto,
                'outcome', 'win',
                'startedAt', v_started,
                'serverNow', v_now
            ),
            v_round.private_state || jsonb_build_object('cashedAt', v_auto),
            p_actor
        );
    END IF;

    IF v_mult >= v_crash THEN
        RETURN private.game_settle_win(
            p_round_id,
            0,
            jsonb_build_object(
                'phase', 'crashed',
                'crashPoint', v_crash,
                'currentMultiplier', v_crash,
                'outcome', 'lose',
                'startedAt', v_started,
                'serverNow', v_now
            ),
            v_round.private_state,
            p_actor
        );
    END IF;

    UPDATE private.game_rounds
    SET
        public_result = jsonb_build_object(
            'startedAt', v_started,
            'serverNow', v_now,
            'autoCashout', v_auto,
            'currentMultiplier', v_mult,
            'phase', 'flying'
        ),
        updated_at = v_now
    WHERE id = p_round_id
    RETURNING * INTO v_round;
    RETURN v_round;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_adapter_aviator_action(
    p_round_id UUID,
    p_action TEXT,
    p_options JSONB,
    p_actor UUID
)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_round private.game_rounds%ROWTYPE;
    v_started TIMESTAMPTZ;
    v_crash NUMERIC;
    v_elapsed NUMERIC;
    v_mult NUMERIC;
    v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
    v_round := private.game_adapter_aviator_progress(p_round_id, p_actor);
    IF v_round.state IS DISTINCT FROM 'open' THEN
        RETURN v_round;
    END IF;
    IF LOWER(BTRIM(p_action)) IS DISTINCT FROM 'cashout' THEN
        RAISE EXCEPTION 'ACTION_NOT_ALLOWED';
    END IF;

    v_started := (v_round.private_state->>'startedAt')::TIMESTAMPTZ;
    v_crash := (v_round.private_state->>'crashPoint')::NUMERIC;
    v_elapsed := EXTRACT(EPOCH FROM (v_now - v_started));
    v_mult := private.game_aviator_multiplier(v_elapsed);

    IF v_mult >= v_crash THEN
        RETURN private.game_settle_win(
            p_round_id,
            0,
            jsonb_build_object(
                'phase', 'crashed',
                'crashPoint', v_crash,
                'currentMultiplier', v_crash,
                'outcome', 'lose',
                'startedAt', v_started,
                'serverNow', v_now
            ),
            v_round.private_state,
            p_actor
        );
    END IF;

    RETURN private.game_settle_win(
        p_round_id,
        private.game_money(v_round.stake * v_mult),
        jsonb_build_object(
            'phase', 'cashed',
            'crashPoint', v_crash,
            'cashedAt', v_mult,
            'currentMultiplier', v_mult,
            'outcome', 'win',
            'startedAt', v_started,
            'serverNow', v_now
        ),
        v_round.private_state || jsonb_build_object('cashedAt', v_mult),
        p_actor
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_adapter_start(
    p_round_id UUID,
    p_game_code TEXT,
    p_options JSONB,
    p_actor UUID
)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
BEGIN
    CASE p_game_code
        WHEN 'pharaoh' THEN RETURN private.game_adapter_pharaoh_start(p_round_id, p_actor);
        WHEN 'dice' THEN RETURN private.game_adapter_dice_start(p_round_id, p_actor);
        WHEN 'blackjack' THEN RETURN private.game_adapter_blackjack_start(p_round_id, p_actor);
        WHEN 'apples' THEN RETURN private.game_adapter_apples_start(p_round_id, p_actor);
        WHEN 'crystal' THEN RETURN private.game_adapter_crystal_start(p_round_id, p_actor);
        WHEN 'aviator' THEN RETURN private.game_adapter_aviator_start(p_round_id, p_options, p_actor);
        ELSE RAISE EXCEPTION 'GAME_ADAPTER_NOT_IMPLEMENTED';
    END CASE;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_adapter_action(
    p_round_id UUID,
    p_game_code TEXT,
    p_action TEXT,
    p_options JSONB,
    p_actor UUID
)
RETURNS private.game_rounds
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
BEGIN
    CASE p_game_code
        WHEN 'blackjack' THEN
            RETURN private.game_adapter_blackjack_action(p_round_id, p_action, p_options, p_actor);
        WHEN 'apples' THEN
            RETURN private.game_adapter_apples_action(p_round_id, p_action, p_options, p_actor);
        WHEN 'aviator' THEN
            RETURN private.game_adapter_aviator_action(p_round_id, p_action, p_options, p_actor);
        ELSE
            RAISE EXCEPTION 'ACTION_NOT_ALLOWED';
    END CASE;
END;
$fn$;


-- ============================================================
-- 6. GENERIC ENGINE
-- ============================================================

CREATE OR REPLACE FUNCTION private.game_engine_start(
    p_game_code TEXT,
    p_stake NUMERIC,
    p_idempotency_key TEXT,
    p_options JSONB
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_cat private.game_catalog%ROWTYPE;
    v_key TEXT;
    v_opts JSONB;
    v_fp TEXT;
    v_existing private.game_rounds%ROWTYPE;
    v_round private.game_rounds%ROWTYPE;
    v_seed TEXT;
    v_hash TEXT;
    v_stake NUMERIC(20,2);
    v_json JSONB;
BEGIN
    SELECT * INTO v_ctx FROM private.game_require_player_context();
    v_cat := private.game_require_catalog(p_game_code);
    v_key := private.game_require_idempotency_key(p_idempotency_key);
    v_opts := private.game_sanitize_options(p_options);

    IF p_stake IS NULL OR p_stake <= 0 THEN
        RAISE EXCEPTION 'STAKE_NOT_POSITIVE';
    END IF;
    IF p_stake <> ROUND(p_stake, 2) THEN
        RAISE EXCEPTION 'STAKE_SCALE_INVALID';
    END IF;
    v_stake := ROUND(p_stake, 2);
    IF v_stake < v_cat.min_stake THEN
        RAISE EXCEPTION 'STAKE_BELOW_MIN';
    END IF;
    IF v_cat.max_stake IS NOT NULL AND v_stake > v_cat.max_stake THEN
        RAISE EXCEPTION 'STAKE_ABOVE_MAX';
    END IF;

    v_fp := private.game_fingerprint(jsonb_build_object(
        'gameCode', v_cat.game_code,
        'stake', v_stake,
        'options', v_opts
    ));

    SELECT r.*
    INTO v_existing
    FROM private.game_rounds AS r
    WHERE r.player_user_id = v_ctx.user_id
      AND r.start_idempotency_key = v_key
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing.start_fingerprint IS DISTINCT FROM v_fp THEN
            RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
        END IF;
        IF v_existing.start_response IS NOT NULL THEN
            RETURN v_existing.start_response;
        END IF;
        RETURN private.game_round_json(
            v_existing,
            private.game_current_balance(v_existing.wallet_id),
            true,
            private.game_allowed_actions(v_existing)
        );
    END IF;

    v_seed := encode(extensions.gen_random_bytes(32), 'hex');
    v_hash := private.game_sha256_hex(v_seed);

    INSERT INTO private.game_rounds (
        player_user_id,
        wallet_id,
        game_code,
        state,
        stake,
        total_stake,
        payout,
        server_seed,
        server_seed_hash,
        nonce,
        start_idempotency_key,
        start_fingerprint
    ) VALUES (
        v_ctx.user_id,
        v_ctx.wallet_id,
        v_cat.game_code,
        'open',
        v_stake,
        v_stake,
        0,
        v_seed,
        v_hash,
        0,
        v_key,
        v_fp
    )
    RETURNING * INTO v_round;

    PERFORM private.game_apply_bet(v_round, v_stake, v_ctx.user_id);
    v_round := private.game_adapter_start(v_round.id, v_cat.game_code, v_opts, v_ctx.user_id);
    v_json := private.game_round_json(
        v_round,
        private.game_current_balance(v_round.wallet_id),
        false,
        private.game_allowed_actions(v_round)
    );
    UPDATE private.game_rounds
    SET start_response = v_json, updated_at = pg_catalog.now()
    WHERE id = v_round.id;
    RETURN v_json;
EXCEPTION
    WHEN unique_violation THEN
        SELECT r.*
        INTO v_existing
        FROM private.game_rounds AS r
        WHERE r.player_user_id = v_ctx.user_id
          AND r.start_idempotency_key = v_key
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE;
        END IF;
        IF v_existing.start_fingerprint IS DISTINCT FROM v_fp THEN
            RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
        END IF;
        IF v_existing.start_response IS NOT NULL THEN
            RETURN v_existing.start_response;
        END IF;
        RETURN private.game_round_json(
            v_existing,
            private.game_current_balance(v_existing.wallet_id),
            true,
            private.game_allowed_actions(v_existing)
        );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_engine_action(
    p_round_id UUID,
    p_action TEXT,
    p_idempotency_key TEXT,
    p_options JSONB
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_key TEXT;
    v_opts JSONB;
    v_fp TEXT;
    v_action TEXT;
    v_round private.game_rounds%ROWTYPE;
    v_existing private.game_actions%ROWTYPE;
    v_seq BIGINT;
    v_json JSONB;
BEGIN
    SELECT * INTO v_ctx FROM private.game_require_player_context();
    v_key := private.game_require_idempotency_key(p_idempotency_key);
    v_action := NULLIF(BTRIM(LOWER(COALESCE(p_action, ''))), '');
    IF v_action IS NULL THEN
        RAISE EXCEPTION 'ACTION_REQUIRED';
    END IF;
    v_opts := private.game_sanitize_options(p_options);
    v_fp := private.game_fingerprint(jsonb_build_object(
        'action', v_action,
        'options', v_opts
    ));

    v_round := private.game_lock_round_owned(p_round_id, v_ctx.user_id);

    SELECT a.*
    INTO v_existing
    FROM private.game_actions AS a
    WHERE a.round_id = v_round.id
      AND a.idempotency_key = v_key
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing.request_fingerprint IS DISTINCT FROM v_fp THEN
            RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
        END IF;
        RETURN v_existing.response_payload;
    END IF;

    IF v_round.game_code = 'aviator' THEN
        v_round := private.game_adapter_aviator_progress(v_round.id, v_ctx.user_id);
    END IF;

    IF v_round.state IS DISTINCT FROM 'open' THEN
        RAISE EXCEPTION 'GAME_ROUND_NOT_OPEN';
    END IF;

    v_round := private.game_adapter_action(v_round.id, v_round.game_code, v_action, v_opts, v_ctx.user_id);
    v_json := private.game_round_json(
        v_round,
        private.game_current_balance(v_round.wallet_id),
        false,
        private.game_allowed_actions(v_round)
    );

    SELECT COALESCE(MAX(a.seq), 0) + 1
    INTO v_seq
    FROM private.game_actions AS a
    WHERE a.round_id = v_round.id;

    INSERT INTO private.game_actions (
        round_id, seq, action_type, idempotency_key, request_fingerprint, request_payload, response_payload
    ) VALUES (
        v_round.id, v_seq, v_action, v_key, v_fp, jsonb_build_object('action', v_action, 'options', v_opts), v_json
    );

    RETURN v_json;
EXCEPTION
    WHEN unique_violation THEN
        SELECT a.*
        INTO v_existing
        FROM private.game_actions AS a
        WHERE a.round_id = p_round_id
          AND a.idempotency_key = v_key
        FOR UPDATE;
        IF FOUND THEN
            IF v_existing.request_fingerprint IS DISTINCT FROM v_fp THEN
                RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
            END IF;
            RETURN v_existing.response_payload;
        END IF;
        RAISE;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_engine_get(p_round_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_round private.game_rounds%ROWTYPE;
BEGIN
    SELECT * INTO v_ctx FROM private.game_require_player_context();
    v_round := private.game_lock_round_owned(p_round_id, v_ctx.user_id);
    IF v_round.game_code = 'aviator' AND v_round.state = 'open' THEN
        v_round := private.game_adapter_aviator_progress(v_round.id, v_ctx.user_id);
    END IF;
    RETURN private.game_round_json(
        v_round,
        private.game_current_balance(v_round.wallet_id),
        false,
        private.game_allowed_actions(v_round)
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.player_game_start(
    p_game_code TEXT,
    p_stake NUMERIC,
    p_idempotency_key TEXT,
    p_options JSONB DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    RETURN private.game_engine_start(p_game_code, p_stake, p_idempotency_key, p_options);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.player_game_action(
    p_round_id UUID,
    p_action TEXT,
    p_idempotency_key TEXT,
    p_options JSONB DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    RETURN private.game_engine_action(p_round_id, p_action, p_idempotency_key, p_options);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.player_game_get(p_round_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    RETURN private.game_engine_get(p_round_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.player_game_start(TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_game_start(TEXT, NUMERIC, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.player_game_start(TEXT, NUMERIC, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.player_game_action(UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_game_action(UUID, TEXT, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.player_game_action(UUID, TEXT, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.player_game_get(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_game_get(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.player_game_get(UUID) TO authenticated;

COMMENT ON FUNCTION public.player_game_start(TEXT, NUMERIC, TEXT, JSONB) IS
'Generic player game start. Identity from auth.uid(). Debits via Wallet Core CASINO_BET. New games reuse this RPC.';
COMMENT ON FUNCTION public.player_game_action(UUID, TEXT, TEXT, JSONB) IS
'Generic player game action. Idempotent. Never accepts wallet/user/payout from the browser.';
COMMENT ON FUNCTION public.player_game_get(UUID) IS
'Generic player round read. Ownership enforced. Aviator lazily settles from server time.';

DO $$
DECLARE
    v_fn RECORD;
BEGIN
    FOR v_fn IN
        SELECT n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_catalog.pg_proc AS p
        JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'private'
          AND p.proname LIKE 'game_%'
    LOOP
        EXECUTE format(
            'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
            v_fn.nspname,
            v_fn.proname,
            v_fn.args
        );
    END LOOP;
END
$$;

COMMIT;
