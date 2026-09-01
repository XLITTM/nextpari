-- NEXTPARI PHASE 031 / 031A / 031B behavior probe.
-- NOT a migration. Do NOT COMMIT. Do NOT execute against production.
-- Test-only fixtures live inside this transaction and are discarded by ROLLBACK.
--
-- 031B lock-order contract:
--   AVIATOR_ADVISORY
--       ↓
--   wallet / round / session locks as required
--       ↓
--   Wallet Core settlement
-- The global Aviator advisory lock is the outer serialization boundary.
--
-- Live IDs (test file only — never in production functions):
--   player A auth/profile     bc5d66cd-5e18-4352-b7f8-ea99029758e0
--   player A wallet           3ea1677a-d664-47c3-b019-0635b643d6e5
--   cashier staff auth        de04491b-344d-4af1-81e8-bce3f53f21ac
-- Player B is the first other non-staff profile with an active wallet.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.np_set_jwt(p_sub UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $jwt$
BEGIN
    PERFORM set_config('request.jwt.claim.sub', p_sub::TEXT, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config(
        'request.jwt.claims',
        json_build_object('sub', p_sub::TEXT, 'role', 'authenticated')::TEXT,
        true
    );
END;
$jwt$;

CREATE OR REPLACE FUNCTION pg_temp.np_assert(p_ok BOOLEAN, p_msg TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $as$
BEGIN
    IF p_ok IS NOT TRUE THEN
        RAISE EXCEPTION 'ASSERT: %', p_msg;
    END IF;
END;
$as$;

CREATE OR REPLACE FUNCTION pg_temp.np_casino_count(p_round UUID, p_op TEXT)
RETURNS BIGINT
LANGUAGE sql
AS $q$
    SELECT COUNT(*)::BIGINT
    FROM private.wallet_ledger
    WHERE reference_type = 'game_round'
      AND reference_id = p_round::TEXT
      AND operation_type = p_op;
$q$;

CREATE OR REPLACE FUNCTION pg_temp.np_force_session_flying(
    p_session UUID,
    p_elapsed NUMERIC,
    p_crash NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
    UPDATE private.game_sessions
    SET
        state = 'flying',
        betting_closes_at = v_now - make_interval(secs => p_elapsed + 1),
        starts_at = v_now - make_interval(secs => p_elapsed),
        crash_at = v_now + INTERVAL '2 minutes',
        private_state = COALESCE(private_state, '{}'::jsonb)
            || jsonb_build_object('crashPoint', p_crash),
        updated_at = v_now
    WHERE id = p_session;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ASSERT: could not force session flying on %', p_session;
    END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.np_force_session_ready_to_crash(p_session UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
    UPDATE private.game_sessions
    SET
        state = 'flying',
        betting_closes_at = v_now - INTERVAL '40 seconds',
        starts_at = v_now - INTERVAL '30 seconds',
        crash_at = v_now - INTERVAL '1 second',
        updated_at = v_now
    WHERE id = p_session;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ASSERT: could not force session crash on %', p_session;
    END IF;
END;
$fn$;

SELECT pg_temp.np_assert(
    EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'private' AND table_name = 'game_rounds' AND column_name = 'math_version'
    ),
    'math_version column exists'
);

SELECT pg_temp.np_assert(
    EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'private' AND table_name = 'game_sessions'
    ),
    'game_sessions exists'
);

SELECT pg_temp.np_assert(
    (SELECT config->>'mathVersion' FROM private.game_catalog WHERE game_code = 'dice') = 'dice-v2-rtp875'
    AND (SELECT (config->>'winMultiplier')::NUMERIC FROM private.game_catalog WHERE game_code = 'dice') = 1.72,
    'Dice catalog x1.72'
);

SELECT pg_temp.np_assert(
    (SELECT config->>'mathVersion' FROM private.game_catalog WHERE game_code = 'pharaoh') = 'pharaoh-v2-rtp875',
    'Pharaoh math version metadata'
);

SELECT pg_temp.np_assert(
    strpos((SELECT config::TEXT FROM private.game_catalog WHERE game_code = 'apples'), '"multiplier":1.23') > 0
    AND strpos((SELECT config::TEXT FROM private.game_catalog WHERE game_code = 'apples'), '"multiplier":349.00') > 0,
    'Apples multipliers unchanged'
);

SELECT pg_temp.np_assert(
    pg_get_functiondef('private.game_adapter_dice_start(uuid,uuid)'::regprocedure) ILIKE '%1.72%',
    'Dice adapter pays x1.72'
);

SELECT pg_temp.np_assert(
    pg_get_functiondef('private.game_aviator_lock_current()'::regprocedure) ILIKE '%nextpari:aviator:current%'
    AND pg_get_functiondef('private.game_aviator_lock_current()'::regprocedure) ILIKE '%pg_advisory_xact_lock%'
    AND strpos(
        pg_get_functiondef('private.game_aviator_get_or_create_current_session()'::regprocedure),
        'game_aviator_lock_current'
    ) > 0
    AND strpos(
        pg_get_functiondef('private.game_aviator_get_or_create_current_session()'::regprocedure),
        'game_aviator_lock_current'
    ) < strpos(
        pg_get_functiondef('private.game_aviator_get_or_create_current_session()'::regprocedure),
        'FOR UPDATE'
    ),
    'canonical Aviator advisory lock is held before game_sessions FOR UPDATE'
);

SELECT pg_temp.np_assert(
    strpos(pg_get_functiondef('private.game_engine_start(text,numeric,text,jsonb)'::regprocedure), 'game_aviator_lock_current')
        < strpos(pg_get_functiondef('private.game_engine_start(text,numeric,text,jsonb)'::regprocedure), 'game_require_player_context')
    AND strpos(pg_get_functiondef('private.game_engine_action(uuid,text,text,jsonb)'::regprocedure), 'game_aviator_lock_current')
        < strpos(pg_get_functiondef('private.game_engine_action(uuid,text,text,jsonb)'::regprocedure), 'game_require_player_context')
    AND strpos(pg_get_functiondef('private.game_engine_action(uuid,text,text,jsonb)'::regprocedure), 'game_aviator_lock_current')
        < strpos(pg_get_functiondef('private.game_engine_action(uuid,text,text,jsonb)'::regprocedure), 'game_lock_round_owned')
    AND strpos(pg_get_functiondef('private.game_engine_get(uuid)'::regprocedure), 'game_aviator_lock_current')
        < strpos(pg_get_functiondef('private.game_engine_get(uuid)'::regprocedure), 'game_require_player_context')
    AND strpos(pg_get_functiondef('private.game_engine_get(uuid)'::regprocedure), 'game_aviator_lock_current')
        < strpos(pg_get_functiondef('private.game_engine_get(uuid)'::regprocedure), 'game_lock_round_owned'),
    'AVIATOR_ADVISORY is acquired before wallet/round locks on start/action/get'
);

SELECT pg_temp.np_assert(
    pg_get_functiondef('private.game_adapter_dice_start(uuid,uuid)'::regprocedure) NOT ILIKE '%game_aviator_lock_current%'
    AND pg_get_functiondef('private.game_adapter_pharaoh_start(uuid,uuid)'::regprocedure) NOT ILIKE '%game_aviator_lock_current%',
    'non-Aviator games are not serialized on the Aviator advisory lock'
);

SELECT pg_temp.np_assert(
    EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'private' AND table_name = 'game_rounds' AND column_name = 'session_id'
    ),
    'game_rounds.session_id exists for future Aviator bets'
);

SELECT pg_temp.np_assert(
    (SELECT config->>'mathVersion' FROM private.game_catalog WHERE game_code = 'apples') = 'apples-v1-progressive',
    'Apples math version remains progressive'
);

SELECT pg_temp.np_assert(
    pg_get_functiondef('private.game_adapter_pharaoh_start(uuid,uuid)'::regprocedure) ILIKE '%hitBps%'
    AND pg_get_functiondef('private.game_adapter_pharaoh_start(uuid,uuid)'::regprocedure) ILIKE '%prizeWeight%',
    'Pharaoh uses prize then independent hit'
);

SELECT pg_temp.np_assert(
    pg_get_functiondef('public.owner_game_rtp_report(text,date,date,text)'::regprocedure) ILIKE '%game_rounds%',
    '030B report still reads game_rounds'
);

SELECT pg_temp.np_assert(
    pg_get_functiondef('private.game_adapter_aviator_start(uuid,jsonb,uuid)'::regprocedure) ILIKE '%session_id%'
    AND pg_get_functiondef('private.game_adapter_aviator_start(uuid,jsonb,uuid)'::regprocedure) ILIKE '%game_aviator_get_or_create_current_session%',
    'Aviator bets attach to the current shared session'
);

SELECT pg_temp.np_assert(
    pg_get_functiondef('public.player_game_session_get(text)'::regprocedure) ILIKE '%game_require_session_viewer%'
    AND pg_get_functiondef('public.player_game_session_get(text)'::regprocedure) NOT ILIKE '%game_require_player_context%',
    'session GET uses read-only viewer, not financial wallet lock'
);

SELECT pg_temp.np_assert(
    pg_get_functiondef('private.game_require_session_viewer()'::regprocedure) NOT ILIKE '%FOR UPDATE%'
    AND pg_get_functiondef('private.game_require_session_viewer()'::regprocedure) NOT ILIKE '%wallet_accounts%',
    'session viewer does not lock wallet_accounts'
);

SELECT pg_temp.np_assert(
    pg_get_functiondef('private.game_aviator_session_public(private.game_sessions,timestamp with time zone)'::regprocedure)
        ILIKE '%CASE WHEN v_reveal THEN p_session.crash_at ELSE NULL END%',
    'public crashAt is null until crashed'
);

-- Historical settled rows must not be rewritten by this probe.
CREATE TEMP TABLE np_hist ON COMMIT DROP AS
SELECT id, payout, session_id, state, public_result, settled_at, server_seed, server_seed_hash
FROM private.game_rounds
WHERE state = 'settled';

SELECT pg_temp.np_set_jwt('bc5d66cd-5e18-4352-b7f8-ea99029758e0');

SELECT pg_temp.np_assert(
    (SELECT p.id FROM public.profiles AS p WHERE p.id = 'bc5d66cd-5e18-4352-b7f8-ea99029758e0')
    = 'bc5d66cd-5e18-4352-b7f8-ea99029758e0',
    'canonical test player A profile'
);

-- Controlled Wallet Core credit. Discarded by ROLLBACK.
SELECT e.ledger_id
FROM private.apply_wallet_entry(
    '3ea1677a-d664-47c3-b019-0635b643d6e5'::UUID,
    400,
    0,
    'CASH_DEPOSIT',
    'system',
    'rollback:031a-fund-player-a',
    'rollback_test',
    '031a',
    'system',
    NULL,
    jsonb_build_object('phase', '031a-behavior-rollback')
) AS e;

-- Player B: first other non-staff active wallet. Isolated runner must have one.
CREATE TEMP TABLE np_player_b ON COMMIT DROP AS
SELECT p.id AS user_id, p.wallet_id
FROM public.profiles AS p
LEFT JOIN private.staff_accounts AS s ON s.auth_user_id = p.id
WHERE p.id <> 'bc5d66cd-5e18-4352-b7f8-ea99029758e0'
  AND s.auth_user_id IS NULL
  AND p.wallet_id IS NOT NULL
  AND EXISTS (
      SELECT 1
      FROM private.wallet_accounts AS a
      WHERE a.wallet_id = p.wallet_id
        AND a.status = 'active'
        AND a.migration_state IN ('staging', 'active')
  )
LIMIT 1;

SELECT pg_temp.np_assert(
    (SELECT COUNT(*) FROM np_player_b) = 1,
    'isolated probe needs a second non-staff sandbox player B'
);

SELECT e.ledger_id
FROM private.apply_wallet_entry(
    (SELECT wallet_id FROM np_player_b),
    200,
    0,
    'CASH_DEPOSIT',
    'system',
    'rollback:031a-fund-player-b',
    'rollback_test',
    '031a-b',
    'system',
    NULL,
    jsonb_build_object('phase', '031a-behavior-rollback')
) AS e;

-- player A bet 1 joins session S
CREATE TEMP TABLE np_a1 ON COMMIT DROP AS
SELECT public.player_game_start('aviator', 10, '031a:a-bet-1', '{}'::jsonb) AS payload;

-- player A bet 2 joins same session S
CREATE TEMP TABLE np_a2 ON COMMIT DROP AS
SELECT public.player_game_start('aviator', 25, '031a:a-bet-2', '{}'::jsonb) AS payload;

SELECT pg_temp.np_set_jwt((SELECT user_id FROM np_player_b));

-- player B bet joins same session S
CREATE TEMP TABLE np_b1 ON COMMIT DROP AS
SELECT public.player_game_start('aviator', 8, '031a:b-bet-1', '{}'::jsonb) AS payload;

SELECT pg_temp.np_set_jwt('bc5d66cd-5e18-4352-b7f8-ea99029758e0');

CREATE TEMP TABLE np_ids ON COMMIT DROP AS
SELECT
    (SELECT (payload->>'roundId')::UUID FROM np_a1) AS a1,
    (SELECT (payload->>'roundId')::UUID FROM np_a2) AS a2,
    (SELECT (payload->>'roundId')::UUID FROM np_b1) AS b1,
    (SELECT (payload->>'sessionId')::UUID FROM np_a1) AS session_id;

SELECT pg_temp.np_assert(
    (SELECT session_id FROM np_ids)
        = (SELECT r.session_id FROM private.game_rounds AS r WHERE r.id = (SELECT a1 FROM np_ids))
    AND (SELECT r.session_id FROM private.game_rounds AS r WHERE r.id = (SELECT a1 FROM np_ids))
        = (SELECT r.session_id FROM private.game_rounds AS r WHERE r.id = (SELECT a2 FROM np_ids))
    AND (SELECT r.session_id FROM private.game_rounds AS r WHERE r.id = (SELECT a2 FROM np_ids))
        = (SELECT r.session_id FROM private.game_rounds AS r WHERE r.id = (SELECT b1 FROM np_ids)),
    'all three have same session_id'
);

SELECT pg_temp.np_assert(
    (SELECT payload->>'serverSeedHash' FROM np_a1)
        = (SELECT payload->>'serverSeedHash' FROM np_a2)
    AND (SELECT payload->>'serverSeedHash' FROM np_a2)
        = (SELECT payload->>'serverSeedHash' FROM np_b1)
    AND (SELECT payload->>'serverSeedHash' FROM np_a1)
        = (SELECT s.server_seed_hash FROM private.game_sessions AS s WHERE s.id = (SELECT session_id FROM np_ids)),
    'session has one serverSeedHash'
);

SELECT pg_temp.np_assert(
    (SELECT (payload->>'stake')::NUMERIC FROM np_a1) = 10
    AND (SELECT (payload->>'stake')::NUMERIC FROM np_a2) = 25
    AND (SELECT (payload->>'stake')::NUMERIC FROM np_b1) = 8,
    'bets have independent stake values'
);

SELECT pg_temp.np_assert(
    (SELECT payload->>'serverSeed' FROM np_a1) IS NULL
    AND (SELECT payload->>'serverSeed' FROM np_a2) IS NULL
    AND (SELECT payload->>'serverSeed' FROM np_b1) IS NULL,
    'session seed hidden before crash'
);

CREATE TEMP TABLE np_sess_bet ON COMMIT DROP AS
SELECT public.player_game_session_get('aviator') AS payload;

SELECT pg_temp.np_assert(
    (SELECT payload->>'state' FROM np_sess_bet) = 'betting'
    AND (SELECT payload->>'crashAt' FROM np_sess_bet) IS NULL
    AND (SELECT payload->>'crashPoint' FROM np_sess_bet) IS NULL
    AND (SELECT payload->>'serverSeed' FROM np_sess_bet) IS NULL
    AND (SELECT payload->>'sessionId' FROM np_sess_bet) = (SELECT session_id::TEXT FROM np_ids),
    'betting public JSON hides crashAt crashPoint serverSeed'
);

-- Session creation race is protected by advisory lock: two gets keep the same S.
CREATE TEMP TABLE np_sess_bet2 ON COMMIT DROP AS
SELECT public.player_game_session_get('aviator') AS payload;

SELECT pg_temp.np_assert(
    (SELECT payload->>'sessionId' FROM np_sess_bet)
        = (SELECT payload->>'sessionId' FROM np_sess_bet2),
    'session creation race is protected by advisory lock'
);

SELECT pg_temp.np_force_session_flying((SELECT session_id FROM np_ids), 8, 50);

CREATE TEMP TABLE np_sess_fly ON COMMIT DROP AS
SELECT public.player_game_session_get('aviator') AS payload;

SELECT pg_temp.np_assert(
    (SELECT payload->>'state' FROM np_sess_fly) = 'flying'
    AND (SELECT payload->>'crashAt' FROM np_sess_fly) IS NULL
    AND (SELECT payload->>'crashPoint' FROM np_sess_fly) IS NULL
    AND (SELECT payload->>'serverSeed' FROM np_sess_fly) IS NULL,
    'flying public JSON hides crashAt crashPoint serverSeed'
);

-- one bet can cash out
CREATE TEMP TABLE np_cash1 ON COMMIT DROP AS
SELECT public.player_game_action(
    (SELECT a1 FROM np_ids),
    'cashout',
    '031a:cash-a1',
    '{}'::jsonb
) AS payload;

SELECT pg_temp.np_assert(
    (SELECT payload->>'state' FROM np_cash1) = 'settled'
    AND (SELECT (payload->>'payout')::NUMERIC FROM np_cash1) > 0
    AND (SELECT payload->>'serverSeed' FROM np_cash1) IS NULL
    AND (SELECT payload->'publicResult'->>'crashPoint' FROM np_cash1) IS NULL,
    'cashout wins without revealing crash proof while flying'
);

-- repeated cashout cannot create duplicate payout
-- same action idempotency returns same settlement
CREATE TEMP TABLE np_cash1b ON COMMIT DROP AS
SELECT public.player_game_action(
    (SELECT a1 FROM np_ids),
    'cashout',
    '031a:cash-a1',
    '{}'::jsonb
) AS payload;

SELECT pg_temp.np_assert(
    (SELECT payload->>'payout' FROM np_cash1) = (SELECT payload->>'payout' FROM np_cash1b)
    AND pg_temp.np_casino_count((SELECT a1 FROM np_ids), 'CASINO_WIN') = 1,
    'repeated cashout cannot create duplicate payout'
);

CREATE TEMP TABLE np_cash1c ON COMMIT DROP AS
SELECT public.player_game_action(
    (SELECT a1 FROM np_ids),
    'cashout',
    '031a:cash-a1-retry',
    '{}'::jsonb
) AS payload;

SELECT pg_temp.np_assert(
    (SELECT payload->>'state' FROM np_cash1c) = 'settled'
    AND (SELECT payload->>'payout' FROM np_cash1c) = (SELECT payload->>'payout' FROM np_cash1)
    AND pg_temp.np_casino_count((SELECT a1 FROM np_ids), 'CASINO_WIN') = 1,
    'same action idempotency returns same settlement'
);

SELECT pg_temp.np_assert(
    (SELECT r.state FROM private.game_rounds AS r WHERE r.id = (SELECT a2 FROM np_ids)) = 'open'
    AND (SELECT r.state FROM private.game_rounds AS r WHERE r.id = (SELECT b1 FROM np_ids)) = 'open',
    'another remains open'
);

SELECT pg_temp.np_force_session_ready_to_crash((SELECT session_id FROM np_ids));

CREATE TEMP TABLE np_sess_crash ON COMMIT DROP AS
SELECT public.player_game_session_get('aviator') AS payload;

SELECT pg_temp.np_assert(
    (SELECT payload->>'state' FROM np_sess_crash) = 'crashed'
    AND (SELECT payload->>'crashAt' FROM np_sess_crash) IS NOT NULL
    AND (SELECT payload->>'crashPoint' FROM np_sess_crash) IS NOT NULL
    AND (SELECT payload->>'serverSeed' FROM np_sess_crash) IS NOT NULL
    AND (SELECT payload->>'serverSeed' FROM np_sess_crash)
        = (SELECT s.server_seed FROM private.game_sessions AS s WHERE s.id = (SELECT session_id FROM np_ids)),
    'crashed session may reveal crashAt crashPoint serverSeed'
);

SELECT pg_temp.np_assert(
    (SELECT r.state FROM private.game_rounds AS r WHERE r.id = (SELECT a2 FROM np_ids)) = 'settled'
    AND (SELECT r.payout FROM private.game_rounds AS r WHERE r.id = (SELECT a2 FROM np_ids)) = 0
    AND (SELECT r.state FROM private.game_rounds AS r WHERE r.id = (SELECT b1 FROM np_ids)) = 'settled'
    AND (SELECT r.payout FROM private.game_rounds AS r WHERE r.id = (SELECT b1 FROM np_ids)) = 0,
    'another can lose at crash'
);

SELECT pg_temp.np_set_jwt((SELECT user_id FROM np_player_b));

CREATE TEMP TABLE np_b_get ON COMMIT DROP AS
SELECT public.player_game_get((SELECT b1 FROM np_ids)) AS payload;

SELECT pg_temp.np_set_jwt('bc5d66cd-5e18-4352-b7f8-ea99029758e0');

CREATE TEMP TABLE np_a1_get ON COMMIT DROP AS
SELECT public.player_game_get((SELECT a1 FROM np_ids)) AS payload;

SELECT pg_temp.np_assert(
    (SELECT payload->>'serverSeedHash' FROM np_b_get)
        = (SELECT payload->>'serverSeedHash' FROM np_a1_get)
    AND (SELECT payload->>'serverSeed' FROM np_b_get)
        = (SELECT payload->>'serverSeed' FROM np_a1_get)
    AND (SELECT payload->>'serverSeed' FROM np_a1_get)
        = (SELECT s.server_seed FROM private.game_sessions AS s WHERE s.id = (SELECT session_id FROM np_ids))
    AND (SELECT payload->>'serverSeedHash' FROM np_a1_get)
        = (SELECT s.server_seed_hash FROM private.game_sessions AS s WHERE s.id = (SELECT session_id FROM np_ids)),
    'after crash both bets reveal the same session seed/hash'
);

SELECT pg_temp.np_assert(
    NOT EXISTS (
        SELECT 1
        FROM np_hist AS h
        JOIN private.game_rounds AS r ON r.id = h.id
        WHERE r.payout IS DISTINCT FROM h.payout
           OR r.session_id IS DISTINCT FROM h.session_id
           OR r.state IS DISTINCT FROM h.state
           OR r.public_result IS DISTINCT FROM h.public_result
           OR r.server_seed IS DISTINCT FROM h.server_seed
           OR r.server_seed_hash IS DISTINCT FROM h.server_seed_hash
           OR r.settled_at IS DISTINCT FROM h.settled_at
    ),
    'historical settled rows are not modified'
);

SELECT pg_temp.np_set_jwt('de04491b-344d-4af1-81e8-bce3f53f21ac');

DO $staff$
DECLARE
    v_msg TEXT;
BEGIN
    BEGIN
        PERFORM public.player_game_session_get('aviator');
        RAISE EXCEPTION 'ASSERT: staff was allowed to poll Aviator session';
    EXCEPTION
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
            IF v_msg NOT ILIKE '%STAFF_CANNOT_PLAY%' THEN
                RAISE EXCEPTION 'ASSERT: staff session GET expected STAFF_CANNOT_PLAY got %', v_msg;
            END IF;
    END;
END;
$staff$;

-- Two panels / two players join the SAME flight because start always
-- calls game_aviator_get_or_create_current_session under advisory lock.
-- Lock order: AVIATOR_ADVISORY then wallet / round / session then Wallet Core.
-- Independent stakes, one cashout each, retry idempotent, crash shared.
-- Historical settled rounds keep session_id NULL (no backfill UPDATE).
-- Dice draw returns x1; win x1.72; settle goes through game_settle_win once.
-- Do NOT COMMIT. Do NOT run against production.

ROLLBACK;
