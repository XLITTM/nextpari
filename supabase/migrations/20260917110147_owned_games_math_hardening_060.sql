BEGIN;

-- NEXTPARI PHASE 060
-- Owned-game math hardening + multi-currency readiness.
-- WRITE ONLY. Do not execute against production in this task.
-- Does not UPDATE player/treasury balances, wallet_ledger, sports bets,
-- withdrawals, USDT quotes, or historical game_rounds.
-- Catalog cutover affects NEW rounds only.
-- Settlement always uses game_rounds.math_version.

ALTER TABLE private.game_catalog
    ADD COLUMN IF NOT EXISTS multi_currency_ready BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN private.game_catalog.multi_currency_ready IS
'TRUE only when the game has versioned house-edge math, bounded max liability, and currency scale/limit enforcement. TMT may still start a game when this is FALSE.';

ALTER TABLE private.supported_currencies
    DROP CONSTRAINT IF EXISTS supported_currencies_non_tmt_owned_games_blocked;

-- Dice v4: same 2d6 vs 2d6 probabilities, win 1.96, draw 1.00.
-- Exact RTP = (575*1.96 + 146*1.00) / 1296 = 1273/1296.
UPDATE private.game_catalog
SET
    config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
        'rtpTarget', (1273::NUMERIC / 1296),
        'mathVersion', 'dice-v4-house-edge',
        'winMultiplier', 1.96,
        'drawMultiplier', 1.00
    ),
    multi_currency_ready = TRUE,
    updated_at = pg_catalog.now()
WHERE game_code = 'dice';

-- Blackjack v5: same visible-dealer rules, win/blackjack 1.94, golden 2.00, push 1.00.
-- Verified optimal-policy RTP from the existing finite-shoe DP: 0.9863278373317749.
UPDATE private.game_catalog
SET
    config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
        'rtpTarget', 0.9863278373317749,
        'mathVersion', 'blackjack-v5-visible-dealer-house-edge',
        'winPayout', 1.94,
        'goldenPayout', 2.00,
        'pushPayout', 1.00
    ),
    multi_currency_ready = TRUE,
    updated_at = pg_catalog.now()
WHERE game_code = 'blackjack';

-- Pharaoh already has house-edge RTP and a closed prize-table max (10000x).
UPDATE private.game_catalog
SET
    multi_currency_ready = TRUE,
    updated_at = pg_catalog.now()
WHERE game_code = 'pharaoh';

UPDATE private.game_catalog
SET
    multi_currency_ready = FALSE,
    updated_at = pg_catalog.now()
WHERE game_code IN ('crystal', 'apples', 'aviator');


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
    IF p_math_version = 'dice-v4-house-edge' THEN
        RETURN 1.96;
    END IF;
    RAISE EXCEPTION 'DICE_MATH_VERSION_UNSUPPORTED';
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
    ELSIF p_math_version = 'blackjack-v5-visible-dealer-house-edge' THEN
        v_win := 1.94;
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
    IF p_game_code = 'apples' THEN
        RETURN jsonb_build_object(
            'theoreticalRtpTarget', NULL,
            'rtpModel', 'progressive'
        );
    END IF;

    IF p_game_code = 'dice' THEN
        RETURN jsonb_build_object(
            'theoreticalRtpTarget', (1273::NUMERIC / 1296),
            'rtpModel', 'fixed-target'
        );
    END IF;

    IF p_game_code = 'blackjack' THEN
        RETURN jsonb_build_object(
            'theoreticalRtpTarget', 0.9863278373317749,
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


CREATE OR REPLACE FUNCTION private.owned_games_readiness_json()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT jsonb_build_object(
        'ready_games', COALESCE((
            SELECT jsonb_agg(c.game_code ORDER BY c.game_code)
            FROM private.game_catalog AS c
            WHERE c.multi_currency_ready IS TRUE
              AND c.status = 'active'
        ), '[]'::jsonb),
        'blocked_games', COALESCE((
            SELECT jsonb_agg(c.game_code ORDER BY c.game_code)
            FROM private.game_catalog AS c
            WHERE c.multi_currency_ready IS DISTINCT FROM TRUE
              AND c.status = 'active'
        ), '[]'::jsonb)
    );
$$;


CREATE OR REPLACE FUNCTION private.currency_public_limit_json(p_code TEXT)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_row private.supported_currencies%ROWTYPE;
    v_ready jsonb;
BEGIN
    SELECT c.*
    INTO v_row
    FROM private.supported_currencies AS c
    WHERE c.code = p_code;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    v_ready := private.owned_games_readiness_json();
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
        'owned_games_enabled', v_row.owned_games_enabled,
        'owned_games_ready', COALESCE(jsonb_array_length(v_ready->'ready_games'), 0) > 0,
        'ready_games', v_ready->'ready_games',
        'blocked_games', v_ready->'blocked_games'
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.require_owned_games_new_start_ready(p_display TEXT)
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
    IF v_row.code IS DISTINCT FROM 'TMT' AND v_row.limits_configured IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'CURRENCY_LIMITS_UNCONFIGURED';
    END IF;
    IF v_row.owned_games_enabled IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'OWNED_GAMES_CURRENCY_DISABLED';
    END IF;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.require_owned_game_multi_currency_ready(
    p_display TEXT,
    p_game_code TEXT
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ready BOOLEAN;
BEGIN
    IF COALESCE(p_display, '') IS NOT DISTINCT FROM 'TMT' THEN
        RETURN;
    END IF;
    SELECT c.multi_currency_ready
    INTO v_ready
    FROM private.game_catalog AS c
    WHERE c.game_code = p_game_code;
    IF v_ready IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'GAME_MULTI_CURRENCY_NOT_READY';
    END IF;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.game_max_possible_payout(
    p_game_code TEXT,
    p_stake NUMERIC,
    p_math_version TEXT,
    p_options JSONB
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_code TEXT;
    v_stake NUMERIC;
    v_mult NUMERIC;
BEGIN
    PERFORM 1 FROM (SELECT p_options) AS unused;
    v_code := NULLIF(BTRIM(LOWER(COALESCE(p_game_code, ''))), '');
    v_stake := COALESCE(p_stake, 0);
    IF v_stake <= 0 THEN
        RETURN 0;
    END IF;
    IF v_code = 'dice' THEN
        RETURN private.game_money(v_stake * private.game_dice_win_multiplier_for_version(p_math_version));
    END IF;
    IF v_code = 'blackjack' THEN
        RETURN GREATEST(
            private.game_bj_payout_for_version(v_stake, 'golden', p_math_version),
            private.game_bj_payout_for_version(v_stake, 'win', p_math_version)
        );
    END IF;
    IF v_code = 'pharaoh' THEN
        RETURN private.game_money(v_stake * 10000);
    END IF;
    IF v_code = 'apples' THEN
        RETURN private.game_money(v_stake * 349);
    END IF;
    IF v_code = 'aviator' THEN
        RETURN private.game_money(v_stake * 1000000);
    END IF;
    RETURN NULL;
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
    v_row private.supported_currencies%ROWTYPE;
    v_ready_count INTEGER;
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
        IF v_code IS DISTINCT FROM 'TMT' THEN
            IF v_row.limits_configured IS DISTINCT FROM TRUE THEN
                RAISE EXCEPTION 'CURRENCY_LIMITS_UNCONFIGURED';
            END IF;
            SELECT COUNT(*)::INTEGER
            INTO v_ready_count
            FROM private.game_catalog AS g
            WHERE g.multi_currency_ready IS TRUE
              AND g.status = 'active';
            IF COALESCE(v_ready_count, 0) < 1 THEN
                RAISE EXCEPTION 'GAME_MULTI_CURRENCY_NOT_READY';
            END IF;
        END IF;
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
    v_uid UUID;
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
    v_limits_configured BOOLEAN;
    v_max_payout NUMERIC;
    v_liability NUMERIC;
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

    v_code := NULLIF(BTRIM(LOWER(COALESCE(p_game_code, ''))), '');
    IF v_code = 'aviator' THEN
        PERFORM private.game_aviator_lock_current();
    END IF;
    v_cat := private.game_require_catalog(p_game_code);
    v_key := private.game_require_idempotency_key(p_idempotency_key);
    v_opts := private.game_sanitize_options(p_options);

    IF p_stake IS NULL OR p_stake <= 0 THEN
        RAISE EXCEPTION 'STAKE_NOT_POSITIVE';
    END IF;
    v_stake := ROUND(p_stake, 2);

    v_fp := private.game_fingerprint(jsonb_build_object(
        'gameCode', v_cat.game_code,
        'stake', v_stake,
        'options', v_opts
    ));

    SELECT r.*
    INTO v_existing
    FROM private.game_rounds AS r
    WHERE r.player_user_id = v_uid
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

    SELECT * INTO v_ctx FROM private.game_require_player_context();
    SELECT private.wallet_display_currency(a.currency)
    INTO v_display
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = v_ctx.wallet_id;
    PERFORM private.require_owned_games_new_start_ready(v_display);
    PERFORM private.require_owned_game_multi_currency_ready(v_display, v_cat.game_code);
    PERFORM private.require_currency_amount_scale(v_display, p_stake);
    v_stake := p_stake;

    SELECT b.min_stake, b.max_stake
    INTO v_eff_min, v_eff_max
    FROM private.game_effective_stake_bounds(v_display, v_cat.min_stake, v_cat.max_stake) AS b;
    IF v_stake < v_eff_min THEN
        RAISE EXCEPTION 'STAKE_BELOW_MIN';
    END IF;
    IF v_eff_max IS NOT NULL AND v_stake > v_eff_max THEN
        RAISE EXCEPTION 'STAKE_ABOVE_MAX';
    END IF;

    v_math := private.game_math_version(v_cat.game_code);

    SELECT c.limits_configured, c.max_payout
    INTO v_limits_configured, v_max_payout
    FROM private.supported_currencies AS c
    WHERE c.code = v_display;
    IF v_limits_configured IS TRUE THEN
        v_liability := private.game_max_possible_payout(v_cat.game_code, v_stake, v_math, v_opts);
        IF v_liability IS NULL OR v_max_payout IS NULL OR v_liability > v_max_payout THEN
            RAISE EXCEPTION 'GAME_PAYOUT_ABOVE_CURRENCY_MAX';
        END IF;
    END IF;

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
        WHERE r.player_user_id = v_uid
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


REVOKE ALL ON FUNCTION private.owned_games_readiness_json() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.owned_games_readiness_json() TO service_role;
REVOKE ALL ON FUNCTION private.require_owned_game_multi_currency_ready(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.require_owned_game_multi_currency_ready(TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION private.game_max_possible_payout(TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.game_max_possible_payout(TEXT, NUMERIC, TEXT, JSONB) TO service_role;
REVOKE ALL ON FUNCTION private.game_dice_win_multiplier_for_version(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.game_bj_payout_for_version(NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.owner_set_currency_owned_games_enabled(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_set_currency_owned_games_enabled(TEXT, BOOLEAN) TO authenticated;

COMMIT;
