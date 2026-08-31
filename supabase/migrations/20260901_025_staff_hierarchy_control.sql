BEGIN;

-- ============================================================
-- NEXTPARI PHASE 025
-- STAFF HIERARCHY CONTROL
--
-- Owner JWT
--   → public.owner_list_managers()
--   → public.owner_manager_detail(p_manager_id)
--   → public.owner_provision_manager(p_auth_user_id, ...)
--
-- Manager JWT
--   → public.manager_provision_cashier(p_auth_user_id, ...)
--
-- Auth Admin createUser happens ONLY in the trusted BFF.
-- These RPCs accept a pre-created auth.users.id and bind it.
-- Browser never supplies networkId / managerId / starting balance.
--
-- New operational accounts: 0 TMTM, status=active, migration_state=active.
-- No opening ledger. No money created by staff creation.
--
-- Does NOT GRANT legacy manager_create_cashier.
-- Does NOT restore PIN login.
-- Does NOT SET existing accounts' migration_state.
-- ============================================================


CREATE OR REPLACE FUNCTION private.staff_unusable_legacy_pin_hash()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
BEGIN
    RETURN extensions.crypt(
        pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'),
        extensions.gen_salt('bf')
    );
END;
$fn$;

REVOKE ALL ON FUNCTION private.staff_unusable_legacy_pin_hash() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.staff_unusable_legacy_pin_hash() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.staff_unusable_legacy_pin_hash() TO service_role;


CREATE OR REPLACE FUNCTION private.staff_normalize_login(p_login TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_login TEXT;
BEGIN
    v_login := lower(BTRIM(COALESCE(p_login, '')));
    IF v_login !~ '^[a-z0-9._-]{3,32}$' THEN
        RAISE EXCEPTION 'LOGIN_INVALID';
    END IF;
    RETURN v_login;
END;
$fn$;

REVOKE ALL ON FUNCTION private.staff_normalize_login(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.staff_normalize_login(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.staff_normalize_login(TEXT) TO service_role;


CREATE OR REPLACE FUNCTION private.staff_normalize_label(p_value TEXT, p_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_value TEXT;
BEGIN
    v_value := NULLIF(BTRIM(COALESCE(p_value, '')), '');
    IF v_value IS NULL OR char_length(v_value) > 120 THEN
        RAISE EXCEPTION '%', p_code;
    END IF;
    RETURN v_value;
END;
$fn$;

REVOKE ALL ON FUNCTION private.staff_normalize_label(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.staff_normalize_label(TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.staff_normalize_label(TEXT, TEXT) TO service_role;


CREATE OR REPLACE FUNCTION private.staff_assert_fresh_auth_user(p_auth_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.owner_require_bind_auth_user(p_auth_user_id);
    PERFORM private.owner_assert_not_player_auth(p_auth_user_id);

    IF EXISTS (
        SELECT 1
        FROM private.staff_accounts AS s
        WHERE s.auth_user_id = p_auth_user_id
    ) THEN
        RAISE EXCEPTION 'STAFF_AUTH_ALREADY_BOUND';
    END IF;

    RETURN p_auth_user_id;
END;
$fn$;

REVOKE ALL ON FUNCTION private.staff_assert_fresh_auth_user(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.staff_assert_fresh_auth_user(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.staff_assert_fresh_auth_user(UUID) TO service_role;


CREATE OR REPLACE FUNCTION private.staff_assert_login_available(p_login TEXT)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.manager_accounts AS m WHERE lower(m.login) = p_login
    ) OR EXISTS (
        SELECT 1 FROM public.cashiers AS c WHERE lower(c.login) = p_login
    ) THEN
        RAISE EXCEPTION 'LOGIN_TAKEN';
    END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION private.staff_assert_login_available(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.staff_assert_login_available(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.staff_assert_login_available(TEXT) TO service_role;


-- ============================================================
-- OWNER LIST / DETAIL
-- ============================================================

CREATE OR REPLACE FUNCTION public.owner_list_managers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_rows jsonb;
    v_total INTEGER;
BEGIN
    PERFORM private.get_current_owner_context();

    SELECT COALESCE(jsonb_agg(item ORDER BY item ->> 'login'), '[]'::jsonb), COUNT(*)::INTEGER
    INTO v_rows, v_total
    FROM (
        SELECT jsonb_build_object(
            'manager_id', m.id,
            'login', m.login,
            'full_name', m.full_name,
            'status', CASE
                WHEN s.status IS NOT NULL THEN s.status
                WHEN m.is_active IS TRUE THEN 'active'
                ELSE 'disabled'
            END,
            'is_active', m.is_active,
            'network_id', m.network_id,
            'network_name', m.network_name,
            'auth_user_id', s.auth_user_id,
            'auth_bound', s.auth_user_id IS NOT NULL,
            'operational_account_id', op.id,
            'operational_balance', COALESCE(op.available_balance, 0),
            'operational_status', op.status,
            'operational_migration_state', COALESCE(op.migration_state, 'staging'),
            'cashier_count', (
                SELECT COUNT(*)::INTEGER
                FROM public.cashiers AS c
                WHERE c.network_id IS NOT DISTINCT FROM m.network_id
            )
        ) AS item
        FROM public.manager_accounts AS m
        LEFT JOIN private.staff_accounts AS s
            ON s.legacy_manager_account_id = m.id
           AND s.role = 'manager'
        LEFT JOIN private.operational_accounts AS op
            ON op.legacy_manager_account_id = m.id
           AND op.account_type = 'manager'
           AND op.currency = 'TMTM'
        WHERE m.role = 'manager'
    ) AS listed;

    RETURN jsonb_build_object(
        'ok', true,
        'rows', COALESCE(v_rows, '[]'::jsonb),
        'total', COALESCE(v_total, 0)
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_manager_detail(p_manager_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_manager public.manager_accounts%ROWTYPE;
    v_staff private.staff_accounts%ROWTYPE;
    v_op private.operational_accounts%ROWTYPE;
    v_cashiers jsonb;
BEGIN
    PERFORM private.get_current_owner_context();

    IF p_manager_id IS NULL THEN
        RAISE EXCEPTION 'MANAGER_ID_REQUIRED';
    END IF;

    SELECT m.*
    INTO v_manager
    FROM public.manager_accounts AS m
    WHERE m.id = p_manager_id
      AND m.role = 'manager';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'MANAGER_NOT_FOUND';
    END IF;

    SELECT s.*
    INTO v_staff
    FROM private.staff_accounts AS s
    WHERE s.legacy_manager_account_id = v_manager.id
      AND s.role = 'manager'
    LIMIT 1;

    SELECT a.*
    INTO v_op
    FROM private.operational_accounts AS a
    WHERE a.legacy_manager_account_id = v_manager.id
      AND a.account_type = 'manager'
      AND a.currency = 'TMTM'
    LIMIT 1;

    SELECT COALESCE(jsonb_agg(item ORDER BY item ->> 'login'), '[]'::jsonb)
    INTO v_cashiers
    FROM (
        SELECT jsonb_build_object(
            'cashier_id', c.id,
            'login', c.login,
            'full_name', c.full_name,
            'city', c.city,
            'point_name', c.point_name,
            'is_active', c.is_active,
            'auth_user_id', cs.auth_user_id,
            'auth_bound', cs.auth_user_id IS NOT NULL,
            'operational_account_id', cop.id,
            'operational_balance', COALESCE(cop.available_balance, 0),
            'operational_status', cop.status,
            'operational_migration_state', COALESCE(cop.migration_state, 'staging')
        ) AS item
        FROM public.cashiers AS c
        LEFT JOIN private.staff_accounts AS cs
            ON cs.legacy_cashier_id = c.id
           AND cs.role = 'cashier'
        LEFT JOIN private.operational_accounts AS cop
            ON cop.legacy_cashier_id = c.id
           AND cop.account_type = 'cashier'
           AND cop.currency = 'TMTM'
        WHERE c.network_id IS NOT DISTINCT FROM v_manager.network_id
    ) AS listed;

    RETURN jsonb_build_object(
        'ok', true,
        'manager', jsonb_build_object(
            'manager_id', v_manager.id,
            'login', v_manager.login,
            'full_name', v_manager.full_name,
            'status', CASE
                WHEN v_staff.status IS NOT NULL THEN v_staff.status
                WHEN v_manager.is_active IS TRUE THEN 'active'
                ELSE 'disabled'
            END,
            'is_active', v_manager.is_active,
            'network_id', v_manager.network_id,
            'network_name', v_manager.network_name,
            'auth_user_id', v_staff.auth_user_id,
            'auth_bound', v_staff.auth_user_id IS NOT NULL,
            'operational_account_id', v_op.id,
            'operational_balance', COALESCE(v_op.available_balance, 0),
            'operational_status', v_op.status,
            'operational_migration_state', COALESCE(v_op.migration_state, 'staging')
        ),
        'cashiers', COALESCE(v_cashiers, '[]'::jsonb)
    );
END;
$fn$;


-- ============================================================
-- OWNER CREATE MANAGER + BIND AUTH UID
-- ============================================================

CREATE OR REPLACE FUNCTION public.owner_provision_manager(
    p_auth_user_id UUID,
    p_login TEXT,
    p_full_name TEXT,
    p_network_name TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_auth UUID;
    v_login TEXT;
    v_name TEXT;
    v_network_name TEXT;
    v_network_id UUID;
    v_manager_id UUID;
    v_op_id UUID;
BEGIN
    PERFORM private.get_current_owner_context();

    v_auth := private.staff_assert_fresh_auth_user(p_auth_user_id);
    v_login := private.staff_normalize_login(p_login);
    v_name := private.staff_normalize_label(p_full_name, 'FULL_NAME_INVALID');
    v_network_name := private.staff_normalize_label(p_network_name, 'NETWORK_NAME_INVALID');

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_auth::TEXT, 0)
    );
    PERFORM private.staff_assert_login_available(v_login);

    v_network_id := pg_catalog.gen_random_uuid();

    BEGIN
        INSERT INTO public.manager_accounts (
            login,
            pin_hash,
            full_name,
            role,
            network_id,
            network_name,
            is_active
        )
        VALUES (
            v_login,
            private.staff_unusable_legacy_pin_hash(),
            v_name,
            'manager',
            v_network_id,
            v_network_name,
            TRUE
        )
        RETURNING id INTO v_manager_id;
    EXCEPTION
        WHEN unique_violation THEN
            RAISE EXCEPTION 'LOGIN_TAKEN';
    END;

    INSERT INTO private.staff_accounts (
        auth_user_id,
        role,
        status,
        display_name,
        network_id,
        legacy_manager_account_id,
        legacy_cashier_id
    )
    VALUES (
        v_auth,
        'manager',
        'active',
        v_name,
        v_network_id,
        v_manager_id,
        NULL
    );

    INSERT INTO private.operational_accounts (
        account_type,
        currency,
        legacy_manager_account_id,
        legacy_cashier_id,
        network_id,
        available_balance,
        status,
        migration_state
    )
    VALUES (
        'manager',
        'TMTM',
        v_manager_id,
        NULL,
        v_network_id,
        0,
        'active',
        'active'
    )
    RETURNING id INTO v_op_id;

    PERFORM private.append_staff_audit(
        'OWNER_CREATED_MANAGER',
        'manager',
        v_manager_id::TEXT,
        'owner_only',
        jsonb_build_object(
            'login', v_login,
            'network_id', v_network_id,
            'auth_user_id', v_auth,
            'operational_account_id', v_op_id
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'manager_id', v_manager_id,
        'login', v_login,
        'full_name', v_name,
        'status', 'active',
        'network_id', v_network_id,
        'network_name', v_network_name,
        'auth_user_id', v_auth,
        'auth_bound', true,
        'operational_account_id', v_op_id,
        'operational_balance', 0,
        'operational_status', 'active',
        'operational_migration_state', 'active'
    );
END;
$fn$;


-- ============================================================
-- MANAGER CREATE CASHIER IN OWN NETWORK
-- ============================================================

CREATE OR REPLACE FUNCTION public.manager_provision_cashier(
    p_auth_user_id UUID,
    p_login TEXT,
    p_full_name TEXT,
    p_city TEXT,
    p_point_name TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_auth UUID;
    v_login TEXT;
    v_name TEXT;
    v_city TEXT;
    v_point TEXT;
    v_cashier_id UUID;
    v_op_id UUID;
BEGIN
    SELECT
        c.auth_user_id,
        c.network_id,
        c.legacy_manager_account_id
    INTO v_ctx
    FROM private.get_current_manager_context() AS c;

    IF v_ctx.network_id IS NULL THEN
        RAISE EXCEPTION 'NETWORK_ID_REQUIRED';
    END IF;

    v_auth := private.staff_assert_fresh_auth_user(p_auth_user_id);
    v_login := private.staff_normalize_login(p_login);
    v_name := private.staff_normalize_label(p_full_name, 'FULL_NAME_INVALID');
    v_city := private.staff_normalize_label(p_city, 'CITY_INVALID');
    v_point := private.staff_normalize_label(p_point_name, 'POINT_NAME_INVALID');

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_auth::TEXT, 0)
    );
    PERFORM private.staff_assert_login_available(v_login);

    BEGIN
        INSERT INTO public.cashiers (
            login,
            pin_hash,
            full_name,
            city,
            point_name,
            float_balance,
            is_active,
            network_id,
            commission_earned
        )
        VALUES (
            v_login,
            private.staff_unusable_legacy_pin_hash(),
            v_name,
            v_city,
            v_point,
            0,
            TRUE,
            v_ctx.network_id,
            0
        )
        RETURNING id INTO v_cashier_id;
    EXCEPTION
        WHEN unique_violation THEN
            RAISE EXCEPTION 'LOGIN_TAKEN';
    END;

    INSERT INTO private.staff_accounts (
        auth_user_id,
        role,
        status,
        display_name,
        network_id,
        legacy_manager_account_id,
        legacy_cashier_id
    )
    VALUES (
        v_auth,
        'cashier',
        'active',
        v_name,
        v_ctx.network_id,
        NULL,
        v_cashier_id
    );

    INSERT INTO private.operational_accounts (
        account_type,
        currency,
        legacy_manager_account_id,
        legacy_cashier_id,
        network_id,
        available_balance,
        status,
        migration_state
    )
    VALUES (
        'cashier',
        'TMTM',
        NULL,
        v_cashier_id,
        v_ctx.network_id,
        0,
        'active',
        'active'
    )
    RETURNING id INTO v_op_id;

    PERFORM private.append_staff_audit(
        'MANAGER_CREATED_CASHIER',
        'cashier',
        v_cashier_id::TEXT,
        'manager_scope',
        jsonb_build_object(
            'login', v_login,
            'network_id', v_ctx.network_id,
            'auth_user_id', v_auth,
            'operational_account_id', v_op_id
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'cashier_id', v_cashier_id,
        'login', v_login,
        'full_name', v_name,
        'city', v_city,
        'point_name', v_point,
        'status', 'active',
        'network_id', v_ctx.network_id,
        'auth_user_id', v_auth,
        'auth_bound', true,
        'operational_account_id', v_op_id,
        'operational_balance', 0,
        'operational_status', 'active',
        'operational_migration_state', 'active'
    );
END;
$fn$;


REVOKE ALL ON FUNCTION public.owner_list_managers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_list_managers() FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_list_managers() TO authenticated;

REVOKE ALL ON FUNCTION public.owner_manager_detail(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_manager_detail(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_manager_detail(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.owner_provision_manager(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_provision_manager(UUID, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_provision_manager(UUID, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.manager_provision_cashier(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_provision_cashier(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.manager_provision_cashier(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.manager_create_cashier(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_create_cashier(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC) FROM anon, authenticated;

COMMENT ON FUNCTION public.owner_list_managers() IS
'Owner JWT list of canonical managers, operational balances, and cashier counts. No impersonation.';

COMMENT ON FUNCTION public.owner_manager_detail(UUID) IS
'Owner JWT drill-down of one manager and that manager''s network cashiers.';

COMMENT ON FUNCTION public.owner_provision_manager(UUID, TEXT, TEXT, TEXT) IS
'Owner JWT create manager+network+zero operational account and bind trusted Auth UID. No money.';

COMMENT ON FUNCTION public.manager_provision_cashier(UUID, TEXT, TEXT, TEXT, TEXT) IS
'Manager JWT create cashier in own network with zero active operational account. Network from JWT only.';

COMMIT;
