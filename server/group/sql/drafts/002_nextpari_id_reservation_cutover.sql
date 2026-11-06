-- DRAFT ONLY. DO NOT APPLY.
-- This file is outside supabase/migrations.
-- Do not run it against the NextPari production database.
-- Do not change the NextPari counter row.
-- Do not rewrite wallet or profile public_id values.
-- Do not copy email, phone, name, passport, or balance.
--
-- Operator procedure, after owner approval and after the group database exists:
-- 1. Pause new RYXO registration. NextPari registration stays on its current allocator
--    until a later approved switch.
-- 2. Read public IDs only. Example, run on NextPari with a read-only role:
--      SELECT DISTINCT public_id
--      FROM (
--          SELECT public_id FROM public.wallets WHERE public_id IS NOT NULL
--          UNION
--          SELECT public_id FROM public.profiles WHERE public_id IS NOT NULL
--      ) AS ids;
--    Also read, do not write:
--      SELECT next_value FROM private.player_public_id_counter WHERE singleton IS TRUE;
-- 3. Pass those IDs and the unchanged next_value into the function below
--    on the group database only.
-- 4. Compare reservation count to the distinct ID count. Stop on any mismatch.
-- 5. Only then may RYXO call group_control.allocate_player_id.
-- 6. Before NextPari itself switches, pause NextPari registration, repeat the
--    read-only export, reserve any new IDs, then switch NextPari to the central
--    allocator. If that allocator is down, registration fails. There is no local fallback.

BEGIN;

CREATE OR REPLACE FUNCTION group_control.reserve_legacy_nextpari_ids(
    p_public_ids TEXT[],
    p_production_next_value BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_id TEXT;
    v_numeric BIGINT;
    v_max BIGINT := 0;
    v_next BIGINT;
    v_current BIGINT;
BEGIN
    IF p_production_next_value IS NULL OR p_production_next_value < 1 THEN
        RAISE EXCEPTION 'PRODUCTION_COUNTER_INVALID';
    END IF;

    FOREACH v_id IN ARRAY p_public_ids LOOP
        IF v_id !~ '^[0-9]{1,18}$' OR v_id::BIGINT <= 0 THEN
            RAISE EXCEPTION 'PUBLIC_ID_INVALID';
        END IF;
        v_numeric := v_id::BIGINT;
        IF v_numeric > v_max THEN
            v_max := v_numeric;
        END IF;

        INSERT INTO group_control.player_id_reservations (
            public_id,
            public_id_numeric,
            brand_code,
            source,
            idempotency_key
        )
        VALUES (v_id, v_numeric, '001', 'legacy', NULL)
        ON CONFLICT (public_id) DO NOTHING;

        IF EXISTS (
            SELECT 1
            FROM group_control.player_id_reservations AS r
            WHERE r.public_id_numeric = v_numeric
              AND (r.public_id IS DISTINCT FROM v_id OR r.brand_code IS DISTINCT FROM '001' OR r.source IS DISTINCT FROM 'legacy')
        ) THEN
            RAISE EXCEPTION 'PUBLIC_ID_ALREADY_RESERVED';
        END IF;
    END LOOP;

    v_next := p_production_next_value;
    IF v_max + 1 > v_next THEN
        v_next := v_max + 1;
    END IF;

    SELECT c.next_value
    INTO v_current
    FROM group_control.player_id_counter AS c
    WHERE c.singleton IS TRUE
    FOR UPDATE;

    IF v_current IS NULL THEN
        INSERT INTO group_control.player_id_counter (singleton, next_value)
        VALUES (TRUE, v_next);
    ELSIF v_current IS DISTINCT FROM v_next THEN
        RAISE EXCEPTION 'COUNTER_REGRESSION';
    END IF;

    INSERT INTO group_control.audit_events (actor, action, brand_code, public_id)
    VALUES ('cutover', 'legacy_ids_reserved', '001', NULL);

    RETURN v_next;
END;
$fn$;

REVOKE ALL ON FUNCTION group_control.reserve_legacy_nextpari_ids(TEXT[], BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION group_control.reserve_legacy_nextpari_ids(TEXT[], BIGINT) TO service_role;

COMMIT;
