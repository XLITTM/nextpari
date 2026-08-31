BEGIN;

-- ============================================================
-- NEXTPARI PHASE 022A
-- CANONICAL MANAGER OPERATIONAL FINANCE API
-- Sequence: 020 (after 019 staff auth binding).
--
-- Manager JWT
--      → public.manager_operational_overview()
--      → public.manager_fund_cashier(...)
--      → public.manager_collect_cashier(uuid, numeric, text, text)
--      → public.manager_list_operational_transfers(...)
--      → private.get_current_manager_context()  (auth.uid())
--      → private.apply_operational_transfer(...)
--
-- Actor, network, and operational account UUIDs are NEVER
-- accepted from the browser.
--
-- Canonical collect is the 4-argument overload:
--   public.manager_collect_cashier(uuid, numeric, text, text)
-- Legacy 3-argument function stays revoked for authenticated:
--   public.manager_collect_cashier(uuid, uuid, numeric)
-- This file does NOT GRANT the legacy signature.
--
-- Does NOT change migration_state (accounts stay staging).
-- Mutation RPCs currently fail:
--   OPERATIONAL_ACCOUNT_NOT_ACTIVE
-- Read RPC works.
--
-- Does NOT call manager_topup_cashier / legacy collect /
--   manager_create_cashier / manager_adjust_player_balance /
--   manager_settle_bet.
-- Does NOT move money while accounts are staging.
-- ============================================================


-- ============================================================
-- 1. PRIVATE MANAGER GATE
-- ============================================================

CREATE OR REPLACE FUNCTION private.get_current_manager_context()
RETURNS TABLE (
    auth_user_id UUID,
    role TEXT,
    status TEXT,
    display_name TEXT,
    network_id UUID,
    legacy_manager_account_id UUID,
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

    IF v_row.role IS DISTINCT FROM 'manager' THEN
        RAISE EXCEPTION 'MANAGER_REQUIRED';
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

    IF v_row.legacy_manager_account_id IS NULL THEN
        RAISE EXCEPTION 'LEGACY_MANAGER_ID_REQUIRED';
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
        v_row.legacy_manager_account_id,
        v_row.legacy_cashier_id;
END;
$fn$;

REVOKE ALL ON FUNCTION private.get_current_manager_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.get_current_manager_context() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_current_manager_context() TO service_role;


CREATE OR REPLACE FUNCTION private.manager_require_idempotency_key(p_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_key TEXT;
BEGIN
    v_key := NULLIF(BTRIM(COALESCE(p_key, '')), '');
    IF v_key IS NULL THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
    END IF;
    IF char_length(v_key) > 250 THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_TOO_LONG';
    END IF;
    RETURN v_key;
END;
$fn$;

REVOKE ALL ON FUNCTION private.manager_require_idempotency_key(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.manager_require_idempotency_key(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.manager_require_idempotency_key(TEXT) TO service_role;


-- Own-network cashier only. Missing and foreign cashiers share
-- CASHIER_NOT_FOUND so existence of another network is not leaked.
CREATE OR REPLACE FUNCTION private.manager_resolve_own_cashier(
    p_cashier_id UUID,
    p_network_id UUID,
    p_require_active BOOLEAN
)
RETURNS TABLE (
    cashier_id UUID,
    op_account_id UUID,
    currency TEXT
)
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_cashier RECORD;
    v_op RECORD;
BEGIN
    IF p_cashier_id IS NULL THEN
        RAISE EXCEPTION 'CASHIER_ID_REQUIRED';
    END IF;
    IF p_network_id IS NULL THEN
        RAISE EXCEPTION 'NETWORK_ID_REQUIRED';
    END IF;

    SELECT c.id, c.is_active, c.network_id
    INTO v_cashier
    FROM public.cashiers AS c
    WHERE c.id = p_cashier_id
      AND c.network_id IS NOT DISTINCT FROM p_network_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CASHIER_NOT_FOUND';
    END IF;

    IF p_require_active AND v_cashier.is_active IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'CASHIER_NOT_ACTIVE';
    END IF;

    SELECT a.id, a.currency
    INTO v_op
    FROM private.operational_accounts AS a
    WHERE a.account_type = 'cashier'
      AND a.legacy_cashier_id = p_cashier_id
      AND a.network_id IS NOT DISTINCT FROM p_network_id;

    IF v_op.id IS NULL THEN
        RAISE EXCEPTION 'CASHIER_NOT_FOUND';
    END IF;

    RETURN QUERY
    SELECT v_cashier.id, v_op.id, v_op.currency;
END;
$fn$;

REVOKE ALL ON FUNCTION private.manager_resolve_own_cashier(UUID, UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.manager_resolve_own_cashier(UUID, UUID, BOOLEAN) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.manager_resolve_own_cashier(UUID, UUID, BOOLEAN) TO service_role;


-- Post-engine cashier lock. Called AFTER apply_operational_transfer
-- so the engine's operational-account lock order is not inverted.
CREATE OR REPLACE FUNCTION private.manager_revalidate_own_cashier(
    p_cashier_id UUID,
    p_network_id UUID,
    p_require_active BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_cashier RECORD;
BEGIN
    IF p_cashier_id IS NULL THEN
        RAISE EXCEPTION 'CASHIER_ID_REQUIRED';
    END IF;
    IF p_network_id IS NULL THEN
        RAISE EXCEPTION 'NETWORK_ID_REQUIRED';
    END IF;

    SELECT c.id, c.is_active, c.network_id
    INTO v_cashier
    FROM public.cashiers AS c
    WHERE c.id = p_cashier_id
      AND c.network_id IS NOT DISTINCT FROM p_network_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CASHIER_NOT_FOUND';
    END IF;

    IF p_require_active AND v_cashier.is_active IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'CASHIER_NOT_ACTIVE';
    END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION private.manager_revalidate_own_cashier(UUID, UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.manager_revalidate_own_cashier(UUID, UUID, BOOLEAN) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.manager_revalidate_own_cashier(UUID, UUID, BOOLEAN) TO service_role;


CREATE OR REPLACE FUNCTION private.manager_resolve_own_manager_account(
    p_legacy_manager_id UUID,
    p_network_id UUID,
    p_currency TEXT
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_id UUID;
BEGIN
    SELECT a.id
    INTO v_id
    FROM private.operational_accounts AS a
    WHERE a.account_type = 'manager'
      AND a.legacy_manager_account_id = p_legacy_manager_id
      AND a.network_id IS NOT DISTINCT FROM p_network_id
      AND a.currency = p_currency;

    IF v_id IS NULL THEN
        RAISE EXCEPTION 'MANAGER_OPERATIONAL_ACCOUNT_NOT_FOUND';
    END IF;

    RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION private.manager_resolve_own_manager_account(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.manager_resolve_own_manager_account(UUID, UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.manager_resolve_own_manager_account(UUID, UUID, TEXT) TO service_role;


-- ============================================================
-- 2. manager_operational_overview
-- ============================================================

CREATE OR REPLACE FUNCTION public.manager_operational_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_manager jsonb;
    v_cashiers jsonb;
BEGIN
    SELECT
        m.auth_user_id,
        m.network_id,
        m.legacy_manager_account_id
    INTO v_ctx
    FROM private.get_current_manager_context() AS m;

    SELECT jsonb_build_object(
        'id', a.id,
        'currency', a.currency,
        'available_balance', a.available_balance,
        'status', a.status,
        'migration_state', a.migration_state,
        'version', a.version
    )
    INTO v_manager
    FROM private.operational_accounts AS a
    WHERE a.account_type = 'manager'
      AND a.legacy_manager_account_id = v_ctx.legacy_manager_account_id
      AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
    ORDER BY CASE WHEN a.currency = 'TMTM' THEN 0 ELSE 1 END, a.created_at ASC
    LIMIT 1;

    IF v_manager IS NULL THEN
        RAISE EXCEPTION 'MANAGER_OPERATIONAL_ACCOUNT_NOT_FOUND';
    END IF;

    SELECT COALESCE(jsonb_agg(row_json ORDER BY login ASC, cashier_id ASC), '[]'::jsonb)
    INTO v_cashiers
    FROM (
        SELECT
            c.login,
            c.id AS cashier_id,
            jsonb_build_object(
                'cashier_id', c.id,
                'login', c.login,
                'full_name', c.full_name,
                'available_balance', a.available_balance,
                'status', a.status,
                'migration_state', a.migration_state,
                'legacy_float_balance', ROUND(COALESCE(c.float_balance, 0), 2)
            ) AS row_json
        FROM public.cashiers AS c
        INNER JOIN private.operational_accounts AS a
            ON a.account_type = 'cashier'
           AND a.legacy_cashier_id = c.id
           AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
           AND a.currency = (v_manager ->> 'currency')
        WHERE c.network_id IS NOT DISTINCT FROM v_ctx.network_id
    ) AS x;

    RETURN jsonb_build_object(
        'manager', v_manager,
        'cashiers', COALESCE(v_cashiers, '[]'::jsonb),
        'activation_pending', (v_manager ->> 'migration_state') IS DISTINCT FROM 'active'
    );
END;
$fn$;


-- ============================================================
-- 3. manager_list_operational_transfers
-- ============================================================

CREATE OR REPLACE FUNCTION public.manager_list_operational_transfers(
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_limit INTEGER;
    v_offset INTEGER;
    v_manager_account UUID;
    v_total INTEGER;
    v_rows jsonb;
BEGIN
    SELECT
        m.network_id,
        m.legacy_manager_account_id
    INTO v_ctx
    FROM private.get_current_manager_context() AS m;

    v_limit := private.owner_require_limit(p_limit, 100);
    v_offset := private.owner_require_offset(p_offset);

    SELECT a.id
    INTO v_manager_account
    FROM private.operational_accounts AS a
    WHERE a.account_type = 'manager'
      AND a.legacy_manager_account_id = v_ctx.legacy_manager_account_id
      AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
    ORDER BY CASE WHEN a.currency = 'TMTM' THEN 0 ELSE 1 END, a.created_at ASC
    LIMIT 1;

    IF v_manager_account IS NULL THEN
        RAISE EXCEPTION 'MANAGER_OPERATIONAL_ACCOUNT_NOT_FOUND';
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_total
    FROM private.operational_transfers AS t
    WHERE t.network_id IS NOT DISTINCT FROM v_ctx.network_id
      AND (
          t.from_account_id = v_manager_account
          OR t.to_account_id = v_manager_account
          OR t.from_account_id IN (
              SELECT a.id
              FROM private.operational_accounts AS a
              WHERE a.account_type = 'cashier'
                AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
          )
          OR t.to_account_id IN (
              SELECT a.id
              FROM private.operational_accounts AS a
              WHERE a.account_type = 'cashier'
                AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
          )
      );

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', t.id,
            'transfer_no', t.transfer_no,
            'transfer_type', t.transfer_type,
            'currency', t.currency,
            'amount', t.amount,
            'from_account_id', t.from_account_id,
            'to_account_id', t.to_account_id,
            'network_id', t.network_id,
            'actor_role', t.actor_role,
            'created_at', t.created_at
        )
    ), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT
            x.id,
            x.transfer_no,
            x.transfer_type,
            x.currency,
            x.amount,
            x.from_account_id,
            x.to_account_id,
            x.network_id,
            x.actor_role,
            x.created_at
        FROM private.operational_transfers AS x
        WHERE x.network_id IS NOT DISTINCT FROM v_ctx.network_id
          AND (
              x.from_account_id = v_manager_account
              OR x.to_account_id = v_manager_account
              OR x.from_account_id IN (
                  SELECT a.id
                  FROM private.operational_accounts AS a
                  WHERE a.account_type = 'cashier'
                    AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
              )
              OR x.to_account_id IN (
                  SELECT a.id
                  FROM private.operational_accounts AS a
                  WHERE a.account_type = 'cashier'
                    AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
              )
          )
        ORDER BY x.created_at DESC, x.transfer_no DESC
        LIMIT v_limit
        OFFSET v_offset
    ) AS t;

    RETURN jsonb_build_object(
        'rows', COALESCE(v_rows, '[]'::jsonb),
        'total', COALESCE(v_total, 0),
        'limit', v_limit,
        'offset', v_offset
    );
END;
$fn$;


-- ============================================================
-- 4. manager_fund_cashier  (MANAGER_TO_CASHIER)
-- ============================================================

CREATE OR REPLACE FUNCTION public.manager_fund_cashier(
    p_cashier_id UUID,
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
    v_cashier RECORD;
    v_manager_account UUID;
    v_result RECORD;
BEGIN
    IF p_cashier_id IS NULL THEN
        RAISE EXCEPTION 'CASHIER_ID_REQUIRED';
    END IF;
    IF p_amount IS NULL THEN
        RAISE EXCEPTION 'AMOUNT_REQUIRED';
    END IF;

    SELECT
        m.auth_user_id,
        m.role,
        m.network_id,
        m.legacy_manager_account_id
    INTO v_ctx
    FROM private.get_current_manager_context() AS m;

    v_key := private.manager_require_idempotency_key(p_idempotency_key);
    v_note := private.owner_trim_reason(p_note);

    SELECT r.cashier_id, r.op_account_id, r.currency
    INTO v_cashier
    FROM private.manager_resolve_own_cashier(p_cashier_id, v_ctx.network_id, TRUE) AS r;

    v_manager_account := private.manager_resolve_own_manager_account(
        v_ctx.legacy_manager_account_id,
        v_ctx.network_id,
        v_cashier.currency
    );

    SELECT e.transfer_id, e.is_duplicate, e.from_balance_after, e.to_balance_after, e.player_balance_after
    INTO v_result
    FROM private.apply_operational_transfer(
        'MANAGER_TO_CASHIER',
        p_amount,
        v_cashier.currency,
        v_key,
        v_manager_account,
        v_cashier.op_account_id,
        NULL,
        v_ctx.auth_user_id,
        'manager',
        jsonb_build_object(
            'cashier_id', v_cashier.cashier_id,
            'note', v_note
        )
    ) AS e;

    PERFORM private.manager_revalidate_own_cashier(
        v_cashier.cashier_id,
        v_ctx.network_id,
        TRUE
    );

    IF v_result.is_duplicate IS NOT TRUE THEN
        PERFORM private.append_staff_audit(
            'MANAGER_FUNDED_CASHIER',
            'cashier',
            v_cashier.cashier_id::TEXT,
            'manager_scope',
            jsonb_build_object(
                'transfer_id', v_result.transfer_id,
                'amount', p_amount,
                'currency', v_cashier.currency,
                'cashier_id', v_cashier.cashier_id,
                'network_id', v_ctx.network_id
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'transfer_id', v_result.transfer_id,
        'is_duplicate', v_result.is_duplicate,
        'amount', p_amount,
        'currency', v_cashier.currency,
        'from_balance_after', v_result.from_balance_after,
        'to_balance_after', v_result.to_balance_after,
        'cashier_id', v_cashier.cashier_id
    );
END;
$fn$;


-- ============================================================
-- 5. manager_collect_cashier  (CASHIER_TO_MANAGER)
-- Canonical 4-arg overload. Does not replace or GRANT the
-- legacy manager_collect_cashier(uuid, uuid, numeric).
-- ============================================================

CREATE OR REPLACE FUNCTION public.manager_collect_cashier(
    p_cashier_id UUID,
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
    v_cashier RECORD;
    v_manager_account UUID;
    v_result RECORD;
BEGIN
    IF p_cashier_id IS NULL THEN
        RAISE EXCEPTION 'CASHIER_ID_REQUIRED';
    END IF;
    IF p_amount IS NULL THEN
        RAISE EXCEPTION 'AMOUNT_REQUIRED';
    END IF;

    SELECT
        m.auth_user_id,
        m.role,
        m.network_id,
        m.legacy_manager_account_id
    INTO v_ctx
    FROM private.get_current_manager_context() AS m;

    v_key := private.manager_require_idempotency_key(p_idempotency_key);
    v_note := private.owner_trim_reason(p_note);

    SELECT r.cashier_id, r.op_account_id, r.currency
    INTO v_cashier
    FROM private.manager_resolve_own_cashier(p_cashier_id, v_ctx.network_id, TRUE) AS r;

    v_manager_account := private.manager_resolve_own_manager_account(
        v_ctx.legacy_manager_account_id,
        v_ctx.network_id,
        v_cashier.currency
    );

    SELECT e.transfer_id, e.is_duplicate, e.from_balance_after, e.to_balance_after, e.player_balance_after
    INTO v_result
    FROM private.apply_operational_transfer(
        'CASHIER_TO_MANAGER',
        p_amount,
        v_cashier.currency,
        v_key,
        v_cashier.op_account_id,
        v_manager_account,
        NULL,
        v_ctx.auth_user_id,
        'manager',
        jsonb_build_object(
            'cashier_id', v_cashier.cashier_id,
            'note', v_note
        )
    ) AS e;

    PERFORM private.manager_revalidate_own_cashier(
        v_cashier.cashier_id,
        v_ctx.network_id,
        TRUE
    );

    IF v_result.is_duplicate IS NOT TRUE THEN
        PERFORM private.append_staff_audit(
            'MANAGER_COLLECTED_CASHIER',
            'cashier',
            v_cashier.cashier_id::TEXT,
            'manager_scope',
            jsonb_build_object(
                'transfer_id', v_result.transfer_id,
                'amount', p_amount,
                'currency', v_cashier.currency,
                'cashier_id', v_cashier.cashier_id,
                'network_id', v_ctx.network_id
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'transfer_id', v_result.transfer_id,
        'is_duplicate', v_result.is_duplicate,
        'amount', p_amount,
        'currency', v_cashier.currency,
        'from_balance_after', v_result.from_balance_after,
        'to_balance_after', v_result.to_balance_after,
        'cashier_id', v_cashier.cashier_id
    );
END;
$fn$;


-- ============================================================
-- 6. GRANTS
-- Authenticated EXECUTE; body requires manager staff JWT.
-- Legacy manager_collect_cashier(uuid, uuid, numeric) is NOT granted.
-- ============================================================

REVOKE ALL ON FUNCTION public.manager_operational_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_operational_overview() FROM anon;
GRANT EXECUTE ON FUNCTION public.manager_operational_overview() TO authenticated;

REVOKE ALL ON FUNCTION public.manager_list_operational_transfers(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_list_operational_transfers(INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.manager_list_operational_transfers(INTEGER, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.manager_fund_cashier(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_fund_cashier(UUID, NUMERIC, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.manager_fund_cashier(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.manager_collect_cashier(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_collect_cashier(UUID, NUMERIC, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.manager_collect_cashier(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.manager_collect_cashier(UUID, UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_collect_cashier(UUID, UUID, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION public.manager_collect_cashier(UUID, UUID, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.manager_collect_cashier(UUID, UUID, NUMERIC) TO service_role;

REVOKE ALL ON FUNCTION public.manager_topup_cashier(UUID, UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_topup_cashier(UUID, UUID, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION public.manager_topup_cashier(UUID, UUID, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.manager_topup_cashier(UUID, UUID, NUMERIC) TO service_role;


COMMENT ON FUNCTION private.get_current_manager_context() IS
'JWT manager gate. Locks private.staff_accounts FOR UPDATE by auth.uid(), then validates role/status/network/legacy id from the locked row. VOLATILE. No browser EXECUTE.';

COMMENT ON FUNCTION public.manager_operational_overview() IS
'Manager-only JWT operational snapshot for own network. Canonical balances from operational_accounts. legacy_float_balance is diagnostic only. Does not change migration_state.';

COMMENT ON FUNCTION public.manager_list_operational_transfers(INTEGER, INTEGER) IS
'Manager-only JWT operational transfer list for own network and own manager/cashier accounts. Does not return metadata.';

COMMENT ON FUNCTION public.manager_fund_cashier(UUID, NUMERIC, TEXT, TEXT) IS
'Manager-only JWT MANAGER_TO_CASHIER via apply_operational_transfer. Staging accounts raise OPERATIONAL_ACCOUNT_NOT_ACTIVE. Audit MANAGER_FUNDED_CASHIER on new transfer only.';

COMMENT ON FUNCTION public.manager_collect_cashier(UUID, NUMERIC, TEXT, TEXT) IS
'Canonical Manager-only JWT CASHIER_TO_MANAGER via apply_operational_transfer. Distinct from legacy manager_collect_cashier(uuid, uuid, numeric). Staging raises OPERATIONAL_ACCOUNT_NOT_ACTIVE. Audit MANAGER_COLLECTED_CASHIER on new transfer only.';

COMMIT;
