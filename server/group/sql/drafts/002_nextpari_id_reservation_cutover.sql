-- DRAFT ONLY. DO NOT APPLY.
-- This file is outside supabase/migrations.
-- Do not run it against the NextPari production database.
-- Do not change the NextPari counter row.
-- Do not rewrite wallet or profile public_id values.
-- Do not copy email, phone, name, passport, or balance.
-- Do not enable RYXO registration in this draft.
--
-- Read-only export, run on NextPari only after registration is frozen:
--   wallets.public_id, including rows that have no profile
--   profiles.public_id
--   public.app_users, after inspecting its columns. The last inspection
--   found zero rows. Read it again. Do not skip it because that count was zero.
-- A later inspection will not have the same row counts. Reserve every ID
-- the export returns. Also read private.player_public_id_counter.next_value
-- and do not write that row.
--
-- Repeat this function after new NextPari IDs exist. It inserts missing
-- legacy IDs and advances the group counter only upward. It does not
-- require the counter to still equal the previous floor, and it does not
-- change a row whose source is allocation.

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
    v_floor BIGINT;
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
              AND (
                    r.public_id IS DISTINCT FROM v_id
                    OR r.brand_code IS DISTINCT FROM '001'
                    OR r.source IS DISTINCT FROM 'legacy'
                  )
        ) THEN
            RAISE EXCEPTION 'PUBLIC_ID_ALREADY_RESERVED';
        END IF;
    END LOOP;

    v_floor := p_production_next_value;
    IF v_max + 1 > v_floor THEN
        v_floor := v_max + 1;
    END IF;

    SELECT c.next_value
    INTO v_current
    FROM group_control.player_id_counter AS c
    WHERE c.singleton IS TRUE
    FOR UPDATE;

    IF v_current IS NULL THEN
        INSERT INTO group_control.player_id_counter (singleton, next_value)
        VALUES (TRUE, v_floor);
        v_current := v_floor;
    ELSIF v_current < v_floor THEN
        UPDATE group_control.player_id_counter AS c
        SET next_value = v_floor,
            updated_at = pg_catalog.now()
        WHERE c.singleton IS TRUE;
        v_current := v_floor;
    END IF;

    INSERT INTO group_control.audit_events (actor, action, brand_code, public_id)
    VALUES ('cutover', 'legacy_ids_reserved', '001', NULL);

    RETURN v_current;
END;
$fn$;

REVOKE ALL ON FUNCTION group_control.reserve_legacy_nextpari_ids(TEXT[], BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION group_control.reserve_legacy_nextpari_ids(TEXT[], BIGINT) TO service_role;

COMMIT;
