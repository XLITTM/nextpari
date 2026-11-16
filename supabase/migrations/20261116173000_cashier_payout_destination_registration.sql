BEGIN;
SET LOCAL statement_timeout = '3min';
SET LOCAL lock_timeout = '30s';

-- ============================================================
-- Register one stable payout destination for each eligible
-- operational cashier.
--
-- Player cash withdrawal lists read private.cashier_payout_destinations.
-- manager_provision_cashier created the cashier, staff binding, and
-- zero TMTM operational account, and stopped there.
--
-- This does not change balances, wallet ledger rows, withdrawal
-- requests, payout requests, operational status, or migration_state.
-- Existing destination ids and public tokens are left in place.
-- Currency matching stays in the player list and resolve functions.
-- ============================================================


-- Staff labels allow 120 characters. The destination city check was 80,
-- which would reject a cashier this workflow already accepts.
ALTER TABLE private.cashier_payout_destinations
    DROP CONSTRAINT IF EXISTS cashier_payout_destinations_city_check;

ALTER TABLE private.cashier_payout_destinations
    ADD CONSTRAINT cashier_payout_destinations_city_check
    CHECK (char_length(BTRIM(city)) BETWEEN 1 AND 120);


DO $pre$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM private.cashier_payout_destinations
        GROUP BY legacy_cashier_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'CASHIER_PAYOUT_DESTINATION_DUPLICATE';
    END IF;
END
$pre$;

CREATE UNIQUE INDEX IF NOT EXISTS cashier_payout_destinations_cashier_uidx
    ON private.cashier_payout_destinations (legacy_cashier_id);


CREATE OR REPLACE FUNCTION private.register_eligible_cashier_payout_destination(
    p_cashier_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_cashier RECORD;
    v_existing UUID;
    v_city TEXT;
    v_label TEXT;
    v_token TEXT;
    v_id UUID;
    v_try INTEGER;
BEGIN
    IF p_cashier_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT c.id, c.is_active, c.city, c.point_name, c.full_name
    INTO v_cashier
    FROM public.cashiers AS c
    WHERE c.id = p_cashier_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Keep the first destination id and token. Do not rewrite them.
    SELECT d.id
    INTO v_existing
    FROM private.cashier_payout_destinations AS d
    WHERE d.legacy_cashier_id = p_cashier_id
    ORDER BY d.created_at ASC, d.id ASC
    LIMIT 1
    FOR UPDATE;

    IF v_existing IS NOT NULL THEN
        RETURN v_existing;
    END IF;

    -- Frozen cashiers are is_active = false. Disabled and blocked staff
    -- cannot operate. Operational status and migration_state stay the
    -- same predicates the player list already requires. Currency is
    -- matched later, per player wallet, and is not stored on this row.
    IF v_cashier.is_active IS DISTINCT FROM TRUE THEN
        RETURN NULL;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM private.staff_accounts AS s
        WHERE s.legacy_cashier_id = p_cashier_id
          AND s.role = 'cashier'
          AND s.status IS DISTINCT FROM 'active'
    ) THEN
        RETURN NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM private.operational_accounts AS a
        WHERE a.legacy_cashier_id = p_cashier_id
          AND a.account_type = 'cashier'
          AND a.status = 'active'
          AND a.migration_state = 'active'
    ) THEN
        RETURN NULL;
    END IF;

    v_city := NULLIF(BTRIM(COALESCE(v_cashier.city, '')), '');
    v_label := NULLIF(BTRIM(COALESCE(v_cashier.point_name, '')), '');
    IF v_label IS NULL THEN
        v_label := NULLIF(BTRIM(COALESCE(v_cashier.full_name, '')), '');
    END IF;
    IF v_city IS NULL OR char_length(v_city) > 120
       OR v_label IS NULL OR char_length(v_label) > 120 THEN
        RETURN NULL;
    END IF;

    FOR v_try IN 1..5 LOOP
        v_token := 'cp_' || pg_catalog.encode(extensions.gen_random_bytes(16), 'hex');
        v_id := NULL;
        BEGIN
            INSERT INTO private.cashier_payout_destinations (
                public_token,
                legacy_cashier_id,
                city,
                label,
                is_selectable
            )
            VALUES (
                v_token,
                p_cashier_id,
                v_city,
                v_label,
                TRUE
            )
            ON CONFLICT (legacy_cashier_id) DO NOTHING
            RETURNING id INTO v_id;
            EXIT;
        EXCEPTION
            WHEN unique_violation THEN
                v_id := NULL;
        END;
    END LOOP;

    IF v_id IS NULL THEN
        SELECT d.id
        INTO v_id
        FROM private.cashier_payout_destinations AS d
        WHERE d.legacy_cashier_id = p_cashier_id
        ORDER BY d.created_at ASC, d.id ASC
        LIMIT 1;
    END IF;

    RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION private.register_eligible_cashier_payout_destination(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.register_eligible_cashier_payout_destination(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.register_eligible_cashier_payout_destination(UUID) TO service_role;

COMMENT ON FUNCTION private.register_eligible_cashier_payout_destination(UUID) IS
'Insert one selectable payout destination for an active operational cashier. Returns the existing destination id without changing it.';


CREATE OR REPLACE FUNCTION private.cashier_payout_destination_on_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    IF NEW.account_type IS DISTINCT FROM 'cashier'
       OR NEW.status IS DISTINCT FROM 'active'
       OR NEW.migration_state IS DISTINCT FROM 'active'
       OR NEW.legacy_cashier_id IS NULL THEN
        RETURN NEW;
    END IF;
    PERFORM private.register_eligible_cashier_payout_destination(NEW.legacy_cashier_id);
    RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION private.cashier_payout_destination_on_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.cashier_payout_destination_on_account() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.cashier_payout_destination_on_account() TO service_role;

DROP TRIGGER IF EXISTS cashier_operational_account_register_payout_destination
    ON private.operational_accounts;
CREATE TRIGGER cashier_operational_account_register_payout_destination
    AFTER INSERT ON private.operational_accounts
    FOR EACH ROW
    WHEN (
        NEW.account_type = 'cashier'
        AND NEW.status = 'active'
        AND NEW.migration_state = 'active'
        AND NEW.legacy_cashier_id IS NOT NULL
    )
    EXECUTE FUNCTION private.cashier_payout_destination_on_account();


CREATE OR REPLACE FUNCTION private.cashier_payout_destination_on_activation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.register_eligible_cashier_payout_destination(NEW.id);
    RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION private.cashier_payout_destination_on_activation() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.cashier_payout_destination_on_activation() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.cashier_payout_destination_on_activation() TO service_role;

DROP TRIGGER IF EXISTS cashier_activation_register_payout_destination
    ON public.cashiers;
CREATE TRIGGER cashier_activation_register_payout_destination
    AFTER UPDATE OF is_active ON public.cashiers
    FOR EACH ROW
    WHEN (NEW.is_active IS TRUE AND OLD.is_active IS DISTINCT FROM TRUE)
    EXECUTE FUNCTION private.cashier_payout_destination_on_activation();


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
    v_destination_id UUID;
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

    v_destination_id := private.register_eligible_cashier_payout_destination(v_cashier_id);

    PERFORM private.append_staff_audit(
        'MANAGER_CREATED_CASHIER',
        'cashier',
        v_cashier_id::TEXT,
        'manager_scope',
        jsonb_build_object(
            'login', v_login,
            'network_id', v_ctx.network_id,
            'auth_user_id', v_auth,
            'operational_account_id', v_op_id,
            'payout_destination_id', v_destination_id
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
        'operational_migration_state', 'active',
        'payout_destination_id', v_destination_id
    );
END;
$fn$;

REVOKE ALL ON FUNCTION public.manager_provision_cashier(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_provision_cashier(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.manager_provision_cashier(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.manager_provision_cashier(UUID, TEXT, TEXT, TEXT, TEXT) IS
'Manager JWT create cashier in own network with zero active operational account and its payout destination. Network from JWT only.';


DO $backfill$
DECLARE
    v_cashier_id UUID;
BEGIN
    FOR v_cashier_id IN
        SELECT c.id
        FROM public.cashiers AS c
        ORDER BY c.id
    LOOP
        PERFORM private.register_eligible_cashier_payout_destination(v_cashier_id);
    END LOOP;
END
$backfill$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261116173000', 'cashier_payout_destination_registration')
ON CONFLICT (version) DO NOTHING;

COMMIT;
