BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 062
-- OWNER-NATIVE CASHIER LIST (ВСЕ КАССЫ)
-- Sequence: after 061 (BetConstruct wallet core).
--
-- Repository only. DO NOT APPLY from this change.
-- Read-scope only. No money movement.
--
-- public.owner_list_cashiers() previously obtained Owner context
-- and then called public.manager_list_cashiers(v_legacy).
-- That public manager RPC uses private.assert_live_manager_self_binding()
-- → private.get_current_manager_context(), which requires role='manager'
-- and raises MANAGER_REQUIRED for an Owner JWT.
--
-- This migration replaces owner_list_cashiers with an Owner-native
-- read that authenticates via private.get_current_owner_context()
-- and selects cashiers directly.
--
-- public.manager_list_cashiers() is unchanged.
-- private.assert_live_manager_self_binding() is unchanged.
-- private.get_current_manager_context() is unchanged.
-- ============================================================


CREATE OR REPLACE FUNCTION public.owner_list_cashiers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    result jsonb;
BEGIN
    PERFORM private.get_current_owner_context();

    SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.full_name), '[]'::jsonb)
    INTO result
    FROM (
        SELECT
            c.id,
            c.login,
            c.full_name,
            c.city,
            c.point_name,
            c.float_balance,
            c.commission_earned,
            c.commission_rate,
            c.is_active,
            c.network_id,
            c.created_at,
            (
                SELECT m.id
                FROM public.manager_accounts AS m
                WHERE m.role = 'manager'
                  AND m.network_id IS NOT DISTINCT FROM c.network_id
                ORDER BY m.is_active DESC, m.created_at ASC, m.id ASC
                LIMIT 1
            ) AS manager_id
        FROM public.cashiers AS c
    ) x;

    RETURN result;
END;
$fn$;

COMMENT ON FUNCTION public.owner_list_cashiers() IS
'Owner JWT read of all cashiers in the Owner operational hierarchy. Authenticates via private.get_current_owner_context(). Does not call manager_list_cashiers or require a Manager session. Read-only.';

REVOKE ALL ON FUNCTION public.owner_list_cashiers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_list_cashiers() FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_list_cashiers() TO authenticated;

COMMIT;
