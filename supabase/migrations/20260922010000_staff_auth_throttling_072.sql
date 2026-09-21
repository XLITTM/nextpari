BEGIN;

-- ============================================================
-- NEXTPARI PHASE 072
-- Distributed staff login throttling.
-- Repository-only. NOT applied by this change.
--
-- Stores only hashed keys. Does not store email, login,
-- password, raw IP, tokens, or cookies.
-- Does not enable step-up authentication.
-- Does not enable sports betting.
-- ============================================================

CREATE TABLE private.staff_auth_rate_limit_buckets (
    scope TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    window_started_at TIMESTAMPTZ NOT NULL,
    hit_count INTEGER NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (scope, key_hash),
    CONSTRAINT staff_auth_rate_limit_scope_allowed CHECK (
        scope IN (
            'staff-auth:owner:identifier',
            'staff-auth:owner:network',
            'staff-auth:manager:identifier',
            'staff-auth:manager:network',
            'staff-auth:cashier:identifier',
            'staff-auth:cashier:network',
            'staff-auth:security:identifier',
            'staff-auth:security:network'
        )
    ),
    CONSTRAINT staff_auth_rate_limit_hash_hex CHECK (key_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT staff_auth_rate_limit_hit_nonneg CHECK (hit_count >= 0)
);

ALTER TABLE private.staff_auth_rate_limit_buckets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.staff_auth_rate_limit_buckets FROM PUBLIC;
REVOKE ALL ON TABLE private.staff_auth_rate_limit_buckets FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.staff_auth_rate_limit_consume(
    p_scope TEXT,
    p_key_hash TEXT,
    p_max_hits INTEGER,
    p_window_seconds INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
    v_row private.staff_auth_rate_limit_buckets%ROWTYPE;
    v_window_end TIMESTAMPTZ;
    v_retry INTEGER;
BEGIN
    IF p_scope IS NULL OR p_scope NOT IN (
        'staff-auth:owner:identifier',
        'staff-auth:owner:network',
        'staff-auth:manager:identifier',
        'staff-auth:manager:network',
        'staff-auth:cashier:identifier',
        'staff-auth:cashier:network',
        'staff-auth:security:identifier',
        'staff-auth:security:network'
    ) THEN
        RAISE EXCEPTION 'STAFF_AUTH_RATE_LIMIT_INVALID';
    END IF;

    IF p_key_hash IS NULL OR p_key_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'STAFF_AUTH_RATE_LIMIT_INVALID';
    END IF;

    IF p_max_hits IS NULL OR p_max_hits < 1 OR p_max_hits > 1000 THEN
        RAISE EXCEPTION 'STAFF_AUTH_RATE_LIMIT_INVALID';
    END IF;

    IF p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
        RAISE EXCEPTION 'STAFF_AUTH_RATE_LIMIT_INVALID';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtext(p_scope),
        pg_catalog.hashtext(p_key_hash)
    );

    SELECT bucket.*
    INTO v_row
    FROM private.staff_auth_rate_limit_buckets AS bucket
    WHERE bucket.scope = p_scope
      AND bucket.key_hash = p_key_hash
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO private.staff_auth_rate_limit_buckets (
            scope,
            key_hash,
            window_started_at,
            hit_count,
            last_seen_at
        ) VALUES (
            p_scope,
            p_key_hash,
            v_now,
            1,
            v_now
        );
        RETURN pg_catalog.jsonb_build_object(
            'allowed', true,
            'retry_after_seconds', 0
        );
    END IF;

    v_window_end := v_row.window_started_at + (p_window_seconds * INTERVAL '1 second');
    IF v_window_end <= v_now THEN
        UPDATE private.staff_auth_rate_limit_buckets
        SET window_started_at = v_now,
            hit_count = 1,
            last_seen_at = v_now
        WHERE scope = p_scope
          AND key_hash = p_key_hash;
        RETURN pg_catalog.jsonb_build_object(
            'allowed', true,
            'retry_after_seconds', 0
        );
    END IF;

    IF v_row.hit_count >= p_max_hits THEN
        v_retry := GREATEST(
            1,
            pg_catalog.ceil(EXTRACT(EPOCH FROM (v_window_end - v_now)))::INTEGER
        );
        UPDATE private.staff_auth_rate_limit_buckets
        SET last_seen_at = v_now
        WHERE scope = p_scope
          AND key_hash = p_key_hash;
        RETURN pg_catalog.jsonb_build_object(
            'allowed', false,
            'retry_after_seconds', v_retry
        );
    END IF;

    UPDATE private.staff_auth_rate_limit_buckets
    SET hit_count = hit_count + 1,
        last_seen_at = v_now
    WHERE scope = p_scope
      AND key_hash = p_key_hash
      AND hit_count >= 0;

    RETURN pg_catalog.jsonb_build_object(
        'allowed', true,
        'retry_after_seconds', 0
    );
END;
$fn$;

REVOKE ALL ON FUNCTION private.staff_auth_rate_limit_consume(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.staff_auth_rate_limit_consume(TEXT, TEXT, INTEGER, INTEGER) FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.staff_auth_rate_limit_consume(
    p_scope TEXT,
    p_key_hash TEXT,
    p_max_hits INTEGER,
    p_window_seconds INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    RETURN private.staff_auth_rate_limit_consume(
        p_scope,
        p_key_hash,
        p_max_hits,
        p_window_seconds
    );
END;
$fn$;

REVOKE ALL ON FUNCTION public.staff_auth_rate_limit_consume(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_auth_rate_limit_consume(TEXT, TEXT, INTEGER, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_auth_rate_limit_consume(TEXT, TEXT, INTEGER, INTEGER) TO service_role;

COMMIT;
