BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 041
-- SERVER-AUTHORITATIVE WITHDRAWALS VIA WALLET LEDGER
-- Sequence: after 040 (20260913120000_staff_rpc_security_040).
--
-- NOT APPLIED BY THIS CHANGE. Repository-only.
--
-- Cash / Mobcash reuses canonical:
--   public.player_request_cashier_payout (internal only; EXECUTE revoked from authenticated)
--   public.cashier_lookup_player_payout
--   public.cashier_confirm_player_payout
--   WITHDRAWAL_HOLD / WITHDRAWAL_RELEASE / WITHDRAWAL_COMPLETE
--
-- Player cash create goes through public.player_create_withdrawal.
--
-- Card / crypto / e-wallet / other:
--   private.player_withdrawal_requests
--   WITHDRAWAL_HOLD on create
--   WITHDRAWAL_RELEASE on reject
--   WITHDRAWAL_COMPLETE on owner mark-paid
--
-- No public.wallets mutation. No apply_wallet_entry rewrite.
-- No table drops. No wallet/bet/game data changes.
-- ============================================================


CREATE TABLE IF NOT EXISTS private.player_withdrawal_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_auth_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
    player_public_id TEXT NOT NULL,
    wallet_id UUID NOT NULL
        REFERENCES private.wallet_accounts (wallet_id)
        ON DELETE RESTRICT,
    method TEXT NOT NULL,
    method_label TEXT NOT NULL,
    amount NUMERIC(20, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'TMTM',
    status TEXT NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    approved_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    rejection_reason TEXT,
    cash_pickup_city TEXT,
    cash_pickup_point TEXT,
    cash_payout_id UUID
        REFERENCES private.cashier_player_payout_requests (id)
        ON DELETE RESTRICT,
    destination_ref TEXT,
    idempotency_key TEXT NOT NULL,
    approve_idempotency_key TEXT,
    reject_idempotency_key TEXT,
    paid_idempotency_key TEXT,
    approved_by_staff_auth_id UUID,
    rejected_by_staff_auth_id UUID,
    paid_by_staff_auth_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT player_withdrawal_method_check
        CHECK (method IN ('cash', 'card', 'crypto', 'ewallet', 'other')),
    CONSTRAINT player_withdrawal_status_check
        CHECK (status IN ('pending', 'approved', 'paid', 'rejected', 'cancelled', 'expired')),
    CONSTRAINT player_withdrawal_amount_positive
        CHECK (amount > 0 AND amount = ROUND(amount, 2)),
    CONSTRAINT player_withdrawal_public_id_check
        CHECK (player_public_id ~ '^[0-9]{6}$'),
    CONSTRAINT player_withdrawal_idempotency_check
        CHECK (char_length(BTRIM(idempotency_key)) BETWEEN 1 AND 250),
    CONSTRAINT player_withdrawal_cash_shape
        CHECK (
            (method = 'cash' AND cash_payout_id IS NOT NULL)
            OR (method <> 'cash' AND cash_payout_id IS NULL)
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS player_withdrawal_idempotency_uidx
ON private.player_withdrawal_requests (player_auth_user_id, idempotency_key);

CREATE INDEX IF NOT EXISTS player_withdrawal_player_idx
ON private.player_withdrawal_requests (player_auth_user_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS player_withdrawal_status_idx
ON private.player_withdrawal_requests (status, requested_at DESC);

REVOKE ALL ON TABLE private.player_withdrawal_requests FROM PUBLIC;
REVOKE ALL ON TABLE private.player_withdrawal_requests FROM anon, authenticated;
GRANT SELECT ON TABLE private.player_withdrawal_requests TO service_role;


CREATE OR REPLACE FUNCTION private.withdrawal_sanitize_destination(
    p_method TEXT,
    p_destination TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_raw TEXT;
    v_digits TEXT;
BEGIN
    v_raw := NULLIF(BTRIM(COALESCE(p_destination, '')), '');
    IF p_method = 'cash' THEN
        RETURN NULL;
    END IF;
    IF v_raw IS NULL THEN
        RAISE EXCEPTION 'DESTINATION_REQUIRED';
    END IF;
    IF char_length(v_raw) > 128 THEN
        RAISE EXCEPTION 'DESTINATION_TOO_LONG';
    END IF;
    IF p_method = 'card' THEN
        v_digits := regexp_replace(v_raw, '[^0-9]', '', 'g');
        IF char_length(v_digits) < 4 THEN
            RAISE EXCEPTION 'DESTINATION_REQUIRED';
        END IF;
        RETURN right(v_digits, 4);
    END IF;
    RETURN v_raw;
END;
$fn$;

REVOKE ALL ON FUNCTION private.withdrawal_sanitize_destination(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.withdrawal_sanitize_destination(TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.withdrawal_sanitize_destination(TEXT, TEXT) TO service_role;


CREATE OR REPLACE FUNCTION private.withdrawal_effective_status(
    p_row private.player_withdrawal_requests,
    p_payout private.cashier_player_payout_requests
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
BEGIN
    IF p_row.status IN ('rejected', 'cancelled', 'paid') THEN
        RETURN p_row.status;
    END IF;
    IF p_row.method = 'cash' AND p_payout.id IS NOT NULL THEN
        IF p_payout.status = 'pending' AND p_payout.expires_at <= pg_catalog.now() THEN
            RETURN 'expired';
        END IF;
        RETURN p_payout.status;
    END IF;
    RETURN p_row.status;
END;
$fn$;

REVOKE ALL ON FUNCTION private.withdrawal_effective_status(private.player_withdrawal_requests, private.cashier_player_payout_requests) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.withdrawal_effective_status(private.player_withdrawal_requests, private.cashier_player_payout_requests) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.withdrawal_effective_status(private.player_withdrawal_requests, private.cashier_player_payout_requests) TO service_role;


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
        'currency', p_row.currency,
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

REVOKE ALL ON FUNCTION private.withdrawal_public_json(private.player_withdrawal_requests, private.cashier_player_payout_requests, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.withdrawal_public_json(private.player_withdrawal_requests, private.cashier_player_payout_requests, BOOLEAN) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.withdrawal_public_json(private.player_withdrawal_requests, private.cashier_player_payout_requests, BOOLEAN) TO service_role;


CREATE OR REPLACE FUNCTION private.withdrawal_lock_player_wallet(p_uid UUID)
RETURNS TABLE (
    wallet_id UUID,
    public_id TEXT,
    currency TEXT
)
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_wallet UUID;
    v_public TEXT;
    v_currency TEXT;
    v_status TEXT;
BEGIN
    SELECT p.wallet_id, p.public_id
    INTO v_wallet, v_public
    FROM public.profiles AS p
    WHERE p.id = p_uid
    FOR UPDATE;

    IF v_wallet IS NULL THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;

    SELECT a.currency, a.status
    INTO v_currency, v_status
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = v_wallet
    FOR UPDATE;

    IF v_currency IS NULL THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;
    IF v_status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'PLAYER_WALLET_NOT_ACTIVE';
    END IF;
    IF v_public IS NULL THEN
        SELECT w.public_id INTO v_public FROM public.wallets AS w WHERE w.id = v_wallet;
    END IF;
    IF v_public IS NULL OR v_public !~ '^[0-9]{6}$' THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;

    wallet_id := v_wallet;
    public_id := v_public;
    currency := v_currency;
    RETURN NEXT;
END;
$fn$;

REVOKE ALL ON FUNCTION private.withdrawal_lock_player_wallet(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.withdrawal_lock_player_wallet(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.withdrawal_lock_player_wallet(UUID) TO service_role;


CREATE OR REPLACE FUNCTION private.withdrawal_reconcile_expired_cash(p_uid UUID)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_id UUID;
    v_n INTEGER := 0;
BEGIN
    IF p_uid IS NULL THEN
        v_n := private.expire_due_cashier_player_payouts(100);
    ELSE
        FOR v_id IN
            SELECT p.id
            FROM private.player_withdrawal_requests AS w
            INNER JOIN private.cashier_player_payout_requests AS p
                ON p.id = w.cash_payout_id
            WHERE w.player_auth_user_id = p_uid
              AND w.method = 'cash'
              AND p.status = 'pending'
              AND p.expires_at <= pg_catalog.now()
            ORDER BY p.expires_at ASC
            LIMIT 100
        LOOP
            PERFORM private.expire_cashier_player_payout(v_id);
            v_n := v_n + 1;
        END LOOP;
    END IF;

    UPDATE private.player_withdrawal_requests AS w
    SET status = 'expired'
    FROM private.cashier_player_payout_requests AS p
    WHERE w.cash_payout_id = p.id
      AND p.status = 'expired'
      AND w.status IN ('pending', 'approved')
      AND (p_uid IS NULL OR w.player_auth_user_id = p_uid);

    RETURN v_n;
END;
$fn$;

REVOKE ALL ON FUNCTION private.withdrawal_reconcile_expired_cash(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.withdrawal_reconcile_expired_cash(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.withdrawal_reconcile_expired_cash(UUID) TO service_role;


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
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

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


CREATE OR REPLACE FUNCTION public.owner_list_withdrawals(
    p_status TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_status TEXT;
    v_limit INTEGER;
    v_offset INTEGER;
    v_rows jsonb;
    v_total INTEGER;
BEGIN
    PERFORM private.get_current_owner_context();
    PERFORM private.withdrawal_reconcile_expired_cash(NULL);

    v_status := NULLIF(BTRIM(COALESCE(p_status, '')), '');
    IF v_status IS NOT NULL AND v_status NOT IN ('pending', 'approved', 'paid', 'rejected', 'cancelled', 'expired') THEN
        RAISE EXCEPTION 'STATUS_INVALID';
    END IF;
    v_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 0), 200);
    v_offset := GREATEST(COALESCE(p_offset, 0), 0);

    SELECT COUNT(*)::INTEGER
    INTO v_total
    FROM private.player_withdrawal_requests AS w
    LEFT JOIN private.cashier_player_payout_requests AS p
        ON p.id = w.cash_payout_id
    WHERE v_status IS NULL
       OR private.withdrawal_effective_status(w, p) = v_status;

    SELECT COALESCE(jsonb_agg(item ORDER BY (item ->> 'created_at') DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT private.withdrawal_public_json(w, p, false) AS item
        FROM private.player_withdrawal_requests AS w
        LEFT JOIN private.cashier_player_payout_requests AS p
            ON p.id = w.cash_payout_id
        WHERE v_status IS NULL
           OR private.withdrawal_effective_status(w, p) = v_status
        ORDER BY w.created_at DESC
        LIMIT v_limit
        OFFSET v_offset
    ) AS x;

    RETURN jsonb_build_object(
        'rows', COALESCE(v_rows, '[]'::jsonb),
        'total', COALESCE(v_total, 0)
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_approve_withdrawal(
    p_withdrawal_id UUID,
    p_idempotency_key TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_key TEXT;
    v_row private.player_withdrawal_requests%ROWTYPE;
    v_payout private.cashier_player_payout_requests%ROWTYPE;
BEGIN
    SELECT o.auth_user_id INTO v_ctx FROM private.get_current_owner_context() AS o;
    v_key := private.owner_require_idempotency_key(p_idempotency_key);

    IF p_withdrawal_id IS NULL THEN
        RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND';
    END IF;

    SELECT r.*
    INTO v_row
    FROM private.player_withdrawal_requests AS r
    WHERE r.id = p_withdrawal_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND';
    END IF;

    IF v_row.method = 'cash' THEN
        RAISE EXCEPTION 'WITHDRAWAL_CASH_REQUIRES_CASHIER';
    END IF;
    IF v_row.method = 'card' THEN
        RAISE EXCEPTION 'CARD_WITHDRAWAL_PROVIDER_REQUIRED';
    END IF;

    IF v_row.status = 'approved'
       AND v_row.approve_idempotency_key IS NOT DISTINCT FROM v_key THEN
        RETURN private.withdrawal_public_json(v_row, v_payout, false)
            || jsonb_build_object('ok', true, 'is_duplicate', true);
    END IF;

    IF v_row.status = 'paid' THEN
        RAISE EXCEPTION 'WITHDRAWAL_ALREADY_PAID';
    END IF;
    IF v_row.status = 'rejected' THEN
        RAISE EXCEPTION 'WITHDRAWAL_ALREADY_REJECTED';
    END IF;
    IF v_row.status IS DISTINCT FROM 'pending' AND v_row.status IS DISTINCT FROM 'approved' THEN
        RAISE EXCEPTION 'WITHDRAWAL_NOT_PENDING';
    END IF;

    UPDATE private.player_withdrawal_requests
    SET
        status = 'approved',
        approved_at = COALESCE(approved_at, pg_catalog.now()),
        approved_by_staff_auth_id = COALESCE(approved_by_staff_auth_id, v_ctx.auth_user_id),
        approve_idempotency_key = v_key
    WHERE id = v_row.id
    RETURNING * INTO v_row;

    RETURN private.withdrawal_public_json(v_row, v_payout, false)
        || jsonb_build_object('ok', true, 'is_duplicate', false);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_reject_withdrawal(
    p_withdrawal_id UUID,
    p_reason TEXT,
    p_idempotency_key TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_key TEXT;
    v_reason TEXT;
    v_row private.player_withdrawal_requests%ROWTYPE;
    v_payout private.cashier_player_payout_requests%ROWTYPE;
    v_release_key TEXT;
BEGIN
    SELECT o.auth_user_id INTO v_ctx FROM private.get_current_owner_context() AS o;
    v_key := private.owner_require_idempotency_key(p_idempotency_key);
    v_reason := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
    IF v_reason IS NULL THEN
        RAISE EXCEPTION 'REJECTION_REASON_REQUIRED';
    END IF;
    IF char_length(v_reason) > 500 THEN
        RAISE EXCEPTION 'REASON_TOO_LONG';
    END IF;

    IF p_withdrawal_id IS NULL THEN
        RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND';
    END IF;

    SELECT r.*
    INTO v_row
    FROM private.player_withdrawal_requests AS r
    WHERE r.id = p_withdrawal_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND';
    END IF;

    IF v_row.cash_payout_id IS NOT NULL THEN
        SELECT p.*
        INTO v_payout
        FROM private.cashier_player_payout_requests AS p
        WHERE p.id = v_row.cash_payout_id
        FOR UPDATE;
    END IF;

    IF v_row.status = 'rejected'
       AND v_row.reject_idempotency_key IS NOT DISTINCT FROM v_key THEN
        RETURN private.withdrawal_public_json(v_row, v_payout, false)
            || jsonb_build_object('ok', true, 'is_duplicate', true);
    END IF;

    IF v_row.status = 'paid' OR COALESCE(v_payout.status, '') = 'paid' THEN
        RAISE EXCEPTION 'WITHDRAWAL_ALREADY_PAID';
    END IF;

    IF v_row.status = 'rejected' THEN
        RAISE EXCEPTION 'WITHDRAWAL_ALREADY_REJECTED';
    END IF;

    IF v_row.method = 'cash' THEN
        IF v_payout.status = 'pending' THEN
            IF v_payout.expires_at <= pg_catalog.now() THEN
                PERFORM private.expire_cashier_player_payout(v_payout.id);
            ELSE
                PERFORM private.release_cashier_player_payout_hold(
                    v_payout,
                    'cancelled',
                    'owner',
                    v_ctx.auth_user_id::TEXT
                );
            END IF;
        END IF;
    ELSIF v_row.status IN ('pending', 'approved') THEN
        v_release_key := 'wd-release:' || v_row.id::TEXT;
        PERFORM 1
        FROM private.apply_wallet_entry(
            v_row.wallet_id,
            v_row.amount,
            -v_row.amount,
            'WITHDRAWAL_RELEASE',
            'withdrawal',
            v_release_key,
            'player_withdrawal',
            v_row.id::TEXT,
            'owner',
            v_ctx.auth_user_id::TEXT,
            jsonb_build_object('phase', 'reject')
        );
    ELSE
        RAISE EXCEPTION 'WITHDRAWAL_NOT_PENDING';
    END IF;

    UPDATE private.player_withdrawal_requests
    SET
        status = 'rejected',
        rejected_at = pg_catalog.now(),
        rejection_reason = v_reason,
        rejected_by_staff_auth_id = v_ctx.auth_user_id,
        reject_idempotency_key = v_key
    WHERE id = v_row.id
      AND status IS DISTINCT FROM 'rejected'
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        SELECT r.* INTO v_row FROM private.player_withdrawal_requests AS r WHERE r.id = p_withdrawal_id;
        RETURN private.withdrawal_public_json(v_row, v_payout, false)
            || jsonb_build_object('ok', true, 'is_duplicate', true);
    END IF;

    RETURN private.withdrawal_public_json(v_row, v_payout, false)
        || jsonb_build_object('ok', true, 'is_duplicate', false);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_mark_withdrawal_paid(
    p_withdrawal_id UUID,
    p_idempotency_key TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_key TEXT;
    v_row private.player_withdrawal_requests%ROWTYPE;
    v_payout private.cashier_player_payout_requests%ROWTYPE;
    v_complete_key TEXT;
BEGIN
    SELECT o.auth_user_id INTO v_ctx FROM private.get_current_owner_context() AS o;
    v_key := private.owner_require_idempotency_key(p_idempotency_key);

    IF p_withdrawal_id IS NULL THEN
        RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND';
    END IF;

    SELECT r.*
    INTO v_row
    FROM private.player_withdrawal_requests AS r
    WHERE r.id = p_withdrawal_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND';
    END IF;

    IF v_row.method = 'cash' THEN
        RAISE EXCEPTION 'WITHDRAWAL_CASH_REQUIRES_CASHIER';
    END IF;
    IF v_row.method = 'card' THEN
        RAISE EXCEPTION 'CARD_WITHDRAWAL_PROVIDER_REQUIRED';
    END IF;

    IF v_row.status = 'paid'
       AND v_row.paid_idempotency_key IS NOT DISTINCT FROM v_key THEN
        RETURN private.withdrawal_public_json(v_row, v_payout, false)
            || jsonb_build_object('ok', true, 'is_duplicate', true);
    END IF;

    IF v_row.status = 'paid' THEN
        RAISE EXCEPTION 'WITHDRAWAL_ALREADY_PAID';
    END IF;
    IF v_row.status = 'rejected' THEN
        RAISE EXCEPTION 'WITHDRAWAL_ALREADY_REJECTED';
    END IF;
    IF v_row.status IS DISTINCT FROM 'approved' THEN
        RAISE EXCEPTION 'WITHDRAWAL_NOT_APPROVED';
    END IF;

    v_complete_key := 'wd-complete:' || v_row.id::TEXT;
    PERFORM 1
    FROM private.apply_wallet_entry(
        v_row.wallet_id,
        0,
        -v_row.amount,
        'WITHDRAWAL_COMPLETE',
        'withdrawal',
        v_complete_key,
        'player_withdrawal',
        v_row.id::TEXT,
        'owner',
        v_ctx.auth_user_id::TEXT,
        jsonb_build_object('phase', 'paid', 'method', v_row.method)
    );

    UPDATE private.player_withdrawal_requests
    SET
        status = 'paid',
        paid_at = pg_catalog.now(),
        paid_by_staff_auth_id = v_ctx.auth_user_id,
        paid_idempotency_key = v_key
    WHERE id = v_row.id
      AND status = 'approved'
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'WITHDRAWAL_ALREADY_PAID';
    END IF;

    RETURN private.withdrawal_public_json(v_row, v_payout, false)
        || jsonb_build_object('ok', true, 'is_duplicate', false);
END;
$fn$;


REVOKE ALL ON FUNCTION public.player_create_withdrawal(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_create_withdrawal(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.player_create_withdrawal(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.player_list_withdrawals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_list_withdrawals() FROM anon;
GRANT EXECUTE ON FUNCTION public.player_list_withdrawals() TO authenticated;

REVOKE ALL ON FUNCTION public.owner_list_withdrawals(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_list_withdrawals(TEXT, INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_list_withdrawals(TEXT, INTEGER, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.owner_approve_withdrawal(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_approve_withdrawal(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_approve_withdrawal(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.owner_reject_withdrawal(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_reject_withdrawal(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_reject_withdrawal(UUID, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.owner_mark_withdrawal_paid(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_mark_withdrawal_paid(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_mark_withdrawal_paid(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.player_request_cashier_payout(NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_request_cashier_payout(NUMERIC, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_request_cashier_payout(NUMERIC, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.player_cancel_cashier_payout(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_cancel_cashier_payout(UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_cancel_cashier_payout(UUID, TEXT) TO service_role;


DO $legacy$
BEGIN
    IF to_regclass('public.withdrawal_requests') IS NOT NULL THEN
        EXECUTE 'DROP POLICY IF EXISTS "anon_select_withdrawals" ON public.withdrawal_requests';
        EXECUTE 'DROP POLICY IF EXISTS "anon_insert_withdrawals" ON public.withdrawal_requests';
        EXECUTE 'DROP POLICY IF EXISTS "anon_update_withdrawals" ON public.withdrawal_requests';
        EXECUTE 'DROP POLICY IF EXISTS "anon_delete_withdrawals" ON public.withdrawal_requests';
        EXECUTE 'REVOKE ALL ON TABLE public.withdrawal_requests FROM PUBLIC';
        EXECUTE 'REVOKE ALL ON TABLE public.withdrawal_requests FROM anon, authenticated';
    END IF;
END;
$legacy$;

COMMIT;
