-- DRAFT ONLY. DO NOT APPLY.
-- This file is outside supabase/migrations so `supabase db push` cannot pick it up.
-- Do not run it against the NextPari production database.
-- Do not create the group Supabase project from this pull request.
--
-- Target: a future, empty group control-plane database.
-- Personal data, wallet balances, bets, and casino rounds stay in each brand database.
-- This draft stores brand registry, owner permissions, staff brand mapping,
-- global player-id reservations, opaque brand player references, audit events,
-- and aggregate reporting rows.

BEGIN;

CREATE SCHEMA IF NOT EXISTS group_control;

CREATE TABLE IF NOT EXISTS group_control.brands (
    code TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT brands_code_check CHECK (code IN ('001', '002', '003')),
    CONSTRAINT brands_status_check CHECK (status IN ('planned', 'registered', 'provisioning', 'active', 'suspended'))
);

INSERT INTO group_control.brands (code, slug, display_name, status)
VALUES
    ('001', 'nextpari', 'NextPari', 'active'),
    ('002', 'ryxo', 'RYXO', 'registered'),
    ('003', 'future', 'Future brand', 'planned')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS group_control.owner_identities (
    id UUID PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT owner_identities_status_check CHECK (status IN ('active', 'disabled'))
);

CREATE TABLE IF NOT EXISTS group_control.owner_permissions (
    owner_id UUID NOT NULL REFERENCES group_control.owner_identities (id),
    permission TEXT NOT NULL,
    PRIMARY KEY (owner_id, permission),
    CONSTRAINT owner_permissions_permission_check CHECK (
        permission IN ('brands.read', 'reports.read', 'brands.register', 'staff.map', 'ids.reserve')
    )
);

CREATE TABLE IF NOT EXISTS group_control.brand_staff_grants (
    brand_code TEXT NOT NULL REFERENCES group_control.brands (code),
    role TEXT NOT NULL,
    staff_subject UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (brand_code, staff_subject),
    CONSTRAINT brand_staff_grants_role_check CHECK (role IN ('manager', 'cashier', 'security'))
);

CREATE TABLE IF NOT EXISTS group_control.player_id_counter (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE,
    next_value BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT player_id_counter_singleton_true CHECK (singleton IS TRUE),
    CONSTRAINT player_id_counter_next_value_check CHECK (next_value >= 1)
);

-- No seed row. Allocation fails closed until the cutover draft reserves legacy IDs
-- and writes next_value. Starting at 1 would collide with NextPari.

CREATE TABLE IF NOT EXISTS group_control.player_id_reservations (
    public_id TEXT PRIMARY KEY,
    public_id_numeric BIGINT NOT NULL,
    brand_code TEXT NOT NULL REFERENCES group_control.brands (code),
    source TEXT NOT NULL,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT player_id_reservations_public_id_check CHECK (public_id ~ '^[0-9]{1,18}$'),
    CONSTRAINT player_id_reservations_source_check CHECK (source IN ('legacy', 'allocation')),
    CONSTRAINT player_id_reservations_numeric_unique UNIQUE (public_id_numeric)
);

CREATE UNIQUE INDEX IF NOT EXISTS player_id_reservations_idempotency_key
    ON group_control.player_id_reservations (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS group_control.brand_player_refs (
    brand_code TEXT NOT NULL REFERENCES group_control.brands (code),
    local_subject UUID NOT NULL,
    public_id TEXT NOT NULL REFERENCES group_control.player_id_reservations (public_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (brand_code, local_subject),
    UNIQUE (public_id)
);

CREATE TABLE IF NOT EXISTS group_control.audit_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    brand_code TEXT,
    public_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_control.brand_report_snapshots (
    brand_code TEXT NOT NULL REFERENCES group_control.brands (code),
    currency TEXT NOT NULL,
    player_count INTEGER NOT NULL CHECK (player_count >= 0),
    operational_status TEXT NOT NULL,
    deposits TEXT NOT NULL,
    withdrawals TEXT NOT NULL,
    ggr TEXT NOT NULL,
    reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (brand_code, currency)
);

REVOKE ALL ON SCHEMA group_control FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA group_control FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA group_control TO service_role;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA group_control TO service_role;

CREATE OR REPLACE FUNCTION group_control.allocate_player_id(
    p_brand_code TEXT,
    p_idempotency_key TEXT,
    p_nextpari_central BOOLEAN,
    p_ryxo_enabled BOOLEAN,
    p_login_max_digits INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_existing TEXT;
    v_next BIGINT;
    v_candidate TEXT;
    v_numeric BIGINT;
BEGIN
    IF p_brand_code = '003' OR p_brand_code NOT IN ('001', '002') THEN
        RAISE EXCEPTION 'BRAND_REGISTRATION_DISABLED';
    END IF;
    IF p_nextpari_central IS DISTINCT FROM TRUE THEN
        IF p_brand_code = '002' THEN
            RAISE EXCEPTION 'RYXO_BEFORE_NEXTPARI_CUTOVER';
        END IF;
        RAISE EXCEPTION 'NEXTPARI_CENTRAL_ALLOCATION_DISABLED';
    END IF;
    IF p_brand_code = '002' AND p_ryxo_enabled IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'RYXO_REGISTRATION_DISABLED';
    END IF;
    IF p_login_max_digits IS NULL OR p_login_max_digits < 6 THEN
        RAISE EXCEPTION 'LOGIN_CONTRACT_INVALID';
    END IF;
    IF p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,128}$' THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_INVALID';
    END IF;

    SELECT r.public_id
    INTO v_existing
    FROM group_control.player_id_reservations AS r
    WHERE r.idempotency_key = p_idempotency_key;

    IF v_existing IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM group_control.player_id_reservations AS r
            WHERE r.idempotency_key = p_idempotency_key
              AND r.brand_code = p_brand_code
        ) THEN
            RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';
        END IF;
        RETURN v_existing;
    END IF;

    SELECT c.next_value
    INTO v_next
    FROM group_control.player_id_counter AS c
    WHERE c.singleton IS TRUE
    FOR UPDATE;

    IF v_next IS NULL THEN
        RAISE EXCEPTION 'COUNTER_NOT_SEEDED';
    END IF;

    LOOP
        IF v_next > 999999999999999999 THEN
            RAISE EXCEPTION 'PUBLIC_ID_SPACE_EXHAUSTED';
        END IF;
        IF v_next <= 999999 THEN
            v_candidate := pg_catalog.lpad(v_next::TEXT, 6, '0');
        ELSE
            v_candidate := v_next::TEXT;
        END IF;
        v_numeric := v_next;
        IF char_length(v_candidate) > p_login_max_digits THEN
            RAISE EXCEPTION 'SEVEN_DIGIT_LOGIN_UNSUPPORTED';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM group_control.player_id_reservations AS r
            WHERE r.public_id = v_candidate
               OR r.public_id_numeric = v_numeric
        ) THEN
            INSERT INTO group_control.player_id_reservations (
                public_id,
                public_id_numeric,
                brand_code,
                source,
                idempotency_key
            )
            VALUES (v_candidate, v_numeric, p_brand_code, 'allocation', p_idempotency_key);

            UPDATE group_control.player_id_counter AS c
            SET next_value = v_next + 1,
                updated_at = pg_catalog.now()
            WHERE c.singleton IS TRUE;

            INSERT INTO group_control.audit_events (actor, action, brand_code, public_id)
            VALUES ('allocator', 'player_id_allocated', p_brand_code, v_candidate);

            RETURN v_candidate;
        END IF;

        v_next := v_next + 1;
    END LOOP;
END;
$fn$;

REVOKE ALL ON FUNCTION group_control.allocate_player_id(TEXT, TEXT, BOOLEAN, BOOLEAN, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION group_control.allocate_player_id(TEXT, TEXT, BOOLEAN, BOOLEAN, INTEGER) TO service_role;

COMMIT;
