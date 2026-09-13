BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 047
-- SPORTS BET ACCEPTANCE INTEGRITY
-- Sequence: after 046 (provider settlement / GGR foundation).
--
-- Repository only. DO NOT APPLY from this change.
--
-- Strengthens private.sports_engine_place_as (live engine).
-- Does not rewrite private.apply_wallet_entry.
-- Does not restore public.player_sports_place.
-- Does not change LSports adapters or BetB2B.
-- Monetary guardrails stay NULL until explicitly configured.
-- ============================================================


ALTER TABLE private.sports_bets
    ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;

COMMENT ON COLUMN private.sports_bets.request_fingerprint IS
'Canonical SHA-256 of stake/mode/server-accepted leg identity and odds. Exact replay must match; mismatch raises SPORTS_BET_IDEMPOTENCY_CONFLICT.';


CREATE TABLE IF NOT EXISTS private.sports_acceptance_settings (
    id SMALLINT PRIMARY KEY,
    sports_betting_enabled BOOLEAN NOT NULL DEFAULT true,
    max_stake NUMERIC(20, 2),
    max_potential_payout NUMERIC(20, 2),
    max_express_legs INTEGER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT sports_acceptance_settings_singleton CHECK (id = 1),
    CONSTRAINT sports_acceptance_max_stake_check
        CHECK (max_stake IS NULL OR (max_stake > 0 AND max_stake = ROUND(max_stake, 2))),
    CONSTRAINT sports_acceptance_max_payout_check
        CHECK (
            max_potential_payout IS NULL
            OR (max_potential_payout > 0 AND max_potential_payout = ROUND(max_potential_payout, 2))
        ),
    CONSTRAINT sports_acceptance_max_legs_check
        CHECK (max_express_legs IS NULL OR max_express_legs >= 2)
);

INSERT INTO private.sports_acceptance_settings (id, sports_betting_enabled)
VALUES (1, true)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE private.sports_acceptance_settings IS
'Provider-independent Nextpari sports place guardrails. NULL monetary/leg limits mean unconfigured (no invented default).';


CREATE TABLE IF NOT EXISTS private.sports_bet_acceptance_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT NOT NULL,
    player_user_id UUID NOT NULL,
    bet_id UUID,
    providers TEXT NOT NULL DEFAULT '',
    mode TEXT,
    stake NUMERIC(20, 2),
    potential_payout NUMERIC(20, 2),
    decision TEXT NOT NULL,
    decision_code TEXT NOT NULL,
    odds_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT sports_acceptance_decision_check
        CHECK (decision IN ('accepted', 'rejected')),
    CONSTRAINT sports_acceptance_decision_code_check
        CHECK (char_length(BTRIM(decision_code)) BETWEEN 1 AND 64)
);

CREATE INDEX IF NOT EXISTS sports_bet_acceptance_events_player_idx
    ON private.sports_bet_acceptance_events (player_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sports_bet_acceptance_events_key_idx
    ON private.sports_bet_acceptance_events (player_user_id, idempotency_key);

COMMENT ON TABLE private.sports_bet_acceptance_events IS
'Append-only sports place acceptance/rejection audit. No browser EXECUTE. No passwords/JWTs/API keys.';


REVOKE ALL ON TABLE private.sports_acceptance_settings FROM PUBLIC;
REVOKE ALL ON TABLE private.sports_acceptance_settings FROM anon, authenticated;
REVOKE ALL ON TABLE private.sports_acceptance_settings FROM service_role;
GRANT SELECT, UPDATE ON TABLE private.sports_acceptance_settings TO service_role;

REVOKE ALL ON TABLE private.sports_bet_acceptance_events FROM PUBLIC;
REVOKE ALL ON TABLE private.sports_bet_acceptance_events FROM anon, authenticated;
REVOKE ALL ON TABLE private.sports_bet_acceptance_events FROM service_role;
GRANT SELECT ON TABLE private.sports_bet_acceptance_events TO service_role;


CREATE OR REPLACE FUNCTION private.sports_place_request_fingerprint(
    p_stake NUMERIC,
    p_mode TEXT,
    p_legs JSONB
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
    SELECT private.game_fingerprint(
        jsonb_build_object(
            'stake', ROUND(COALESCE(p_stake, 0), 2),
            'mode', LOWER(BTRIM(COALESCE(p_mode, ''))),
            'legs', COALESCE((
                SELECT jsonb_agg(leg.item ORDER BY leg.item->>'provider', leg.item->>'fixtureId', leg.item->>'marketKey', leg.item->>'outcomeId')
                FROM (
                    SELECT jsonb_build_object(
                        'provider', LOWER(BTRIM(COALESCE(elem.leg_json->>'provider', ''))),
                        'fixtureId', BTRIM(COALESCE(elem.leg_json->>'fixtureId', elem.leg_json->>'fixture_id', '')),
                        'marketId', BTRIM(COALESCE(elem.leg_json->>'marketId', elem.leg_json->>'market_id', '')),
                        'marketKey', BTRIM(COALESCE(elem.leg_json->>'marketKey', elem.leg_json->>'market_key', '')),
                        'line', BTRIM(COALESCE(elem.leg_json->>'line', '')),
                        'outcomeId', BTRIM(COALESCE(elem.leg_json->>'outcomeId', elem.leg_json->>'betId', '')),
                        'acceptedOdds', ROUND((elem.leg_json->>'acceptedOdds')::NUMERIC, 3)
                    ) AS item
                    FROM jsonb_array_elements(COALESCE(p_legs, '[]'::jsonb)) AS elem(leg_json)
                ) AS leg
            ), '[]'::jsonb)
        )
    );
$fn$;


-- Pre-047 rows: derive fingerprint from stored stake/mode/legs, never from live quotes.
-- Incomplete/unverifiable bets stay NULL and fail closed on reuse.
UPDATE private.sports_bets AS b
SET request_fingerprint = private.sports_place_request_fingerprint(
    b.stake,
    b.mode,
    COALESCE((
        SELECT jsonb_agg(
            jsonb_build_object(
                'provider', l.provider,
                'fixtureId', l.fixture_id::TEXT,
                'marketId', l.market_id,
                'marketKey', l.market_key,
                'line', l.line,
                'outcomeId', l.outcome_id,
                'acceptedOdds', l.accepted_odds
            )
        )
        FROM private.sports_bet_legs AS l
        WHERE l.bet_id = b.id
    ), '[]'::jsonb)
)
WHERE b.request_fingerprint IS NULL
  AND EXISTS (
      SELECT 1
      FROM private.sports_bet_legs AS complete
      WHERE complete.bet_id = b.id
  )
  AND NOT EXISTS (
      SELECT 1
      FROM private.sports_bet_legs AS incomplete
      WHERE incomplete.bet_id = b.id
        AND (
            NULLIF(BTRIM(COALESCE(incomplete.provider, '')), '') IS NULL
            OR incomplete.fixture_id IS NULL
            OR NULLIF(BTRIM(COALESCE(incomplete.outcome_id, '')), '') IS NULL
            OR incomplete.accepted_odds IS NULL
            OR incomplete.accepted_odds <= 1
        )
  );


CREATE OR REPLACE FUNCTION private.sports_record_acceptance_event(
    p_idempotency_key TEXT,
    p_player_user_id UUID,
    p_bet_id UUID,
    p_providers TEXT,
    p_mode TEXT,
    p_stake NUMERIC,
    p_potential_payout NUMERIC,
    p_decision TEXT,
    p_decision_code TEXT,
    p_odds_snapshot JSONB
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_id UUID;
    v_decision TEXT;
    v_code TEXT;
    v_snapshot JSONB;
BEGIN
    IF p_player_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    v_decision := LOWER(BTRIM(COALESCE(p_decision, '')));
    IF v_decision NOT IN ('accepted', 'rejected') THEN
        RAISE EXCEPTION 'SPORTS_ACCEPTANCE_DECISION_INVALID';
    END IF;
    v_code := BTRIM(COALESCE(p_decision_code, ''));
    IF char_length(v_code) < 1 OR char_length(v_code) > 64 THEN
        RAISE EXCEPTION 'SPORTS_ACCEPTANCE_CODE_INVALID';
    END IF;
    v_snapshot := COALESCE(p_odds_snapshot, '{}'::jsonb);
    IF v_snapshot::TEXT ~* '(password|authorization|bearer |service_role|supabaseServiceRole|eyJ[A-Za-z0-9_-]{20,})' THEN
        RAISE EXCEPTION 'SPORTS_ACCEPTANCE_SECRET_FORBIDDEN';
    END IF;

    INSERT INTO private.sports_bet_acceptance_events (
        idempotency_key,
        player_user_id,
        bet_id,
        providers,
        mode,
        stake,
        potential_payout,
        decision,
        decision_code,
        odds_snapshot
    ) VALUES (
        LEFT(BTRIM(COALESCE(p_idempotency_key, '')), 250),
        p_player_user_id,
        p_bet_id,
        LEFT(BTRIM(COALESCE(p_providers, '')), 250),
        NULLIF(LOWER(BTRIM(COALESCE(p_mode, ''))), ''),
        CASE WHEN p_stake IS NULL THEN NULL ELSE ROUND(p_stake, 2) END,
        CASE WHEN p_potential_payout IS NULL THEN NULL ELSE ROUND(p_potential_payout, 2) END,
        v_decision,
        v_code,
        v_snapshot
    )
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.sports_record_acceptance_event(
    p_idempotency_key TEXT,
    p_player_user_id UUID,
    p_bet_id UUID,
    p_providers TEXT,
    p_mode TEXT,
    p_stake NUMERIC,
    p_potential_payout NUMERIC,
    p_decision TEXT,
    p_decision_code TEXT,
    p_odds_snapshot JSONB
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    RETURN private.sports_record_acceptance_event(
        p_idempotency_key,
        p_player_user_id,
        p_bet_id,
        p_providers,
        p_mode,
        p_stake,
        p_potential_payout,
        p_decision,
        p_decision_code,
        p_odds_snapshot
    );
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
    v_leg_json JSONB;
    v_odds NUMERIC(20, 4) := 1;
    v_leg_odds NUMERIC(20, 4);
    v_count INTEGER := 0;
    v_bet private.sports_bets%ROWTYPE;
    v_existing private.sports_bets%ROWTYPE;
    v_ledger UUID;
    v_provider TEXT;
    v_feed TEXT;
    v_leg_provider TEXT;
    v_fp TEXT;
    v_payout NUMERIC(20, 2);
    v_settings private.sports_acceptance_settings%ROWTYPE;
    v_constraint TEXT;
    v_providers TEXT := '';
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

    FOR v_leg_json IN SELECT value FROM jsonb_array_elements(p_legs)
    LOOP
        v_count := v_count + 1;
        IF NULLIF(BTRIM(COALESCE(v_leg_json->>'fixtureId', v_leg_json->>'fixture_id', '')), '') IS NULL THEN
            RAISE EXCEPTION 'MISSING_FIXTURE';
        END IF;
        IF NULLIF(BTRIM(COALESCE(v_leg_json->>'outcomeId', v_leg_json->>'betId', '')), '') IS NULL THEN
            RAISE EXCEPTION 'MISSING_BET_ID';
        END IF;
        v_leg_provider := NULLIF(LOWER(BTRIM(COALESCE(v_leg_json->>'provider', ''))), '');
        IF v_leg_provider IS NULL THEN
            RAISE EXCEPTION 'EVENT_UNAVAILABLE';
        END IF;
        v_leg_odds := ROUND((v_leg_json->>'acceptedOdds')::NUMERIC, 3);
        IF v_leg_odds IS NULL OR v_leg_odds <= 1 THEN
            RAISE EXCEPTION 'INVALID_PRICE';
        END IF;
        v_odds := v_odds * v_leg_odds;
        v_provider := COALESCE(v_provider, v_leg_provider);
        v_feed := COALESCE(v_feed, NULLIF(BTRIM(COALESCE(v_leg_json->>'feedType', '')), ''));
        IF v_providers = '' THEN
            v_providers := v_leg_provider;
        ELSIF position(v_leg_provider IN v_providers) = 0 THEN
            v_providers := v_providers || ',' || v_leg_provider;
        END IF;
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

    v_payout := private.game_money(v_stake * v_odds);
    v_fp := private.sports_place_request_fingerprint(v_stake, v_mode, p_legs);

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
        IF v_existing.request_fingerprint IS NULL
           OR v_existing.request_fingerprint IS DISTINCT FROM v_fp THEN
            RAISE EXCEPTION 'SPORTS_BET_IDEMPOTENCY_CONFLICT';
        END IF;
        RETURN private.sports_bet_json(
            v_existing,
            private.game_current_balance(v_ctx.wallet_id),
            true
        );
    END IF;

    SELECT s.*
    INTO v_settings
    FROM private.sports_acceptance_settings AS s
    WHERE s.id = 1;
    IF NOT FOUND THEN
        v_settings.sports_betting_enabled := true;
        v_settings.max_stake := NULL;
        v_settings.max_potential_payout := NULL;
        v_settings.max_express_legs := NULL;
    END IF;
    IF v_settings.sports_betting_enabled IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'SPORTS_BET_DISABLED';
    END IF;
    IF v_settings.max_express_legs IS NOT NULL AND v_mode = 'express' AND v_count > v_settings.max_express_legs THEN
        RAISE EXCEPTION 'SPORTS_EXPRESS_LEG_LIMIT';
    END IF;
    IF v_settings.max_stake IS NOT NULL AND v_stake > v_settings.max_stake THEN
        RAISE EXCEPTION 'SPORTS_STAKE_LIMIT';
    END IF;
    IF v_settings.max_potential_payout IS NOT NULL AND v_payout > v_settings.max_potential_payout THEN
        RAISE EXCEPTION 'SPORTS_PAYOUT_LIMIT';
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
        idempotency_key,
        request_fingerprint
    ) VALUES (
        v_ctx.user_id,
        v_ctx.wallet_id,
        v_provider,
        COALESCE(v_feed, 'inplay'),
        v_mode,
        v_stake,
        v_odds,
        v_payout,
        'accepted',
        'unsettled',
        v_key,
        v_fp
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
        LOWER(BTRIM(COALESCE(t.leg_json->>'provider', ''))),
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

    PERFORM private.sports_record_acceptance_event(
        v_key,
        v_ctx.user_id,
        v_bet.id,
        v_providers,
        v_mode,
        v_stake,
        v_payout,
        'accepted',
        'ACCEPTED',
        jsonb_build_object(
            'acceptedOdds', v_odds,
            'legs', COALESCE(p_legs, '[]'::jsonb)
        )
    );

    RETURN private.sports_bet_json(
        v_bet,
        private.game_current_balance(v_ctx.wallet_id),
        false
    );
EXCEPTION
    WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
        IF v_constraint IS DISTINCT FROM 'sports_bets_player_idempotency' THEN
            RAISE;
        END IF;
        SELECT b.*
        INTO v_existing
        FROM private.sports_bets AS b
        WHERE b.player_user_id = v_ctx.user_id
          AND b.idempotency_key = v_key
        FOR UPDATE;
        IF FOUND THEN
            IF v_existing.request_fingerprint IS NULL
               OR v_existing.request_fingerprint IS DISTINCT FROM v_fp THEN
                RAISE EXCEPTION 'SPORTS_BET_IDEMPOTENCY_CONFLICT';
            END IF;
            RETURN private.sports_bet_json(
                v_existing,
                private.game_current_balance(v_ctx.wallet_id),
                true
            );
        END IF;
        RAISE;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.sports_lookup_existing_place_as(
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
    v_leg_odds NUMERIC(20, 4);
    v_count INTEGER := 0;
    v_existing private.sports_bets%ROWTYPE;
    v_fp TEXT;
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

    FOR v_leg_json IN SELECT value FROM jsonb_array_elements(p_legs)
    LOOP
        v_count := v_count + 1;
        IF NULLIF(BTRIM(COALESCE(v_leg_json->>'fixtureId', v_leg_json->>'fixture_id', '')), '') IS NULL THEN
            RAISE EXCEPTION 'MISSING_FIXTURE';
        END IF;
        IF NULLIF(BTRIM(COALESCE(v_leg_json->>'outcomeId', v_leg_json->>'betId', '')), '') IS NULL THEN
            RAISE EXCEPTION 'MISSING_BET_ID';
        END IF;
        IF NULLIF(LOWER(BTRIM(COALESCE(v_leg_json->>'provider', ''))), '') IS NULL THEN
            RAISE EXCEPTION 'EVENT_UNAVAILABLE';
        END IF;
        v_leg_odds := ROUND((v_leg_json->>'acceptedOdds')::NUMERIC, 3);
        IF v_leg_odds IS NULL OR v_leg_odds <= 1 THEN
            RAISE EXCEPTION 'INVALID_PRICE';
        END IF;
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

    v_fp := private.sports_place_request_fingerprint(v_stake, v_mode, p_legs);

    SELECT b.*
    INTO v_existing
    FROM private.sports_bets AS b
    WHERE b.player_user_id = v_ctx.user_id
      AND b.idempotency_key = v_key;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    IF v_existing.request_fingerprint IS NULL
       OR v_existing.request_fingerprint IS DISTINCT FROM v_fp THEN
        RAISE EXCEPTION 'SPORTS_BET_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN private.sports_bet_json(
        v_existing,
        private.game_current_balance(v_ctx.wallet_id),
        true
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.sports_lookup_existing_place_for_player(
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
    RETURN private.sports_lookup_existing_place_as(
        p_player_user_id,
        p_idempotency_key,
        p_stake,
        p_mode,
        p_legs
    );
END;
$fn$;


REVOKE ALL ON FUNCTION private.sports_place_request_fingerprint(NUMERIC, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sports_record_acceptance_event(TEXT, UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sports_engine_place_as(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sports_engine_place_as(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.sports_lookup_existing_place_as(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sports_lookup_existing_place_as(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION private.sports_place_request_fingerprint(NUMERIC, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION private.sports_record_acceptance_event(TEXT, UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION private.sports_lookup_existing_place_as(UUID, TEXT, NUMERIC, TEXT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.sports_record_acceptance_event(TEXT, UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sports_record_acceptance_event(TEXT, UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.sports_record_acceptance_event(TEXT, UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sports_record_acceptance_event(TEXT, UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.sports_place_for_player(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sports_place_for_player(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sports_place_for_player(UUID, TEXT, NUMERIC, TEXT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.sports_lookup_existing_place_for_player(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sports_lookup_existing_place_for_player(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.sports_lookup_existing_place_for_player(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sports_lookup_existing_place_for_player(UUID, TEXT, NUMERIC, TEXT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.player_sports_place(TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_sports_place(TEXT, NUMERIC, TEXT, JSONB) FROM anon, authenticated, service_role;

COMMENT ON FUNCTION private.sports_engine_place_as(UUID, TEXT, NUMERIC, TEXT, JSONB) IS
'Atomic sports place. Exact committed replay returns before current guardrails. New bets apply settings then Wallet Ledger CASINO_BET. NULL/mismatched fingerprint raises SPORTS_BET_IDEMPOTENCY_CONFLICT.';

COMMENT ON FUNCTION public.sports_lookup_existing_place_for_player(UUID, TEXT, NUMERIC, TEXT, JSONB) IS
'Service-role lookup of an already-committed sports place by verified player UUID + idempotency key + canonical fingerprint. Not a browser RPC. Exact match returns the original duplicate payload; mismatch raises SPORTS_BET_IDEMPOTENCY_CONFLICT; miss returns NULL.';

COMMENT ON FUNCTION public.sports_record_acceptance_event(TEXT, UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, JSONB) IS
'Service-role sports acceptance audit insert. Used for rejected attempts that cannot persist inside a rolled-back place transaction. Not a browser RPC.';

COMMIT;
