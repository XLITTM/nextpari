BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 059
-- CURRENCY LIMITS + MULTI-CURRENCY SPORTS
-- PLAYER DEPOSIT/WITHDRAWAL LIMITS
-- OWNED-GAME CURRENCY SAFETY (non-TMT still blocked)
-- Sequence: after 058.
-- Repository only. DO NOT APPLY from this change.
--
-- No FX. No seeded limit values. No balance/ledger rewrite.
-- No historical bet/withdrawal/quote/round rewrite.
-- Owned-game max-payout is NOT enforced here: current Dice/Blackjack
-- math cannot guarantee maximum liability before a round starts.
-- Non-TMT owned games stay blocked with OWNED_GAMES_CURRENCY_NOT_READY.
-- ============================================================

ALTER TABLE private.supported_currencies
    ADD COLUMN IF NOT EXISTS sports_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE private.supported_currencies
    ADD COLUMN IF NOT EXISTS owned_games_enabled BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE private.supported_currencies
SET sports_enabled = TRUE,
    owned_games_enabled = TRUE,
    updated_at = pg_catalog.now()
WHERE code = 'TMT';

ALTER TABLE private.supported_currencies
    DROP CONSTRAINT IF EXISTS supported_currencies_non_tmt_sports_requires_limits;
ALTER TABLE private.supported_currencies
    ADD CONSTRAINT supported_currencies_non_tmt_sports_requires_limits
    CHECK (
        code = 'TMT'
        OR sports_enabled IS DISTINCT FROM TRUE
        OR limits_configured IS TRUE
    );

ALTER TABLE private.supported_currencies
    DROP CONSTRAINT IF EXISTS supported_currencies_non_tmt_owned_games_blocked;
ALTER TABLE private.supported_currencies
    ADD CONSTRAINT supported_currencies_non_tmt_owned_games_blocked
    CHECK (
        code = 'TMT'
        OR owned_games_enabled IS DISTINCT FROM TRUE
    );

CREATE TABLE IF NOT EXISTS private.currency_limit_events (
    id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    currency_code TEXT NOT NULL,
    actor_user_id UUID,
    event_type TEXT NOT NULL,
    old_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    new_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS currency_limit_events_currency_created_idx
    ON private.currency_limit_events (currency_code, created_at DESC);

CREATE OR REPLACE FUNCTION private.currency_limit_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    RAISE EXCEPTION 'CURRENCY_LIMIT_EVENTS_IMMUTABLE';
END;
$fn$;

DROP TRIGGER IF EXISTS currency_limit_events_no_update ON private.currency_limit_events;
CREATE TRIGGER currency_limit_events_no_update
    BEFORE UPDATE OR DELETE ON private.currency_limit_events
    FOR EACH ROW
    EXECUTE FUNCTION private.currency_limit_events_append_only();

REVOKE ALL ON TABLE private.currency_limit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE private.currency_limit_events TO service_role;
REVOKE UPDATE, DELETE ON TABLE private.currency_limit_events FROM service_role;


CREATE OR REPLACE FUNCTION private.require_supported_display_currency(p_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_display TEXT;
    v_found TEXT;
BEGIN
    v_display := pg_catalog.upper(BTRIM(COALESCE(p_code, '')));
    IF v_display = '' OR v_display = 'TMTM' THEN
        RAISE EXCEPTION 'CURRENCY_UNSUPPORTED';
    END IF;
    SELECT c.code
    INTO v_found
    FROM private.supported_currencies AS c
    WHERE c.code = v_display
    LIMIT 1;
    IF v_found IS NULL THEN
        RAISE EXCEPTION 'CURRENCY_UNSUPPORTED';
    END IF;
    RETURN v_found;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.currency_public_limit_json(p_code TEXT)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_row private.supported_currencies%ROWTYPE;
BEGIN
    SELECT c.*
    INTO v_row
    FROM private.supported_currencies AS c
    WHERE c.code = p_code;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    RETURN jsonb_build_object(
        'currency', v_row.code,
        'display_name_ru', v_row.display_name_ru,
        'symbol', v_row.symbol,
        'display_scale', v_row.display_scale,
        'limits_configured', v_row.limits_configured,
        'min_stake', CASE WHEN v_row.min_stake IS NULL THEN NULL ELSE BTRIM(v_row.min_stake::TEXT, ' ') END,
        'max_stake', CASE WHEN v_row.max_stake IS NULL THEN NULL ELSE BTRIM(v_row.max_stake::TEXT, ' ') END,
        'max_payout', CASE WHEN v_row.max_payout IS NULL THEN NULL ELSE BTRIM(v_row.max_payout::TEXT, ' ') END,
        'min_deposit', CASE WHEN v_row.min_deposit IS NULL THEN NULL ELSE BTRIM(v_row.min_deposit::TEXT, ' ') END,
        'min_withdrawal', CASE WHEN v_row.min_withdrawal IS NULL THEN NULL ELSE BTRIM(v_row.min_withdrawal::TEXT, ' ') END,
        'sports_enabled', v_row.sports_enabled,
        'owned_games_enabled', v_row.owned_games_enabled
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.record_currency_limit_event(
    p_currency TEXT,
    p_event_type TEXT,
    p_old jsonb,
    p_new jsonb
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    INSERT INTO private.currency_limit_events (
        currency_code,
        actor_user_id,
        event_type,
        old_values,
        new_values
    )
    VALUES (
        p_currency,
        auth.uid(),
        p_event_type,
        COALESCE(p_old, '{}'::jsonb),
        COALESCE(p_new, '{}'::jsonb)
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.validate_currency_limit_fields(
    p_display_scale INTEGER,
    p_min_stake NUMERIC,
    p_max_stake NUMERIC,
    p_max_payout NUMERIC,
    p_min_deposit NUMERIC,
    p_min_withdrawal NUMERIC
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_scale INTEGER;
BEGIN
    v_scale := COALESCE(p_display_scale, 2);
    IF p_min_stake IS NULL OR p_max_stake IS NULL OR p_max_payout IS NULL
       OR p_min_deposit IS NULL OR p_min_withdrawal IS NULL THEN
        RAISE EXCEPTION 'LIMIT_REQUIRED';
    END IF;
    IF p_min_stake <= 0 OR p_max_stake <= 0 OR p_max_payout <= 0
       OR p_min_deposit <= 0 OR p_min_withdrawal <= 0 THEN
        RAISE EXCEPTION 'LIMIT_NOT_POSITIVE';
    END IF;
    IF pg_catalog.scale(p_min_stake) > v_scale
       OR pg_catalog.scale(p_max_stake) > v_scale
       OR pg_catalog.scale(p_max_payout) > v_scale
       OR pg_catalog.scale(p_min_deposit) > v_scale
       OR pg_catalog.scale(p_min_withdrawal) > v_scale THEN
        RAISE EXCEPTION 'LIMIT_SCALE_INVALID';
    END IF;
    IF p_max_stake < p_min_stake THEN
        RAISE EXCEPTION 'LIMIT_STAKE_RANGE_INVALID';
    END IF;
    IF p_max_payout < p_max_stake THEN
        RAISE EXCEPTION 'LIMIT_PAYOUT_RANGE_INVALID';
    END IF;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.require_player_min_amount(
    p_display TEXT,
    p_amount NUMERIC,
    p_kind TEXT
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_row private.supported_currencies%ROWTYPE;
    v_min NUMERIC;
BEGIN
    SELECT c.*
    INTO v_row
    FROM private.supported_currencies AS c
    WHERE c.code = p_display;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CURRENCY_UNSUPPORTED';
    END IF;
    IF v_row.code IS DISTINCT FROM 'TMT' AND v_row.limits_configured IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'CURRENCY_LIMITS_UNCONFIGURED';
    END IF;
    IF v_row.limits_configured IS DISTINCT FROM TRUE THEN
        RETURN;
    END IF;
    IF p_kind = 'deposit' THEN
        v_min := v_row.min_deposit;
        IF v_min IS NOT NULL AND p_amount < v_min THEN
            RAISE EXCEPTION 'DEPOSIT_BELOW_CURRENCY_MIN';
        END IF;
    ELSIF p_kind = 'withdrawal' THEN
        v_min := v_row.min_withdrawal;
        IF v_min IS NOT NULL AND p_amount < v_min THEN
            RAISE EXCEPTION 'WITHDRAWAL_BELOW_CURRENCY_MIN';
        END IF;
    ELSE
        RAISE EXCEPTION 'LIMIT_REQUIRED';
    END IF;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.require_sports_currency_ready(p_display TEXT)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_row private.supported_currencies%ROWTYPE;
BEGIN
    SELECT c.*
    INTO v_row
    FROM private.supported_currencies AS c
    WHERE c.code = p_display;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CURRENCY_UNSUPPORTED';
    END IF;
    IF v_row.is_active IS DISTINCT FROM TRUE OR v_row.wallet_enabled IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'CURRENCY_DISABLED';
    END IF;
    IF v_row.code IS DISTINCT FROM 'TMT' THEN
        IF v_row.limits_configured IS DISTINCT FROM TRUE THEN
            RAISE EXCEPTION 'CURRENCY_LIMITS_UNCONFIGURED';
        END IF;
        IF v_row.sports_enabled IS DISTINCT FROM TRUE THEN
            RAISE EXCEPTION 'SPORTS_CURRENCY_DISABLED';
        END IF;
        RETURN;
    END IF;
    IF v_row.sports_enabled IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'SPORTS_CURRENCY_DISABLED';
    END IF;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.enforce_sports_currency_limits(
    p_display TEXT,
    p_stake NUMERIC,
    p_payout NUMERIC
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_row private.supported_currencies%ROWTYPE;
BEGIN
    SELECT c.*
    INTO v_row
    FROM private.supported_currencies AS c
    WHERE c.code = p_display;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CURRENCY_UNSUPPORTED';
    END IF;
    IF v_row.limits_configured IS DISTINCT FROM TRUE THEN
        RETURN;
    END IF;
    IF v_row.min_stake IS NOT NULL AND p_stake < v_row.min_stake THEN
        RAISE EXCEPTION 'SPORTS_STAKE_BELOW_CURRENCY_MIN';
    END IF;
    IF v_row.max_stake IS NOT NULL AND p_stake > v_row.max_stake THEN
        RAISE EXCEPTION 'SPORTS_STAKE_ABOVE_CURRENCY_MAX';
    END IF;
    IF v_row.max_payout IS NOT NULL AND p_payout > v_row.max_payout THEN
        RAISE EXCEPTION 'SPORTS_PAYOUT_ABOVE_CURRENCY_MAX';
    END IF;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.require_owned_games_currency_ready(p_display TEXT)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    IF COALESCE(p_display, '') IS DISTINCT FROM 'TMT' THEN
        RAISE EXCEPTION 'OWNED_GAMES_CURRENCY_NOT_READY';
    END IF;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.game_effective_stake_bounds(
    p_display TEXT,
    p_game_min NUMERIC,
    p_game_max NUMERIC
)
RETURNS TABLE (
    min_stake NUMERIC,
    max_stake NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_row private.supported_currencies%ROWTYPE;
    v_min NUMERIC;
    v_max NUMERIC;
BEGIN
    PERFORM private.require_owned_games_currency_ready(p_display);
    v_min := p_game_min;
    v_max := p_game_max;
    SELECT c.*
    INTO v_row
    FROM private.supported_currencies AS c
    WHERE c.code = p_display;
    IF FOUND AND v_row.limits_configured IS TRUE THEN
        IF v_row.min_stake IS NOT NULL THEN
            v_min := GREATEST(COALESCE(v_min, v_row.min_stake), v_row.min_stake);
        END IF;
        IF v_row.max_stake IS NOT NULL THEN
            IF v_max IS NULL THEN
                v_max := v_row.max_stake;
            ELSE
                v_max := LEAST(v_max, v_row.max_stake);
            END IF;
        END IF;
    END IF;
    RETURN QUERY SELECT v_min, v_max;
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_currency_limits()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.get_current_owner_context();
    RETURN COALESCE((
        SELECT jsonb_agg(private.currency_public_limit_json(c.code) ORDER BY c.sort_order, c.code)
        FROM private.supported_currencies AS c
        WHERE c.code IN ('TMT', 'USD', 'TRY', 'UZS', 'RUB', 'KZT')
    ), '[]'::jsonb);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_set_currency_limits(
    p_currency TEXT,
    p_min_stake NUMERIC,
    p_max_stake NUMERIC,
    p_max_payout NUMERIC,
    p_min_deposit NUMERIC,
    p_min_withdrawal NUMERIC
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_code TEXT;
    v_old jsonb;
BEGIN
    PERFORM private.get_current_owner_context();
    v_code := private.require_supported_display_currency(p_currency);
    v_old := private.currency_public_limit_json(v_code);

    PERFORM private.validate_currency_limit_fields(
        (SELECT c.display_scale FROM private.supported_currencies AS c WHERE c.code = v_code),
        p_min_stake,
        p_max_stake,
        p_max_payout,
        p_min_deposit,
        p_min_withdrawal
    );

    UPDATE private.supported_currencies AS c
    SET min_stake = p_min_stake,
        max_stake = p_max_stake,
        max_payout = p_max_payout,
        min_deposit = p_min_deposit,
        min_withdrawal = p_min_withdrawal,
        limits_configured = TRUE,
        updated_at = pg_catalog.now()
    WHERE c.code = v_code;

    PERFORM private.record_currency_limit_event(
        v_code,
        'LIMITS_UPDATED',
        v_old,
        private.currency_public_limit_json(v_code)
    );

    RETURN private.currency_public_limit_json(v_code);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_set_currency_sports_enabled(
    p_currency TEXT,
    p_enabled BOOLEAN
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_code TEXT;
    v_old jsonb;
    v_row private.supported_currencies%ROWTYPE;
BEGIN
    PERFORM private.get_current_owner_context();
    v_code := private.require_supported_display_currency(p_currency);
    v_old := private.currency_public_limit_json(v_code);

    SELECT c.*
    INTO v_row
    FROM private.supported_currencies AS c
    WHERE c.code = v_code
    FOR UPDATE;

    IF COALESCE(p_enabled, FALSE) IS TRUE THEN
        IF v_row.is_active IS DISTINCT FROM TRUE OR v_row.wallet_enabled IS DISTINCT FROM TRUE THEN
            RAISE EXCEPTION 'CURRENCY_DISABLED';
        END IF;
        IF v_row.code IS DISTINCT FROM 'TMT' AND v_row.limits_configured IS DISTINCT FROM TRUE THEN
            RAISE EXCEPTION 'CURRENCY_LIMITS_UNCONFIGURED';
        END IF;
        IF v_row.code IS DISTINCT FROM 'TMT' THEN
            PERFORM private.validate_currency_limit_fields(
                v_row.display_scale,
                v_row.min_stake,
                v_row.max_stake,
                v_row.max_payout,
                v_row.min_deposit,
                v_row.min_withdrawal
            );
        END IF;
    END IF;

    UPDATE private.supported_currencies AS c
    SET sports_enabled = COALESCE(p_enabled, FALSE),
        updated_at = pg_catalog.now()
    WHERE c.code = v_code;

    PERFORM private.record_currency_limit_event(
        v_code,
        'SPORTS_ENABLED_CHANGED',
        v_old,
        private.currency_public_limit_json(v_code)
    );

    RETURN private.currency_public_limit_json(v_code);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_set_currency_owned_games_enabled(
    p_currency TEXT,
    p_enabled BOOLEAN
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_code TEXT;
    v_old jsonb;
BEGIN
    PERFORM private.get_current_owner_context();
    v_code := private.require_supported_display_currency(p_currency);
    v_old := private.currency_public_limit_json(v_code);
    IF v_code IS DISTINCT FROM 'TMT' THEN
        PERFORM private.record_currency_limit_event(
            v_code,
            'OWNED_GAMES_ENABLED_REJECTED',
            v_old,
            jsonb_build_object('requested_enabled', COALESCE(p_enabled, FALSE))
        );
        RAISE EXCEPTION 'OWNED_GAMES_CURRENCY_NOT_READY';
    END IF;

    UPDATE private.supported_currencies AS c
    SET owned_games_enabled = COALESCE(p_enabled, FALSE),
        updated_at = pg_catalog.now()
    WHERE c.code = v_code;

    PERFORM private.record_currency_limit_event(
        v_code,
        'OWNED_GAMES_ENABLED_CHANGED',
        v_old,
        private.currency_public_limit_json(v_code)
    );

    RETURN private.currency_public_limit_json(v_code);
END;
$fn$;


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
    v_staff UUID;
    v_active RECORD;
    v_locked RECORD;
    v_display TEXT;
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

    SELECT *
    INTO v_active
    FROM private.player_active_wallet(v_uid);

    SELECT a.wallet_id, a.currency, a.status, a.migration_state
    INTO v_locked
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = v_active.wallet_id
      AND a.owner_user_id = v_uid
    FOR UPDATE;

    IF v_locked.wallet_id IS NULL THEN
        RAISE EXCEPTION 'PLAYER_WALLET_MISSING';
    END IF;
    IF v_locked.status = 'blocked' THEN
        RAISE EXCEPTION 'WALLET_BLOCKED';
    END IF;
    IF v_locked.status = 'closed' THEN
        RAISE EXCEPTION 'WALLET_CLOSED';
    END IF;
    IF v_locked.status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'PLAYER_WALLET_NOT_ACTIVE';
    END IF;
    IF v_locked.migration_state NOT IN ('staging', 'active') THEN
        RAISE EXCEPTION 'PLAYER_WALLET_NOT_ACTIVE';
    END IF;

    v_display := private.wallet_display_currency(v_locked.currency);
    PERFORM private.require_sports_currency_ready(v_display);

    RETURN QUERY SELECT v_uid, v_locked.wallet_id, v_locked.status, v_locked.migration_state;
END;
$fn$;


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
        'currency', COALESCE(private.wallet_display_currency(p_bet.currency), 'TMT'),
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


CREATE OR REPLACE FUNCTION private.security_sports_bet_json(p_bet private.sports_bets)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_legs jsonb;
BEGIN
    SELECT COALESCE(jsonb_agg(private.security_sports_leg_json(l.*) ORDER BY l.accepted_at, l.id), '[]'::jsonb)
    INTO v_legs
    FROM private.sports_bet_legs AS l
    WHERE l.bet_id = p_bet.id;

    RETURN jsonb_build_object(
        'bet_id', p_bet.id,
        'display_ref', private.security_sports_display_ref(p_bet.id),
        'accepted_at', p_bet.accepted_at,
        'feed_type', p_bet.feed_type,
        'mode', p_bet.mode,
        'stake', p_bet.stake,
        'accepted_odds', p_bet.accepted_odds,
        'potential_payout', p_bet.potential_payout,
        'currency', COALESCE(private.wallet_display_currency(p_bet.currency), 'TMT'),
        'status', p_bet.status,
        'status_bucket', private.security_sports_status_bucket(p_bet.status, p_bet.settlement_state),
        'settlement_state', p_bet.settlement_state,
        'settled_at', p_bet.settled_at,
        'provider', p_bet.provider,
        'legs', v_legs
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
    v_storage TEXT;
    v_display TEXT;
BEGIN
    IF p_player_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    IF EXISTS (
        SELECT 1 FROM private.staff_accounts AS s WHERE s.auth_user_id = p_player_user_id
    ) THEN
        RAISE EXCEPTION 'STAFF_CANNOT_PLAY';
    END IF;

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
        pg_catalog.hashtext(p_player_user_id::TEXT || chr(1) || v_key)
    );

    SELECT b.*
    INTO v_existing
    FROM private.sports_bets AS b
    WHERE b.player_user_id = p_player_user_id
      AND b.idempotency_key = v_key
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing.request_fingerprint IS NULL
           OR v_existing.request_fingerprint IS DISTINCT FROM v_fp THEN
            RAISE EXCEPTION 'SPORTS_BET_IDEMPOTENCY_CONFLICT';
        END IF;
        RETURN private.sports_bet_json(
            v_existing,
            private.game_current_balance(v_existing.wallet_id),
            true
        );
    END IF;

    SELECT * INTO v_ctx FROM private.sports_require_player_by_id(p_player_user_id);
    SELECT a.currency
    INTO v_storage
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = v_ctx.wallet_id;
    v_display := COALESCE(private.wallet_display_currency(v_storage), 'TMT');

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

    PERFORM private.enforce_sports_currency_limits(v_display, v_stake, v_payout);

    INSERT INTO private.sports_bets (
        player_user_id,
        wallet_id,
        currency,
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
        v_storage,
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
                private.game_current_balance(v_existing.wallet_id),
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
    v_key TEXT;
    v_stake NUMERIC(20, 2);
    v_mode TEXT;
    v_leg_json JSONB;
    v_leg_odds NUMERIC(20, 4);
    v_count INTEGER := 0;
    v_existing private.sports_bets%ROWTYPE;
    v_fp TEXT;
BEGIN
    IF p_player_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    IF EXISTS (
        SELECT 1 FROM private.staff_accounts AS s WHERE s.auth_user_id = p_player_user_id
    ) THEN
        RAISE EXCEPTION 'STAFF_CANNOT_PLAY';
    END IF;
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
    WHERE b.player_user_id = p_player_user_id
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
        private.game_current_balance(v_existing.wallet_id),
        true
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.game_require_player_context()
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
    v_active RECORD;
    v_display TEXT;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    IF EXISTS (
        SELECT 1 FROM private.staff_accounts AS s WHERE s.auth_user_id = v_uid
    ) THEN
        RAISE EXCEPTION 'STAFF_CANNOT_PLAY';
    END IF;

    SELECT * INTO v_active FROM private.player_active_wallet(v_uid);
    IF v_active.status = 'blocked' THEN
        RAISE EXCEPTION 'WALLET_BLOCKED';
    END IF;
    IF v_active.status = 'closed' THEN
        RAISE EXCEPTION 'WALLET_CLOSED';
    END IF;
    IF v_active.status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'PLAYER_WALLET_NOT_ACTIVE';
    END IF;
    IF v_active.migration_state NOT IN ('staging', 'active') THEN
        RAISE EXCEPTION 'PLAYER_WALLET_NOT_ACTIVE';
    END IF;

    v_display := v_active.display_currency;
    PERFORM private.require_owned_games_currency_ready(v_display);

    RETURN QUERY SELECT v_uid, v_active.wallet_id, v_active.status, v_active.migration_state;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.game_engine_start(
    p_game_code TEXT,
    p_stake NUMERIC,
    p_idempotency_key TEXT,
    p_options JSONB
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_cat private.game_catalog%ROWTYPE;
    v_key TEXT;
    v_opts JSONB;
    v_fp TEXT;
    v_existing private.game_rounds%ROWTYPE;
    v_round private.game_rounds%ROWTYPE;
    v_seed TEXT;
    v_hash TEXT;
    v_stake NUMERIC(20,2);
    v_json JSONB;
    v_session UUID;
    v_math TEXT;
    v_code TEXT;
    v_display TEXT;
    v_eff_min NUMERIC;
    v_eff_max NUMERIC;
BEGIN
    v_code := NULLIF(BTRIM(LOWER(COALESCE(p_game_code, ''))), '');
    IF v_code = 'aviator' THEN
        PERFORM private.game_aviator_lock_current();
    END IF;
    SELECT * INTO v_ctx FROM private.game_require_player_context();
    v_cat := private.game_require_catalog(p_game_code);
    v_key := private.game_require_idempotency_key(p_idempotency_key);
    v_opts := private.game_sanitize_options(p_options);

    IF p_stake IS NULL OR p_stake <= 0 THEN
        RAISE EXCEPTION 'STAKE_NOT_POSITIVE';
    END IF;
    IF p_stake <> ROUND(p_stake, 2) THEN
        RAISE EXCEPTION 'STAKE_SCALE_INVALID';
    END IF;
    v_stake := ROUND(p_stake, 2);

    SELECT private.wallet_display_currency(a.currency)
    INTO v_display
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = v_ctx.wallet_id;
    SELECT b.min_stake, b.max_stake
    INTO v_eff_min, v_eff_max
    FROM private.game_effective_stake_bounds(v_display, v_cat.min_stake, v_cat.max_stake) AS b;
    IF v_stake < v_eff_min THEN
        RAISE EXCEPTION 'STAKE_BELOW_MIN';
    END IF;
    IF v_eff_max IS NOT NULL AND v_stake > v_eff_max THEN
        RAISE EXCEPTION 'STAKE_ABOVE_MAX';
    END IF;

    v_fp := private.game_fingerprint(jsonb_build_object(
        'gameCode', v_cat.game_code,
        'stake', v_stake,
        'options', v_opts
    ));

    SELECT r.*
    INTO v_existing
    FROM private.game_rounds AS r
    WHERE r.player_user_id = v_ctx.user_id
      AND r.start_idempotency_key = v_key
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing.start_fingerprint IS DISTINCT FROM v_fp THEN
            RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
        END IF;
        IF v_existing.start_response IS NOT NULL THEN
            RETURN v_existing.start_response;
        END IF;
        RETURN private.game_round_json(
            v_existing,
            private.game_current_balance(v_existing.wallet_id),
            true,
            private.game_allowed_actions(v_existing)
        );
    END IF;

    v_math := private.game_math_version(v_cat.game_code);
    v_session := NULL;
    IF v_cat.game_code = 'aviator' THEN
        v_session := (private.game_aviator_get_or_create_current_session()).id;
    END IF;

    v_seed := encode(extensions.gen_random_bytes(32), 'hex');
    v_hash := private.game_sha256_hex(v_seed);

    INSERT INTO private.game_rounds (
        player_user_id, wallet_id, game_code, state, stake, total_stake, payout,
        server_seed, server_seed_hash, nonce, start_idempotency_key, start_fingerprint,
        math_version, session_id
    ) VALUES (
        v_ctx.user_id, v_ctx.wallet_id, v_cat.game_code, 'open', v_stake, v_stake, 0,
        v_seed, v_hash, 0, v_key, v_fp, v_math, v_session
    )
    RETURNING * INTO v_round;

    PERFORM private.game_apply_bet(v_round, v_stake, v_ctx.user_id);
    v_round := private.game_adapter_start(v_round.id, v_cat.game_code, v_opts, v_ctx.user_id);
    v_json := private.game_round_json(
        v_round,
        private.game_current_balance(v_round.wallet_id),
        false,
        private.game_allowed_actions(v_round)
    );
    UPDATE private.game_rounds
    SET start_response = v_json, updated_at = pg_catalog.now()
    WHERE id = v_round.id;
    RETURN v_json;
EXCEPTION
    WHEN unique_violation THEN
        SELECT r.*
        INTO v_existing
        FROM private.game_rounds AS r
        WHERE r.player_user_id = v_ctx.user_id
          AND r.start_idempotency_key = v_key
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE;
        END IF;
        IF v_existing.start_fingerprint IS DISTINCT FROM v_fp THEN
            RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
        END IF;
        IF v_existing.start_response IS NOT NULL THEN
            RETURN v_existing.start_response;
        END IF;
        RETURN private.game_round_json(
            v_existing,
            private.game_current_balance(v_existing.wallet_id),
            true,
            private.game_allowed_actions(v_existing)
        );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.cashier_deposit_player(
    p_player_public_id TEXT,
    p_amount NUMERIC,
    p_idempotency_key TEXT,
    p_note TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_key TEXT;
    v_note TEXT;
    v_player RECORD;
    v_op RECORD;
    v_result RECORD;
    v_engine_key TEXT;
    v_active UUID;
BEGIN
    SELECT
        c.auth_user_id,
        c.network_id,
        c.legacy_cashier_id
    INTO v_ctx
    FROM private.get_current_cashier_context_locked() AS c;

    SELECT r.account_id, r.currency
    INTO v_op
    FROM private.cashier_resolve_own_operational_account(
        v_ctx.legacy_cashier_id,
        v_ctx.network_id
    ) AS r;

    PERFORM private.cashier_require_own_ops_active(v_op.account_id);

    v_key := private.owner_require_idempotency_key(p_idempotency_key);
    v_note := private.owner_trim_reason(p_note);
    v_engine_key := 'cashier-deposit:' || v_ctx.auth_user_id::TEXT || ':' || v_key;

    SELECT r.player_user_id, r.wallet_id, r.public_id, r.currency
    INTO v_player
    FROM private.cashier_resolve_player_wallet_for_ops_currency(p_player_public_id, v_op.currency) AS r;

    IF NOT private.wallet_currencies_match(v_player.currency, v_op.currency) THEN
        RAISE EXCEPTION 'CURRENCY_MISMATCH';
    END IF;

    PERFORM private.require_player_deposit_allowed(v_player.player_user_id);
    PERFORM private.require_player_min_amount(
        COALESCE(private.wallet_display_currency(v_op.currency), 'TMT'),
        p_amount,
        'deposit'
    );

    SELECT pref.active_wallet_id
    INTO v_active
    FROM private.player_wallet_preferences AS pref
    WHERE pref.player_user_id = v_player.player_user_id;

    SELECT e.transfer_id, e.is_duplicate, e.from_balance_after, e.to_balance_after, e.player_balance_after
    INTO v_result
    FROM private.apply_operational_transfer(
        'CASHIER_TO_PLAYER',
        p_amount,
        v_op.currency,
        v_engine_key,
        v_op.account_id,
        NULL,
        v_player.wallet_id,
        v_ctx.auth_user_id,
        'cashier',
        jsonb_build_object(
            'player_public_id', v_player.public_id,
            'note', v_note
        )
    ) AS e;

    IF v_active IS NOT NULL THEN
        UPDATE private.player_wallet_preferences AS pref
        SET active_wallet_id = v_active,
            updated_at = pref.updated_at
        WHERE pref.player_user_id = v_player.player_user_id
          AND pref.active_wallet_id IS DISTINCT FROM v_active;
        UPDATE public.profiles AS p
        SET wallet_id = v_active
        WHERE p.id = v_player.player_user_id
          AND p.wallet_id IS DISTINCT FROM v_active;
    END IF;

    PERFORM private.cashier_revalidate_legacy_cashier(
        v_ctx.legacy_cashier_id,
        v_ctx.network_id
    );

    IF v_result.is_duplicate IS NOT TRUE THEN
        PERFORM private.append_staff_audit(
            'CASHIER_DEPOSITED_PLAYER',
            'player',
            v_player.public_id,
            'cashier_self',
            jsonb_build_object(
                'transfer_id', v_result.transfer_id,
                'amount', p_amount,
                'currency', private.wallet_display_currency(v_op.currency),
                'player_public_id', v_player.public_id
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'transfer_id', v_result.transfer_id,
        'is_duplicate', v_result.is_duplicate,
        'amount', p_amount,
        'currency', private.wallet_display_currency(v_op.currency),
        'cashier_balance_after', v_result.from_balance_after,
        'player_balance_after', v_result.player_balance_after,
        'player_public_id', v_player.public_id,
        'active_wallet_unchanged', true
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.cashier_deposit_player_currency(
    p_player_public_id TEXT,
    p_currency TEXT,
    p_amount NUMERIC,
    p_idempotency_key TEXT,
    p_note TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_key TEXT;
    v_note TEXT;
    v_storage TEXT;
    v_display TEXT;
    v_player RECORD;
    v_op UUID;
    v_result RECORD;
    v_engine_key TEXT;
    v_active UUID;
BEGIN
    SELECT
        c.auth_user_id,
        c.network_id,
        c.legacy_cashier_id
    INTO v_ctx
    FROM private.get_current_cashier_context_locked() AS c;

    v_storage := private.require_operational_storage_currency(p_currency);
    v_display := private.operational_display_currency(v_storage);
    IF v_storage = 'TMTM' THEN
        RETURN public.cashier_deposit_player(p_player_public_id, p_amount, p_idempotency_key, p_note);
    END IF;

    v_op := private.resolve_cashier_currency_account(
        v_ctx.legacy_cashier_id,
        v_ctx.network_id,
        v_storage,
        TRUE
    );
    PERFORM private.cashier_require_own_ops_active(v_op);
    PERFORM private.cashier_revalidate_legacy_cashier(
        v_ctx.legacy_cashier_id,
        v_ctx.network_id
    );

    v_key := private.owner_require_idempotency_key(p_idempotency_key);
    v_note := private.owner_trim_reason(p_note);
    v_engine_key := 'cashier-deposit:' || v_ctx.auth_user_id::TEXT || ':' || v_storage || ':' || v_key;

    SELECT r.player_user_id, r.wallet_id, r.public_id, r.currency
    INTO v_player
    FROM private.cashier_resolve_player_wallet_for_ops_currency(p_player_public_id, v_storage) AS r;

    IF NOT private.wallet_currencies_match(v_player.currency, v_storage) THEN
        RAISE EXCEPTION 'CURRENCY_MISMATCH';
    END IF;

    PERFORM private.require_player_deposit_allowed(v_player.player_user_id);
    PERFORM private.require_player_min_amount(v_display, p_amount, 'deposit');

    SELECT pref.active_wallet_id
    INTO v_active
    FROM private.player_wallet_preferences AS pref
    WHERE pref.player_user_id = v_player.player_user_id;

    SELECT e.transfer_id, e.is_duplicate, e.from_balance_after, e.to_balance_after, e.player_balance_after
    INTO v_result
    FROM private.apply_operational_transfer(
        'CASHIER_TO_PLAYER',
        p_amount,
        v_storage,
        v_engine_key,
        v_op,
        NULL,
        v_player.wallet_id,
        v_ctx.auth_user_id,
        'cashier',
        jsonb_build_object(
            'player_public_id', v_player.public_id,
            'note', v_note,
            'display_currency', v_display
        )
    ) AS e;

    IF v_active IS NOT NULL THEN
        UPDATE private.player_wallet_preferences AS pref
        SET active_wallet_id = v_active,
            updated_at = pref.updated_at
        WHERE pref.player_user_id = v_player.player_user_id
          AND pref.active_wallet_id IS DISTINCT FROM v_active;
        UPDATE public.profiles AS p
        SET wallet_id = v_active
        WHERE p.id = v_player.player_user_id
          AND p.wallet_id IS DISTINCT FROM v_active;
    END IF;

    PERFORM private.cashier_revalidate_legacy_cashier(
        v_ctx.legacy_cashier_id,
        v_ctx.network_id
    );

    IF v_result.is_duplicate IS NOT TRUE THEN
        PERFORM private.append_staff_audit(
            'CASHIER_DEPOSITED_PLAYER',
            'player',
            v_player.public_id,
            'cashier_self',
            jsonb_build_object(
                'transfer_id', v_result.transfer_id,
                'amount', p_amount,
                'currency', v_display,
                'player_public_id', v_player.public_id
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'transfer_id', v_result.transfer_id,
        'is_duplicate', v_result.is_duplicate,
        'amount', p_amount,
        'currency', v_display,
        'cashier_balance_after', v_result.from_balance_after,
        'player_balance_after', v_result.player_balance_after,
        'player_public_id', v_player.public_id,
        'active_wallet_unchanged', true
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.player_create_usdt_quote(
    p_source_amount NUMERIC,
    p_wallet_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_wallet RECORD;
    v_display TEXT;
    v_rate NUMERIC;
    v_enabled BOOLEAN;
    v_credit NUMERIC;
    v_id UUID;
    v_expires TIMESTAMPTZ;
BEGIN
    v_uid := auth.uid();
    PERFORM private.player_require_player_account(v_uid);
    PERFORM private.require_player_deposit_allowed(v_uid);
    IF p_source_amount IS NULL OR p_source_amount <= 0 THEN
        RAISE EXCEPTION 'USDT_AMOUNT_INVALID';
    END IF;
    SELECT a.wallet_id, a.currency, a.owner_user_id, a.status
    INTO v_wallet
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = p_wallet_id
    FOR UPDATE;
    IF v_wallet.wallet_id IS NULL OR v_wallet.owner_user_id IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'WALLET_NOT_OWNED';
    END IF;
    IF v_wallet.status = 'blocked' THEN
        RAISE EXCEPTION 'WALLET_BLOCKED';
    END IF;
    IF v_wallet.status = 'closed' THEN
        RAISE EXCEPTION 'WALLET_CLOSED';
    END IF;
    IF v_wallet.status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'PLAYER_WALLET_NOT_ACTIVE';
    END IF;
    v_display := private.wallet_display_currency(v_wallet.currency);
    IF v_display IS NULL THEN
        RAISE EXCEPTION 'CURRENCY_UNSUPPORTED';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM private.supported_currencies AS c
        WHERE c.code = v_display
          AND c.is_active
          AND c.wallet_enabled
          AND c.usdt_deposit_enabled
    ) THEN
        RAISE EXCEPTION 'USDT_RATE_UNAVAILABLE';
    END IF;
    SELECT r.rate, r.enabled
    INTO v_rate, v_enabled
    FROM private.usdt_deposit_rates AS r
    WHERE r.target_currency_code = v_display
    FOR SHARE;
    IF NOT FOUND OR v_rate IS NULL OR v_enabled IS NOT TRUE THEN
        RAISE EXCEPTION 'USDT_RATE_UNAVAILABLE';
    END IF;
    v_credit := p_source_amount * v_rate;
    PERFORM private.require_player_min_amount(v_display, v_credit, 'deposit');
    v_expires := pg_catalog.now() + INTERVAL '10 minutes';
    INSERT INTO private.crypto_deposit_quotes (
        player_user_id,
        target_wallet_id,
        source_asset,
        source_amount,
        target_currency_code,
        rate_snapshot,
        fee_source_amount,
        credit_amount,
        status,
        expires_at
    )
    VALUES (
        v_uid,
        v_wallet.wallet_id,
        'USDT',
        p_source_amount,
        v_display,
        v_rate,
        0,
        v_credit,
        'QUOTED',
        v_expires
    )
    RETURNING id INTO v_id;

    RETURN jsonb_build_object(
        'ok', true,
        'quoteId', v_id,
        'sourceAsset', 'USDT',
        'sourceAmount', p_source_amount,
        'targetCurrencyCode', v_display,
        'rateSnapshot', v_rate,
        'feeSourceAmount', 0,
        'creditAmount', v_credit,
        'walletId', v_wallet.wallet_id,
        'status', 'QUOTED',
        'expiresAt', v_expires,
        'providerReady', false
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.withdrawal_public_json(
    p_row private.player_withdrawal_requests,
    p_payout private.cashier_player_payout_requests,
    p_include_code BOOLEAN
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_status TEXT;
BEGIN
    v_status := private.withdrawal_effective_status(p_row, p_payout);
    RETURN jsonb_build_object(
        'id', p_row.id,
        'player_public_id', p_row.player_public_id,
        'method', p_row.method,
        'method_label', p_row.method_label,
        'amount', p_row.amount,
        'currency', COALESCE(private.wallet_display_currency(p_row.currency), 'TMT'),
        'status', v_status,
        'requested_at', p_row.requested_at,
        'created_at', p_row.created_at,
        'approved_at', p_row.approved_at,
        'paid_at', COALESCE(p_row.paid_at, p_payout.paid_at),
        'rejected_at', p_row.rejected_at,
        'rejection_reason', p_row.rejection_reason,
        'cash_pickup_city', p_row.cash_pickup_city,
        'cash_pickup_point', p_row.cash_pickup_point,
        'pin_code', CASE
            WHEN p_include_code AND p_row.method = 'cash' AND v_status = 'pending'
                THEN p_payout.secret_code
            ELSE NULL
        END,
        'destination_ref', p_row.destination_ref,
        'cashier_id', p_payout.paid_by_legacy_cashier_id,
        'is_duplicate', false
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.player_create_withdrawal(
    p_method TEXT,
    p_amount NUMERIC,
    p_idempotency_key TEXT,
    p_method_label TEXT,
    p_destination_ref TEXT DEFAULT NULL,
    p_cash_pickup_city TEXT DEFAULT NULL,
    p_cash_pickup_point TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_key TEXT;
    v_method TEXT;
    v_label TEXT;
    v_amount NUMERIC(20, 2);
    v_player RECORD;
    v_existing private.player_withdrawal_requests%ROWTYPE;
    v_payout private.cashier_player_payout_requests%ROWTYPE;
    v_hold jsonb;
    v_dest TEXT;
    v_city TEXT;
    v_point TEXT;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

    v_method := lower(NULLIF(BTRIM(COALESCE(p_method, '')), ''));
    IF v_method IS NULL OR v_method NOT IN ('cash', 'card', 'crypto', 'ewallet', 'other') THEN
        RAISE EXCEPTION 'WITHDRAWAL_METHOD_INVALID';
    END IF;
    IF v_method = 'card' THEN
        RAISE EXCEPTION 'CARD_WITHDRAWAL_PROVIDER_REQUIRED';
    END IF;

    v_key := private.owner_require_idempotency_key(p_idempotency_key);
    v_label := NULLIF(BTRIM(COALESCE(p_method_label, '')), '');
    IF v_label IS NULL THEN
        RAISE EXCEPTION 'METHOD_LABEL_REQUIRED';
    END IF;
    IF char_length(v_label) > 120 THEN
        RAISE EXCEPTION 'METHOD_LABEL_TOO_LONG';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'AMOUNT_NOT_POSITIVE';
    END IF;
    IF p_amount <> ROUND(p_amount, 2) THEN
        RAISE EXCEPTION 'AMOUNT_SCALE_INVALID';
    END IF;
    v_amount := ROUND(p_amount, 2);
    IF v_method = 'cash' AND v_amount < 40 THEN
        RAISE EXCEPTION 'CASH_WITHDRAWAL_BELOW_MIN';
    END IF;

    v_city := NULLIF(BTRIM(COALESCE(p_cash_pickup_city, '')), '');
    v_point := NULLIF(BTRIM(COALESCE(p_cash_pickup_point, '')), '');
    IF v_method = 'cash' THEN
        IF v_city IS NULL OR v_point IS NULL THEN
            RAISE EXCEPTION 'CASH_PICKUP_REQUIRED';
        END IF;
        v_dest := NULL;
    ELSE
        v_dest := private.withdrawal_sanitize_destination(v_method, p_destination_ref);
        v_city := NULL;
        v_point := NULL;
    END IF;

    SELECT r.*
    INTO v_existing
    FROM private.player_withdrawal_requests AS r
    WHERE r.player_auth_user_id = v_uid
      AND r.idempotency_key = v_key
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing.amount IS DISTINCT FROM v_amount
           OR v_existing.method IS DISTINCT FROM v_method
           OR v_existing.destination_ref IS DISTINCT FROM v_dest
           OR v_existing.cash_pickup_city IS DISTINCT FROM v_city
           OR v_existing.cash_pickup_point IS DISTINCT FROM v_point THEN
            RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
        END IF;
        IF v_existing.cash_payout_id IS NOT NULL THEN
            SELECT p.* INTO v_payout
            FROM private.cashier_player_payout_requests AS p
            WHERE p.id = v_existing.cash_payout_id;
        END IF;
        RETURN private.withdrawal_public_json(v_existing, v_payout, true)
            || jsonb_build_object('ok', true, 'is_duplicate', true);
    END IF;

    SELECT w.wallet_id, w.public_id, w.currency
    INTO v_player
    FROM private.withdrawal_lock_player_wallet(v_uid) AS w;

    PERFORM private.require_player_withdrawal_allowed(v_uid);
    PERFORM private.require_player_min_amount(
        COALESCE(private.wallet_display_currency(v_player.currency), 'TMT'),
        v_amount,
        'withdrawal'
    );

    IF v_method = 'cash' THEN
        v_hold := public.player_request_cashier_payout(v_amount, v_key);
        SELECT p.*
        INTO v_payout
        FROM private.cashier_player_payout_requests AS p
        WHERE p.id = (v_hold ->> 'id')::uuid
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'PAYOUT_NOT_FOUND';
        END IF;
    ELSE
        PERFORM 1
        FROM private.apply_wallet_entry(
            v_player.wallet_id,
            -v_amount,
            v_amount,
            'WITHDRAWAL_HOLD',
            'withdrawal',
            'wd-hold:' || v_uid::TEXT || ':' || v_key,
            'player_withdrawal',
            v_uid::TEXT,
            'player',
            v_uid::TEXT,
            jsonb_build_object('phase', 'hold', 'method', v_method)
        );
    END IF;

    INSERT INTO private.player_withdrawal_requests (
        player_auth_user_id,
        player_public_id,
        wallet_id,
        method,
        method_label,
        amount,
        currency,
        status,
        cash_pickup_city,
        cash_pickup_point,
        cash_payout_id,
        destination_ref,
        idempotency_key,
        metadata
    )
    VALUES (
        v_uid,
        v_player.public_id,
        v_player.wallet_id,
        v_method,
        v_label,
        v_amount,
        v_player.currency,
        'pending',
        v_city,
        v_point,
        v_payout.id,
        v_dest,
        v_key,
        COALESCE(p_metadata, '{}'::jsonb) - 'wallet_id' - 'walletId' - 'auth_user_id'
            - 'player_id' - 'balance' - 'status' - 'cashier_id' - 'network_id' - 'manager_id'
    )
    RETURNING * INTO v_existing;

    RETURN private.withdrawal_public_json(v_existing, v_payout, true)
        || jsonb_build_object(
            'ok', true,
            'is_duplicate', COALESCE((v_hold ->> 'is_duplicate')::boolean, false),
            'code', CASE WHEN v_method = 'cash' THEN v_payout.secret_code ELSE NULL END
        );
EXCEPTION
    WHEN unique_violation THEN
        SELECT r.*
        INTO v_existing
        FROM private.player_withdrawal_requests AS r
        WHERE r.player_auth_user_id = v_uid
          AND r.idempotency_key = v_key
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE;
        END IF;
        IF v_existing.amount IS DISTINCT FROM v_amount
           OR v_existing.method IS DISTINCT FROM v_method
           OR v_existing.destination_ref IS DISTINCT FROM v_dest
           OR v_existing.cash_pickup_city IS DISTINCT FROM v_city
           OR v_existing.cash_pickup_point IS DISTINCT FROM v_point THEN
            RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
        END IF;
        IF v_existing.cash_payout_id IS NOT NULL THEN
            SELECT p.* INTO v_payout
            FROM private.cashier_player_payout_requests AS p
            WHERE p.id = v_existing.cash_payout_id;
        END IF;
        RETURN private.withdrawal_public_json(v_existing, v_payout, true)
            || jsonb_build_object('ok', true, 'is_duplicate', true);
END;
$fn$;


REVOKE ALL ON FUNCTION private.require_supported_display_currency(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.require_supported_display_currency(TEXT) TO service_role;
REVOKE ALL ON FUNCTION private.currency_public_limit_json(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.currency_public_limit_json(TEXT) TO service_role;
REVOKE ALL ON FUNCTION private.record_currency_limit_event(TEXT, TEXT, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.record_currency_limit_event(TEXT, TEXT, jsonb, jsonb) TO service_role;
REVOKE ALL ON FUNCTION private.validate_currency_limit_fields(INTEGER, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.validate_currency_limit_fields(INTEGER, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC) TO service_role;
REVOKE ALL ON FUNCTION private.require_player_min_amount(TEXT, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.require_player_min_amount(TEXT, NUMERIC, TEXT) TO service_role;
REVOKE ALL ON FUNCTION private.require_sports_currency_ready(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.require_sports_currency_ready(TEXT) TO service_role;
REVOKE ALL ON FUNCTION private.enforce_sports_currency_limits(TEXT, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_sports_currency_limits(TEXT, NUMERIC, NUMERIC) TO service_role;
REVOKE ALL ON FUNCTION private.require_owned_games_currency_ready(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.require_owned_games_currency_ready(TEXT) TO service_role;
REVOKE ALL ON FUNCTION private.game_effective_stake_bounds(TEXT, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.game_effective_stake_bounds(TEXT, NUMERIC, NUMERIC) TO service_role;
REVOKE ALL ON FUNCTION private.currency_limit_events_append_only() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.owner_currency_limits() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_currency_limits() TO authenticated;
REVOKE ALL ON FUNCTION public.owner_set_currency_limits(TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_set_currency_limits(TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC) TO authenticated;
REVOKE ALL ON FUNCTION public.owner_set_currency_sports_enabled(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_set_currency_sports_enabled(TEXT, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.owner_set_currency_owned_games_enabled(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_set_currency_owned_games_enabled(TEXT, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.cashier_deposit_player(TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cashier_deposit_player(TEXT, NUMERIC, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.cashier_deposit_player_currency(TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cashier_deposit_player_currency(TEXT, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.player_create_usdt_quote(NUMERIC, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_create_usdt_quote(NUMERIC, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.player_create_withdrawal(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_create_withdrawal(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION private.withdrawal_public_json(private.player_withdrawal_requests, private.cashier_player_payout_requests, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.withdrawal_public_json(private.player_withdrawal_requests, private.cashier_player_payout_requests, BOOLEAN) TO service_role;

COMMIT;
