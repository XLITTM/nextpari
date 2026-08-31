BEGIN;

-- ============================================================
-- NEXTPARI PHASE 024A.1
-- CANONICAL CASHIER ↔ PLAYER FINANCE API
-- Sequence: 024 (after 023 cashier↔player transfer types).
--
-- Cashier JWT
--      → public.cashier_deposit_player(...)
--      → public.cashier_lookup_player_payout(...)
--      → public.cashier_confirm_player_payout(...)
--      → private.get_current_cashier_context_locked()  (auth.uid())
--      → private.apply_operational_transfer(...)
--
-- Player JWT
--      → public.player_request_cashier_payout(...)
--      → public.player_cancel_cashier_payout(...)
--      → WITHDRAWAL_HOLD / WITHDRAWAL_RELEASE via Wallet Core
--
-- Browser NEVER supplies cashierId / networkId /
-- operationalAccountId / actorUserId / actorRole / walletId.
-- Live player/cashier IDs are never hardcoded here.
--
-- Activation gates (intentional, not the same check):
--   private.cashier_require_platform_ops_active()
--     Platform-wide Mobcash product gate: at least one cashier
--     operational account is live. Used ONLY for NEW player holds.
--     Player requests have no cashier identity.
--   private.cashier_require_own_ops_active(account_id)
--     Per-cashier gate for deposit/confirm. This cashier's own
--     operational account must be active. Engine still re-checks
--     the same row under FOR UPDATE.
--   cancel / expire / release: NO ops gate. Locked player funds
--     must be releasable even if Mobcash is later staged again.
--
-- Staging (no live cashier ops):
--   new hold / deposit / confirm raise OPERATIONAL_ACCOUNT_NOT_ACTIVE
--   before money, ledger, or request writes.
--
-- Does NOT GRANT legacy:
--   cashier_deposit_to_player
--   cashier_payout_by_code
--   cashier_lookup_payout_code
--   player_create_cash_payout
-- ============================================================


-- ============================================================
-- 1. CANONICAL PAYOUT REQUESTS
-- ============================================================

CREATE TABLE IF NOT EXISTS private.cashier_player_payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    secret_code TEXT NOT NULL,
    player_public_id TEXT NOT NULL,
    wallet_id UUID NOT NULL
        REFERENCES private.wallet_accounts(wallet_id)
        ON DELETE RESTRICT,

    currency TEXT NOT NULL DEFAULT 'TMTM',
    amount NUMERIC(20,2) NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending',

    expires_at TIMESTAMPTZ NOT NULL,
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    paid_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,

    paid_by_legacy_cashier_id UUID
        REFERENCES public.cashiers(id)
        ON DELETE RESTRICT,
    paid_by_staff_auth_id UUID
        REFERENCES auth.users(id)
        ON DELETE RESTRICT,
    operational_transfer_id UUID
        REFERENCES private.operational_transfers(id)
        ON DELETE RESTRICT,

    hold_idempotency_key TEXT NOT NULL,
    confirm_idempotency_key TEXT,
    cancel_idempotency_key TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),

    CONSTRAINT cashier_player_payout_code_check
        CHECK (secret_code ~ '^[0-9a-f]{16}$'),
    CONSTRAINT cashier_player_payout_public_id_check
        CHECK (player_public_id ~ '^[0-9]{6}$'),
    CONSTRAINT cashier_player_payout_status_check
        CHECK (status IN ('pending', 'paid', 'cancelled', 'expired')),
    CONSTRAINT cashier_player_payout_amount_positive
        CHECK (amount > 0),
    CONSTRAINT cashier_player_payout_amount_scale
        CHECK (amount = ROUND(amount, 2)),
    CONSTRAINT cashier_player_payout_amount_finite
        CHECK (
            amount NOT IN (
                'NaN'::NUMERIC,
                'Infinity'::NUMERIC,
                '-Infinity'::NUMERIC
            )
        ),
    CONSTRAINT cashier_player_payout_currency_check
        CHECK (currency ~ '^[A-Z]{3,10}$'),
    CONSTRAINT cashier_player_payout_hold_key_check
        CHECK (char_length(BTRIM(hold_idempotency_key)) BETWEEN 1 AND 250),
    CONSTRAINT cashier_player_payout_status_shape
        CHECK (
            (
                status <> 'paid'
                OR (
                    paid_at IS NOT NULL
                    AND paid_by_staff_auth_id IS NOT NULL
                    AND paid_by_legacy_cashier_id IS NOT NULL
                    AND operational_transfer_id IS NOT NULL
                )
            )
            AND (
                status <> 'cancelled'
                OR cancelled_at IS NOT NULL
            )
            AND (
                status <> 'pending'
                OR (
                    operational_transfer_id IS NULL
                    AND paid_at IS NULL
                )
            )
        )
);

-- Global unique: ~64-bit codes are never reused. Historical replay
-- stays unambiguous. Theoretical insert collision retries a new code.
DROP INDEX IF EXISTS private.cashier_player_payout_pending_code_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS cashier_player_payout_code_uidx
ON private.cashier_player_payout_requests (secret_code);

CREATE UNIQUE INDEX IF NOT EXISTS cashier_player_payout_hold_key_uidx
ON private.cashier_player_payout_requests (hold_idempotency_key);

CREATE INDEX IF NOT EXISTS cashier_player_payout_wallet_idx
ON private.cashier_player_payout_requests (wallet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cashier_player_payout_due_idx
ON private.cashier_player_payout_requests (expires_at)
WHERE status = 'pending';

REVOKE ALL ON TABLE private.cashier_player_payout_requests FROM PUBLIC;
REVOKE ALL ON TABLE private.cashier_player_payout_requests FROM anon, authenticated;
GRANT SELECT ON TABLE private.cashier_player_payout_requests TO service_role;


-- ============================================================
-- 2. LOCKING CASHIER GATE + HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION private.get_current_cashier_context_locked()
RETURNS TABLE (
    auth_user_id UUID,
    role TEXT,
    status TEXT,
    display_name TEXT,
    network_id UUID,
    legacy_cashier_id UUID
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_row private.staff_accounts%ROWTYPE;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

    SELECT s.*
    INTO v_row
    FROM private.staff_accounts AS s
    WHERE s.auth_user_id = v_uid
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'STAFF_ACCOUNT_NOT_FOUND';
    END IF;

    IF v_row.role IS DISTINCT FROM 'cashier' THEN
        RAISE EXCEPTION 'CASHIER_REQUIRED';
    END IF;

    IF v_row.status = 'blocked' THEN
        RAISE EXCEPTION 'STAFF_ACCOUNT_BLOCKED';
    END IF;

    IF v_row.status = 'disabled' THEN
        RAISE EXCEPTION 'STAFF_ACCOUNT_DISABLED';
    END IF;

    IF v_row.status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'STAFF_ACCOUNT_NOT_ACTIVE';
    END IF;

    IF v_row.legacy_cashier_id IS NULL THEN
        RAISE EXCEPTION 'LEGACY_CASHIER_ID_REQUIRED';
    END IF;

    IF v_row.network_id IS NULL THEN
        RAISE EXCEPTION 'NETWORK_ID_REQUIRED';
    END IF;

    RETURN QUERY
    SELECT
        v_row.auth_user_id,
        v_row.role,
        v_row.status,
        v_row.display_name,
        v_row.network_id,
        v_row.legacy_cashier_id;
END;
$fn$;

REVOKE ALL ON FUNCTION private.get_current_cashier_context_locked() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.get_current_cashier_context_locked() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_current_cashier_context_locked() TO service_role;


-- Platform-wide Mobcash product gate.
-- True iff at least one cashier operational account is live.
-- Player hold has no cashier identity; this is the product on/off switch.
-- NOT used for deposit/confirm (those check the caller's own account).
CREATE OR REPLACE FUNCTION private.cashier_require_platform_ops_active()
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM private.operational_accounts AS a
        WHERE a.account_type = 'cashier'
          AND a.migration_state = 'active'
          AND a.status = 'active'
    ) THEN
        RAISE EXCEPTION 'OPERATIONAL_ACCOUNT_NOT_ACTIVE';
    END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION private.cashier_require_platform_ops_active() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.cashier_require_platform_ops_active() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.cashier_require_platform_ops_active() TO service_role;

COMMENT ON FUNCTION private.cashier_require_platform_ops_active() IS
'Platform-wide Mobcash gate: any one live cashier operational account. New player holds only. Not per-cashier money authority.';


-- Per-cashier activation. No row lock; engine locks the same account later.
CREATE OR REPLACE FUNCTION private.cashier_require_own_ops_active(p_account_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_row RECORD;
BEGIN
    IF p_account_id IS NULL THEN
        RAISE EXCEPTION 'CASHIER_OPERATIONAL_ACCOUNT_NOT_FOUND';
    END IF;

    SELECT a.account_type, a.migration_state, a.status
    INTO v_row
    FROM private.operational_accounts AS a
    WHERE a.id = p_account_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CASHIER_OPERATIONAL_ACCOUNT_NOT_FOUND';
    END IF;

    IF v_row.account_type IS DISTINCT FROM 'cashier' THEN
        RAISE EXCEPTION 'CASHIER_OPERATIONAL_ACCOUNT_NOT_FOUND';
    END IF;

    IF v_row.migration_state IS DISTINCT FROM 'active'
       OR v_row.status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'OPERATIONAL_ACCOUNT_NOT_ACTIVE';
    END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION private.cashier_require_own_ops_active(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.cashier_require_own_ops_active(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.cashier_require_own_ops_active(UUID) TO service_role;

COMMENT ON FUNCTION private.cashier_require_own_ops_active(UUID) IS
'Per-cashier operational activation for deposit/confirm. Checks this account only; does not FOR UPDATE.';

DROP FUNCTION IF EXISTS private.cashier_require_active_ops();


CREATE OR REPLACE FUNCTION private.cashier_resolve_own_operational_account(
    p_legacy_cashier_id UUID,
    p_network_id UUID
)
RETURNS TABLE (
    account_id UUID,
    currency TEXT
)
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_op RECORD;
BEGIN
    SELECT a.id, a.currency
    INTO v_op
    FROM private.operational_accounts AS a
    WHERE a.account_type = 'cashier'
      AND a.legacy_cashier_id = p_legacy_cashier_id
      AND a.network_id IS NOT DISTINCT FROM p_network_id
    ORDER BY CASE WHEN a.currency = 'TMTM' THEN 0 ELSE 1 END, a.created_at ASC
    LIMIT 1;

    IF v_op.id IS NULL THEN
        RAISE EXCEPTION 'CASHIER_OPERATIONAL_ACCOUNT_NOT_FOUND';
    END IF;

    RETURN QUERY
    SELECT v_op.id, v_op.currency;
END;
$fn$;

REVOKE ALL ON FUNCTION private.cashier_resolve_own_operational_account(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.cashier_resolve_own_operational_account(UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.cashier_resolve_own_operational_account(UUID, UUID) TO service_role;


CREATE OR REPLACE FUNCTION private.cashier_revalidate_legacy_cashier(
    p_legacy_cashier_id UUID,
    p_network_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_cashier RECORD;
BEGIN
    SELECT c.id, c.is_active, c.network_id
    INTO v_cashier
    FROM public.cashiers AS c
    WHERE c.id = p_legacy_cashier_id
      AND c.network_id IS NOT DISTINCT FROM p_network_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CASHIER_NOT_FOUND';
    END IF;

    IF v_cashier.is_active IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'CASHIER_NOT_ACTIVE';
    END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION private.cashier_revalidate_legacy_cashier(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.cashier_revalidate_legacy_cashier(UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.cashier_revalidate_legacy_cashier(UUID, UUID) TO service_role;


-- public_id only. Missing / invalid / other-network existence
-- all collapse to PLAYER_NOT_FOUND. No wallet UUID from browser.
CREATE OR REPLACE FUNCTION private.cashier_resolve_player_by_public_id(
    p_player_public_id TEXT
)
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
    v_raw TEXT;
    v_wallet UUID;
    v_public TEXT;
    v_currency TEXT;
    v_status TEXT;
BEGIN
    v_raw := NULLIF(BTRIM(COALESCE(p_player_public_id, '')), '');
    IF v_raw IS NULL OR v_raw !~ '^[0-9]{6}$' THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;

    SELECT w.id, w.public_id
    INTO v_wallet, v_public
    FROM public.wallets AS w
    WHERE w.public_id = v_raw
    LIMIT 1;

    IF v_wallet IS NULL THEN
        SELECT p.wallet_id, p.public_id
        INTO v_wallet, v_public
        FROM public.profiles AS p
        WHERE p.public_id = v_raw
        LIMIT 1;
    END IF;

    IF v_wallet IS NULL THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;

    SELECT a.currency, a.status
    INTO v_currency, v_status
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = v_wallet;

    IF v_currency IS NULL THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;

    IF v_status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'PLAYER_WALLET_NOT_ACTIVE';
    END IF;

    RETURN QUERY
    SELECT v_wallet, COALESCE(v_public, v_raw), v_currency;
END;
$fn$;

REVOKE ALL ON FUNCTION private.cashier_resolve_player_by_public_id(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.cashier_resolve_player_by_public_id(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.cashier_resolve_player_by_public_id(TEXT) TO service_role;


-- 16 lowercase hex chars from 8 CSPRNG bytes (~64 bits).
-- Globally unique across all statuses. 6-digit codes are not used.
CREATE OR REPLACE FUNCTION private.cashier_new_payout_code()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_code TEXT;
    v_i INTEGER;
BEGIN
    FOR v_i IN 1..32 LOOP
        v_code := pg_catalog.encode(extensions.gen_random_bytes(8), 'hex');
        IF NOT EXISTS (
            SELECT 1
            FROM private.cashier_player_payout_requests AS r
            WHERE r.secret_code = v_code
        ) THEN
            RETURN v_code;
        END IF;
    END LOOP;
    RAISE EXCEPTION 'PAYOUT_CODE_UNAVAILABLE';
END;
$fn$;

REVOKE ALL ON FUNCTION private.cashier_new_payout_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.cashier_new_payout_code() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.cashier_new_payout_code() TO service_role;


CREATE OR REPLACE FUNCTION private.cashier_payout_hold_duplicate_json(
    p_req private.cashier_player_payout_requests
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $fn$
    SELECT jsonb_build_object(
        'ok', true,
        'is_duplicate', true,
        'id', p_req.id,
        'code', p_req.secret_code,
        'amount', p_req.amount,
        'currency', p_req.currency,
        'status', p_req.status,
        'expires_at', p_req.expires_at,
        'player_public_id', p_req.player_public_id
    );
$fn$;

REVOKE ALL ON FUNCTION private.cashier_payout_hold_duplicate_json(private.cashier_player_payout_requests) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.cashier_payout_hold_duplicate_json(private.cashier_player_payout_requests) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.cashier_payout_hold_duplicate_json(private.cashier_player_payout_requests) TO service_role;


CREATE OR REPLACE FUNCTION private.cashier_match_hold_idempotency(
    p_req private.cashier_player_payout_requests,
    p_wallet_id UUID,
    p_amount NUMERIC,
    p_currency TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
BEGIN
    IF p_req.wallet_id IS NOT DISTINCT FROM p_wallet_id
       AND p_req.amount IS NOT DISTINCT FROM p_amount
       AND p_req.currency IS NOT DISTINCT FROM p_currency THEN
        RETURN;
    END IF;
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
END;
$fn$;

REVOKE ALL ON FUNCTION private.cashier_match_hold_idempotency(private.cashier_player_payout_requests, UUID, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.cashier_match_hold_idempotency(private.cashier_player_payout_requests, UUID, NUMERIC, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.cashier_match_hold_idempotency(private.cashier_player_payout_requests, UUID, NUMERIC, TEXT) TO service_role;


-- Assumes the payout row is already locked FOR UPDATE and pending.
-- Wallet Core WITHDRAWAL_RELEASE is idempotent on payout-release:{id}.
CREATE OR REPLACE FUNCTION private.release_cashier_player_payout_hold(
    p_req private.cashier_player_payout_requests,
    p_new_status TEXT,
    p_actor_type TEXT,
    p_actor_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
BEGIN
    IF p_new_status NOT IN ('cancelled', 'expired') THEN
        RAISE EXCEPTION 'PAYOUT_NOT_PENDING';
    END IF;

    IF p_req.status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'PAYOUT_NOT_PENDING';
    END IF;

    PERFORM 1
    FROM private.apply_wallet_entry(
        p_req.wallet_id,
        p_req.amount,
        -p_req.amount,
        'WITHDRAWAL_RELEASE',
        'mobcash',
        'payout-release:' || p_req.id::TEXT,
        'cashier_player_payout',
        p_req.id::TEXT,
        COALESCE(p_actor_type, 'system'),
        p_actor_id,
        jsonb_build_object('phase', 'release', 'to_status', p_new_status)
    );

    UPDATE private.cashier_player_payout_requests
    SET
        status = p_new_status,
        cancelled_at = CASE
            WHEN p_new_status = 'cancelled' THEN pg_catalog.now()
            ELSE cancelled_at
        END
    WHERE id = p_req.id
      AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYOUT_NOT_PENDING';
    END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION private.release_cashier_player_payout_hold(private.cashier_player_payout_requests, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.release_cashier_player_payout_hold(private.cashier_player_payout_requests, TEXT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.release_cashier_player_payout_hold(private.cashier_player_payout_requests, TEXT, TEXT, TEXT) TO service_role;


-- Trusted worker / confirm lazy path. Idempotent.
-- Does not require operational accounts to be active.
CREATE OR REPLACE FUNCTION private.expire_cashier_player_payout(p_payout_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_req private.cashier_player_payout_requests%ROWTYPE;
BEGIN
    IF p_payout_id IS NULL THEN
        RAISE EXCEPTION 'PAYOUT_NOT_FOUND';
    END IF;

    SELECT r.*
    INTO v_req
    FROM private.cashier_player_payout_requests AS r
    WHERE r.id = p_payout_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYOUT_NOT_FOUND';
    END IF;

    IF v_req.status = 'expired' THEN
        RETURN jsonb_build_object(
            'ok', true,
            'is_duplicate', true,
            'id', v_req.id,
            'status', 'expired'
        );
    END IF;

    IF v_req.status = 'cancelled' THEN
        RAISE EXCEPTION 'PAYOUT_CANCELLED';
    END IF;

    IF v_req.status = 'paid' THEN
        RAISE EXCEPTION 'PAYOUT_ALREADY_PAID';
    END IF;

    IF v_req.status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'PAYOUT_NOT_PENDING';
    END IF;

    IF v_req.expires_at > pg_catalog.now() THEN
        RAISE EXCEPTION 'PAYOUT_NOT_EXPIRED';
    END IF;

    PERFORM private.release_cashier_player_payout_hold(
        v_req,
        'expired',
        'system',
        NULL
    );

    RETURN jsonb_build_object(
        'ok', true,
        'is_duplicate', false,
        'id', v_req.id,
        'status', 'expired'
    );
END;
$fn$;

REVOKE ALL ON FUNCTION private.expire_cashier_player_payout(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.expire_cashier_player_payout(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.expire_cashier_player_payout(UUID) TO service_role;

COMMENT ON FUNCTION private.expire_cashier_player_payout(UUID) IS
'Idempotent pending→expired + Wallet Core WITHDRAWAL_RELEASE. Worker-safe. No scheduler.';


CREATE OR REPLACE FUNCTION private.expire_due_cashier_player_payouts(p_limit INTEGER DEFAULT 100)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_id UUID;
    v_n INTEGER := 0;
    v_cap INTEGER;
BEGIN
    v_cap := LEAST(GREATEST(COALESCE(p_limit, 100), 0), 500);

    FOR v_id IN
        SELECT r.id
        FROM private.cashier_player_payout_requests AS r
        WHERE r.status = 'pending'
          AND r.expires_at <= pg_catalog.now()
        ORDER BY r.expires_at ASC
        LIMIT v_cap
        FOR UPDATE SKIP LOCKED
    LOOP
        PERFORM private.expire_cashier_player_payout(v_id);
        v_n := v_n + 1;
    END LOOP;

    RETURN v_n;
END;
$fn$;

REVOKE ALL ON FUNCTION private.expire_due_cashier_player_payouts(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.expire_due_cashier_player_payouts(INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.expire_due_cashier_player_payouts(INTEGER) TO service_role;


-- ============================================================
-- 3. PLAYER REQUEST (hold). Platform-gated.
-- ============================================================

CREATE OR REPLACE FUNCTION public.player_request_cashier_payout(
    p_amount NUMERIC,
    p_idempotency_key TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_key TEXT;
    v_hold_key TEXT;
    v_amount NUMERIC(20,2);
    v_wallet UUID;
    v_public TEXT;
    v_currency TEXT;
    v_status TEXT;
    v_existing private.cashier_player_payout_requests%ROWTYPE;
    v_code TEXT;
    v_id UUID;
    v_i INTEGER;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

    PERFORM private.cashier_require_platform_ops_active();

    v_key := private.owner_require_idempotency_key(p_idempotency_key);
    v_hold_key := 'payout-hold:' || v_uid::TEXT || ':' || v_key;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'AMOUNT_NOT_POSITIVE';
    END IF;
    IF p_amount <> ROUND(p_amount, 2) THEN
        RAISE EXCEPTION 'AMOUNT_SCALE_INVALID';
    END IF;
    v_amount := ROUND(p_amount, 2);

    SELECT p.wallet_id, p.public_id
    INTO v_wallet, v_public
    FROM public.profiles AS p
    WHERE p.id = v_uid
    FOR UPDATE;

    IF v_wallet IS NULL THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;

    SELECT r.*
    INTO v_existing
    FROM private.cashier_player_payout_requests AS r
    WHERE r.hold_idempotency_key = v_hold_key
    FOR UPDATE;

    IF FOUND THEN
        SELECT a.currency
        INTO v_currency
        FROM private.wallet_accounts AS a
        WHERE a.wallet_id = v_wallet;
        IF v_currency IS NULL THEN
            RAISE EXCEPTION 'PLAYER_NOT_FOUND';
        END IF;
        PERFORM private.cashier_match_hold_idempotency(
            v_existing, v_wallet, v_amount, v_currency
        );
        RETURN private.cashier_payout_hold_duplicate_json(v_existing);
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

    SELECT r.*
    INTO v_existing
    FROM private.cashier_player_payout_requests AS r
    WHERE r.hold_idempotency_key = v_hold_key
    FOR UPDATE;

    IF FOUND THEN
        PERFORM private.cashier_match_hold_idempotency(
            v_existing, v_wallet, v_amount, v_currency
        );
        RETURN private.cashier_payout_hold_duplicate_json(v_existing);
    END IF;

    PERFORM 1
    FROM private.apply_wallet_entry(
        v_wallet,
        -v_amount,
        v_amount,
        'WITHDRAWAL_HOLD',
        'mobcash',
        v_hold_key,
        'cashier_player_payout',
        v_uid::TEXT,
        'player',
        v_uid::TEXT,
        jsonb_build_object('phase', 'hold')
    );

    FOR v_i IN 1..32 LOOP
        v_code := private.cashier_new_payout_code();
        BEGIN
            INSERT INTO private.cashier_player_payout_requests (
                secret_code,
                player_public_id,
                wallet_id,
                currency,
                amount,
                status,
                expires_at,
                hold_idempotency_key
            )
            VALUES (
                v_code,
                v_public,
                v_wallet,
                v_currency,
                v_amount,
                'pending',
                pg_catalog.now() + INTERVAL '24 hours',
                v_hold_key
            )
            RETURNING id INTO v_id;
            EXIT;
        EXCEPTION
            WHEN unique_violation THEN
                v_id := NULL;
                SELECT r.*
                INTO v_existing
                FROM private.cashier_player_payout_requests AS r
                WHERE r.hold_idempotency_key = v_hold_key
                FOR UPDATE;
                IF FOUND THEN
                    PERFORM private.cashier_match_hold_idempotency(
                        v_existing, v_wallet, v_amount, v_currency
                    );
                    RETURN private.cashier_payout_hold_duplicate_json(v_existing);
                END IF;
        END;
    END LOOP;

    IF v_id IS NULL THEN
        RAISE EXCEPTION 'PAYOUT_CODE_UNAVAILABLE';
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'is_duplicate', false,
        'id', v_id,
        'code', v_code,
        'amount', v_amount,
        'currency', v_currency,
        'status', 'pending',
        'expires_at', pg_catalog.now() + INTERVAL '24 hours',
        'player_public_id', v_public
    );
END;
$fn$;


-- ============================================================
-- 3b. PLAYER CANCEL (release). No ops gate.
-- ============================================================

CREATE OR REPLACE FUNCTION public.player_cancel_cashier_payout(
    p_payout_id UUID,
    p_idempotency_key TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_key TEXT;
    v_wallet UUID;
    v_req private.cashier_player_payout_requests%ROWTYPE;
    v_any UUID;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

    IF p_payout_id IS NULL THEN
        RAISE EXCEPTION 'PAYOUT_NOT_FOUND';
    END IF;

    v_key := private.owner_require_idempotency_key(p_idempotency_key);

    SELECT p.wallet_id
    INTO v_wallet
    FROM public.profiles AS p
    WHERE p.id = v_uid
    FOR UPDATE;

    IF v_wallet IS NULL THEN
        RAISE EXCEPTION 'PAYOUT_NOT_FOUND';
    END IF;

    SELECT r.*
    INTO v_req
    FROM private.cashier_player_payout_requests AS r
    WHERE r.id = p_payout_id
      AND r.wallet_id = v_wallet
    FOR UPDATE;

    IF NOT FOUND THEN
        SELECT r.id
        INTO v_any
        FROM private.cashier_player_payout_requests AS r
        WHERE r.id = p_payout_id;
        RAISE EXCEPTION 'PAYOUT_NOT_FOUND';
    END IF;

    IF v_req.status = 'cancelled' THEN
        IF v_req.cancel_idempotency_key IS NOT DISTINCT FROM v_key THEN
            RETURN jsonb_build_object(
                'ok', true,
                'is_duplicate', true,
                'id', v_req.id,
                'status', 'cancelled',
                'amount', v_req.amount,
                'currency', v_req.currency,
                'player_public_id', v_req.player_public_id,
                'cancelled_at', v_req.cancelled_at
            );
        END IF;
        RAISE EXCEPTION 'PAYOUT_CANCELLED';
    END IF;

    IF v_req.status = 'paid' THEN
        RAISE EXCEPTION 'PAYOUT_ALREADY_PAID';
    END IF;

    IF v_req.status = 'expired' THEN
        RAISE EXCEPTION 'PAYOUT_EXPIRED';
    END IF;

    IF v_req.status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'PAYOUT_NOT_PENDING';
    END IF;

    PERFORM private.release_cashier_player_payout_hold(
        v_req,
        'cancelled',
        'player',
        v_uid::TEXT
    );

    UPDATE private.cashier_player_payout_requests
    SET cancel_idempotency_key = v_key
    WHERE id = v_req.id
      AND status = 'cancelled';

    SELECT r.*
    INTO v_req
    FROM private.cashier_player_payout_requests AS r
    WHERE r.id = v_req.id;

    RETURN jsonb_build_object(
        'ok', true,
        'is_duplicate', false,
        'id', v_req.id,
        'status', 'cancelled',
        'amount', v_req.amount,
        'currency', v_req.currency,
        'player_public_id', v_req.player_public_id,
        'cancelled_at', v_req.cancelled_at
    );
END;
$fn$;


-- ============================================================
-- 4. CASHIER DEPOSIT
-- ============================================================

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


-- ============================================================
-- 5. CASHIER PAYOUT LOOKUP (read-only)
-- ============================================================

CREATE OR REPLACE FUNCTION public.cashier_lookup_player_payout(
    p_code TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_code TEXT;
    v_req private.cashier_player_payout_requests%ROWTYPE;
    v_status TEXT;
BEGIN
    PERFORM 1 FROM private.get_current_cashier_context() AS c;

    v_code := lower(NULLIF(BTRIM(COALESCE(p_code, '')), ''));
    IF v_code IS NULL OR v_code !~ '^[0-9a-f]{16}$' THEN
        RAISE EXCEPTION 'PAYOUT_CODE_INVALID';
    END IF;

    SELECT r.*
    INTO v_req
    FROM private.cashier_player_payout_requests AS r
    WHERE r.secret_code = v_code
    ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYOUT_NOT_FOUND';
    END IF;

    v_status := v_req.status;
    IF v_status = 'pending' AND v_req.expires_at <= pg_catalog.now() THEN
        v_status := 'expired';
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'player_public_id', v_req.player_public_id,
        'amount', v_req.amount,
        'currency', v_req.currency,
        'status', v_status,
        'expires_at', v_req.expires_at
    );
END;
$fn$;


-- ============================================================
-- 6. CASHIER PAYOUT CONFIRM
-- ============================================================

CREATE OR REPLACE FUNCTION public.cashier_confirm_player_payout(
    p_code TEXT,
    p_idempotency_key TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_code TEXT;
    v_key TEXT;
    v_req private.cashier_player_payout_requests%ROWTYPE;
    v_op RECORD;
    v_engine_key TEXT;
    v_result RECORD;
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

    v_code := lower(NULLIF(BTRIM(COALESCE(p_code, '')), ''));
    IF v_code IS NULL OR v_code !~ '^[0-9a-f]{16}$' THEN
        RAISE EXCEPTION 'PAYOUT_CODE_INVALID';
    END IF;

    v_key := private.owner_require_idempotency_key(p_idempotency_key);

    SELECT r.*
    INTO v_req
    FROM private.cashier_player_payout_requests AS r
    WHERE r.secret_code = v_code
      AND r.status = 'pending'
    FOR UPDATE;

    IF NOT FOUND THEN
        SELECT r.*
        INTO v_req
        FROM private.cashier_player_payout_requests AS r
        WHERE r.secret_code = v_code
        ORDER BY r.created_at DESC
        LIMIT 1
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'PAYOUT_NOT_FOUND';
        END IF;
    END IF;

    IF v_req.status = 'paid' THEN
        IF v_req.confirm_idempotency_key IS NOT DISTINCT FROM v_key
           AND v_req.paid_by_staff_auth_id IS NOT DISTINCT FROM v_ctx.auth_user_id THEN
            RETURN jsonb_build_object(
                'ok', true,
                'is_duplicate', true,
                'transfer_id', v_req.operational_transfer_id,
                'amount', v_req.amount,
                'currency', v_req.currency,
                'player_public_id', v_req.player_public_id,
                'payout_id', v_req.id,
                'status', 'paid'
            );
        END IF;
        RAISE EXCEPTION 'PAYOUT_ALREADY_PAID';
    END IF;

    IF v_req.status = 'cancelled' THEN
        RAISE EXCEPTION 'PAYOUT_CANCELLED';
    END IF;

    -- Already expired (committed earlier): raise, no mutation.
    IF v_req.status = 'expired' THEN
        RAISE EXCEPTION 'PAYOUT_EXPIRED';
    END IF;

    -- Pending but past expires_at: release in THIS statement and RETURN
    -- (do not RAISE — RAISE would roll back the WITHDRAWAL_RELEASE).
    IF v_req.status = 'pending' AND v_req.expires_at <= pg_catalog.now() THEN
        PERFORM private.expire_cashier_player_payout(v_req.id);
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'PAYOUT_EXPIRED',
            'status', 'expired',
            'payout_id', v_req.id,
            'is_duplicate', false
        );
    END IF;

    IF v_req.status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'PAYOUT_NOT_PENDING';
    END IF;

    IF v_req.currency IS DISTINCT FROM v_op.currency THEN
        RAISE EXCEPTION 'CURRENCY_MISMATCH';
    END IF;

    v_engine_key := 'cashier-payout:' || v_req.id::TEXT;

    SELECT e.transfer_id, e.is_duplicate, e.from_balance_after, e.to_balance_after, e.player_balance_after
    INTO v_result
    FROM private.apply_operational_transfer(
        'PLAYER_TO_CASHIER',
        v_req.amount,
        v_op.currency,
        v_engine_key,
        NULL,
        v_op.account_id,
        v_req.wallet_id,
        v_ctx.auth_user_id,
        'cashier',
        jsonb_build_object(
            'payout_id', v_req.id,
            'player_public_id', v_req.player_public_id
        )
    ) AS e;

    UPDATE private.cashier_player_payout_requests
    SET
        status = 'paid',
        paid_at = pg_catalog.now(),
        paid_by_legacy_cashier_id = v_ctx.legacy_cashier_id,
        paid_by_staff_auth_id = v_ctx.auth_user_id,
        operational_transfer_id = v_result.transfer_id,
        confirm_idempotency_key = v_key
    WHERE id = v_req.id
      AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYOUT_ALREADY_PAID';
    END IF;

    PERFORM private.cashier_revalidate_legacy_cashier(
        v_ctx.legacy_cashier_id,
        v_ctx.network_id
    );

    IF v_result.is_duplicate IS NOT TRUE THEN
        PERFORM private.append_staff_audit(
            'CASHIER_PAID_PLAYER',
            'player',
            v_req.player_public_id,
            'cashier_self',
            jsonb_build_object(
                'transfer_id', v_result.transfer_id,
                'payout_id', v_req.id,
                'amount', v_req.amount,
                'currency', v_op.currency,
                'player_public_id', v_req.player_public_id
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'is_duplicate', v_result.is_duplicate,
        'transfer_id', v_result.transfer_id,
        'amount', v_req.amount,
        'currency', v_op.currency,
        'cashier_balance_after', v_result.to_balance_after,
        'player_balance_after', v_result.player_balance_after,
        'player_public_id', v_req.player_public_id,
        'payout_id', v_req.id,
        'status', 'paid'
    );
END;
$fn$;


-- ============================================================
-- 7. GRANTS
-- ============================================================

REVOKE ALL ON FUNCTION public.player_request_cashier_payout(NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_request_cashier_payout(NUMERIC, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.player_request_cashier_payout(NUMERIC, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.player_cancel_cashier_payout(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_cancel_cashier_payout(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.player_cancel_cashier_payout(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.cashier_deposit_player(TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cashier_deposit_player(TEXT, NUMERIC, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.cashier_deposit_player(TEXT, NUMERIC, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.cashier_lookup_player_payout(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cashier_lookup_player_payout(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.cashier_lookup_player_payout(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.cashier_confirm_player_payout(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cashier_confirm_player_payout(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.cashier_confirm_player_payout(TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.cashier_deposit_to_player(UUID, TEXT, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cashier_deposit_to_player(UUID, TEXT, NUMERIC) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.cashier_payout_by_code(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cashier_payout_by_code(UUID, TEXT) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.cashier_lookup_payout_code(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cashier_lookup_payout_code(TEXT) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.player_create_cash_payout(NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_create_cash_payout(NUMERIC) FROM anon, authenticated;

COMMENT ON FUNCTION public.cashier_deposit_player(TEXT, NUMERIC, TEXT, TEXT) IS
'Cashier JWT CASHIER_TO_PLAYER. Identity from auth.uid() only. Own operational account must be active.';

COMMENT ON FUNCTION public.cashier_lookup_player_payout(TEXT) IS
'Cashier JWT read-only payout lookup by 16-hex CSPRNG code. Minimal fields. No money mutation.';

COMMENT ON FUNCTION public.cashier_confirm_player_payout(TEXT, TEXT) IS
'Cashier JWT PLAYER_TO_CASHIER confirm. Own ops active. Pending+past-due releases then returns PAYOUT_EXPIRED without RAISE so the release commits.';

COMMENT ON FUNCTION public.player_request_cashier_payout(NUMERIC, TEXT) IS
'Player JWT WITHDRAWAL_HOLD + globally unique 16-hex code. Same key+payload duplicates; same key different payload → IDEMPOTENCY_KEY_CONFLICT. Platform ops gate.';

COMMENT ON FUNCTION public.player_cancel_cashier_payout(UUID, TEXT) IS
'Player JWT cancel of own pending payout. WITHDRAWAL_RELEASE then cancelled. Exact retry duplicates. Foreign payout → PAYOUT_NOT_FOUND.';

COMMIT;
