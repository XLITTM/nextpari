BEGIN;

-- ============================================================
-- NEXTPARI PHASE 023B
-- CASHIER OPERATIONAL READ API
-- Sequence: 022 (after 021 staff binding context).
--
-- Cashier JWT
--      → public.cashier_operational_overview()
--      → public.cashier_list_operational_transfers(...)
--      → private.get_current_cashier_context()  (auth.uid())
--
-- Read-only. Canonical balance is
-- private.operational_accounts.available_balance.
-- public.cashiers.float_balance is diagnostic only.
--
-- Actor / cashier / network IDs are NEVER accepted as arguments.
-- Does NOT change migration_state.
-- Does NOT mutate operational transfers.
-- Does NOT enable deposit/payout.
-- Does NOT GRANT private tables to the browser.
-- ============================================================


-- ============================================================
-- 1. PRIVATE CASHIER GATE (read-only, no money-row locks)
-- ============================================================

CREATE OR REPLACE FUNCTION private.get_current_cashier_context()
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
    WHERE s.auth_user_id = v_uid;

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

REVOKE ALL ON FUNCTION private.get_current_cashier_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.get_current_cashier_context() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_current_cashier_context() TO service_role;


-- ============================================================
-- 2. cashier_operational_overview
-- ============================================================

CREATE OR REPLACE FUNCTION public.cashier_operational_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_cashier RECORD;
    v_op RECORD;
BEGIN
    SELECT
        c.auth_user_id,
        c.network_id,
        c.legacy_cashier_id,
        c.display_name
    INTO v_ctx
    FROM private.get_current_cashier_context() AS c;

    SELECT
        x.id,
        x.login,
        x.full_name,
        x.point_name,
        x.city,
        x.network_id,
        ROUND(COALESCE(x.float_balance, 0), 2) AS legacy_float
    INTO v_cashier
    FROM public.cashiers AS x
    WHERE x.id = v_ctx.legacy_cashier_id
      AND x.network_id IS NOT DISTINCT FROM v_ctx.network_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CASHIER_NOT_FOUND';
    END IF;

    SELECT
        a.id,
        a.currency,
        a.available_balance,
        a.status,
        a.migration_state,
        a.version
    INTO v_op
    FROM private.operational_accounts AS a
    WHERE a.account_type = 'cashier'
      AND a.legacy_cashier_id = v_ctx.legacy_cashier_id
      AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
    ORDER BY CASE WHEN a.currency = 'TMTM' THEN 0 ELSE 1 END, a.created_at ASC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CASHIER_OPERATIONAL_ACCOUNT_NOT_FOUND';
    END IF;

    RETURN jsonb_build_object(
        'cashier', jsonb_build_object(
            'cashier_id', v_cashier.id,
            'login', v_cashier.login,
            'full_name', v_cashier.full_name,
            'point_name', v_cashier.point_name,
            'city', v_cashier.city,
            'network_id', v_cashier.network_id
        ),
        'operational', jsonb_build_object(
            'account_id', v_op.id,
            'currency', v_op.currency,
            'available_balance', v_op.available_balance,
            'status', v_op.status,
            'migration_state', v_op.migration_state,
            'version', v_op.version,
            'legacy_float_diagnostic', v_cashier.legacy_float
        ),
        'activation_pending', v_op.migration_state IS DISTINCT FROM 'active'
    );
END;
$fn$;


-- ============================================================
-- 3. cashier_list_operational_transfers
-- Own canonical operational account only.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cashier_list_operational_transfers(
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
    v_account UUID;
    v_total INTEGER;
    v_rows jsonb;
BEGIN
    SELECT
        c.network_id,
        c.legacy_cashier_id
    INTO v_ctx
    FROM private.get_current_cashier_context() AS c;

    v_limit := private.owner_require_limit(p_limit, 100);
    v_offset := private.owner_require_offset(p_offset);

    SELECT a.id
    INTO v_account
    FROM private.operational_accounts AS a
    WHERE a.account_type = 'cashier'
      AND a.legacy_cashier_id = v_ctx.legacy_cashier_id
      AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
    ORDER BY CASE WHEN a.currency = 'TMTM' THEN 0 ELSE 1 END, a.created_at ASC
    LIMIT 1;

    IF v_account IS NULL THEN
        RAISE EXCEPTION 'CASHIER_OPERATIONAL_ACCOUNT_NOT_FOUND';
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_total
    FROM private.operational_transfers AS t
    WHERE t.from_account_id = v_account
       OR t.to_account_id = v_account;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', t.id,
            'transfer_no', t.transfer_no,
            'transfer_type', t.transfer_type,
            'currency', t.currency,
            'amount', t.amount,
            'from_account_id', t.from_account_id,
            'to_account_id', t.to_account_id,
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
            x.actor_role,
            x.created_at
        FROM private.operational_transfers AS x
        WHERE x.from_account_id = v_account
           OR x.to_account_id = v_account
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
-- 4. GRANTS
-- ============================================================

REVOKE ALL ON FUNCTION public.cashier_operational_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cashier_operational_overview() FROM anon;
GRANT EXECUTE ON FUNCTION public.cashier_operational_overview() TO authenticated;

REVOKE ALL ON FUNCTION public.cashier_list_operational_transfers(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cashier_list_operational_transfers(INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.cashier_list_operational_transfers(INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION private.get_current_cashier_context() IS
'Resolves active cashier staff from auth.uid(). Requires role=cashier, status=active, network_id, legacy_cashier_id. Read-only: no money-row locks. No identity parameters. No browser EXECUTE.';

COMMENT ON FUNCTION public.cashier_operational_overview() IS
'Cashier JWT operational snapshot for the subject only. Canonical available_balance from operational_accounts. legacy_float_diagnostic is not authority. Does not change migration_state.';

COMMENT ON FUNCTION public.cashier_list_operational_transfers(INTEGER, INTEGER) IS
'Cashier JWT transfer history for the subject operational account only (from_account_id OR to_account_id). No extra payload fields. No other cashiers.';

COMMIT;
