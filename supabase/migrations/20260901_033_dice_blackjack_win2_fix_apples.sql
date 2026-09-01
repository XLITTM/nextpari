BEGIN;

-- NEXTPARI PHASE 033
-- Dice ×2.00, Blackjack ×2.00 (visible dealer), Apples start array_append fix.
-- WRITE ONLY. Do not execute against production in this task.
-- Does not UPDATE historical settled rounds.
-- Does not change Pharaoh, Crystal, or Aviator math.
-- Does not change Apples financial math / catalog levels.
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

-- Apples start: fix TEXT[] concatenation only. Levels, RNG, shuffle, pick/cashout unchanged.
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
            v_kinds := array_append(v_kinds, 'good');
        END LOOP;
        FOR v_k IN 1 .. COALESCE((v_level->>'bad')::INTEGER, 0) LOOP
            v_kinds := array_append(v_kinds, 'bad');
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
