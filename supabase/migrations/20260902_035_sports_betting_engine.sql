BEGIN;

-- ============================================================
-- NEXTPARI PHASE 035
-- LSports sports betting via Wallet Core
-- Sequence: after 034 dice/blackjack.
--
-- Additive only. Does NOT rewrite private.apply_wallet_entry.
-- Does NOT GRANT public money RPCs beyond player_sports_place/list.
-- Does NOT mutate public.wallets.
-- Browser has NO EXECUTE on settlement.
--
-- Debit:  CASINO_BET   (existing Wallet Core type)
-- Credit: CASINO_WIN / CASINO_REFUND
-- Reverse: CASINO_BET compensating debit of previous payout
-- ============================================================

CREATE TABLE IF NOT EXISTS private.sports_bets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_user_id UUID NOT NULL,
    wallet_id UUID NOT NULL,
    provider TEXT NOT NULL,
    feed_type TEXT NOT NULL,
    mode TEXT NOT NULL,
    stake NUMERIC(20, 2) NOT NULL,
    accepted_odds NUMERIC(20, 4) NOT NULL,
    potential_payout NUMERIC(20, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'TMTM',
    status TEXT NOT NULL,
    settlement_state TEXT NOT NULL DEFAULT 'unsettled',
    provider_settlement_code INTEGER,
    last_applied_settlement_code INTEGER,
    last_payout_amount NUMERIC(20, 2) NOT NULL DEFAULT 0,
    last_settlement_fingerprint TEXT,
    bet_ledger_id UUID,
    last_settlement_ledger_id UUID,
    idempotency_key TEXT NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT sports_bets_mode_check CHECK (mode IN ('single', 'express')),
    CONSTRAINT sports_bets_status_check CHECK (status IN ('accepted', 'settled', 'cancelled')),
    CONSTRAINT sports_bets_settlement_state_check CHECK (
        settlement_state IN (
            'unsettled', 'winner', 'loser', 'refund', 'half_lost', 'half_won', 'cancelled'
        )
    ),
    CONSTRAINT sports_bets_stake_positive CHECK (stake > 0),
    CONSTRAINT sports_bets_player_idempotency UNIQUE (player_user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS private.sports_bet_legs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bet_id UUID NOT NULL REFERENCES private.sports_bets (id),
    provider TEXT NOT NULL,
    feed_type TEXT NOT NULL,
    fixture_id BIGINT NOT NULL,
    market_id TEXT NOT NULL,
    market_key TEXT NOT NULL,
    line TEXT NOT NULL DEFAULT '',
    outcome_id TEXT NOT NULL,
    outcome_name TEXT NOT NULL DEFAULT '',
    accepted_odds NUMERIC(20, 4) NOT NULL,
    market_status TEXT,
    bet_status TEXT,
    bet_status_id TEXT,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    provider_last_update TEXT,
    fixture_label TEXT,
    league TEXT,
    settlement_code INTEGER,
    settlement_fingerprint TEXT,
    CONSTRAINT sports_bet_legs_identity UNIQUE (bet_id, fixture_id, market_key, outcome_id)
);

CREATE TABLE IF NOT EXISTS private.sports_settlement_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fingerprint TEXT NOT NULL UNIQUE,
    fixture_id BIGINT,
    market_id TEXT,
    market_key TEXT,
    outcome_id TEXT,
    settlement_code INTEGER,
    matched_bet_id UUID,
    result TEXT NOT NULL,
    payout_amount NUMERIC(20, 2),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT sports_settlement_events_result_check CHECK (
        result IN (
            'applied', 'duplicate', 'unmatched', 'ignored', 'reversed', 'corrected', 'unknown'
        )
    )
);

CREATE INDEX IF NOT EXISTS sports_bet_legs_match_idx
    ON private.sports_bet_legs (fixture_id, outcome_id, market_key);

CREATE INDEX IF NOT EXISTS sports_bets_player_idx
    ON private.sports_bets (player_user_id, accepted_at DESC);

REVOKE ALL ON TABLE private.sports_bets FROM PUBLIC;
REVOKE ALL ON TABLE private.sports_bets FROM anon, authenticated;
REVOKE ALL ON TABLE private.sports_bet_legs FROM PUBLIC;
REVOKE ALL ON TABLE private.sports_bet_legs FROM anon, authenticated;
REVOKE ALL ON TABLE private.sports_settlement_events FROM PUBLIC;
REVOKE ALL ON TABLE private.sports_settlement_events FROM anon, authenticated;
GRANT SELECT ON TABLE private.sports_bets TO service_role;
GRANT SELECT ON TABLE private.sports_bet_legs TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE private.sports_settlement_events TO service_role;


CREATE OR REPLACE FUNCTION private.sports_outcome_payout(
    p_stake NUMERIC,
    p_odds NUMERIC,
    p_code INTEGER
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE
        WHEN p_code IS NULL OR p_code = 0 THEN NULL
        WHEN p_code = 1 THEN 0
        WHEN p_code = 2 THEN private.game_money(p_stake * p_odds)
        WHEN p_code = 3 THEN private.game_money(p_stake)
        WHEN p_code = 4 THEN private.game_money(p_stake / 2)
        WHEN p_code = 5 THEN private.game_money((p_stake / 2) * p_odds + (p_stake / 2))
        ELSE NULL
    END;
$$;

CREATE OR REPLACE FUNCTION private.sports_state_from_code(p_code INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE p_code
        WHEN -1 THEN 'cancelled'
        WHEN 1 THEN 'loser'
        WHEN 2 THEN 'winner'
        WHEN 3 THEN 'refund'
        WHEN 4 THEN 'half_lost'
        WHEN 5 THEN 'half_won'
        ELSE 'unsettled'
    END;
$$;

CREATE OR REPLACE FUNCTION private.sports_bet_json(
    p_bet private.sports_bets,
    p_balance NUMERIC,
    p_duplicate BOOLEAN
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_legs jsonb;
BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'fixtureId', l.fixture_id,
        'marketId', l.market_id,
        'marketKey', l.market_key,
        'line', l.line,
        'outcomeId', l.outcome_id,
        'outcomeName', l.outcome_name,
        'acceptedOdds', l.accepted_odds,
        'fixtureLabel', l.fixture_label,
        'league', l.league,
        'settlementCode', l.settlement_code
    ) ORDER BY l.accepted_at), '[]'::jsonb)
    INTO v_legs
    FROM private.sports_bet_legs AS l
    WHERE l.bet_id = p_bet.id;

    RETURN jsonb_build_object(
        'ok', true,
        'isDuplicate', COALESCE(p_duplicate, false),
        'betId', p_bet.id,
        'provider', p_bet.provider,
        'feedType', p_bet.feed_type,
        'mode', p_bet.mode,
        'stake', p_bet.stake,
        'acceptedOdds', p_bet.accepted_odds,
        'potentialPayout', p_bet.potential_payout,
        'currency', p_bet.currency,
        'status', p_bet.status,
        'settlementState', p_bet.settlement_state,
        'providerSettlementCode', p_bet.provider_settlement_code,
        'acceptedAt', p_bet.accepted_at,
        'settledAt', p_bet.settled_at,
        'balanceAfter', private.game_money(p_balance),
        'legs', v_legs
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.sports_engine_place(
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
    SELECT * INTO v_ctx FROM private.game_require_player_context();
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


CREATE OR REPLACE FUNCTION private.sports_credit(
    p_wallet UUID,
    p_amount NUMERIC,
    p_op TEXT,
    p_idempotency TEXT,
    p_bet UUID,
    p_actor TEXT,
    p_meta JSONB
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_ledger UUID;
    v_amount NUMERIC(20, 2);
BEGIN
    v_amount := private.game_money(p_amount);
    IF v_amount <= 0 THEN
        RETURN NULL;
    END IF;
    SELECT e.ledger_id
    INTO v_ledger
    FROM private.apply_wallet_entry(
        p_wallet,
        v_amount,
        0,
        p_op,
        'casino',
        p_idempotency,
        'sports_bet',
        p_bet::TEXT,
        'system',
        p_actor,
        p_meta
    ) AS e;
    RETURN v_ledger;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.sports_debit(
    p_wallet UUID,
    p_amount NUMERIC,
    p_idempotency TEXT,
    p_bet UUID,
    p_actor TEXT,
    p_meta JSONB
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_ledger UUID;
    v_amount NUMERIC(20, 2);
BEGIN
    v_amount := private.game_money(p_amount);
    IF v_amount <= 0 THEN
        RETURN NULL;
    END IF;
    SELECT e.ledger_id
    INTO v_ledger
    FROM private.apply_wallet_entry(
        p_wallet,
        -v_amount,
        0,
        'CASINO_BET',
        'casino',
        p_idempotency,
        'sports_bet',
        p_bet::TEXT,
        'system',
        p_actor,
        p_meta
    ) AS e;
    RETURN v_ledger;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.sports_apply_one(
    p_item JSONB
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_fp TEXT;
    v_fixture BIGINT;
    v_market_key TEXT;
    v_market_id TEXT;
    v_outcome TEXT;
    v_code INTEGER;
    v_existing UUID;
    v_bet private.sports_bets%ROWTYPE;
    v_leg private.sports_bet_legs%ROWTYPE;
    v_matched INTEGER := 0;
    v_result TEXT := 'unmatched';
    v_payout NUMERIC(20, 2) := 0;
    v_ledger UUID;
    v_op TEXT;
BEGIN
    v_fp := NULLIF(BTRIM(COALESCE(p_item->>'fingerprint', '')), '');
    IF v_fp IS NULL THEN
        RAISE EXCEPTION 'SETTLEMENT_FINGERPRINT_REQUIRED';
    END IF;
    v_fixture := NULLIF(p_item->>'fixtureId', '')::BIGINT;
    v_market_key := COALESCE(p_item->>'marketKey', '');
    v_market_id := COALESCE(p_item->>'marketId', '');
    v_outcome := COALESCE(p_item->>'outcomeId', p_item->>'betId', '');
    v_code := NULLIF(p_item->>'settlement', '')::INTEGER;

    INSERT INTO private.sports_settlement_events (
        fingerprint, fixture_id, market_id, market_key, outcome_id, settlement_code, result, payload
    ) VALUES (
        v_fp, v_fixture, v_market_id, v_market_key, v_outcome, v_code, 'ignored', p_item
    )
    ON CONFLICT (fingerprint) DO NOTHING
    RETURNING id INTO v_existing;

    IF v_existing IS NULL THEN
        RETURN jsonb_build_object('ok', true, 'result', 'duplicate', 'fingerprint', v_fp);
    END IF;

    IF v_code IS NULL OR v_code NOT IN (-1, 0, 1, 2, 3, 4, 5) THEN
        UPDATE private.sports_settlement_events
        SET result = 'unknown'
        WHERE fingerprint = v_fp;
        RETURN jsonb_build_object('ok', true, 'result', 'unknown', 'fingerprint', v_fp);
    END IF;

    IF v_code = 0 THEN
        UPDATE private.sports_settlement_events
        SET result = 'ignored'
        WHERE fingerprint = v_fp;
        RETURN jsonb_build_object('ok', true, 'result', 'ignored', 'fingerprint', v_fp);
    END IF;

    FOR v_leg IN
        SELECT l.*
        FROM private.sports_bet_legs AS l
        WHERE l.fixture_id = v_fixture
          AND l.outcome_id = v_outcome
          AND (
            v_market_key = ''
            OR l.market_key = v_market_key
            OR (v_market_id <> '' AND l.market_id = v_market_id)
          )
    LOOP
        SELECT b.*
        INTO v_bet
        FROM private.sports_bets AS b
        WHERE b.id = v_leg.bet_id
        FOR UPDATE;

        IF NOT FOUND THEN
            CONTINUE;
        END IF;
        v_matched := v_matched + 1;

        UPDATE private.sports_bet_legs
        SET settlement_code = v_code,
            settlement_fingerprint = v_fp
        WHERE id = v_leg.id;

        IF v_bet.mode = 'express' THEN
            IF EXISTS (
                SELECT 1 FROM private.sports_bet_legs AS x
                WHERE x.bet_id = v_bet.id
                  AND (x.settlement_code IS NULL OR x.settlement_code = 0)
            ) AND v_code <> -1 THEN
                v_result := 'ignored';
                CONTINUE;
            END IF;
        END IF;

        IF v_code = -1 THEN
            IF v_bet.last_applied_settlement_code = -1
               AND COALESCE(v_bet.last_payout_amount, 0) = 0 THEN
                v_result := 'duplicate';
                UPDATE private.sports_settlement_events
                SET matched_bet_id = v_bet.id,
                    result = 'duplicate',
                    payout_amount = 0
                WHERE fingerprint = v_fp;
                CONTINUE;
            END IF;
            IF COALESCE(v_bet.last_payout_amount, 0) > 0 THEN
                v_ledger := private.sports_debit(
                    v_bet.wallet_id,
                    v_bet.last_payout_amount,
                    'sports-reverse:' || v_bet.id::TEXT || ':' || v_fp,
                    v_bet.id,
                    'type35',
                    jsonb_build_object('phase', 'reversal', 'code', -1)
                );
                v_result := 'reversed';
            ELSIF v_bet.settlement_state = 'unsettled' THEN
                v_ledger := private.sports_credit(
                    v_bet.wallet_id,
                    v_bet.stake,
                    'CASINO_REFUND',
                    'sports-void:' || v_bet.id::TEXT || ':' || v_fp,
                    v_bet.id,
                    'type35',
                    jsonb_build_object('phase', 'cancelled', 'code', -1)
                );
                v_payout := v_bet.stake;
                v_result := 'applied';
            ELSE
                v_result := 'reversed';
            END IF;
            UPDATE private.sports_bets
            SET status = 'cancelled',
                settlement_state = 'cancelled',
                provider_settlement_code = -1,
                last_applied_settlement_code = -1,
                last_payout_amount = 0,
                last_settlement_fingerprint = v_fp,
                last_settlement_ledger_id = COALESCE(v_ledger, last_settlement_ledger_id),
                settled_at = pg_catalog.now(),
                updated_at = pg_catalog.now()
            WHERE id = v_bet.id;
        ELSE
            v_payout := COALESCE(private.sports_outcome_payout(v_bet.stake, v_bet.accepted_odds, v_code), 0);
            IF v_bet.mode = 'express' THEN
                v_payout := v_bet.stake;
                FOR v_leg IN
                    SELECT * FROM private.sports_bet_legs WHERE bet_id = v_bet.id
                LOOP
                    IF v_leg.settlement_code IS NULL OR v_leg.settlement_code = 0 THEN
                        v_payout := NULL;
                        EXIT;
                    END IF;
                    IF v_leg.settlement_code NOT IN (-1, 1, 2, 3, 4, 5) THEN
                        UPDATE private.sports_settlement_events
                        SET result = 'unknown', matched_bet_id = v_bet.id
                        WHERE fingerprint = v_fp;
                        RETURN jsonb_build_object('ok', true, 'result', 'unknown', 'betId', v_bet.id);
                    END IF;
                    IF v_leg.settlement_code IN (-1, 3) THEN
                        CONTINUE;
                    ELSIF v_leg.settlement_code = 1 THEN
                        v_payout := 0;
                    ELSIF v_leg.settlement_code = 2 THEN
                        v_payout := private.game_money(v_payout * v_leg.accepted_odds);
                    ELSIF v_leg.settlement_code = 4 THEN
                        v_payout := private.game_money(v_payout / 2);
                    ELSIF v_leg.settlement_code = 5 THEN
                        v_payout := private.game_money((v_payout / 2) * v_leg.accepted_odds + (v_payout / 2));
                    END IF;
                END LOOP;
                IF v_payout IS NULL THEN
                    v_result := 'ignored';
                    CONTINUE;
                END IF;
            END IF;

            IF v_bet.last_applied_settlement_code IS NOT DISTINCT FROM v_code
               AND COALESCE(v_bet.last_payout_amount, 0) = COALESCE(v_payout, 0)
               AND v_bet.settlement_state IS DISTINCT FROM 'unsettled' THEN
                v_result := 'duplicate';
                UPDATE private.sports_settlement_events
                SET matched_bet_id = v_bet.id,
                    result = 'duplicate',
                    payout_amount = 0
                WHERE fingerprint = v_fp;
                CONTINUE;
            END IF;

            IF COALESCE(v_bet.last_payout_amount, 0) > 0
               AND v_bet.last_applied_settlement_code IS DISTINCT FROM v_code THEN
                v_ledger := private.sports_debit(
                    v_bet.wallet_id,
                    v_bet.last_payout_amount,
                    'sports-reverse:' || v_bet.id::TEXT || ':' || v_fp,
                    v_bet.id,
                    'type35',
                    jsonb_build_object('phase', 'correction-reversal')
                );
                v_result := 'corrected';
            ELSE
                v_result := 'applied';
            END IF;

            IF v_payout > 0 THEN
                IF v_code = 3 THEN
                    v_op := 'CASINO_REFUND';
                ELSE
                    v_op := 'CASINO_WIN';
                END IF;
                v_ledger := private.sports_credit(
                    v_bet.wallet_id,
                    v_payout,
                    v_op,
                    'sports-settle:' || v_bet.id::TEXT || ':' || v_fp,
                    v_bet.id,
                    'type35',
                    jsonb_build_object('phase', 'settlement', 'code', v_code)
                );
            END IF;

            UPDATE private.sports_bets
            SET status = 'settled',
                settlement_state = private.sports_state_from_code(v_code),
                provider_settlement_code = v_code,
                last_applied_settlement_code = v_code,
                last_payout_amount = COALESCE(v_payout, 0),
                last_settlement_fingerprint = v_fp,
                last_settlement_ledger_id = COALESCE(v_ledger, last_settlement_ledger_id),
                settled_at = pg_catalog.now(),
                updated_at = pg_catalog.now()
            WHERE id = v_bet.id;
        END IF;

        UPDATE private.sports_settlement_events
        SET matched_bet_id = v_bet.id,
            result = v_result,
            payout_amount = COALESCE(v_payout, 0)
        WHERE fingerprint = v_fp;
    END LOOP;

    IF v_matched = 0 THEN
        UPDATE private.sports_settlement_events
        SET result = 'unmatched'
        WHERE fingerprint = v_fp;
        RETURN jsonb_build_object('ok', true, 'result', 'unmatched', 'fingerprint', v_fp);
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'result', v_result,
        'fingerprint', v_fp,
        'matched', v_matched,
        'payout', COALESCE(v_payout, 0)
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
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    RETURN private.sports_engine_place(p_idempotency_key, p_stake, p_mode, p_legs);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.player_sports_list()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_rows jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    SELECT * INTO v_ctx FROM private.game_require_player_context();
    SELECT COALESCE(jsonb_agg(private.sports_bet_json(b, 0, false) ORDER BY b.accepted_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM private.sports_bets AS b
    WHERE b.player_user_id = v_ctx.user_id;
    RETURN jsonb_build_object('ok', true, 'bets', v_rows);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.sports_apply_settlement(p_items JSONB)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_item JSONB;
    v_out jsonb := '[]'::jsonb;
    v_one jsonb;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'SETTLEMENT_ITEMS_REQUIRED';
    END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        v_one := private.sports_apply_one(v_item);
        v_out := v_out || jsonb_build_array(v_one);
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'results', v_out);
END;
$fn$;

REVOKE ALL ON FUNCTION public.player_sports_place(TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_sports_place(TEXT, NUMERIC, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.player_sports_place(TEXT, NUMERIC, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.player_sports_list() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_sports_list() FROM anon;
GRANT EXECUTE ON FUNCTION public.player_sports_list() TO authenticated;

REVOKE ALL ON FUNCTION public.sports_apply_settlement(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sports_apply_settlement(JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sports_apply_settlement(JSONB) TO service_role;

REVOKE ALL ON FUNCTION private.sports_engine_place(TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sports_engine_place(TEXT, NUMERIC, TEXT, JSONB) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.sports_apply_one(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sports_apply_one(JSONB) FROM anon, authenticated;

COMMENT ON FUNCTION public.player_sports_place(TEXT, NUMERIC, TEXT, JSONB) IS
'Player sports bet placement. Identity from auth.uid(). Debits via Wallet Core CASINO_BET. Odds must already be server-validated.';
COMMENT ON FUNCTION public.sports_apply_settlement(JSONB) IS
'Service-role Type 35 settlement. Matches FixtureId + market identity + Bet.Id. Never deletes ledger history.';

COMMIT;
