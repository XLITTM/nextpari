BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 063
-- OWNER DIRECT CASHIER OPERATIONAL VISIBILITY
-- Sequence: after 062 (owner-native cashier list).
-- Created with `supabase migration new`; timestamp ordered after 062.
--
-- Repository only. DO NOT APPLY from this change.
-- Read-scope only. No money movement.
--
-- public.owner_list_cashiers() already authenticates as Owner.
-- Direct-owner cashiers (no manager binding) were missing from the
-- Owner UI operational map because that map was built from manager
-- details only. This read model adds canonical TMT operational
-- fields from private.operational_accounts for every cashier.
--
-- Does NOT change migration_state, available_balance, ledgers,
-- cashier float, staff binding, or manager binding.
-- Does NOT use public.cashiers.float_balance as canonical authority.
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
            ) AS manager_id,
            op.available_balance AS operational_balance,
            op.status AS operational_status,
            op.migration_state AS operational_migration_state,
            op.currency AS operational_currency
        FROM public.cashiers AS c
        LEFT JOIN private.operational_accounts AS op
            ON op.account_type = 'cashier'
           AND op.legacy_cashier_id = c.id
           AND op.network_id IS NOT DISTINCT FROM c.network_id
           AND op.currency = 'TMTM'
    ) x;

    RETURN result;
END;
$fn$;

COMMENT ON FUNCTION public.owner_list_cashiers() IS
'Owner JWT read of all cashiers plus canonical TMT operational fields from private.operational_accounts. Authenticates via private.get_current_owner_context(). Read-only. Does not activate cashiers or move money.';

REVOKE ALL ON FUNCTION public.owner_list_cashiers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_list_cashiers() FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_list_cashiers() TO authenticated;

COMMIT;
