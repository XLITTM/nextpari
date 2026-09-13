BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 048
-- PLAYER FRAUD & SECURITY FOUNDATION
-- Sequence: after 047 (sports bet acceptance integrity).
--
-- Repository only. DO NOT APPLY from this change.
--
-- Append-only security event ledger, DB-backed login rate limits,
-- reviewable multi-account flags, and Owner-only decision support.
-- Does not rewrite Wallet Ledger, sports settlement, or provider GGR.
-- Does not automatically block players or mutate balances.
-- ============================================================


CREATE TABLE IF NOT EXISTS private.player_security_settings (
    id SMALLINT PRIMARY KEY,
    login_failure_window_minutes INTEGER NOT NULL DEFAULT 15,
    max_failures_per_identifier INTEGER NOT NULL DEFAULT 8,
    max_failures_per_device INTEGER NOT NULL DEFAULT 20,
    max_failures_per_network INTEGER NOT NULL DEFAULT 40,
    cooldown_minutes INTEGER NOT NULL DEFAULT 15,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT player_security_settings_singleton CHECK (id = 1),
    CONSTRAINT player_security_window_check
        CHECK (login_failure_window_minutes BETWEEN 1 AND 1440),
    CONSTRAINT player_security_identifier_max_check
        CHECK (max_failures_per_identifier BETWEEN 3 AND 100),
    CONSTRAINT player_security_device_max_check
        CHECK (max_failures_per_device BETWEEN 3 AND 200),
    CONSTRAINT player_security_network_max_check
        CHECK (max_failures_per_network BETWEEN 5 AND 500),
    CONSTRAINT player_security_cooldown_check
        CHECK (cooldown_minutes BETWEEN 1 AND 1440)
);

INSERT INTO private.player_security_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE private.player_security_settings IS
'Singleton login brute-force thresholds. Conservative defaults; Owner/admin infrastructure may update values. No invented money. No automatic player block.';


CREATE TABLE IF NOT EXISTS private.player_security_login_pressure (
    bucket_kind TEXT NOT NULL,
    bucket_hash TEXT NOT NULL,
    failure_count INTEGER NOT NULL DEFAULT 0,
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_success_at TIMESTAMPTZ,
    last_blocked_at TIMESTAMPTZ,
    PRIMARY KEY (bucket_kind, bucket_hash),
    CONSTRAINT player_security_pressure_kind_check
        CHECK (bucket_kind IN ('identifier', 'device', 'network')),
    CONSTRAINT player_security_pressure_hash_check
        CHECK (bucket_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT player_security_pressure_count_check
        CHECK (failure_count >= 0)
);

COMMENT ON TABLE private.player_security_login_pressure IS
'Concurrency-safe login attempt buckets for multi-instance rate limits. LOGIN_SUCCESS may clear the matching identifier bucket only. Device/network spray buckets recover by window/cooldown, never because another account succeeded. REGISTER_SUCCESS does not reset pre-auth login pressure. No account lock and no money mutation.';


CREATE TABLE IF NOT EXISTS private.player_security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_user_id UUID,
    event_type TEXT NOT NULL,
    identifier_hash TEXT,
    device_hash TEXT,
    network_hash TEXT,
    user_agent_hash TEXT,
    risk_level TEXT NOT NULL DEFAULT 'info',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT player_security_event_type_check
        CHECK (event_type IN (
            'LOGIN_SUCCESS',
            'LOGIN_FAILURE',
            'REGISTER_SUCCESS',
            'REGISTER_FAILURE',
            'PASSWORD_CHANGED',
            'EMAIL_VERIFIED',
            'AUTH_RATE_LIMITED',
            'SHARED_DEVICE_SIGNAL',
            'SHARED_NETWORK_SIGNAL'
        )),
    CONSTRAINT player_security_risk_level_check
        CHECK (risk_level IN ('info', 'low', 'medium', 'high')),
    CONSTRAINT player_security_identifier_hash_check
        CHECK (identifier_hash IS NULL OR identifier_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT player_security_device_hash_check
        CHECK (device_hash IS NULL OR device_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT player_security_network_hash_check
        CHECK (network_hash IS NULL OR network_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT player_security_user_agent_hash_check
        CHECK (user_agent_hash IS NULL OR user_agent_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT player_security_metadata_object_check
        CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS player_security_events_player_idx
    ON private.player_security_events (player_user_id, created_at DESC)
    WHERE player_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS player_security_events_type_idx
    ON private.player_security_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS player_security_events_identifier_idx
    ON private.player_security_events (identifier_hash, event_type, created_at DESC)
    WHERE identifier_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS player_security_events_device_idx
    ON private.player_security_events (device_hash, player_user_id)
    WHERE device_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS player_security_events_network_idx
    ON private.player_security_events (network_hash, player_user_id)
    WHERE network_hash IS NOT NULL;

COMMENT ON TABLE private.player_security_events IS
'Append-only player security ledger. Hashed/pseudonymous signals only. No passwords, JWTs, API keys, raw IPs, raw device tokens, or full User-Agent strings.';


CREATE TABLE IF NOT EXISTS private.player_risk_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_user_id UUID NOT NULL,
    flag_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    signal_count INTEGER NOT NULL DEFAULT 1,
    related_player_count INTEGER NOT NULL DEFAULT 1,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID,
    resolution_reason TEXT,
    CONSTRAINT player_risk_flag_type_check
        CHECK (flag_type IN (
            'SHARED_DEVICE',
            'SHARED_NETWORK',
            'LOGIN_FAILURE_BURST',
            'AUTH_RATE_LIMITED'
        )),
    CONSTRAINT player_risk_severity_check
        CHECK (severity IN ('low', 'medium', 'high')),
    CONSTRAINT player_risk_status_check
        CHECK (status IN ('open', 'reviewed', 'resolved', 'dismissed')),
    CONSTRAINT player_risk_signal_count_check
        CHECK (signal_count >= 1),
    CONSTRAINT player_risk_related_count_check
        CHECK (related_player_count >= 1),
    CONSTRAINT player_risk_details_object_check
        CHECK (jsonb_typeof(details) = 'object'),
    CONSTRAINT player_risk_resolution_reason_len_check
        CHECK (resolution_reason IS NULL OR char_length(resolution_reason) BETWEEN 1 AND 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS player_risk_flags_active_uidx
    ON private.player_risk_flags (player_user_id, flag_type)
    WHERE status IN ('open', 'reviewed');

CREATE INDEX IF NOT EXISTS player_risk_flags_status_idx
    ON private.player_risk_flags (status, severity, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS player_risk_flags_player_idx
    ON private.player_risk_flags (player_user_id, last_seen_at DESC);

COMMENT ON TABLE private.player_risk_flags IS
'Reviewable fraud/security decision-support flags. Shared network/device never auto-blocks and never mutates Wallet Ledger.';


CREATE OR REPLACE FUNCTION private.player_security_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
    RAISE EXCEPTION 'PLAYER_SECURITY_EVENTS_APPEND_ONLY';
END;
$fn$;

DROP TRIGGER IF EXISTS player_security_events_no_update ON private.player_security_events;
CREATE TRIGGER player_security_events_no_update
    BEFORE UPDATE OR DELETE ON private.player_security_events
    FOR EACH ROW
    EXECUTE FUNCTION private.player_security_events_append_only();


CREATE OR REPLACE FUNCTION private.player_security_assert_safe_metadata(p_metadata JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_key TEXT;
    v_compact TEXT;
    v_dump TEXT;
BEGIN
    IF p_metadata IS NULL THEN
        RETURN '{}'::jsonb;
    END IF;
    IF jsonb_typeof(p_metadata) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'PLAYER_SECURITY_METADATA_INVALID';
    END IF;

    FOR v_key IN SELECT jsonb_object_keys(p_metadata)
    LOOP
        v_compact := lower(replace(replace(v_key, '_', ''), '-', ''));
        IF v_compact IN (
            'password',
            'currentpassword',
            'newpassword',
            'accesstoken',
            'refreshtoken',
            'authorization',
            'cookie',
            'ip',
            'deviceid',
            'devicetoken',
            'useragent',
            'pepper',
            'apikey',
            'servicerolekey',
            'servicerole',
            'network'
        ) THEN
            RAISE EXCEPTION 'PLAYER_SECURITY_METADATA_FORBIDDEN';
        END IF;
    END LOOP;

    v_dump := p_metadata::text;
    IF v_dump ~* '(password|access_token|refresh_token|authorization|service_role|pepper|api[_-]?key|device_token|bearer )' THEN
        RAISE EXCEPTION 'PLAYER_SECURITY_METADATA_FORBIDDEN';
    END IF;
    IF v_dump ~ '((^|[^0-9])((25[0-5]|2[0-4][0-9]|[01]?[0-9]{1,2})\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9]{1,2})([^0-9]|$))' THEN
        RAISE EXCEPTION 'PLAYER_SECURITY_METADATA_FORBIDDEN';
    END IF;

    RETURN p_metadata;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_security_mask_hash(p_hash TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
    SELECT CASE
        WHEN p_hash IS NULL OR char_length(p_hash) < 8 THEN NULL
        ELSE substr(p_hash, 1, 8) || '…'
    END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_security_public_id(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_public TEXT;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT NULLIF(BTRIM(COALESCE(p.public_id, '')), '')
    INTO v_public
    FROM public.profiles AS p
    WHERE p.id = p_user_id
    LIMIT 1;

    IF v_public IS NOT NULL THEN
        RETURN v_public;
    END IF;

    SELECT NULLIF(BTRIM(COALESCE(w.public_id, '')), '')
    INTO v_public
    FROM public.profiles AS p
    INNER JOIN public.wallets AS w ON w.id = p.wallet_id
    WHERE p.id = p_user_id
    LIMIT 1;

    RETURN v_public;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_security_user_id_from_public_id(p_player_id TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_raw TEXT;
    v_uid UUID;
BEGIN
    v_raw := NULLIF(BTRIM(COALESCE(p_player_id, '')), '');
    IF v_raw IS NULL OR v_raw !~ '^[0-9]{6}$' THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;

    SELECT p.id
    INTO v_uid
    FROM public.profiles AS p
    WHERE p.public_id = v_raw
    LIMIT 1;

    IF v_uid IS NOT NULL THEN
        RETURN v_uid;
    END IF;

    SELECT p.id
    INTO v_uid
    FROM public.wallets AS w
    INNER JOIN public.profiles AS p ON p.wallet_id = w.id
    WHERE w.public_id = v_raw
    LIMIT 1;

    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;
    RETURN v_uid;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_security_upsert_flag(
    p_player_user_id UUID,
    p_flag_type TEXT,
    p_severity TEXT,
    p_related_player_count INTEGER,
    p_details JSONB
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_id UUID;
    v_details JSONB;
BEGIN
    IF p_player_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    v_details := private.player_security_assert_safe_metadata(COALESCE(p_details, '{}'::jsonb));

    INSERT INTO private.player_risk_flags (
        player_user_id,
        flag_type,
        severity,
        status,
        signal_count,
        related_player_count,
        details
    )
    VALUES (
        p_player_user_id,
        p_flag_type,
        p_severity,
        'open',
        1,
        GREATEST(COALESCE(p_related_player_count, 1), 1),
        v_details
    )
    ON CONFLICT (player_user_id, flag_type) WHERE status IN ('open', 'reviewed')
    DO UPDATE SET
        signal_count = private.player_risk_flags.signal_count + 1,
        related_player_count = GREATEST(
            private.player_risk_flags.related_player_count,
            EXCLUDED.related_player_count
        ),
        last_seen_at = pg_catalog.now(),
        details = EXCLUDED.details,
        severity = EXCLUDED.severity
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_security_evaluate_sharing(
    p_player_user_id UUID,
    p_event_type TEXT,
    p_device_hash TEXT,
    p_network_hash TEXT,
    p_identifier_hash TEXT,
    p_user_agent_hash TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_related INTEGER;
    v_peer UUID;
    v_public_ids JSONB;
BEGIN
    IF p_player_user_id IS NULL THEN
        RETURN;
    END IF;

    IF p_device_hash IS NOT NULL THEN
        SELECT COUNT(DISTINCT e.player_user_id)
        INTO v_related
        FROM private.player_security_events AS e
        WHERE e.device_hash = p_device_hash
          AND e.player_user_id IS NOT NULL
          AND e.event_type IN ('LOGIN_SUCCESS', 'REGISTER_SUCCESS', 'SHARED_DEVICE_SIGNAL');

        IF v_related >= 2 THEN
            SELECT COALESCE(
                jsonb_agg(DISTINCT private.player_security_public_id(e.player_user_id))
                    FILTER (WHERE private.player_security_public_id(e.player_user_id) IS NOT NULL),
                '[]'::jsonb
            )
            INTO v_public_ids
            FROM private.player_security_events AS e
            WHERE e.device_hash = p_device_hash
              AND e.player_user_id IS NOT NULL
              AND e.event_type IN ('LOGIN_SUCCESS', 'REGISTER_SUCCESS', 'SHARED_DEVICE_SIGNAL');

            INSERT INTO private.player_security_events (
                player_user_id,
                event_type,
                identifier_hash,
                device_hash,
                network_hash,
                user_agent_hash,
                risk_level,
                metadata
            )
            VALUES (
                p_player_user_id,
                'SHARED_DEVICE_SIGNAL',
                p_identifier_hash,
                p_device_hash,
                p_network_hash,
                p_user_agent_hash,
                'high',
                private.player_security_assert_safe_metadata(
                    jsonb_build_object(
                        'related_player_count', v_related,
                        'device_ref', private.player_security_mask_hash(p_device_hash)
                    )
                )
            );

            FOR v_peer IN
                SELECT DISTINCT e.player_user_id
                FROM private.player_security_events AS e
                WHERE e.device_hash = p_device_hash
                  AND e.player_user_id IS NOT NULL
                  AND e.event_type IN ('LOGIN_SUCCESS', 'REGISTER_SUCCESS', 'SHARED_DEVICE_SIGNAL')
            LOOP
                PERFORM private.player_security_upsert_flag(
                    v_peer,
                    'SHARED_DEVICE',
                    'high',
                    v_related,
                    jsonb_build_object(
                        'device_ref', private.player_security_mask_hash(p_device_hash),
                        'related_public_ids', v_public_ids
                    )
                );
            END LOOP;
        END IF;
    END IF;

    IF p_network_hash IS NOT NULL THEN
        SELECT COUNT(DISTINCT e.player_user_id)
        INTO v_related
        FROM private.player_security_events AS e
        WHERE e.network_hash = p_network_hash
          AND e.player_user_id IS NOT NULL
          AND e.event_type IN ('LOGIN_SUCCESS', 'REGISTER_SUCCESS', 'SHARED_NETWORK_SIGNAL');

        IF v_related >= 2 THEN
            SELECT COALESCE(
                jsonb_agg(DISTINCT private.player_security_public_id(e.player_user_id))
                    FILTER (WHERE private.player_security_public_id(e.player_user_id) IS NOT NULL),
                '[]'::jsonb
            )
            INTO v_public_ids
            FROM private.player_security_events AS e
            WHERE e.network_hash = p_network_hash
              AND e.player_user_id IS NOT NULL
              AND e.event_type IN ('LOGIN_SUCCESS', 'REGISTER_SUCCESS', 'SHARED_NETWORK_SIGNAL');

            INSERT INTO private.player_security_events (
                player_user_id,
                event_type,
                identifier_hash,
                device_hash,
                network_hash,
                user_agent_hash,
                risk_level,
                metadata
            )
            VALUES (
                p_player_user_id,
                'SHARED_NETWORK_SIGNAL',
                p_identifier_hash,
                p_device_hash,
                p_network_hash,
                p_user_agent_hash,
                'medium',
                private.player_security_assert_safe_metadata(
                    jsonb_build_object(
                        'related_player_count', v_related,
                        'network_ref', private.player_security_mask_hash(p_network_hash)
                    )
                )
            );

            FOR v_peer IN
                SELECT DISTINCT e.player_user_id
                FROM private.player_security_events AS e
                WHERE e.network_hash = p_network_hash
                  AND e.player_user_id IS NOT NULL
                  AND e.event_type IN ('LOGIN_SUCCESS', 'REGISTER_SUCCESS', 'SHARED_NETWORK_SIGNAL')
            LOOP
                PERFORM private.player_security_upsert_flag(
                    v_peer,
                    'SHARED_NETWORK',
                    'medium',
                    v_related,
                    jsonb_build_object(
                        'network_ref', private.player_security_mask_hash(p_network_hash),
                        'related_public_ids', v_public_ids
                    )
                );
            END LOOP;
        END IF;
    END IF;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_security_record_event(
    p_player_user_id UUID,
    p_event_type TEXT,
    p_identifier_hash TEXT,
    p_device_hash TEXT,
    p_network_hash TEXT,
    p_user_agent_hash TEXT,
    p_risk_level TEXT,
    p_metadata JSONB
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_id UUID;
    v_meta JSONB;
    v_risk TEXT;
    v_failures INTEGER;
    v_window INTEGER;
BEGIN
    v_risk := COALESCE(NULLIF(BTRIM(p_risk_level), ''), 'info');
    v_meta := private.player_security_assert_safe_metadata(COALESCE(p_metadata, '{}'::jsonb));

    INSERT INTO private.player_security_events (
        player_user_id,
        event_type,
        identifier_hash,
        device_hash,
        network_hash,
        user_agent_hash,
        risk_level,
        metadata
    )
    VALUES (
        p_player_user_id,
        p_event_type,
        NULLIF(p_identifier_hash, ''),
        NULLIF(p_device_hash, ''),
        NULLIF(p_network_hash, ''),
        NULLIF(p_user_agent_hash, ''),
        v_risk,
        v_meta
    )
    RETURNING id INTO v_id;

    -- A successful login may clear pressure for that login identifier only.
    -- Shared device/network buckets exist to detect cross-account spraying and
    -- must not be zeroed because one account authenticated.
    IF p_event_type = 'LOGIN_SUCCESS' THEN
        UPDATE private.player_security_login_pressure
        SET
            failure_count = 0,
            last_success_at = pg_catalog.now(),
            window_started_at = pg_catalog.now(),
            last_blocked_at = NULL
        WHERE bucket_kind = 'identifier'
          AND bucket_hash = NULLIF(p_identifier_hash, '');
    END IF;

    IF p_event_type IN ('LOGIN_SUCCESS', 'REGISTER_SUCCESS') THEN
        PERFORM private.player_security_evaluate_sharing(
            p_player_user_id,
            p_event_type,
            NULLIF(p_device_hash, ''),
            NULLIF(p_network_hash, ''),
            NULLIF(p_identifier_hash, ''),
            NULLIF(p_user_agent_hash, '')
        );
    END IF;

    IF p_event_type = 'AUTH_RATE_LIMITED' AND p_player_user_id IS NOT NULL THEN
        PERFORM private.player_security_upsert_flag(
            p_player_user_id,
            'AUTH_RATE_LIMITED',
            'low',
            1,
            jsonb_build_object('source', 'auth_rate_limited')
        );
    END IF;

    IF p_event_type = 'LOGIN_FAILURE' AND p_player_user_id IS NOT NULL THEN
        SELECT s.login_failure_window_minutes
        INTO v_window
        FROM private.player_security_settings AS s
        WHERE s.id = 1;

        SELECT COUNT(*)::INTEGER
        INTO v_failures
        FROM private.player_security_events AS e
        WHERE e.player_user_id = p_player_user_id
          AND e.event_type = 'LOGIN_FAILURE'
          AND e.created_at >= pg_catalog.now() - make_interval(mins => COALESCE(v_window, 15));

        IF v_failures >= 5 THEN
            PERFORM private.player_security_upsert_flag(
                p_player_user_id,
                'LOGIN_FAILURE_BURST',
                'medium',
                1,
                jsonb_build_object('failure_count', v_failures)
            );
        END IF;
    END IF;

    RETURN v_id;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_security_consume_bucket(
    p_kind TEXT,
    p_hash TEXT,
    p_window_minutes INTEGER,
    p_max_failures INTEGER,
    p_cooldown_minutes INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_row private.player_security_login_pressure%ROWTYPE;
    v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
    IF p_hash IS NULL OR p_hash = '' THEN
        RETURN true;
    END IF;

    INSERT INTO private.player_security_login_pressure (bucket_kind, bucket_hash)
    VALUES (p_kind, p_hash)
    ON CONFLICT (bucket_kind, bucket_hash) DO NOTHING;

    SELECT *
    INTO v_row
    FROM private.player_security_login_pressure
    WHERE bucket_kind = p_kind
      AND bucket_hash = p_hash
    FOR UPDATE;

    -- last_success_at may reset the identifier bucket after LOGIN_SUCCESS.
    -- Device/network buckets must not treat another account's success as a reset.
    IF p_kind = 'identifier'
        AND v_row.last_success_at IS NOT NULL
        AND v_row.last_success_at >= v_row.window_started_at
    THEN
        v_row.failure_count := 0;
        v_row.window_started_at := v_now;
    ELSIF v_row.window_started_at <= v_now - make_interval(mins => GREATEST(p_window_minutes, 1)) THEN
        v_row.failure_count := 0;
        v_row.window_started_at := v_now;
    END IF;

    IF v_row.last_blocked_at IS NOT NULL
        AND v_row.last_blocked_at >= v_now - make_interval(mins => GREATEST(p_cooldown_minutes, 1))
        AND (
            p_kind <> 'identifier'
            OR v_row.last_success_at IS NULL
            OR v_row.last_blocked_at > v_row.last_success_at
        )
    THEN
        UPDATE private.player_security_login_pressure
        SET
            failure_count = v_row.failure_count,
            window_started_at = v_row.window_started_at
        WHERE bucket_kind = p_kind
          AND bucket_hash = p_hash;
        RETURN false;
    END IF;

    IF v_row.failure_count >= p_max_failures THEN
        UPDATE private.player_security_login_pressure
        SET
            failure_count = v_row.failure_count,
            window_started_at = v_row.window_started_at,
            last_blocked_at = v_now
        WHERE bucket_kind = p_kind
          AND bucket_hash = p_hash;
        RETURN false;
    END IF;

    UPDATE private.player_security_login_pressure
    SET
        failure_count = v_row.failure_count + 1,
        window_started_at = v_row.window_started_at,
        last_blocked_at = NULL
    WHERE bucket_kind = p_kind
      AND bucket_hash = p_hash;

    RETURN true;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_security_in_cooldown(
    p_identifier_hash TEXT,
    p_device_hash TEXT,
    p_network_hash TEXT,
    p_cooldown_minutes INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_since TIMESTAMPTZ;
    v_success TIMESTAMPTZ;
BEGIN
    v_since := pg_catalog.now() - make_interval(mins => GREATEST(p_cooldown_minutes, 1));

    -- Only a LOGIN_SUCCESS for the same identifier may end identifier cooldown.
    -- Shared device/network AUTH_RATE_LIMITED rows age by cooldown, not by
    -- another account authenticating on the same device or network.
    SELECT MAX(e.created_at)
    INTO v_success
    FROM private.player_security_events AS e
    WHERE e.event_type = 'LOGIN_SUCCESS'
      AND p_identifier_hash IS NOT NULL
      AND e.identifier_hash = p_identifier_hash;

    RETURN EXISTS (
        SELECT 1
        FROM private.player_security_events AS e
        WHERE e.event_type = 'AUTH_RATE_LIMITED'
          AND e.created_at >= v_since
          AND (v_success IS NULL OR e.created_at > v_success)
          AND (
              (p_identifier_hash IS NOT NULL AND e.identifier_hash = p_identifier_hash)
              OR (p_device_hash IS NOT NULL AND e.device_hash = p_device_hash)
              OR (p_network_hash IS NOT NULL AND e.network_hash = p_network_hash)
          )
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_security_check_login(
    p_identifier_hash TEXT,
    p_device_hash TEXT,
    p_network_hash TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_settings private.player_security_settings%ROWTYPE;
    v_ok BOOLEAN;
BEGIN
    -- Serialize concurrent attempts for the same identifier/device/network buckets.
    IF NULLIF(p_identifier_hash, '') IS NOT NULL THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(
            88104848,
            pg_catalog.hashtext('id:' || p_identifier_hash)
        );
    END IF;
    IF NULLIF(p_device_hash, '') IS NOT NULL THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(
            88104849,
            pg_catalog.hashtext('dev:' || p_device_hash)
        );
    END IF;
    IF NULLIF(p_network_hash, '') IS NOT NULL THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(
            88104850,
            pg_catalog.hashtext('net:' || p_network_hash)
        );
    END IF;

    SELECT *
    INTO v_settings
    FROM private.player_security_settings
    WHERE id = 1;

    IF v_settings.id IS NULL THEN
        RETURN jsonb_build_object('allowed', true);
    END IF;

    v_ok := private.player_security_consume_bucket(
        'identifier',
        NULLIF(p_identifier_hash, ''),
        v_settings.login_failure_window_minutes,
        v_settings.max_failures_per_identifier,
        v_settings.cooldown_minutes
    );
    v_ok := v_ok AND private.player_security_consume_bucket(
        'device',
        NULLIF(p_device_hash, ''),
        v_settings.login_failure_window_minutes,
        v_settings.max_failures_per_device,
        v_settings.cooldown_minutes
    );
    v_ok := v_ok AND private.player_security_consume_bucket(
        'network',
        NULLIF(p_network_hash, ''),
        v_settings.login_failure_window_minutes,
        v_settings.max_failures_per_network,
        v_settings.cooldown_minutes
    );

    IF NOT v_ok THEN
        RETURN jsonb_build_object('allowed', false, 'code', 'AUTH_RATE_LIMITED');
    END IF;

    RETURN jsonb_build_object('allowed', true);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.player_security_record_event(
    p_player_user_id UUID,
    p_event_type TEXT,
    p_identifier_hash TEXT,
    p_device_hash TEXT,
    p_network_hash TEXT,
    p_user_agent_hash TEXT,
    p_risk_level TEXT,
    p_metadata JSONB
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_id UUID;
BEGIN
    v_id := private.player_security_record_event(
        p_player_user_id,
        p_event_type,
        p_identifier_hash,
        p_device_hash,
        p_network_hash,
        p_user_agent_hash,
        p_risk_level,
        p_metadata
    );
    RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.player_security_check_login(
    p_identifier_hash TEXT,
    p_device_hash TEXT,
    p_network_hash TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    RETURN private.player_security_check_login(
        p_identifier_hash,
        p_device_hash,
        p_network_hash
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_security_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_owner UUID;
BEGIN
    SELECT o.auth_user_id
    INTO v_owner
    FROM private.get_current_owner_context() AS o;

    RETURN jsonb_build_object(
        'open_flags', (
            SELECT COUNT(*)::INTEGER
            FROM private.player_risk_flags AS f
            WHERE f.status = 'open'
        ),
        'high_severity_flags', (
            SELECT COUNT(*)::INTEGER
            FROM private.player_risk_flags AS f
            WHERE f.severity = 'high'
              AND f.status IN ('open', 'reviewed')
        ),
        'login_failures', (
            SELECT COUNT(*)::INTEGER
            FROM private.player_security_events AS e
            WHERE e.event_type = 'LOGIN_FAILURE'
        ),
        'rate_limited_attempts', (
            SELECT COUNT(*)::INTEGER
            FROM private.player_security_events AS e
            WHERE e.event_type = 'AUTH_RATE_LIMITED'
        ),
        'shared_device_flags', (
            SELECT COUNT(*)::INTEGER
            FROM private.player_risk_flags AS f
            WHERE f.flag_type = 'SHARED_DEVICE'
              AND f.status IN ('open', 'reviewed')
        ),
        'shared_network_flags', (
            SELECT COUNT(*)::INTEGER
            FROM private.player_risk_flags AS f
            WHERE f.flag_type = 'SHARED_NETWORK'
              AND f.status IN ('open', 'reviewed')
        )
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_list_security_flags(
    p_status TEXT DEFAULT NULL,
    p_severity TEXT DEFAULT NULL,
    p_flag_type TEXT DEFAULT NULL,
    p_player_id TEXT DEFAULT NULL,
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_owner UUID;
    v_uid UUID;
    v_limit INTEGER;
    v_offset INTEGER;
    v_total INTEGER;
    v_rows jsonb;
BEGIN
    SELECT o.auth_user_id
    INTO v_owner
    FROM private.get_current_owner_context() AS o;

    v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 0), 200);
    v_offset := GREATEST(COALESCE(p_offset, 0), 0);

    IF NULLIF(BTRIM(COALESCE(p_player_id, '')), '') IS NOT NULL THEN
        v_uid := private.player_security_user_id_from_public_id(p_player_id);
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_total
    FROM private.player_risk_flags AS f
    WHERE (p_status IS NULL OR f.status = p_status)
      AND (p_severity IS NULL OR f.severity = p_severity)
      AND (p_flag_type IS NULL OR f.flag_type = p_flag_type)
      AND (v_uid IS NULL OR f.player_user_id = v_uid)
      AND (p_from IS NULL OR f.last_seen_at >= p_from)
      AND (p_to IS NULL OR f.last_seen_at <= p_to);

    SELECT COALESCE(jsonb_agg(item.obj ORDER BY item.last_seen_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT jsonb_build_object(
            'id', f.id,
            'player_public_id', private.player_security_public_id(f.player_user_id),
            'flag_type', f.flag_type,
            'severity', f.severity,
            'status', f.status,
            'signal_count', f.signal_count,
            'related_player_count', f.related_player_count,
            'first_seen_at', f.first_seen_at,
            'last_seen_at', f.last_seen_at,
            'details', f.details,
            'resolution_reason', f.resolution_reason
        ) AS obj,
        f.last_seen_at
        FROM private.player_risk_flags AS f
        WHERE (p_status IS NULL OR f.status = p_status)
          AND (p_severity IS NULL OR f.severity = p_severity)
          AND (p_flag_type IS NULL OR f.flag_type = p_flag_type)
          AND (v_uid IS NULL OR f.player_user_id = v_uid)
          AND (p_from IS NULL OR f.last_seen_at >= p_from)
          AND (p_to IS NULL OR f.last_seen_at <= p_to)
        ORDER BY f.last_seen_at DESC
        LIMIT v_limit
        OFFSET v_offset
    ) AS item;

    RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_player_security(p_player_id TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_owner UUID;
    v_uid UUID;
    v_flags jsonb;
    v_events jsonb;
BEGIN
    SELECT o.auth_user_id
    INTO v_owner
    FROM private.get_current_owner_context() AS o;

    v_uid := private.player_security_user_id_from_public_id(p_player_id);

    SELECT COALESCE(jsonb_agg(item.obj ORDER BY item.last_seen_at DESC), '[]'::jsonb)
    INTO v_flags
    FROM (
        SELECT jsonb_build_object(
            'id', f.id,
            'player_public_id', private.player_security_public_id(f.player_user_id),
            'flag_type', f.flag_type,
            'severity', f.severity,
            'status', f.status,
            'signal_count', f.signal_count,
            'related_player_count', f.related_player_count,
            'first_seen_at', f.first_seen_at,
            'last_seen_at', f.last_seen_at,
            'details', f.details,
            'resolution_reason', f.resolution_reason
        ) AS obj,
        f.last_seen_at
        FROM private.player_risk_flags AS f
        WHERE f.player_user_id = v_uid
        ORDER BY f.last_seen_at DESC
        LIMIT 100
    ) AS item;

    SELECT COALESCE(jsonb_agg(item.obj ORDER BY item.created_at DESC), '[]'::jsonb)
    INTO v_events
    FROM (
        SELECT jsonb_build_object(
            'id', e.id,
            'event_type', e.event_type,
            'risk_level', e.risk_level,
            'identifier_ref', private.player_security_mask_hash(e.identifier_hash),
            'device_ref', private.player_security_mask_hash(e.device_hash),
            'network_ref', private.player_security_mask_hash(e.network_hash),
            'user_agent_ref', private.player_security_mask_hash(e.user_agent_hash),
            'metadata', e.metadata,
            'created_at', e.created_at
        ) AS obj,
        e.created_at
        FROM private.player_security_events AS e
        WHERE e.player_user_id = v_uid
        ORDER BY e.created_at DESC
        LIMIT 100
    ) AS item;

    RETURN jsonb_build_object(
        'player_public_id', private.player_security_public_id(v_uid),
        'flags', v_flags,
        'events', v_events
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_resolve_security_flag(
    p_flag_id UUID,
    p_action TEXT,
    p_reason TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_owner UUID;
    v_action TEXT;
    v_reason TEXT;
    v_flag private.player_risk_flags%ROWTYPE;
    v_status TEXT;
    v_public TEXT;
BEGIN
    SELECT o.auth_user_id
    INTO v_owner
    FROM private.get_current_owner_context() AS o;

    v_action := lower(BTRIM(COALESCE(p_action, '')));
    IF v_action NOT IN ('review', 'reviewed', 'resolve', 'resolved', 'dismiss', 'dismissed') THEN
        RAISE EXCEPTION 'FLAG_ACTION_INVALID';
    END IF;

    v_status := CASE
        WHEN v_action IN ('review', 'reviewed') THEN 'reviewed'
        WHEN v_action IN ('resolve', 'resolved') THEN 'resolved'
        ELSE 'dismissed'
    END;

    v_reason := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
    IF v_status IN ('resolved', 'dismissed') AND v_reason IS NULL THEN
        RAISE EXCEPTION 'REASON_REQUIRED';
    END IF;
    IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN
        RAISE EXCEPTION 'REASON_TOO_LONG';
    END IF;

    SELECT *
    INTO v_flag
    FROM private.player_risk_flags
    WHERE id = p_flag_id
    FOR UPDATE;

    IF v_flag.id IS NULL THEN
        RAISE EXCEPTION 'FLAG_NOT_FOUND';
    END IF;

    UPDATE private.player_risk_flags
    SET
        status = v_status,
        resolved_at = CASE WHEN v_status IN ('resolved', 'dismissed') THEN pg_catalog.now() ELSE resolved_at END,
        resolved_by = v_owner,
        resolution_reason = COALESCE(v_reason, resolution_reason)
    WHERE id = p_flag_id;

    v_public := private.player_security_public_id(v_flag.player_user_id);

    PERFORM private.append_staff_audit(
        'owner_resolve_security_flag',
        'player_risk_flag',
        p_flag_id::text,
        'owner_only',
        jsonb_build_object(
            'action', v_status,
            'flag_type', v_flag.flag_type,
            'player_public_id', v_public,
            'reason', COALESCE(v_reason, '')
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'id', p_flag_id,
        'status', v_status,
        'player_public_id', v_public
    );
END;
$fn$;


REVOKE ALL ON TABLE private.player_security_settings FROM PUBLIC;
REVOKE ALL ON TABLE private.player_security_settings FROM anon, authenticated;
REVOKE ALL ON TABLE private.player_security_settings FROM service_role;
GRANT SELECT, UPDATE ON TABLE private.player_security_settings TO service_role;

REVOKE ALL ON TABLE private.player_security_login_pressure FROM PUBLIC;
REVOKE ALL ON TABLE private.player_security_login_pressure FROM anon, authenticated;
REVOKE ALL ON TABLE private.player_security_login_pressure FROM service_role;
GRANT SELECT ON TABLE private.player_security_login_pressure TO service_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE private.player_security_login_pressure FROM service_role;

REVOKE ALL ON TABLE private.player_security_events FROM PUBLIC;
REVOKE ALL ON TABLE private.player_security_events FROM anon, authenticated;
REVOKE ALL ON TABLE private.player_security_events FROM service_role;
GRANT SELECT ON TABLE private.player_security_events TO service_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE private.player_security_events FROM service_role;

REVOKE ALL ON TABLE private.player_risk_flags FROM PUBLIC;
REVOKE ALL ON TABLE private.player_risk_flags FROM anon, authenticated;
REVOKE ALL ON TABLE private.player_risk_flags FROM service_role;
GRANT SELECT ON TABLE private.player_risk_flags TO service_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE private.player_risk_flags FROM service_role;

REVOKE ALL ON FUNCTION private.player_security_events_append_only() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_security_assert_safe_metadata(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_security_mask_hash(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_security_public_id(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_security_user_id_from_public_id(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_security_upsert_flag(UUID, TEXT, TEXT, INTEGER, JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_security_evaluate_sharing(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_security_record_event(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_security_consume_bucket(TEXT, TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_security_in_cooldown(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_security_check_login(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.player_security_record_event(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_security_record_event(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_security_record_event(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.player_security_check_login(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_security_check_login(TEXT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_security_check_login(TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.owner_security_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_security_overview() TO authenticated;

REVOKE ALL ON FUNCTION public.owner_list_security_flags(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_list_security_flags(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.owner_player_security(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_player_security(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.owner_resolve_security_flag(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_resolve_security_flag(UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.player_security_record_event(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) IS
'Service-role canonical security ingest. Direct table INSERT is denied. EXECUTE granted only to service_role. Browser/authenticated ingest is denied.';

COMMENT ON FUNCTION public.player_security_check_login(TEXT, TEXT, TEXT) IS
'Service-role DB-backed login rate-limit check with advisory locks. Direct pressure INSERT/UPDATE is denied. Does not verify passwords and does not lock accounts permanently.';

COMMENT ON FUNCTION public.owner_security_overview() IS
'Owner JWT aggregate security counts. Manager/cashier/player denied via get_current_owner_context.';

COMMENT ON FUNCTION public.owner_list_security_flags(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) IS
'Owner JWT reviewable risk flags with masked signal refs. No raw hashes, IPs, or device tokens.';

COMMENT ON FUNCTION public.owner_player_security(TEXT) IS
'Owner JWT player security dossier. Masked hashes only.';

COMMENT ON FUNCTION public.owner_resolve_security_flag(UUID, TEXT, TEXT) IS
'Owner JWT review/resolve/dismiss. Writes private.staff_audit_log with owner_only visibility. No wallet or block mutation.';

COMMIT;
