-- NEXTPARI PHASE 029A
-- Behavioral BEGIN/ROLLBACK probe for the canonical game engine.
--
-- NOT a migration. Do NOT COMMIT. Do NOT run against production.
-- Requires 029 already applied on the database you test.
-- Temporary wallet funding and status changes are local to this
-- transaction and discarded by ROLLBACK.
--
-- Live IDs (test file only — never in production functions):
--   player auth/profile       bc5d66cd-5e18-4352-b7f8-ea99029758e0
--   player wallet             3ea1677a-d664-47c3-b019-0635b643d6e5
--   cashier staff auth        de04491b-344d-4af1-81e8-bce3f53f21ac
--
-- psql:  \i this file   (file has BEGIN/ROLLBACK)

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

CREATE OR REPLACE FUNCTION pg_temp.np_expect_error(p_sql TEXT, p_needle TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $ex$
DECLARE
    v_raised BOOLEAN := FALSE;
    v_msg TEXT;
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION
        WHEN OTHERS THEN
            v_raised := TRUE;
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    END;

    IF v_raised IS NOT TRUE THEN
        RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED: % [%]', p_needle, p_sql;
    END IF;

    IF v_msg NOT ILIKE '%' || p_needle || '%' THEN
        RAISE EXCEPTION 'UNEXPECTED_ERROR: expected % got % [%]', p_needle, v_msg, p_sql;
    END IF;
END;
$ex$;

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

CREATE OR REPLACE FUNCTION pg_temp.np_force_aviator_elapsed(
    p_round UUID,
    p_crash NUMERIC,
    p_auto NUMERIC,
    p_seconds NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_started TIMESTAMPTZ;
BEGIN
    v_started := pg_catalog.now() - make_interval(secs => p_seconds);
    UPDATE private.game_rounds
    SET
        private_state = jsonb_build_object(
            'crashPoint', p_crash,
            'startedAt', v_started,
            'autoCashout', p_auto
        ),
        public_result = jsonb_build_object(
            'startedAt', v_started,
            'serverNow', v_started,
            'autoCashout', p_auto,
            'currentMultiplier', 1,
            'phase', 'flying'
        ),
        updated_at = pg_catalog.now()
    WHERE id = p_round
      AND state = 'open'
      AND game_code = 'aviator';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ASSERT: could not force Aviator elapsed on %', p_round;
    END IF;
END;
$fn$;

SELECT pg_temp.np_set_jwt('bc5d66cd-5e18-4352-b7f8-ea99029758e0');

CREATE TEMP TABLE np_snap ON COMMIT DROP AS
SELECT
    (SELECT available_balance FROM private.wallet_accounts
     WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5') AS avail,
    (SELECT status FROM private.wallet_accounts
     WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5') AS status,
    (SELECT COUNT(*)::BIGINT FROM private.wallet_ledger
     WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5') AS ledger_n;

SELECT pg_temp.np_assert(
    (SELECT p.id FROM public.profiles AS p WHERE p.id = 'bc5d66cd-5e18-4352-b7f8-ea99029758e0')
    = 'bc5d66cd-5e18-4352-b7f8-ea99029758e0',
    'canonical test player profile 110790'
);

SELECT pg_temp.np_assert(
    (SELECT w.status FROM private.wallet_accounts AS w
     WHERE w.wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5') = 'active',
    'player 110790 wallet is active'
);

-- Controlled Wallet Core credit. Discarded by ROLLBACK.
SELECT e.ledger_id
FROM private.apply_wallet_entry(
    '3ea1677a-d664-47c3-b019-0635b643d6e5'::UUID,
    200,
    0,
    'CASH_DEPOSIT',
    'system',
    'rollback:029a-fund-110790',
    'rollback_test',
    '029a',
    'system',
    NULL,
    jsonb_build_object('phase', '029a-behavior-rollback')
) AS e;

SELECT pg_temp.np_assert(
    (SELECT available_balance FROM private.wallet_accounts
     WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5')
    = (SELECT avail FROM np_snap) + 200,
    'funded +200 via Wallet Core'
);


-- ============================================================
-- A. start + single debit + ownership
-- ============================================================

CREATE TEMP TABLE np_open ON COMMIT DROP AS
SELECT public.player_game_start('aviator', 10, '029a:start-open', '{}'::jsonb) AS payload;

SELECT pg_temp.np_assert(
    (SELECT payload->>'ok' FROM np_open) = 'true'
    AND (SELECT payload->>'state' FROM np_open) = 'open'
    AND (SELECT payload->>'gameCode' FROM np_open) = 'aviator'
    AND (SELECT (payload->>'isDuplicate')::BOOLEAN FROM np_open) IS NOT TRUE
    AND (SELECT (payload->>'stake')::NUMERIC FROM np_open) = 10,
    'test player can start a game'
);

SELECT pg_temp.np_assert(
    (SELECT r.player_user_id FROM private.game_rounds AS r
     WHERE r.id = (SELECT (payload->>'roundId')::UUID FROM np_open))
    = 'bc5d66cd-5e18-4352-b7f8-ea99029758e0'
    AND (SELECT r.wallet_id FROM private.game_rounds AS r
         WHERE r.id = (SELECT (payload->>'roundId')::UUID FROM np_open))
    = '3ea1677a-d664-47c3-b019-0635b643d6e5',
    'game round belongs only to the JWT player'
);

SELECT pg_temp.np_assert(
    pg_temp.np_casino_count((SELECT (payload->>'roundId')::UUID FROM np_open), 'CASINO_BET') = 1
    AND pg_temp.np_casino_count((SELECT (payload->>'roundId')::UUID FROM np_open), 'CASINO_WIN') = 0,
    'stake debits exactly once'
);

SELECT pg_temp.np_assert(
    (SELECT available_balance FROM private.wallet_accounts
     WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5')
    = (SELECT avail FROM np_snap) + 200 - 10,
    'available balance after first stake'
);


-- ============================================================
-- B. exact start retry / conflict
-- ============================================================

CREATE TEMP TABLE np_dup ON COMMIT DROP AS
SELECT public.player_game_start('aviator', 10, '029a:start-open', '{}'::jsonb) AS payload;

SELECT pg_temp.np_assert(
    (SELECT payload->>'roundId' FROM np_dup) = (SELECT payload->>'roundId' FROM np_open)
    AND (
        (SELECT (payload->>'isDuplicate')::BOOLEAN FROM np_dup) IS TRUE
        OR (SELECT payload->>'roundId' FROM np_dup) = (SELECT payload->>'roundId' FROM np_open)
    )
    AND pg_temp.np_casino_count((SELECT (payload->>'roundId')::UUID FROM np_open), 'CASINO_BET') = 1,
    'duplicate start idempotency does not double debit'
);

SELECT pg_temp.np_expect_error(
    $q$SELECT public.player_game_start('aviator', 20, '029a:start-open', '{}'::jsonb)$q$,
    'IDEMPOTENCY_KEY_CONFLICT'
);

SELECT pg_temp.np_assert(
    pg_temp.np_casino_count((SELECT (payload->>'roundId')::UUID FROM np_open), 'CASINO_BET') = 1
    AND (SELECT available_balance FROM private.wallet_accounts
         WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5')
    = (SELECT avail FROM np_snap) + 200 - 10,
    'conflicting start key does not debit'
);


-- ============================================================
-- C. blocked wallet rejected
-- ============================================================

UPDATE private.wallet_accounts
SET status = 'blocked'
WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5';

SELECT pg_temp.np_expect_error(
    $q$SELECT public.player_game_start('aviator', 10, '029a:blocked', '{}'::jsonb)$q$,
    'WALLET_BLOCKED'
);

UPDATE private.wallet_accounts
SET status = (SELECT status FROM np_snap)
WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5';

SELECT pg_temp.np_assert(
    (SELECT COUNT(*) FROM private.game_rounds
     WHERE start_idempotency_key = '029a:blocked') = 0,
    'blocked wallet created no round'
);


-- ============================================================
-- D. staff rejected
-- ============================================================

SELECT pg_temp.np_set_jwt('de04491b-344d-4af1-81e8-bce3f53f21ac');
SELECT pg_temp.np_expect_error(
    $q$SELECT public.player_game_start('aviator', 10, '029a:staff', '{}'::jsonb)$q$,
    'STAFF_CANNOT_PLAY'
);
SELECT pg_temp.np_set_jwt('bc5d66cd-5e18-4352-b7f8-ea99029758e0');


-- ============================================================
-- E. losing Aviator: cashout after crash. Must commit, not roll back.
-- ============================================================

CREATE TEMP TABLE np_crash ON COMMIT DROP AS
SELECT public.player_game_start('aviator', 10, '029a:crash-lose', '{}'::jsonb) AS payload;

SELECT pg_temp.np_force_aviator_elapsed(
    (SELECT (payload->>'roundId')::UUID FROM np_crash),
    1.05,
    NULL,
    30
);

CREATE TEMP TABLE np_crash_act ON COMMIT DROP AS
SELECT public.player_game_action(
    (SELECT (payload->>'roundId')::UUID FROM np_crash),
    'cashout',
    '029a:crash-cashout',
    '{}'::jsonb
) AS payload;

SELECT pg_temp.np_assert(
    (SELECT payload->>'state' FROM np_crash_act) = 'settled'
    AND (SELECT (payload->>'payout')::NUMERIC FROM np_crash_act) = 0
    AND (SELECT payload->'publicResult'->>'outcome' FROM np_crash_act) = 'lose',
    'cashout after crash settles as a loss'
);

SELECT pg_temp.np_assert(
    (SELECT r.state FROM private.game_rounds AS r
     WHERE r.id = (SELECT (payload->>'roundId')::UUID FROM np_crash)) = 'settled'
    AND (SELECT r.payout FROM private.game_rounds AS r
         WHERE r.id = (SELECT (payload->>'roundId')::UUID FROM np_crash)) = 0
    AND (SELECT r.bet_ledger_id IS NOT NULL FROM private.game_rounds AS r
         WHERE r.id = (SELECT (payload->>'roundId')::UUID FROM np_crash))
    AND (SELECT r.win_ledger_id IS NULL FROM private.game_rounds AS r
         WHERE r.id = (SELECT (payload->>'roundId')::UUID FROM np_crash)),
    'crash settlement remains committed: one bet ledger, no win ledger'
);

SELECT pg_temp.np_assert(
    pg_temp.np_casino_count((SELECT (payload->>'roundId')::UUID FROM np_crash), 'CASINO_BET') = 1
    AND pg_temp.np_casino_count((SELECT (payload->>'roundId')::UUID FROM np_crash), 'CASINO_WIN') = 0,
    'losing round creates CASINO_BET only'
);

CREATE TEMP TABLE np_crash_retry ON COMMIT DROP AS
SELECT public.player_game_action(
    (SELECT (payload->>'roundId')::UUID FROM np_crash),
    'cashout',
    '029a:crash-cashout',
    '{}'::jsonb
) AS payload;

SELECT pg_temp.np_assert(
    (SELECT payload FROM np_crash_retry) = (SELECT payload FROM np_crash_act)
    AND pg_temp.np_casino_count((SELECT (payload->>'roundId')::UUID FROM np_crash), 'CASINO_BET') = 1
    AND pg_temp.np_casino_count((SELECT (payload->>'roundId')::UUID FROM np_crash), 'CASINO_WIN') = 0,
    'exact cashout retry does not settle again'
);

CREATE TEMP TABLE np_crash_late ON COMMIT DROP AS
SELECT public.player_game_action(
    (SELECT (payload->>'roundId')::UUID FROM np_crash),
    'cashout',
    '029a:crash-late',
    '{}'::jsonb
) AS payload;

SELECT pg_temp.np_assert(
    (SELECT payload->>'state' FROM np_crash_late) = 'settled'
    AND (SELECT (payload->>'payout')::NUMERIC FROM np_crash_late) = 0
    AND pg_temp.np_casino_count((SELECT (payload->>'roundId')::UUID FROM np_crash), 'CASINO_WIN') = 0,
    'later cashout cannot undo or credit a crashed round'
);

SELECT pg_temp.np_assert(
    (SELECT available_balance FROM private.wallet_accounts
     WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5')
    = (SELECT avail FROM np_snap) + 200 - 20,
    'two stakes, crash pays 0'
);


-- ============================================================
-- F. winning Aviator cashout before crash
-- ============================================================

CREATE TEMP TABLE np_win ON COMMIT DROP AS
SELECT public.player_game_start('aviator', 10, '029a:win-cashout', '{}'::jsonb) AS payload;

SELECT pg_temp.np_force_aviator_elapsed(
    (SELECT (payload->>'roundId')::UUID FROM np_win),
    50,
    NULL,
    5
);

CREATE TEMP TABLE np_win_act ON COMMIT DROP AS
SELECT public.player_game_action(
    (SELECT (payload->>'roundId')::UUID FROM np_win),
    'cashout',
    '029a:win-act',
    '{}'::jsonb
) AS payload;

SELECT pg_temp.np_assert(
    (SELECT payload->>'state' FROM np_win_act) = 'settled'
    AND (SELECT (payload->>'payout')::NUMERIC FROM np_win_act) > 0
    AND (SELECT payload->'publicResult'->>'outcome' FROM np_win_act) = 'win',
    'cashout before crash is a win'
);

SELECT pg_temp.np_assert(
    pg_temp.np_casino_count((SELECT (payload->>'roundId')::UUID FROM np_win), 'CASINO_BET') = 1
    AND pg_temp.np_casino_count((SELECT (payload->>'roundId')::UUID FROM np_win), 'CASINO_WIN') = 1
    AND (SELECT r.win_ledger_id IS NOT NULL FROM private.game_rounds AS r
         WHERE r.id = (SELECT (payload->>'roundId')::UUID FROM np_win)),
    'winning round creates CASINO_BET + CASINO_WIN'
);

SELECT pg_temp.np_assert(
    (SELECT available_balance FROM private.wallet_accounts
     WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5')
    = (SELECT avail FROM np_snap) + 200 - 30 + (SELECT (payload->>'payout')::NUMERIC FROM np_win_act),
    'available balance after win is funded - stakes + payout'
);


-- ============================================================
-- G. auto cashout: settle once; later action cannot undo
-- ============================================================

CREATE TEMP TABLE np_auto ON COMMIT DROP AS
SELECT public.player_game_start(
    'aviator',
    10,
    '029a:auto',
    jsonb_build_object('autoCashout', 1.10)
) AS payload;

SELECT pg_temp.np_force_aviator_elapsed(
    (SELECT (payload->>'roundId')::UUID FROM np_auto),
    50,
    1.10,
    30
);

CREATE TEMP TABLE np_auto_get ON COMMIT DROP AS
SELECT public.player_game_get((SELECT (payload->>'roundId')::UUID FROM np_auto)) AS payload;

SELECT pg_temp.np_assert(
    (SELECT payload->>'state' FROM np_auto_get) = 'settled'
    AND (SELECT (payload->>'payout')::NUMERIC FROM np_auto_get) = 11.00
    AND (SELECT payload->'publicResult'->>'outcome' FROM np_auto_get) = 'win',
    'GET lazily settles auto cashout once'
);

SELECT pg_temp.np_assert(
    pg_temp.np_casino_count((SELECT (payload->>'roundId')::UUID FROM np_auto), 'CASINO_BET') = 1
    AND pg_temp.np_casino_count((SELECT (payload->>'roundId')::UUID FROM np_auto), 'CASINO_WIN') = 1,
    'auto cashout credits exactly one CASINO_WIN'
);

CREATE TEMP TABLE np_auto_act ON COMMIT DROP AS
SELECT public.player_game_action(
    (SELECT (payload->>'roundId')::UUID FROM np_auto),
    'cashout',
    '029a:auto-late',
    '{}'::jsonb
) AS payload;

SELECT pg_temp.np_assert(
    (SELECT payload->>'state' FROM np_auto_act) = 'settled'
    AND (SELECT (payload->>'payout')::NUMERIC FROM np_auto_act) = 11.00
    AND (SELECT r.state FROM private.game_rounds AS r
         WHERE r.id = (SELECT (payload->>'roundId')::UUID FROM np_auto)) = 'settled'
    AND pg_temp.np_casino_count((SELECT (payload->>'roundId')::UUID FROM np_auto), 'CASINO_WIN') = 1,
    'later action cannot undo or double-settle auto cashout'
);

SELECT pg_temp.np_assert(
    (SELECT available_balance FROM private.wallet_accounts
     WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5')
    = (SELECT avail FROM np_snap) + 200 - 40
      + (SELECT (payload->>'payout')::NUMERIC FROM np_win_act)
      + 11.00,
    'final available balance mathematics'
);

ROLLBACK;
