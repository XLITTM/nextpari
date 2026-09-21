BEGIN;

-- ============================================================
-- NEXTPARI PHASE 070
-- A revoked Supabase player session must not use game or
-- withdrawal RPCs. One canonical liveness gate.
-- Repository-only. NOT applied by this change.
--
-- Does NOT create a second auth system.
-- Does NOT edit auth.sessions.
-- Does NOT rewrite private.apply_wallet_entry.
-- Does NOT rewrite game engines or sports settlement.
-- Does NOT enable sports betting.
-- ============================================================

CREATE OR REPLACE FUNCTION private.player_require_live_auth_session()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_raw TEXT;
    v_session UUID;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

    v_raw := NULLIF(BTRIM(COALESCE(auth.jwt() ->> 'session_id', '')), '');
    IF v_raw IS NULL THEN
        RAISE EXCEPTION 'SESSION_EXPIRED';
    END IF;

    BEGIN
        v_session := v_raw::UUID;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'SESSION_EXPIRED';
    END;

    IF NOT private.player_auth_session_is_active(v_uid, v_session) THEN
        RAISE EXCEPTION 'SESSION_EXPIRED';
    END IF;

    RETURN v_uid;
END;
$fn$;

REVOKE ALL ON FUNCTION private.player_require_live_auth_session() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.player_require_live_auth_session() FROM anon, authenticated;

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
BEGIN
    v_uid := private.player_require_live_auth_session();
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

    RETURN QUERY SELECT v_uid, v_active.wallet_id, v_active.status, v_active.migration_state;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.game_require_session_viewer()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_staff UUID;
    v_profile UUID;
BEGIN
    v_uid := private.player_require_live_auth_session();

    SELECT s.auth_user_id
    INTO v_staff
    FROM private.staff_accounts AS s
    WHERE s.auth_user_id = v_uid
    LIMIT 1;
    IF v_staff IS NOT NULL THEN
        RAISE EXCEPTION 'STAFF_CANNOT_PLAY';
    END IF;

    SELECT p.id
    INTO v_profile
    FROM public.profiles AS p
    WHERE p.id = v_uid;

    IF v_profile IS NULL THEN
        RAISE EXCEPTION 'PLAYER_PROFILE_MISSING';
    END IF;

    RETURN v_uid;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.player_game_start(
    p_game_code TEXT,
    p_stake NUMERIC,
    p_idempotency_key TEXT,
    p_options JSONB DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.player_require_live_auth_session();
    RETURN private.game_engine_start(p_game_code, p_stake, p_idempotency_key, p_options);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.player_game_action(
    p_round_id UUID,
    p_action TEXT,
    p_idempotency_key TEXT,
    p_options JSONB DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.player_require_live_auth_session();
    RETURN private.game_engine_action(p_round_id, p_action, p_idempotency_key, p_options);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.player_game_get(p_round_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.player_require_live_auth_session();
    RETURN private.game_engine_get(p_round_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.player_game_start(TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_game_start(TEXT, NUMERIC, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.player_game_start(TEXT, NUMERIC, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.player_game_action(UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_game_action(UUID, TEXT, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.player_game_action(UUID, TEXT, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.player_game_get(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_game_get(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.player_game_get(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.player_create_withdrawal(
    p_method TEXT,
    p_amount NUMERIC,
    p_idempotency_key TEXT,
    p_method_label TEXT,
    p_destination_ref TEXT DEFAULT NULL,
    p_cash_pickup_city TEXT DEFAULT NULL,
    p_cash_pickup_point TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_payout_destination_id TEXT DEFAULT NULL
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
    v_amount NUMERIC;
    v_player RECORD;
    v_existing private.player_withdrawal_requests%ROWTYPE;
    v_payout private.cashier_player_payout_requests%ROWTYPE;
    v_hold jsonb;
    v_dest TEXT;
    v_city TEXT;
    v_point TEXT;
    v_display TEXT;
    v_limits_configured BOOLEAN;
    v_enforce BOOLEAN;
    v_dest_id UUID := NULL;
    v_dest_cashier UUID := NULL;
    v_minor NUMERIC(40, 0);
    v_selected_avail NUMERIC(40, 0) := 0;
    v_need_review BOOLEAN := FALSE;
    v_issue_code BOOLEAN := TRUE;
    v_notice TEXT;
    v_review_id UUID;
    v_signals JSONB := '{}'::jsonb;
    v_snapshot JSONB := '[]'::jsonb;
    v_state TEXT;
BEGIN
    -- Reject a revoked session before idempotency lookup, wallet lock, hold, or payout creation.
    v_uid := private.player_require_live_auth_session();

    v_method := lower(NULLIF(BTRIM(COALESCE(p_method, '')), ''));
    IF v_method IS NULL OR v_method NOT IN ('cash', 'card', 'crypto', 'ewallet', 'other') THEN
        RAISE EXCEPTION 'WITHDRAWAL_METHOD_INVALID';
    END IF;
    IF v_method = 'card' THEN RAISE EXCEPTION 'CARD_WITHDRAWAL_PROVIDER_REQUIRED'; END IF;

    v_key := private.owner_require_idempotency_key(p_idempotency_key);
    v_label := NULLIF(BTRIM(COALESCE(p_method_label, '')), '');
    IF v_label IS NULL THEN RAISE EXCEPTION 'METHOD_LABEL_REQUIRED'; END IF;
    IF char_length(v_label) > 120 THEN RAISE EXCEPTION 'METHOD_LABEL_TOO_LONG'; END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'AMOUNT_NOT_POSITIVE'; END IF;
    v_amount := p_amount;
    v_enforce := private.fund_attribution_enforcement_enabled();
    v_city := NULLIF(BTRIM(COALESCE(p_cash_pickup_city, '')), '');
    v_point := NULLIF(BTRIM(COALESCE(p_cash_pickup_point, '')), '');
    IF v_method = 'cash' THEN
        v_dest := NULL;
    ELSE
        v_dest := private.withdrawal_sanitize_destination(v_method, p_destination_ref);
        v_city := NULL;
        v_point := NULL;
    END IF;

    SELECT r.* INTO v_existing
    FROM private.player_withdrawal_requests AS r
    WHERE r.player_auth_user_id = v_uid AND r.idempotency_key = v_key
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
            SELECT p.* INTO v_payout FROM private.cashier_player_payout_requests AS p WHERE p.id = v_existing.cash_payout_id;
        END IF;
        RETURN private.withdrawal_public_json(v_existing, v_payout, true)
            || jsonb_build_object('ok', true, 'is_duplicate', true);
    END IF;

    SELECT w.wallet_id, w.public_id, w.currency
    INTO v_player
    FROM private.withdrawal_lock_player_wallet(v_uid) AS w;
    v_display := COALESCE(private.wallet_display_currency(v_player.currency), 'TMT');
    PERFORM private.require_currency_amount_scale(v_display, p_amount);
    v_amount := p_amount;
    v_minor := private.currency_amount_to_minor(v_display, v_amount);

    SELECT c.limits_configured INTO v_limits_configured
    FROM private.supported_currencies AS c WHERE c.code = v_display;
    IF v_display = 'TMT' AND COALESCE(v_limits_configured, FALSE) IS NOT TRUE
       AND v_method = 'cash' AND p_amount < 40 THEN
        RAISE EXCEPTION 'CASH_WITHDRAWAL_BELOW_MIN';
    END IF;
    PERFORM private.require_player_withdrawal_allowed(v_uid);
    PERFORM private.require_player_min_amount(v_display, p_amount, 'withdrawal');

    IF v_method = 'cash' THEN
        IF v_enforce THEN
            SELECT d.destination_id, d.legacy_cashier_id, d.city, d.label
            INTO v_dest_id, v_dest_cashier, v_city, v_point
            FROM private.resolve_live_payout_destination(p_payout_destination_id, v_player.currency) AS d;
            PERFORM private.ensure_fund_attribution_initialized(
                v_player.wallet_id,
                (SELECT a.available_balance FROM private.wallet_accounts AS a WHERE a.wallet_id = v_player.wallet_id),
                (SELECT a.locked_balance FROM private.wallet_accounts AS a WHERE a.wallet_id = v_player.wallet_id)
            );
            v_state := private.assert_attribution_matches_wallet(v_player.wallet_id);
            v_selected_avail := private.cashier_attribution_available_minor(
                v_player.wallet_id, v_player.currency, v_dest_cashier
            );
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'source_kind', b.source_kind,
                'source_cashier_id', to_jsonb(b.source_cashier_id),
                'available_minor', b.available_minor,
                'reserved_minor', b.reserved_minor
            ) ORDER BY b.source_kind, COALESCE(b.source_cashier_id::TEXT, '')), '[]'::jsonb)
            INTO v_snapshot
            FROM private.player_fund_attribution AS b
            WHERE b.wallet_id = v_player.wallet_id AND b.currency = v_player.currency;
            v_need_review := (v_minor > COALESCE(v_selected_avail, 0)) OR v_state IS DISTINCT FROM 'active';
            IF v_need_review THEN
                v_issue_code := FALSE;
                v_notice := 'under_review';
                v_signals := jsonb_build_object(
                    'requested_exceeds_selected', v_minor > COALESCE(v_selected_avail, 0),
                    'tiny_selected_cashier_share',
                        COALESCE(v_selected_avail, 0) > 0
                        AND COALESCE(v_selected_avail, 0) * 20 < v_minor,
                    'legacy_or_noncashier_required', EXISTS (
                        SELECT 1 FROM private.player_fund_attribution AS b
                        WHERE b.wallet_id = v_player.wallet_id
                          AND b.currency = v_player.currency
                          AND b.source_kind IN ('legacy', 'treasury', 'house', 'bonus')
                          AND b.available_minor > 0
                    ),
                    'inconsistent', v_state IS DISTINCT FROM 'active',
                    'no_first_free_payout', true
                );
            END IF;
        ELSE
            -- Enforcement OFF: preserve legacy city/point cash flow. Destination
            -- and selected cashier stay NULL unless an optional destination token
            -- is supplied. Never dereference an unassigned RECORD.
            IF v_city IS NULL OR v_point IS NULL THEN RAISE EXCEPTION 'CASH_PICKUP_REQUIRED'; END IF;
            IF NULLIF(BTRIM(COALESCE(p_payout_destination_id, '')), '') IS NOT NULL THEN
                SELECT d.destination_id, d.legacy_cashier_id, d.city, d.label
                INTO v_dest_id, v_dest_cashier, v_city, v_point
                FROM private.resolve_live_payout_destination(p_payout_destination_id, v_player.currency) AS d;
            END IF;
        END IF;

        v_hold := public.player_request_cashier_payout(
            v_amount, v_key, v_dest_cashier, v_dest_id, v_issue_code
        );
        SELECT p.* INTO v_payout
        FROM private.cashier_player_payout_requests AS p
        WHERE p.id = (v_hold ->> 'id')::uuid
        FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'PAYOUT_NOT_FOUND'; END IF;
    END IF;

    INSERT INTO private.player_withdrawal_requests (
        player_auth_user_id, player_public_id, wallet_id, method, method_label, amount, currency,
        status, cash_pickup_city, cash_pickup_point, cash_payout_id, destination_ref, idempotency_key,
        metadata, payout_destination_id, selected_legacy_cashier_id, player_notice_code
    )
    VALUES (
        v_uid, v_player.public_id, v_player.wallet_id, v_method, v_label, v_amount, v_player.currency,
        'pending', v_city, v_point, v_payout.id, v_dest, v_key,
        COALESCE(p_metadata, '{}'::jsonb) - 'wallet_id' - 'walletId' - 'auth_user_id' - 'player_id'
            - 'balance' - 'status' - 'cashier_id' - 'network_id' - 'manager_id',
        v_dest_id, v_dest_cashier, v_notice
    )
    RETURNING * INTO v_existing;

    IF v_method <> 'cash' THEN
        -- Non-cash HOLD uses the withdrawal id as hold identity so RELEASE/COMPLETE
        -- restore/consume the same parts. Attribution trigger reserves proportionally.
        -- Do not open cashier review merely because attribution exists.
        PERFORM 1 FROM private.apply_wallet_entry(
            v_player.wallet_id, -v_amount, v_amount, 'WITHDRAWAL_HOLD', 'withdrawal',
            'wd-hold:' || v_existing.id::TEXT, 'player_withdrawal', v_existing.id::TEXT,
            'player', v_uid::TEXT, jsonb_build_object('phase', 'hold', 'method', v_method)
        );
    END IF;

    IF v_need_review THEN
        INSERT INTO private.withdrawal_attribution_reviews (
            withdrawal_id, cash_payout_id, payout_destination_id, selected_legacy_cashier_id,
            currency, requested_amount, selected_cashier_amount, cross_cashier_amount,
            review_status, signal_details, attribution_snapshot
        )
        VALUES (
            v_existing.id, v_payout.id, v_dest_id, v_dest_cashier,
            v_player.currency, v_amount,
            private.currency_minor_to_amount(v_display, COALESCE(v_selected_avail, 0)),
            private.currency_minor_to_amount(v_display, GREATEST(v_minor - COALESCE(v_selected_avail, 0), 0)),
            'required', v_signals, v_snapshot
        )
        RETURNING id INTO v_review_id;
        PERFORM private.withdrawal_review_append_audit(
            v_review_id, v_existing.id, 'system', NULL, NULL, 'required', 'created', NULL
        );
    END IF;

    RETURN private.withdrawal_public_json(v_existing, v_payout, true)
        || jsonb_build_object(
            'ok', true,
            'is_duplicate', COALESCE((v_hold ->> 'is_duplicate')::boolean, false),
            'code', CASE WHEN v_method = 'cash' AND v_issue_code THEN v_payout.secret_code ELSE NULL END
        );
EXCEPTION
    WHEN unique_violation THEN
        SELECT r.* INTO v_existing
        FROM private.player_withdrawal_requests AS r
        WHERE r.player_auth_user_id = v_uid AND r.idempotency_key = v_key
        FOR UPDATE;
        IF NOT FOUND THEN RAISE; END IF;
        IF v_existing.cash_payout_id IS NOT NULL THEN
            SELECT p.* INTO v_payout FROM private.cashier_player_payout_requests AS p WHERE p.id = v_existing.cash_payout_id;
        END IF;
        RETURN private.withdrawal_public_json(v_existing, v_payout, true)
            || jsonb_build_object('ok', true, 'is_duplicate', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.player_list_withdrawals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_rows jsonb;
BEGIN
    v_uid := private.player_require_live_auth_session();

    PERFORM private.withdrawal_reconcile_expired_cash(v_uid);

    SELECT COALESCE(jsonb_agg(item ORDER BY (item ->> 'created_at') DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT private.withdrawal_public_json(w, p, true) AS item
        FROM private.player_withdrawal_requests AS w
        LEFT JOIN private.cashier_player_payout_requests AS p
            ON p.id = w.cash_payout_id
        WHERE w.player_auth_user_id = v_uid
    ) AS x;

    RETURN jsonb_build_object(
        'ok', true,
        'rows', COALESCE(v_rows, '[]'::jsonb),
        'total', jsonb_array_length(COALESCE(v_rows, '[]'::jsonb))
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.player_list_cash_payout_destinations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_active RECORD;
    v_rows jsonb;
BEGIN
    v_uid := private.player_require_live_auth_session();
    SELECT * INTO v_active FROM private.player_active_wallet(v_uid);
    IF v_active.wallet_id IS NULL THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', d.public_token,
        'city', d.city,
        'label', d.label
    ) ORDER BY d.city, d.label), '[]'::jsonb)
    INTO v_rows
    FROM private.cashier_payout_destinations AS d
    INNER JOIN public.cashiers AS c ON c.id = d.legacy_cashier_id
    INNER JOIN private.operational_accounts AS a
        ON a.legacy_cashier_id = d.legacy_cashier_id
       AND a.account_type = 'cashier'
       AND a.currency = v_active.storage_currency
    WHERE d.is_selectable IS TRUE
      AND c.is_active IS TRUE
      AND a.status = 'active'
      AND a.migration_state = 'active';

    RETURN jsonb_build_object(
        'ok', true,
        'rows', COALESCE(v_rows, '[]'::jsonb)
    );
END;
$fn$;

REVOKE ALL ON FUNCTION public.player_create_withdrawal(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_create_withdrawal(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.player_list_withdrawals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_list_withdrawals() FROM anon;
GRANT EXECUTE ON FUNCTION public.player_list_withdrawals() TO authenticated;

REVOKE ALL ON FUNCTION public.player_list_cash_payout_destinations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_list_cash_payout_destinations() TO authenticated;

COMMIT;
