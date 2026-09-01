-- NEXTPARI PHASE 033 Apples-only behavior probe.
-- NOT a migration. Do NOT COMMIT. Do NOT execute against production.
-- Requires 033 already applied on the database you test.
-- Test-only fixtures live inside this transaction and are discarded by ROLLBACK.
--
-- Live IDs (test file only — never in production functions):
--   player auth/profile       bc5d66cd-5e18-4352-b7f8-ea99029758e0
--   player wallet             3ea1677a-d664-47c3-b019-0635b643d6e5
--
-- Proves Apples start no longer raises malformed array literal: "good",
-- reaches playing, hides cell kinds, debits the wallet, then ROLLBACK.

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

SELECT pg_temp.np_assert(
    (SELECT config->>'mathVersion' FROM private.game_catalog WHERE game_code = 'apples') = 'apples-v1-progressive'
    AND strpos((SELECT config::TEXT FROM private.game_catalog WHERE game_code = 'apples'), '"multiplier":1.23') > 0
    AND strpos((SELECT config::TEXT FROM private.game_catalog WHERE game_code = 'apples'), '"multiplier":349.00') > 0,
    'Apples catalog math unchanged'
);

SELECT pg_temp.np_assert(
    pg_get_functiondef('private.game_adapter_apples_start(uuid,uuid)'::regprocedure)
        LIKE '%array_append(v_kinds, ''good'')%'
    AND pg_get_functiondef('private.game_adapter_apples_start(uuid,uuid)'::regprocedure)
        LIKE '%array_append(v_kinds, ''bad'')%'
    AND pg_get_functiondef('private.game_adapter_apples_start(uuid,uuid)'::regprocedure)
        NOT LIKE '%v_kinds := v_kinds || ''good''%'
    AND pg_get_functiondef('private.game_adapter_apples_start(uuid,uuid)'::regprocedure)
        NOT LIKE '%v_kinds := v_kinds || ''bad''%',
    'Apples start uses array_append'
);

SELECT pg_temp.np_set_jwt('bc5d66cd-5e18-4352-b7f8-ea99029758e0');

CREATE TEMP TABLE np_snap ON COMMIT DROP AS
SELECT
    (SELECT available_balance FROM private.wallet_accounts
     WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5') AS avail,
    (SELECT COUNT(*)::BIGINT FROM private.wallet_ledger
     WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5') AS ledger_n;

SELECT pg_temp.np_assert(
    (SELECT w.status FROM private.wallet_accounts AS w
     WHERE w.wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5') = 'active',
    'player 110790 wallet is active'
);

SELECT e.ledger_id
FROM private.apply_wallet_entry(
    '3ea1677a-d664-47c3-b019-0635b643d6e5'::UUID,
    50,
    0,
    'CASH_DEPOSIT',
    'system',
    'rollback:033-fund-110790',
    'rollback_test',
    '033',
    'system',
    NULL,
    jsonb_build_object('phase', '033-apples-start-rollback')
) AS e;

SELECT pg_temp.np_assert(
    (SELECT available_balance FROM private.wallet_accounts
     WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5')
    = (SELECT avail FROM np_snap) + 50,
    'funded +50 via Wallet Core'
);

CREATE TEMP TABLE np_apples ON COMMIT DROP AS
SELECT public.player_game_start('apples', 10, '033:apples-start', '{}'::jsonb) AS payload;

SELECT pg_temp.np_assert(
    (SELECT payload->>'state' FROM np_apples) = 'open'
    AND (SELECT payload->'publicResult'->>'phase' FROM np_apples) = 'playing',
    'Apples round reaches playing state'
);

SELECT pg_temp.np_assert(
    jsonb_array_length((SELECT payload->'publicResult'->'rows'->0->'cells' FROM np_apples)) = 5,
    'five cells exist at first level'
);

SELECT pg_temp.np_assert(
    NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
            (SELECT payload->'publicResult'->'rows'->0->'cells' FROM np_apples)
        ) AS cell
        WHERE cell.value->>'kind' IN ('good', 'bad')
    )
    AND (
        SELECT COUNT(*)
        FROM jsonb_array_elements(
            (SELECT payload->'publicResult'->'rows'->0->'cells' FROM np_apples)
        ) AS cell
        WHERE cell.value->'kind' IS NULL OR cell.value->>'kind' IS NULL
    ) = 5,
    'hidden public result does not leak bad/good kinds'
);

SELECT pg_temp.np_assert(
    pg_temp.np_casino_count((SELECT (payload->>'roundId')::UUID FROM np_apples), 'CASINO_BET') = 1,
    'bet ledger is created inside transaction'
);

SELECT pg_temp.np_assert(
    (SELECT available_balance FROM private.wallet_accounts
     WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5')
    = (SELECT avail FROM np_snap) + 50 - 10,
    'wallet balance decreases inside transaction'
);

ROLLBACK;
