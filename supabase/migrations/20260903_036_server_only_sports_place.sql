BEGIN;

-- ============================================================
-- NEXTPARI PHASE 036
-- Server-only sports placement. Do not reapply 035.
--
-- Bypass closed:
--   authenticated/anon/public can no longer EXECUTE
--   public.player_sports_place (money path).
-- New path:
--   public.sports_place_for_player is service_role only.
--   p_player_user_id MUST be the Nextpari-verified session uid.
--   Never accept wallet/user ids from browser JSON.
--
-- player_sports_list stays authenticated with existing ownership checks.
-- sports_apply_settlement stays service_role (unchanged).
-- Wallet Core / apply_wallet_entry / public.wallets untouched.
-- ============================================================

CREATE OR REPLACE FUNCTION private.sports_require_player_by_id(p_player_user_id UUID)
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
    v_uid := p_player_user_id;
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
    v_leg JSONB;
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

    FOR v_leg IN SELECT value FROM jsonb_array_elements(p_legs)
    LOOP
        v_count := v_count + 1;
        IF NULLIF(BTRIM(COALESCE(v_leg->>'fixtureId', v_leg->>'fixture_id', '')), '') IS NULL THEN
            RAISE EXCEPTION 'MISSING_FIXTURE';
        END IF;
        IF NULLIF(BTRIM(COALESCE(v_leg->>'outcomeId', v_leg->>'betId', '')), '') IS NULL THEN
            RAISE EXCEPTION 'MISSING_BET_ID';
        END IF;
        v_leg_odds := ROUND((v_leg->>'acceptedOdds')::NUMERIC, 3);
        IF v_leg_odds IS NULL OR v_leg_odds <= 1 THEN
            RAISE EXCEPTION 'INVALID_PRICE';
        END IF;
        v_odds := v_odds * v_leg_odds;
        v_provider := COALESCE(v_provider, NULLIF(BTRIM(COALESCE(v_leg->>'provider', '')), ''), 'lsports');
        v_feed := COALESCE(v_feed, NULLIF(BTRIM(COALESCE(v_leg->>'feedType', '')), ''), 'inplay');
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
        COALESCE(NULLIF(BTRIM(COALESCE(v_leg->>'provider', '')), ''), 'lsports'),
        COALESCE(NULLIF(BTRIM(COALESCE(v_leg->>'feedType', '')), ''), 'inplay'),
        (COALESCE(v_leg->>'fixtureId', v_leg->>'fixture_id'))::BIGINT,
        COALESCE(v_leg->>'marketId', v_leg->>'market_id', ''),
        COALESCE(v_leg->>'marketKey', v_leg->>'market_key', ''),
        COALESCE(v_leg->>'line', ''),
        COALESCE(v_leg->>'outcomeId', v_leg->>'betId', ''),
        COALESCE(v_leg->>'outcomeName', v_leg->>'outcome_name', ''),
        (v_leg->>'acceptedOdds')::NUMERIC,
        v_leg->>'marketStatus',
        v_leg->>'betStatus',
        v_leg->>'betStatusId',
        v_leg->>'updatedAt',
        v_leg->>'fixtureLabel',
        v_leg->>'league'
    FROM jsonb_array_elements(p_legs) AS t(v_leg);

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

CREATE OR REPLACE FUNCTION public.sports_place_for_player(
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
BEGIN
    IF p_player_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    RETURN private.sports_engine_place_as(
        p_player_user_id,
        p_idempotency_key,
        p_stake,
        p_mode,
        p_legs
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.player_sports_place(
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
BEGIN
    RAISE EXCEPTION 'SPORTS_PLACE_SERVER_ONLY';
END;
$fn$;

REVOKE ALL ON FUNCTION private.sports_require_player_by_id(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sports_require_player_by_id(UUID) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.sports_engine_place_as(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sports_engine_place_as(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.sports_place_for_player(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sports_place_for_player(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sports_place_for_player(UUID, TEXT, NUMERIC, TEXT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.player_sports_place(TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_sports_place(TEXT, NUMERIC, TEXT, JSONB) FROM anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.player_sports_list() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_sports_list() FROM anon;
GRANT EXECUTE ON FUNCTION public.player_sports_list() TO authenticated;

COMMENT ON FUNCTION public.sports_place_for_player(UUID, TEXT, NUMERIC, TEXT, JSONB) IS
'Service-role sports placement. p_player_user_id is the Nextpari-verified session uid. Debits via Wallet Core CASINO_BET.';
COMMENT ON FUNCTION public.player_sports_place(TEXT, NUMERIC, TEXT, JSONB) IS
'Disabled. Direct player JWT placement is revoked. Use Nextpari /api/player/sports/place.';

COMMIT;
