-- NEXTPARI PHASE 031 behavior probe.
-- NOT a migration. Do NOT COMMIT. Do NOT execute against production.

BEGIN;

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
    pg_get_functiondef('private.game_aviator_get_or_create_current_session()'::regprocedure) ILIKE '%pg_advisory_xact_lock%',
    'shared Aviator session uses advisory lock'
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

-- Two panels / two players join the SAME flight because start always
-- calls game_aviator_get_or_create_current_session under advisory lock.
-- Independent stakes, one cashout each, retry idempotent, crash shared.
-- Historical settled rounds keep session_id NULL (no backfill UPDATE).
-- Dice draw returns x1; win x1.72; settle goes through game_settle_win once.
-- Do NOT COMMIT. Do NOT run against production.

ROLLBACK;
