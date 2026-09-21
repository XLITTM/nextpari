BEGIN;

-- ============================================================
-- NEXTPARI PHASE 071
-- Staff logout revokes the current Supabase session, and
-- privileged staff SQL rejects that session's old access JWT.
-- Repository-only. NOT applied by this change.
--
-- Does NOT edit auth.sessions.
-- Does NOT use global sign-out.
-- Does NOT implement step-up authentication.
-- Does NOT implement distributed request throttling.
-- Does NOT rewrite downstream staff RPCs.
-- Does NOT enable sports betting.
-- ============================================================

CREATE OR REPLACE FUNCTION private.staff_require_live_auth_session()
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

    IF NOT EXISTS (
        SELECT 1
        FROM auth.sessions AS s
        WHERE s.id = v_session
          AND s.user_id = v_uid
    ) THEN
        RAISE EXCEPTION 'SESSION_EXPIRED';
    END IF;

    RETURN v_uid;
END;
$fn$;

REVOKE ALL ON FUNCTION private.staff_require_live_auth_session() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.staff_require_live_auth_session() FROM anon, authenticated;

-- Shared owner/manager/cashier binding gate used by
-- public.current_staff_binding_context().
CREATE OR REPLACE FUNCTION private.get_current_staff_context()
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
    v_uid := private.staff_require_live_auth_session();

    SELECT s.*
    INTO v_row
    FROM private.staff_accounts AS s
    WHERE s.auth_user_id = v_uid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'STAFF_ACCOUNT_NOT_FOUND';
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

REVOKE ALL ON FUNCTION private.get_current_staff_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.get_current_staff_context() FROM anon, authenticated;

-- Owner RPCs read o.auth_user_id from this helper. Its previous body is
-- not stored in the repository. The return shape matches the staff
-- binding context, which is the only in-repo contract that selects
-- these columns. Role and status stay database checks.
CREATE OR REPLACE FUNCTION private.get_current_owner_context()
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
    v_uid := private.staff_require_live_auth_session();

    SELECT s.*
    INTO v_row
    FROM private.staff_accounts AS s
    WHERE s.auth_user_id = v_uid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'STAFF_ACCOUNT_NOT_FOUND';
    END IF;
    IF v_row.role IS DISTINCT FROM 'owner' THEN
        RAISE EXCEPTION 'OWNER_REQUIRED';
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

REVOKE ALL ON FUNCTION private.get_current_owner_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.get_current_owner_context() FROM anon, authenticated;

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
    v_uid := private.staff_require_live_auth_session();

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
    v_uid := private.staff_require_live_auth_session();

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
    v_uid := private.staff_require_live_auth_session();

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

CREATE OR REPLACE FUNCTION private.get_current_security_context()
RETURNS TABLE (
    auth_user_id UUID,
    role TEXT,
    status TEXT,
    display_name TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_row RECORD;
BEGIN
    v_uid := private.staff_require_live_auth_session();

    SELECT
        s.auth_user_id,
        s.role,
        s.status,
        s.display_name
    INTO v_row
    FROM private.staff_accounts AS s
    WHERE s.auth_user_id = v_uid
    LIMIT 1;

    IF v_row.auth_user_id IS NULL THEN
        RAISE EXCEPTION 'STAFF_ACCOUNT_NOT_FOUND';
    END IF;
    IF v_row.role IS DISTINCT FROM 'security' THEN
        RAISE EXCEPTION 'SECURITY_REQUIRED';
    END IF;
    IF v_row.status = 'blocked' THEN
        RAISE EXCEPTION 'STAFF_ACCOUNT_BLOCKED';
    END IF;
    IF v_row.status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'STAFF_ACCOUNT_DISABLED';
    END IF;

    UPDATE private.staff_accounts
    SET last_seen_at = pg_catalog.now()
    WHERE private.staff_accounts.auth_user_id = v_uid
      AND private.staff_accounts.role = 'security';

    auth_user_id := v_row.auth_user_id;
    role := v_row.role;
    status := v_row.status;
    display_name := v_row.display_name;
    RETURN NEXT;
END;
$fn$;

COMMIT;
