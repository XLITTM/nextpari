BEGIN;

-- ============================================================
-- NEXTPARI PHASE 023A.1
-- FULL CANONICAL STAFF BINDING CONTEXT
-- Sequence: 021 (after 020 manager operational finance).
--
-- public.current_staff_context() is UNCHANGED.
-- Postgres cannot safely add OUT columns with CREATE OR REPLACE.
-- Other callers still depend on that 5-column row type.
--
-- New server-auth RPC:
--   public.current_staff_binding_context()
--     → private.get_current_staff_context()  (auth.uid())
--
-- Returns the existing public fields PLUS:
--   legacy_manager_account_id
--   legacy_cashier_id
--
-- No identity parameters. No browser-supplied user/staff IDs.
-- Does NOT GRANT private.staff_accounts to the browser.
-- Does NOT change migration_state.
-- Does NOT move money.
-- Does NOT activate operational accounts.
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_staff_binding_context()
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
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    RETURN QUERY
    SELECT
        c.auth_user_id,
        c.role,
        c.status,
        c.display_name,
        c.network_id,
        c.legacy_manager_account_id,
        c.legacy_cashier_id
    FROM private.get_current_staff_context() AS c;
END;
$fn$;

REVOKE ALL ON FUNCTION public.current_staff_binding_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_staff_binding_context() FROM anon;
REVOKE ALL ON FUNCTION public.current_staff_binding_context() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.current_staff_binding_context() TO authenticated;

COMMENT ON FUNCTION public.current_staff_binding_context() IS
'Authenticated canonical staff binding context for the JWT subject. Includes legacy_manager_account_id and legacy_cashier_id. Authority is auth.uid() via private.get_current_staff_context(). No identity parameters. GRANT authenticated. REVOKE anon. Does not replace public.current_staff_context().';

COMMIT;
