BEGIN;

-- NEXTPARI PHASE 034
-- Dice ×2.00 and Blackjack ×2.00 (visible dealer, existing rules).
-- WRITE ONLY. Do not execute against production in this task.
-- Does not UPDATE historical settled rounds.
-- Does not change Dice/Blackjack RNG, probabilities, or dealer/tie rules.
-- Does not change Pharaoh, Crystal, Apples, or Aviator math.
-- Does not change Wallet Core or ledger.
-- New Dice/Blackjack rounds take catalog mathVersion at START.
-- Settlement ALWAYS uses private.game_rounds.math_version, never live catalog payout.

UPDATE private.game_catalog
SET
    config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
        'rtpTarget', 1.000000000000000000,
        'mathVersion', 'dice-v3-win2',
        'winMultiplier', 2.00,
        'drawMultiplier', 1.00
    ),
    updated_at = pg_catalog.now()
WHERE game_code = 'dice';

UPDATE private.game_catalog
SET
    config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
        'rtpTarget', 1.0136234940440312,
        'mathVersion', 'blackjack-v4-visible-dealer-win2',
        'winPayout', 2.00,
        'goldenPayout', 2.00,
        'pushPayout', 1.00
    ),
    updated_at = pg_catalog.now()
WHERE game_code = 'blackjack';

CREATE OR REPLACE FUNCTION private.game_dice_win_multiplier_for_version(
    p_math_version TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
BEGIN
    IF p_math_version IS NULL OR btrim(p_math_version) = '' THEN
        RAISE EXCEPTION 'DICE_MATH_VERSION_MISSING';
    END IF;
    IF p_math_version = 'dice-v2-rtp875' THEN
        RETURN 1.72;
    END IF;
    IF p_math_version = 'dice-v3-win2' THEN
        RETURN 2.00;
    END IF;
    RAISE EXCEPTION 'DICE_MATH_VERSION_UNSUPPORTED';
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
    v_win NUMERIC;
BEGIN
    SELECT r.* INTO v_round FROM private.game_rounds AS r WHERE r.id = p_round_id FOR UPDATE;
    v_win := private.game_dice_win_multiplier_for_version(v_round.math_version);
    v_p1 := private.game_next_int(p_round_id, 6) + 1;
    v_p2 := private.game_next_int(p_round_id, 6) + 1;
    v_r1 := private.game_next_int(p_round_id, 6) + 1;
    v_r2 := private.game_next_int(p_round_id, 6) + 1;
    v_ps := v_p1 + v_p2;
    v_rs := v_r1 + v_r2;
    IF v_ps > v_rs THEN
        v_outcome := 'win';
        v_payout := private.game_money(v_round.stake * v_win);
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
            'winMultiplier', v_win,
            'mathVersion', v_round.math_version,
            'outcome', v_outcome
        ),
        jsonb_build_object('outcome', v_outcome),
        p_actor
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_bj_payout_for_version(
    p_stake NUMERIC,
    p_result TEXT,
    p_math_version TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_win NUMERIC;
    v_golden NUMERIC := 2.00;
BEGIN
    IF p_math_version IS NULL OR btrim(p_math_version) = '' THEN
        RAISE EXCEPTION 'BLACKJACK_MATH_VERSION_MISSING';
    END IF;
    IF p_math_version = 'blackjack-v2-rtp875' THEN
        v_win := 1.84;
    ELSIF p_math_version = 'blackjack-v3-visible-dealer-rtp875' THEN
        v_win := 1.70;
    ELSIF p_math_version = 'blackjack-v4-visible-dealer-win2' THEN
        v_win := 2.00;
    ELSE
        RAISE EXCEPTION 'BLACKJACK_MATH_VERSION_UNSUPPORTED';
    END IF;
    RETURN CASE
        WHEN p_result = 'golden' THEN private.game_money(p_stake * v_golden)
        WHEN p_result IN ('blackjack', 'win') THEN private.game_money(p_stake * v_win)
        WHEN p_result = 'push' THEN private.game_money(p_stake)
        ELSE 0
    END;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_report_rtp_meta(p_game_code TEXT)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_theo NUMERIC(8,6);
BEGIN
    -- Active theoretical targets follow each game's live math version.
    -- Historical settled rounds keep their own math_version / payouts.
    -- Pharaoh / Crystal / Aviator remain on the 0.875 controlled target.
    IF p_game_code = 'apples' THEN
        RETURN jsonb_build_object(
            'theoreticalRtpTarget', NULL,
            'rtpModel', 'progressive'
        );
    END IF;

    IF p_game_code = 'dice' THEN
        RETURN jsonb_build_object(
            'theoreticalRtpTarget', 1.000000000000000000,
            'rtpModel', 'fixed-target'
        );
    END IF;

    IF p_game_code = 'blackjack' THEN
        RETURN jsonb_build_object(
            'theoreticalRtpTarget', 1.0136234940440312,
            'rtpModel', 'fixed-target'
        );
    END IF;

    IF p_game_code IN ('pharaoh', 'crystal', 'aviator') THEN
        SELECT s.theoretical_rtp
        INTO v_theo
        FROM private.game_report_settings AS s
        WHERE s.id = 1;

        RETURN jsonb_build_object(
            'theoreticalRtpTarget', COALESCE(v_theo, 0.875000),
            'rtpModel', 'fixed-target'
        );
    END IF;

    RETURN jsonb_build_object(
        'theoreticalRtpTarget', NULL,
        'rtpModel', 'unconfigured'
    );
END;
$fn$;

REVOKE ALL ON FUNCTION private.game_dice_win_multiplier_for_version(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.game_bj_payout_for_version(NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

COMMIT;
