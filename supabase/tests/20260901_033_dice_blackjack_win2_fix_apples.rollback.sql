-- NEXTPARI PHASE 033 behavior probe.
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
    (SELECT config->>'mathVersion' FROM private.game_catalog WHERE game_code = 'dice') = 'dice-v3-win2'
    AND (SELECT (config->>'winMultiplier')::NUMERIC FROM private.game_catalog WHERE game_code = 'dice') = 2.00,
    'Dice catalog x2.00 v3'
);

SELECT pg_temp.np_assert(
    (SELECT config->>'mathVersion' FROM private.game_catalog WHERE game_code = 'blackjack')
        = 'blackjack-v4-visible-banker-ties-chase-win2'
    AND (SELECT (config->>'winPayout')::NUMERIC FROM private.game_catalog WHERE game_code = 'blackjack') = 2.00
    AND (SELECT config->>'tieRule' FROM private.game_catalog WHERE game_code = 'blackjack') = 'banker'
    AND (SELECT config->>'dealerRule' FROM private.game_catalog WHERE game_code = 'blackjack') = 'chasePlayer',
    'Blackjack catalog v4 banker-chase x2.00'
);

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

SELECT pg_temp.np_assert(
    (private.game_report_rtp_meta('dice')->>'theoreticalRtpTarget')::NUMERIC = 1
    AND (private.game_report_rtp_meta('blackjack')->>'theoreticalRtpTarget')::NUMERIC > 0.85
    AND (private.game_report_rtp_meta('blackjack')->>'theoreticalRtpTarget')::NUMERIC < 0.90
    AND (private.game_report_rtp_meta('blackjack')->>'houseEdge')::NUMERIC >= 0.10
    AND (private.game_report_rtp_meta('blackjack')->>'houseEdge')::NUMERIC <= 0.15
    AND (private.game_report_rtp_meta('pharaoh')->>'theoreticalRtpTarget')::NUMERIC = 0.875000
    AND (private.game_report_rtp_meta('crystal')->>'theoreticalRtpTarget')::NUMERIC = 0.875000
    AND (private.game_report_rtp_meta('aviator')->>'theoreticalRtpTarget')::NUMERIC = 0.875000
    AND (private.game_report_rtp_meta('apples')->>'theoreticalRtpTarget') IS NULL
    AND (private.game_report_rtp_meta('apples')->>'rtpModel') = 'progressive',
    'active reporting metadata is version-accurate'
);

SELECT pg_temp.np_assert(
    private.game_dice_win_multiplier_for_version('dice-v2-rtp875') = 1.72
    AND private.game_dice_win_multiplier_for_version('dice-v3-win2') = 2.00,
    'Dice version-safe win multipliers'
);

SELECT pg_temp.np_assert(
    private.game_bj_payout_for_version(10, 'win', 'blackjack-v2-rtp875') = 18.40
    AND private.game_bj_payout_for_version(10, 'win', 'blackjack-v3-visible-dealer-rtp875') = 17.00
    AND private.game_bj_payout_for_version(10, 'win', 'blackjack-v4-visible-banker-ties-chase-win2') = 20.00,
    'Blackjack version-safe win payouts'
);

SELECT pg_temp.np_assert(
    private.game_bj_dealer_should_draw(17, 20, 'blackjack-v2-rtp875') IS FALSE
    AND private.game_bj_dealer_should_draw(17, 20, 'blackjack-v3-visible-dealer-rtp875') IS FALSE
    AND private.game_bj_dealer_should_draw(17, 20, 'blackjack-v4-visible-banker-ties-chase-win2') IS TRUE
    AND private.game_bj_dealer_should_draw(17, 12, 'blackjack-v4-visible-banker-ties-chase-win2') IS FALSE,
    'v2/v3 stand at 17; v4 chases player total'
);

SELECT pg_temp.np_assert(
    private.game_bj_resolve_for_version(
        '[{"value":10,"isHidden":false},{"value":8,"isHidden":false}]'::jsonb,
        '[{"value":9,"isHidden":false},{"value":9,"isHidden":false}]'::jsonb,
        'blackjack-v3-visible-dealer-rtp875'
    ) = 'push'
    AND private.game_bj_resolve_for_version(
        '[{"value":10,"isHidden":false},{"value":8,"isHidden":false}]'::jsonb,
        '[{"value":9,"isHidden":false},{"value":9,"isHidden":false}]'::jsonb,
        'blackjack-v2-rtp875'
    ) = 'push'
    AND private.game_bj_resolve_for_version(
        '[{"value":10,"isHidden":false},{"value":8,"isHidden":false}]'::jsonb,
        '[{"value":9,"isHidden":false},{"value":9,"isHidden":false}]'::jsonb,
        'blackjack-v4-visible-banker-ties-chase-win2'
    ) = 'lose',
    'v4 banker wins equal totals; v2/v3 still push'
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

-- Controlled Wallet Core credit. Discarded by ROLLBACK.
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
