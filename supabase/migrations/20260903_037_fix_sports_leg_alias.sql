-- Fix PL/pgSQL variable vs SQL alias collision in private.sports_engine_place_as.
-- Production already applied 20260903_036_server_only_sports_place.sql.
-- Do not edit or reapply 036. This replaces only the affected function.

BEGIN;

CREATE OR REPLACE FUNCTION private.sports_engine_place_as(
    p_player_user_id UUID,
    p_idempotency_key TEXT,
    p_stake NUMERIC,
    p_mode TEXT,
    p_legs JSONB
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
    v_stake NUMERIC(20, 2);
    v_mode TEXT;
    v_leg_json JSONB;
    v_odds NUMERIC(20, 4) := 1;
    v_leg_odds NUMERIC(20, 4);
    v_count INTEGER := 0;
    v_bet private.sports_bets%ROWTYPE;
    v_existing private.sports_bets%ROWTYPE;
    v_ledger UUID;
    v_provider TEXT;
    v_feed TEXT;
BEGIN
    SELECT * INTO v_ctx FROM private.sports_require_player_by_id(p_player_user_id);
    v_key := private.game_require_idempotency_key(p_idempotency_key);
    v_stake := private.game_money(p_stake);
    IF v_stake <= 0 THEN
        RAISE EXCEPTION 'STAKE_NOT_POSITIVE';
    END IF;
    v_mode := NULLIF(BTRIM(LOWER(COALESCE(p_mode, 'single'))), '');
    IF v_mode IS NULL OR v_mode NOT IN ('single', 'express') THEN
        RAISE EXCEPTION 'SPORTS_MODE_INVALID';
    END IF;
    IF p_legs IS NULL OR jsonb_typeof(p_legs) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'SPORTS_LEGS_REQUIRED';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtext(v_ctx.user_id::TEXT || chr(1) || v_key)
    );

    SELECT b.*
    INTO v_existing
    FROM private.sports_bets AS b
    WHERE b.player_user_id = v_ctx.user_id
      AND b.idempotency_key = v_key
    FOR UPDATE;

    IF FOUND THEN
        RETURN private.sports_bet_json(
            v_existing,
            private.game_current_balance(v_ctx.wallet_id),
            true
        );
    END IF;

    FOR v_leg_json IN SELECT value FROM jsonb_array_elements(p_legs)
    LOOP
        v_count := v_count + 1;
        IF NULLIF(BTRIM(COALESCE(v_leg_json->>'fixtureId', v_leg_json->>'fixture_id', '')), '') IS NULL THEN
            RAISE EXCEPTION 'MISSING_FIXTURE';
        END IF;
        IF NULLIF(BTRIM(COALESCE(v_leg_json->>'outcomeId', v_leg_json->>'betId', '')), '') IS NULL THEN
            RAISE EXCEPTION 'MISSING_BET_ID';
        END IF;
        v_leg_odds := ROUND((v_leg_json->>'acceptedOdds')::NUMERIC, 3);
        IF v_leg_odds IS NULL OR v_leg_odds <= 1 THEN
            RAISE EXCEPTION 'INVALID_PRICE';
        END IF;
        v_odds := v_odds * v_leg_odds;
        v_provider := COALESCE(v_provider, NULLIF(BTRIM(COALESCE(v_leg_json->>'provider', '')), ''), 'lsports');
        v_feed := COALESCE(v_feed, NULLIF(BTRIM(COALESCE(v_leg_json->>'feedType', '')), ''), 'inplay');
    END LOOP;

    IF v_count < 1 THEN
        RAISE EXCEPTION 'SPORTS_LEGS_REQUIRED';
    END IF;
    IF v_mode = 'single' AND v_count <> 1 THEN
        RAISE EXCEPTION 'SPORTS_SINGLE_REQUIRES_ONE_LEG';
    END IF;
    IF v_mode = 'express' AND v_count < 2 THEN
        RAISE EXCEPTION 'SPORTS_EXPRESS_REQUIRES_LEGS';
    END IF;

    INSERT INTO private.sports_bets (
        player_user_id,
        wallet_id,
        provider,
        feed_type,
        mode,
        stake,
        accepted_odds,
        potential_payout,
        status,
        settlement_state,
        idempotency_key
    ) VALUES (
        v_ctx.user_id,
        v_ctx.wallet_id,
        COALESCE(v_provider, 'lsports'),
        COALESCE(v_feed, 'inplay'),
        v_mode,
        v_stake,
        v_odds,
        private.game_money(v_stake * v_odds),
        'accepted',
        'unsettled',
        v_key
    )
    RETURNING * INTO v_bet;

    INSERT INTO private.sports_bet_legs (
        bet_id,
        provider,
        feed_type,
        fixture_id,
        market_id,
        market_key,
        line,
        outcome_id,
        outcome_name,
        accepted_odds,
        market_status,
        bet_status,
        bet_status_id,
        provider_last_update,
        fixture_label,
        league
    )
    SELECT
        v_bet.id,
        COALESCE(NULLIF(BTRIM(COALESCE(t.leg_json->>'provider', '')), ''), 'lsports'),
        COALESCE(NULLIF(BTRIM(COALESCE(t.leg_json->>'feedType', '')), ''), 'inplay'),
        (COALESCE(t.leg_json->>'fixtureId', t.leg_json->>'fixture_id'))::BIGINT,
        COALESCE(t.leg_json->>'marketId', t.leg_json->>'market_id', ''),
        COALESCE(t.leg_json->>'marketKey', t.leg_json->>'market_key', ''),
        COALESCE(t.leg_json->>'line', ''),
        COALESCE(t.leg_json->>'outcomeId', t.leg_json->>'betId', ''),
        COALESCE(t.leg_json->>'outcomeName', t.leg_json->>'outcome_name', ''),
        (t.leg_json->>'acceptedOdds')::NUMERIC,
        t.leg_json->>'marketStatus',
        t.leg_json->>'betStatus',
        t.leg_json->>'betStatusId',
        t.leg_json->>'updatedAt',
        t.leg_json->>'fixtureLabel',
        t.leg_json->>'league'
    FROM jsonb_array_elements(p_legs) AS t(leg_json);

    SELECT e.ledger_id
    INTO v_ledger
    FROM private.apply_wallet_entry(
        v_ctx.wallet_id,
        -v_stake,
        0,
        'CASINO_BET',
        'casino',
        'sports-bet:' || v_bet.id::TEXT,
        'sports_bet',
        v_bet.id::TEXT,
        'player',
        v_ctx.user_id::TEXT,
        jsonb_build_object('provider', v_bet.provider, 'phase', 'place', 'mode', v_mode)
    ) AS e;

    UPDATE private.sports_bets
    SET bet_ledger_id = v_ledger,
        updated_at = pg_catalog.now()
    WHERE id = v_bet.id
    RETURNING * INTO v_bet;

    RETURN private.sports_bet_json(
        v_bet,
        private.game_current_balance(v_ctx.wallet_id),
        false
    );
END;
$fn$;

REVOKE ALL ON FUNCTION private.sports_engine_place_as(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sports_engine_place_as(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM anon, authenticated;

COMMENT ON FUNCTION private.sports_engine_place_as(UUID, TEXT, NUMERIC, TEXT, JSONB) IS
'Internal sports placement engine. Called only by public.sports_place_for_player (service_role).';

COMMIT;
