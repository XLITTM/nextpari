BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 049
-- PLAYER SECURITY RESTRICTION FOUNDATION
-- Sequence: after 048 (player fraud/security foundation).
--
-- Repository only. DO NOT APPLY from this change.
--
-- Soft Security restriction is independent of emergency hard block.
-- Does NOT set profiles.is_blocked, wallets.is_blocked, or
-- private.wallet_accounts.status = 'blocked'.
-- Does NOT rewrite Wallet Ledger, sports settlement, owned games,
-- provider GGR, or owner_set_player_blocked.
-- ============================================================


CREATE TABLE IF NOT EXISTS private.player_security_restrictions (
    player_user_id UUID PRIMARY KEY,
    player_public_id TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    created_by UUID NOT NULL,
    updated_by UUID NOT NULL,
    created_by_role TEXT NOT NULL,
    updated_by_role TEXT NOT NULL,
    CONSTRAINT player_security_restriction_public_id_check
        CHECK (player_public_id ~ '^[0-9]{6}$'),
    CONSTRAINT player_security_restriction_reason_check
        CHECK (char_length(BTRIM(reason)) > 0 AND char_length(reason) <= 500),
    CONSTRAINT player_security_restriction_created_role_check
        CHECK (created_by_role IN ('owner', 'security')),
    CONSTRAINT player_security_restriction_updated_role_check
        CHECK (updated_by_role IN ('owner', 'security'))
);

CREATE INDEX IF NOT EXISTS player_security_restrictions_active_idx
    ON private.player_security_restrictions (is_active, updated_at DESC)
    WHERE is_active IS TRUE;

COMMENT ON TABLE private.player_security_restrictions IS
'Current-state Security restriction per player. Independent of hard block and Wallet Ledger. One row per player. Browser roles cannot mutate this table.';


CREATE TABLE IF NOT EXISTS private.player_security_restriction_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_user_id UUID NOT NULL,
    player_public_id TEXT,
    event_type TEXT NOT NULL,
    actor_auth_user_id UUID NOT NULL,
    actor_staff_role TEXT NOT NULL,
    reason TEXT NOT NULL,
    previous_state BOOLEAN NOT NULL,
    new_state BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT player_security_restriction_event_type_check
        CHECK (event_type IN (
            'SECURITY_RESTRICTION_APPLIED',
            'SECURITY_RESTRICTION_REMOVED'
        )),
    CONSTRAINT player_security_restriction_event_role_check
        CHECK (actor_staff_role IN ('owner', 'security')),
    CONSTRAINT player_security_restriction_event_reason_check
        CHECK (char_length(BTRIM(reason)) > 0 AND char_length(reason) <= 500),
    CONSTRAINT player_security_restriction_event_state_check
        CHECK (previous_state IS DISTINCT FROM new_state)
);

CREATE INDEX IF NOT EXISTS player_security_restriction_events_player_idx
    ON private.player_security_restriction_events (player_user_id, created_at DESC);

COMMENT ON TABLE private.player_security_restriction_events IS
'Append-only Security restriction history. Direct UPDATE/DELETE is denied. Does not duplicate Wallet Ledger.';


CREATE OR REPLACE FUNCTION private.player_security_restriction_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
    RAISE EXCEPTION 'PLAYER_SECURITY_RESTRICTION_EVENTS_APPEND_ONLY';
END;
$fn$;

DROP TRIGGER IF EXISTS player_security_restriction_events_no_update
    ON private.player_security_restriction_events;
CREATE TRIGGER player_security_restriction_events_no_update
    BEFORE UPDATE OR DELETE ON private.player_security_restriction_events
    FOR EACH ROW
    EXECUTE FUNCTION private.player_security_restriction_events_append_only();


CREATE OR REPLACE FUNCTION private.security_restriction_mutator_role_allowed(p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
    SELECT BTRIM(COALESCE(p_role, '')) = 'owner';
$fn$;

COMMENT ON FUNCTION private.security_restriction_mutator_role_allowed(TEXT) IS
'Staff roles allowed to apply/remove Security restrictions. This PR: owner only. A later dedicated security staff role should be added here so the restriction engine is reused without duplicating business logic.';


CREATE OR REPLACE FUNCTION private.is_player_security_restricted(p_player_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_active BOOLEAN;
BEGIN
    IF p_player_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT r.is_active
    INTO v_active
    FROM private.player_security_restrictions AS r
    WHERE r.player_user_id = p_player_user_id;

    RETURN COALESCE(v_active, FALSE);
END;
$fn$;

COMMENT ON FUNCTION private.is_player_security_restricted(UUID) IS
'True when an active Security restriction exists. Does not change wallet status, login, sports, owned games, or hard block.';


CREATE OR REPLACE FUNCTION private.require_player_withdrawal_allowed(p_player_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    IF p_player_user_id IS NULL THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;
    IF private.is_player_security_restricted(p_player_user_id) THEN
        RAISE EXCEPTION 'SECURITY_WITHDRAWAL_RESTRICTED';
    END IF;
END;
$fn$;

COMMENT ON FUNCTION private.require_player_withdrawal_allowed(UUID) IS
'Canonical player-withdrawal gate. Restricted players cannot create a new withdrawal. Existing requests are not cancelled.';


CREATE OR REPLACE FUNCTION private.require_player_deposit_allowed(p_player_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    IF p_player_user_id IS NULL THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;
    IF private.is_player_security_restricted(p_player_user_id) THEN
        RAISE EXCEPTION 'SECURITY_DEPOSIT_RESTRICTED';
    END IF;
END;
$fn$;

COMMENT ON FUNCTION private.require_player_deposit_allowed(UUID) IS
'Canonical player-deposit gate for cashier and future payment-provider adapters. Owner administrative treasury credit is not a player deposit.';


CREATE OR REPLACE FUNCTION private.require_player_external_casino_allowed(p_player_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    IF p_player_user_id IS NULL THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;
    IF private.is_player_security_restricted(p_player_user_id) THEN
        RAISE EXCEPTION 'SECURITY_CASINO_RESTRICTED';
    END IF;
END;
$fn$;

COMMENT ON FUNCTION private.require_player_external_casino_allowed(UUID) IS
'Canonical provider-independent casino/slot/live-casino gate. Future BetB2B launch/wallet adapters MUST call this before issuing a provider session. No sports or Nextpari-owned-game helper exists that denies play for Security restriction.';


CREATE OR REPLACE FUNCTION private.player_security_restriction_policy(p_restricted BOOLEAN)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
    SELECT jsonb_build_object(
        'login', 'allowed',
        'sports', 'allowed',
        'owned_games', 'allowed',
        'external_casino', CASE WHEN p_restricted THEN 'denied' ELSE 'allowed' END,
        'live_casino', CASE WHEN p_restricted THEN 'denied' ELSE 'allowed' END,
        'player_deposits', CASE WHEN p_restricted THEN 'denied' ELSE 'allowed' END,
        'player_withdrawals', CASE WHEN p_restricted THEN 'denied' ELSE 'allowed' END
    );
$fn$;


CREATE OR REPLACE FUNCTION private.set_player_security_restriction(
    p_player_user_id UUID,
    p_restricted BOOLEAN,
    p_reason TEXT,
    p_actor_user_id UUID,
    p_actor_staff_role TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_reason TEXT;
    v_role TEXT;
    v_public TEXT;
    v_row private.player_security_restrictions%ROWTYPE;
    v_previous BOOLEAN;
    v_event TEXT;
BEGIN
    v_role := BTRIM(COALESCE(p_actor_staff_role, ''));
    IF NOT private.security_restriction_mutator_role_allowed(v_role) THEN
        RAISE EXCEPTION 'SECURITY_RESTRICTION_ACTOR_DENIED';
    END IF;
    IF p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    IF p_player_user_id IS NULL THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;
    IF p_restricted IS NULL THEN
        RAISE EXCEPTION 'RESTRICTED_REQUIRED';
    END IF;

    v_reason := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
    IF v_reason IS NULL THEN
        RAISE EXCEPTION 'REASON_REQUIRED';
    END IF;
    IF char_length(v_reason) > 500 THEN
        RAISE EXCEPTION 'REASON_TOO_LONG';
    END IF;

    v_public := private.player_security_public_id(p_player_user_id);
    IF v_public IS NULL OR v_public !~ '^[0-9]{6}$' THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;

    SELECT *
    INTO v_row
    FROM private.player_security_restrictions AS r
    WHERE r.player_user_id = p_player_user_id
    FOR UPDATE;

    v_previous := COALESCE(v_row.is_active, FALSE);
    IF p_restricted AND v_previous THEN
        RAISE EXCEPTION 'SECURITY_RESTRICTION_ALREADY_ACTIVE';
    END IF;
    IF (NOT p_restricted) AND (NOT v_previous) THEN
        RAISE EXCEPTION 'SECURITY_RESTRICTION_NOT_ACTIVE';
    END IF;

    v_event := CASE
        WHEN p_restricted THEN 'SECURITY_RESTRICTION_APPLIED'
        ELSE 'SECURITY_RESTRICTION_REMOVED'
    END;

    IF v_row.player_user_id IS NULL THEN
        INSERT INTO private.player_security_restrictions (
            player_user_id,
            player_public_id,
            is_active,
            reason,
            created_by,
            updated_by,
            created_by_role,
            updated_by_role
        )
        VALUES (
            p_player_user_id,
            v_public,
            TRUE,
            v_reason,
            p_actor_user_id,
            p_actor_user_id,
            v_role,
            v_role
        )
        RETURNING * INTO v_row;
    ELSE
        UPDATE private.player_security_restrictions
        SET
            player_public_id = v_public,
            is_active = p_restricted,
            reason = v_reason,
            updated_at = pg_catalog.now(),
            updated_by = p_actor_user_id,
            updated_by_role = v_role
        WHERE player_user_id = p_player_user_id
        RETURNING * INTO v_row;
    END IF;

    INSERT INTO private.player_security_restriction_events (
        player_user_id,
        player_public_id,
        event_type,
        actor_auth_user_id,
        actor_staff_role,
        reason,
        previous_state,
        new_state
    )
    VALUES (
        p_player_user_id,
        v_public,
        v_event,
        p_actor_user_id,
        v_role,
        v_reason,
        v_previous,
        p_restricted
    );

    PERFORM private.append_staff_audit(
        v_event,
        'player',
        v_public,
        'owner_only',
        jsonb_build_object(
            'player_public_id', v_public,
            'restricted', p_restricted,
            'previous_state', v_previous,
            'reason', v_reason,
            'actor_staff_role', v_role
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'player_public_id', v_public,
        'restricted', v_row.is_active,
        'reason', v_row.reason,
        'updated_at', v_row.updated_at,
        'policy', private.player_security_restriction_policy(v_row.is_active)
    );
END;
$fn$;

COMMENT ON FUNCTION private.set_player_security_restriction(UUID, BOOLEAN, TEXT, UUID, TEXT) IS
'Canonical apply/remove engine. Owner is the only mutator in this PR. Does not touch wallets, profiles.is_blocked, sports flags, or Wallet Ledger.';


CREATE OR REPLACE FUNCTION public.owner_player_security_restriction(p_player_id TEXT)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_public TEXT;
    v_row private.player_security_restrictions%ROWTYPE;
BEGIN
    PERFORM private.get_current_owner_context();
    v_uid := private.player_security_user_id_from_public_id(p_player_id);
    v_public := private.player_security_public_id(v_uid);

    SELECT *
    INTO v_row
    FROM private.player_security_restrictions AS r
    WHERE r.player_user_id = v_uid;

    RETURN jsonb_build_object(
        'ok', true,
        'player_public_id', v_public,
        'restricted', COALESCE(v_row.is_active, FALSE),
        'reason', v_row.reason,
        'updated_at', v_row.updated_at,
        'policy', private.player_security_restriction_policy(COALESCE(v_row.is_active, FALSE))
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_set_player_security_restriction(
    p_player_id TEXT,
    p_restricted BOOLEAN,
    p_reason TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_owner UUID;
    v_uid UUID;
BEGIN
    SELECT o.auth_user_id
    INTO v_owner
    FROM private.get_current_owner_context() AS o;

    v_uid := private.player_security_user_id_from_public_id(p_player_id);
    RETURN private.set_player_security_restriction(
        v_uid,
        p_restricted,
        p_reason,
        v_owner,
        'owner'
    );
END;
$fn$;

COMMENT ON FUNCTION public.owner_player_security_restriction(TEXT) IS
'Owner JWT read of current Security restriction. Manager/cashier/player denied via get_current_owner_context.';

COMMENT ON FUNCTION public.owner_set_player_security_restriction(TEXT, BOOLEAN, TEXT) IS
'Owner JWT apply/remove Security restriction. Reason required. Does not call owner_set_player_blocked and does not auto-close fraud flags.';


CREATE OR REPLACE FUNCTION public.require_player_external_casino_allowed(p_player_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.require_player_external_casino_allowed(p_player_user_id);
END;
$fn$;

COMMENT ON FUNCTION public.require_player_external_casino_allowed(UUID) IS
'Service-role wrapper for future BetB2B casino/slot/live-casino adapters. Browser/authenticated execute is denied. Call before issuing a provider session.';


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

    SELECT r.wallet_id, r.public_id, r.currency
    INTO v_player
    FROM private.cashier_resolve_player_by_public_id(p_player_public_id) AS r;

    IF v_player.currency IS DISTINCT FROM v_op.currency THEN
        RAISE EXCEPTION 'CURRENCY_MISMATCH';
    END IF;

    PERFORM private.require_player_deposit_allowed(
        private.player_security_user_id_from_public_id(v_player.public_id)
    );

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
                'currency', v_op.currency,
                'player_public_id', v_player.public_id
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'transfer_id', v_result.transfer_id,
        'is_duplicate', v_result.is_duplicate,
        'amount', p_amount,
        'currency', v_op.currency,
        'cashier_balance_after', v_result.from_balance_after,
        'player_balance_after', v_result.player_balance_after,
        'player_public_id', v_player.public_id
    );
END;
$fn$;


REVOKE ALL ON TABLE private.player_security_restrictions FROM PUBLIC;
REVOKE ALL ON TABLE private.player_security_restrictions FROM anon, authenticated;
REVOKE ALL ON TABLE private.player_security_restrictions FROM service_role;
GRANT SELECT ON TABLE private.player_security_restrictions TO service_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE private.player_security_restrictions FROM service_role;

REVOKE ALL ON TABLE private.player_security_restriction_events FROM PUBLIC;
REVOKE ALL ON TABLE private.player_security_restriction_events FROM anon, authenticated;
REVOKE ALL ON TABLE private.player_security_restriction_events FROM service_role;
GRANT SELECT ON TABLE private.player_security_restriction_events TO service_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE private.player_security_restriction_events FROM service_role;

REVOKE ALL ON FUNCTION private.player_security_restriction_events_append_only() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.security_restriction_mutator_role_allowed(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.is_player_security_restricted(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.require_player_withdrawal_allowed(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.require_player_deposit_allowed(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.require_player_external_casino_allowed(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_security_restriction_policy(BOOLEAN) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.set_player_security_restriction(UUID, BOOLEAN, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.owner_player_security_restriction(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_player_security_restriction(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.owner_set_player_security_restriction(TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_set_player_security_restriction(TEXT, BOOLEAN, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.require_player_external_casino_allowed(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.require_player_external_casino_allowed(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.require_player_external_casino_allowed(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.player_create_withdrawal(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_create_withdrawal(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.cashier_deposit_player(TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cashier_deposit_player(TEXT, NUMERIC, TEXT, TEXT) TO authenticated;

COMMIT;
