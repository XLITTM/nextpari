BEGIN;

-- NEXTPARI PHASE 032
-- Blackjack visible-dealer RTP calibration.
-- WRITE ONLY. Do not execute against production in this task.
-- Does not UPDATE historical settled rounds.
-- Does not change Pharaoh, Dice, Apples, Crystal, or Aviator math.
-- Does not change Wallet Core or ledger.

UPDATE private.game_catalog
SET
    config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
        'rtpTarget', 0.875,
        'mathVersion', 'blackjack-v3-visible-dealer-rtp875',
        'winPayout', 1.70,
        'goldenPayout', 2.00,
        'pushPayout', 1.00
    ),
    updated_at = pg_catalog.now()
WHERE game_code = 'blackjack';

CREATE OR REPLACE FUNCTION private.game_bj_payout(p_stake NUMERIC, p_result TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_win NUMERIC := 1.70;
    v_golden NUMERIC := 2.00;
BEGIN
    SELECT
        COALESCE((c.config->>'winPayout')::NUMERIC, 1.70),
        COALESCE((c.config->>'goldenPayout')::NUMERIC, 2.00)
    INTO v_win, v_golden
    FROM private.game_catalog AS c
    WHERE c.game_code = 'blackjack';
    RETURN CASE
        WHEN p_result = 'golden' THEN private.game_money(p_stake * v_golden)
        WHEN p_result IN ('blackjack', 'win') THEN private.game_money(p_stake * v_win)
        WHEN p_result = 'push' THEN private.game_money(p_stake)
        ELSE 0
    END;
END;
$fn$;

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
    v_draws JSONB := '[]'::jsonb;
    v_result TEXT;
    v_pub JSONB;
BEGIN
    SELECT r.* INTO v_round FROM private.game_rounds AS r WHERE r.id = p_round_id FOR UPDATE;
    WHILE private.game_bj_score(v_dealer) < 17 LOOP
        v_drawn := private.game_bj_draw(p_deck, false);
        v_dealer := v_dealer || jsonb_build_array(v_drawn->'card');
        v_draws := v_draws || jsonb_build_array(v_drawn->'card');
        p_deck := v_drawn->'deck';
    END LOOP;
    v_result := private.game_bj_resolve(p_player, v_dealer);
    v_pub := private.game_bj_public(p_player, v_dealer, 'gameOver', v_result)
        || jsonb_build_object(
            'dealerDraws', v_draws,
            'mathVersion', COALESCE(private.game_math_version('blackjack'), 'blackjack-v3-visible-dealer-rtp875')
        );
    RETURN private.game_settle_win(
        p_round_id,
        private.game_bj_payout(v_round.stake, v_result),
        v_pub,
        jsonb_build_object('deck', p_deck, 'playerHand', p_player, 'dealerHand', v_dealer, 'result', v_result, 'dealerDraws', v_draws),
        p_actor
    );
END;
$fn$;

COMMIT;
