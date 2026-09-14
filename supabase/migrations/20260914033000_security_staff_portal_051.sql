BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 051
-- DEDICATED SECURITY STAFF ROLE AND PORTAL FOUNDATION
-- Sequence: after 050 (security sports investigation).
--
-- Repository only. DO NOT APPLY from this change.
--
-- Adds staff role=security, Owner-provisioned Security employees,
-- Security JWT RPCs for investigation, flags, and the 049 restriction
-- engine. Does not hard-block wallets, mutate sports, or invent CLV.
-- ============================================================


ALTER TABLE private.staff_accounts
    ADD COLUMN IF NOT EXISTS login_name TEXT;

ALTER TABLE private.staff_accounts
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

DO $role$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname
        FROM pg_constraint AS c
        WHERE c.conrelid = 'private.staff_accounts'::regclass
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%role%'
          AND pg_get_constraintdef(c.oid) NOT ILIKE '%security%'
    LOOP
        EXECUTE format('ALTER TABLE private.staff_accounts DROP CONSTRAINT %I', r.conname);
    END LOOP;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint AS c
        WHERE c.conrelid = 'private.staff_accounts'::regclass
          AND c.conname = 'staff_accounts_role_check'
    ) THEN
        ALTER TABLE private.staff_accounts
            ADD CONSTRAINT staff_accounts_role_check
            CHECK (role IN ('owner', 'manager', 'cashier', 'security'));
    END IF;
END;
$role$;

DO $status$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname
        FROM pg_constraint AS c
        WHERE c.conrelid = 'private.staff_accounts'::regclass
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%status%'
          AND pg_get_constraintdef(c.oid) NOT ILIKE '%disabled%'
    LOOP
        EXECUTE format('ALTER TABLE private.staff_accounts DROP CONSTRAINT %I', r.conname);
    END LOOP;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint AS c
        WHERE c.conrelid = 'private.staff_accounts'::regclass
          AND c.conname = 'staff_accounts_status_check'
    ) THEN
        ALTER TABLE private.staff_accounts
            ADD CONSTRAINT staff_accounts_status_check
            CHECK (status IN ('active', 'disabled', 'blocked'));
    END IF;
END;
$status$;

ALTER TABLE private.staff_accounts
    DROP CONSTRAINT IF EXISTS staff_accounts_security_identity_check;

ALTER TABLE private.staff_accounts
    ADD CONSTRAINT staff_accounts_security_identity_check
    CHECK (
        role IS DISTINCT FROM 'security'
        OR (
            login_name IS NOT NULL
            AND display_name IS NOT NULL
            AND BTRIM(display_name) <> ''
            AND network_id IS NULL
            AND legacy_manager_account_id IS NULL
            AND legacy_cashier_id IS NULL
        )
    );

CREATE UNIQUE INDEX IF NOT EXISTS staff_accounts_security_login_uidx
    ON private.staff_accounts (lower(login_name))
    WHERE role = 'security' AND login_name IS NOT NULL;


CREATE TABLE IF NOT EXISTS private.security_staff_identities (
    auth_user_id UUID PRIMARY KEY,
    login_name TEXT NOT NULL,
    auth_email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT security_staff_identities_login_check CHECK (login_name ~ '^[a-z0-9._-]{3,32}$'),
    CONSTRAINT security_staff_identities_login_unique UNIQUE (login_name),
    CONSTRAINT security_staff_identities_email_unique UNIQUE (auth_email)
);

CREATE TABLE IF NOT EXISTS private.security_staff_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID NOT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    player_public_id TEXT,
    reason TEXT,
    result TEXT NOT NULL DEFAULT 'ok',
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT security_staff_actions_role_check CHECK (actor_role IN ('security', 'owner')),
    CONSTRAINT security_staff_actions_action_check CHECK (action IN (
        'SECURITY_FLAG_REVIEWED',
        'SECURITY_FLAG_RESOLVED',
        'SECURITY_FLAG_DISMISSED',
        'SECURITY_RESTRICTION_APPLIED',
        'SECURITY_RESTRICTION_REMOVED',
        'OWNER_CREATED_SECURITY_STAFF',
        'OWNER_SET_SECURITY_STAFF_STATUS',
        'OWNER_RESET_SECURITY_PASSWORD'
    ))
);

CREATE INDEX IF NOT EXISTS security_staff_actions_actor_created_idx
    ON private.security_staff_actions (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS security_staff_actions_created_idx
    ON private.security_staff_actions (created_at DESC);


CREATE OR REPLACE FUNCTION private.security_staff_actions_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
    RAISE EXCEPTION 'SECURITY_STAFF_ACTIONS_APPEND_ONLY';
END;
$fn$;

DROP TRIGGER IF EXISTS security_staff_actions_no_update ON private.security_staff_actions;
CREATE TRIGGER security_staff_actions_no_update
    BEFORE UPDATE OR DELETE ON private.security_staff_actions
    FOR EACH ROW
    EXECUTE FUNCTION private.security_staff_actions_append_only();


REVOKE ALL ON TABLE private.security_staff_identities FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.security_staff_actions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE private.security_staff_identities FROM service_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE private.security_staff_actions FROM service_role;


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
    ) OR EXISTS (
        SELECT 1 FROM private.staff_accounts AS s
        WHERE s.role = 'security' AND lower(s.login_name) = p_login
    ) THEN
        RAISE EXCEPTION 'LOGIN_TAKEN';
    END IF;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.security_restriction_mutator_role_allowed(p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
    SELECT BTRIM(COALESCE(p_role, '')) IN ('owner', 'security');
$fn$;

COMMENT ON FUNCTION private.security_restriction_mutator_role_allowed(TEXT) IS
'Staff roles allowed to apply/remove Security restrictions: owner and dedicated security.';


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
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

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

COMMENT ON FUNCTION private.get_current_security_context() IS
'JWT gate for dedicated security staff. Requires auth.uid, role=security, status=active.';


CREATE OR REPLACE FUNCTION private.security_record_action(
    p_actor_user_id UUID,
    p_actor_role TEXT,
    p_action TEXT,
    p_target_type TEXT,
    p_target_id TEXT,
    p_player_public_id TEXT,
    p_reason TEXT,
    p_result TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    INSERT INTO private.security_staff_actions (
        actor_user_id,
        actor_role,
        action,
        target_type,
        target_id,
        player_public_id,
        reason,
        result
    )
    VALUES (
        p_actor_user_id,
        p_actor_role,
        p_action,
        p_target_type,
        p_target_id,
        p_player_public_id,
        p_reason,
        COALESCE(NULLIF(BTRIM(COALESCE(p_result, '')), ''), 'ok')
    );

    PERFORM private.append_staff_audit(
        p_action,
        p_target_type,
        p_target_id,
        'owner_only',
        jsonb_build_object(
            'actor_user_id', p_actor_user_id,
            'actor_role', p_actor_role,
            'player_public_id', p_player_public_id,
            'reason', COALESCE(p_reason, ''),
            'result', COALESCE(p_result, 'ok')
        )
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.security_flag_action_name(p_status TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
    SELECT CASE p_status
        WHEN 'reviewed' THEN 'SECURITY_FLAG_REVIEWED'
        WHEN 'resolved' THEN 'SECURITY_FLAG_RESOLVED'
        WHEN 'dismissed' THEN 'SECURITY_FLAG_DISMISSED'
        ELSE NULL
    END;
$fn$;


CREATE OR REPLACE FUNCTION private.security_resolve_risk_flag(
    p_flag_id UUID,
    p_action TEXT,
    p_reason TEXT,
    p_actor_user_id UUID,
    p_actor_role TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_action TEXT;
    v_reason TEXT;
    v_flag private.player_risk_flags%ROWTYPE;
    v_status TEXT;
    v_public TEXT;
    v_audit TEXT;
BEGIN
    IF p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    IF p_actor_role IS DISTINCT FROM 'owner' AND p_actor_role IS DISTINCT FROM 'security' THEN
        RAISE EXCEPTION 'SECURITY_REQUIRED';
    END IF;

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
        resolved_by = p_actor_user_id,
        resolution_reason = COALESCE(v_reason, resolution_reason)
    WHERE id = p_flag_id;

    v_public := private.player_security_public_id(v_flag.player_user_id);
    v_audit := private.security_flag_action_name(v_status);

    PERFORM private.security_record_action(
        p_actor_user_id,
        p_actor_role,
        v_audit,
        'player_risk_flag',
        p_flag_id::text,
        v_public,
        v_reason,
        v_status
    );

    RETURN jsonb_build_object(
        'ok', true,
        'id', p_flag_id,
        'status', v_status,
        'player_public_id', v_public
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.security_flags_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    RETURN jsonb_build_object(
        'open_flags', (
            SELECT COUNT(*)::INTEGER FROM private.player_risk_flags AS f WHERE f.status = 'open'
        ),
        'high_severity_flags', (
            SELECT COUNT(*)::INTEGER
            FROM private.player_risk_flags AS f
            WHERE f.severity = 'high' AND f.status IN ('open', 'reviewed')
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
            WHERE f.flag_type = 'SHARED_DEVICE' AND f.status IN ('open', 'reviewed')
        ),
        'shared_network_flags', (
            SELECT COUNT(*)::INTEGER
            FROM private.player_risk_flags AS f
            WHERE f.flag_type = 'SHARED_NETWORK' AND f.status IN ('open', 'reviewed')
        ),
        'restricted_accounts', (
            SELECT COUNT(*)::INTEGER
            FROM private.player_security_restrictions AS r
            WHERE r.is_active
        )
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.security_player_dossier(p_player_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_public TEXT;
    v_flags jsonb;
    v_events jsonb;
    v_row private.player_security_restrictions%ROWTYPE;
    v_history jsonb;
    v_decisions jsonb;
BEGIN
    v_uid := p_player_user_id;
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;
    v_public := private.player_security_public_id(v_uid);

    SELECT *
    INTO v_row
    FROM private.player_security_restrictions AS r
    WHERE r.player_user_id = v_uid;

    SELECT COALESCE(jsonb_agg(item.obj ORDER BY item.last_seen_at DESC), '[]'::jsonb)
    INTO v_flags
    FROM (
        SELECT jsonb_build_object(
            'id', f.id,
            'player_public_id', v_public,
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

    SELECT COALESCE(jsonb_agg(item.obj ORDER BY item.created_at DESC), '[]'::jsonb)
    INTO v_history
    FROM (
        SELECT jsonb_build_object(
            'event_type', e.event_type,
            'reason', e.reason,
            'actor_staff_role', e.actor_staff_role,
            'created_at', e.created_at,
            'previous_state', e.previous_state,
            'new_state', e.new_state
        ) AS obj,
        e.created_at
        FROM private.player_security_restriction_events AS e
        WHERE e.player_user_id = v_uid
        ORDER BY e.created_at DESC
        LIMIT 50
    ) AS item;

    SELECT COALESCE(jsonb_agg(item.obj ORDER BY item.created_at DESC), '[]'::jsonb)
    INTO v_decisions
    FROM (
        SELECT jsonb_build_object(
            'action', a.action,
            'actor_role', a.actor_role,
            'reason', a.reason,
            'result', a.result,
            'created_at', a.created_at
        ) AS obj,
        a.created_at
        FROM private.security_staff_actions AS a
        WHERE a.player_public_id = v_public
        ORDER BY a.created_at DESC
        LIMIT 50
    ) AS item;

    RETURN jsonb_build_object(
        'ok', true,
        'player_public_id', v_public,
        'restricted', COALESCE(v_row.is_active, FALSE),
        'restriction_reason', v_row.reason,
        'restriction_updated_at', v_row.updated_at,
        'policy', private.player_security_restriction_policy(COALESCE(v_row.is_active, FALSE)),
        'flags', v_flags,
        'events', v_events,
        'restriction_history', v_history,
        'recent_security_decisions', v_decisions,
        'linked_account_count', COALESCE((
            SELECT MAX(f.related_player_count)::INTEGER
            FROM private.player_risk_flags AS f
            WHERE f.player_user_id = v_uid
              AND f.flag_type IN ('SHARED_DEVICE', 'SHARED_NETWORK')
        ), 0)
    );
END;
$fn$;


-- Public Security wrappers

CREATE OR REPLACE FUNCTION public.security_current_staff()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_login TEXT;
BEGIN
    SELECT * INTO v_ctx FROM private.get_current_security_context();
    SELECT s.login_name INTO v_login
    FROM private.staff_accounts AS s
    WHERE s.auth_user_id = v_ctx.auth_user_id;
    RETURN jsonb_build_object(
        'ok', true,
        'auth_user_id', v_ctx.auth_user_id,
        'role', v_ctx.role,
        'status', v_ctx.status,
        'display_name', v_ctx.display_name,
        'login', v_login
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.security_security_overview()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.get_current_security_context();
    RETURN private.security_flags_overview();
END;
$fn$;


CREATE OR REPLACE FUNCTION public.security_list_security_flags(
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
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_limit INTEGER;
    v_offset INTEGER;
    v_total INTEGER;
    v_rows jsonb;
BEGIN
    PERFORM private.get_current_security_context();
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

    RETURN jsonb_build_object('ok', true, 'rows', v_rows, 'total', v_total);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.security_player_security(p_player_id TEXT)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.get_current_security_context();
    RETURN private.security_player_dossier(
        private.player_security_user_id_from_public_id(p_player_id)
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.security_resolve_security_flag(
    p_flag_id UUID,
    p_action TEXT,
    p_reason TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
BEGIN
    SELECT * INTO v_ctx FROM private.get_current_security_context();
    RETURN private.security_resolve_risk_flag(
        p_flag_id,
        p_action,
        p_reason,
        v_ctx.auth_user_id,
        'security'
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.security_player_security_restriction(p_player_id TEXT)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_public TEXT;
    v_row private.player_security_restrictions%ROWTYPE;
BEGIN
    PERFORM private.get_current_security_context();
    v_uid := private.player_security_user_id_from_public_id(p_player_id);
    v_public := private.player_security_public_id(v_uid);
    SELECT * INTO v_row FROM private.player_security_restrictions AS r WHERE r.player_user_id = v_uid;
    RETURN jsonb_build_object(
        'ok', true,
        'player_public_id', v_public,
        'restricted', COALESCE(v_row.is_active, FALSE),
        'reason', v_row.reason,
        'updated_at', v_row.updated_at,
        'policy', private.player_security_restriction_policy(COALESCE(v_row.is_active, FALSE))
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.security_set_player_security_restriction(
    p_player_id TEXT,
    p_restricted BOOLEAN,
    p_reason TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_uid UUID;
    v_result jsonb;
BEGIN
    SELECT * INTO v_ctx FROM private.get_current_security_context();
    v_uid := private.player_security_user_id_from_public_id(p_player_id);
    v_result := private.set_player_security_restriction(
        v_uid,
        p_restricted,
        p_reason,
        v_ctx.auth_user_id,
        'security'
    );
    PERFORM private.security_record_action(
        v_ctx.auth_user_id,
        'security',
        CASE WHEN p_restricted THEN 'SECURITY_RESTRICTION_APPLIED' ELSE 'SECURITY_RESTRICTION_REMOVED' END,
        'player',
        COALESCE(v_result ->> 'player_public_id', p_player_id),
        COALESCE(v_result ->> 'player_public_id', p_player_id),
        p_reason,
        'ok'
    );
    RETURN v_result;
END;
$fn$;


CREATE OR REPLACE FUNCTION public.security_activity_feed(
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_limit INTEGER;
    v_offset INTEGER;
    v_rows jsonb;
    v_total INTEGER;
BEGIN
    PERFORM private.get_current_security_context();
    v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
    v_offset := GREATEST(COALESCE(p_offset, 0), 0);

    SELECT COUNT(*)::INTEGER INTO v_total FROM private.security_staff_actions;

    SELECT COALESCE(jsonb_agg(item.obj ORDER BY item.created_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT jsonb_build_object(
            'at', a.created_at,
            'action', a.action,
            'actor_role', a.actor_role,
            'employee_login', s.login_name,
            'employee_name', s.display_name,
            'player_public_id', a.player_public_id,
            'target', a.target_id,
            'reason', a.reason,
            'result', a.result
        ) AS obj,
        a.created_at
        FROM private.security_staff_actions AS a
        LEFT JOIN private.staff_accounts AS s ON s.auth_user_id = a.actor_user_id
        ORDER BY a.created_at DESC
        LIMIT v_limit
        OFFSET v_offset
    ) AS item;

    RETURN jsonb_build_object('ok', true, 'rows', v_rows, 'total', v_total);
END;
$fn$;


-- Service-role login lookup. Never granted to browser roles.

CREATE OR REPLACE FUNCTION public.security_lookup_login_email(p_login TEXT)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_login TEXT;
    v_email TEXT;
    v_status TEXT;
BEGIN
    v_login := private.staff_normalize_login(p_login);

    SELECT i.auth_email, s.status
    INTO v_email, v_status
    FROM private.security_staff_identities AS i
    INNER JOIN private.staff_accounts AS s ON s.auth_user_id = i.auth_user_id
    WHERE i.login_name = v_login
      AND s.role = 'security'
    LIMIT 1;

    IF v_email IS NULL THEN
        RAISE EXCEPTION 'AUTH_FAILED';
    END IF;
    IF v_status = 'blocked' THEN
        RAISE EXCEPTION 'STAFF_ACCOUNT_BLOCKED';
    END IF;
    IF v_status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'STAFF_ACCOUNT_DISABLED';
    END IF;

    RETURN jsonb_build_object('ok', true, 'auth_email', v_email);
END;
$fn$;


-- Owner Security employee management

CREATE OR REPLACE FUNCTION public.owner_provision_security_staff(
    p_auth_user_id UUID,
    p_login TEXT,
    p_display_name TEXT,
    p_auth_email TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_owner UUID;
    v_auth UUID;
    v_login TEXT;
    v_name TEXT;
    v_email TEXT;
BEGIN
    SELECT o.auth_user_id INTO v_owner FROM private.get_current_owner_context() AS o;
    v_auth := private.staff_assert_fresh_auth_user(p_auth_user_id);
    v_login := private.staff_normalize_login(p_login);
    v_name := private.staff_normalize_label(p_display_name, 'DISPLAY_NAME_INVALID');
    v_email := NULLIF(BTRIM(COALESCE(p_auth_email, '')), '');
    IF v_email IS NULL OR v_email !~ '^[^@]+@auth\.nextpari\.invalid$' THEN
        RAISE EXCEPTION 'AUTH_EMAIL_INVALID';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_auth::text, 0));
    PERFORM private.staff_assert_login_available(v_login);

    INSERT INTO private.staff_accounts (
        auth_user_id,
        role,
        status,
        display_name,
        login_name,
        network_id,
        legacy_manager_account_id,
        legacy_cashier_id
    )
    VALUES (
        v_auth,
        'security',
        'active',
        v_name,
        v_login,
        NULL,
        NULL,
        NULL
    );

    INSERT INTO private.security_staff_identities (auth_user_id, login_name, auth_email)
    VALUES (v_auth, v_login, lower(v_email));

    PERFORM private.security_record_action(
        v_owner,
        'owner',
        'OWNER_CREATED_SECURITY_STAFF',
        'security_staff',
        v_auth::text,
        NULL,
        v_login,
        'ok'
    );

    RETURN jsonb_build_object(
        'ok', true,
        'auth_user_id', v_auth,
        'role', 'security',
        'status', 'active',
        'login', v_login,
        'display_name', v_name
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_list_security_staff()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_rows jsonb;
BEGIN
    PERFORM private.get_current_owner_context();

    SELECT COALESCE(jsonb_agg(item.obj ORDER BY item.created_sort DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT jsonb_build_object(
            'auth_user_id', s.auth_user_id,
            'login', s.login_name,
            'display_name', s.display_name,
            'status', s.status,
            'created_at', i.created_at,
            'last_activity_at', s.last_seen_at,
            'metrics', jsonb_build_object(
                'h24', jsonb_build_object(
                    'reviewed', COUNT(*) FILTER (
                        WHERE a.action = 'SECURITY_FLAG_REVIEWED' AND a.created_at >= pg_catalog.now() - INTERVAL '24 hours'
                    )::INTEGER,
                    'resolved', COUNT(*) FILTER (
                        WHERE a.action = 'SECURITY_FLAG_RESOLVED' AND a.created_at >= pg_catalog.now() - INTERVAL '24 hours'
                    )::INTEGER,
                    'dismissed', COUNT(*) FILTER (
                        WHERE a.action = 'SECURITY_FLAG_DISMISSED' AND a.created_at >= pg_catalog.now() - INTERVAL '24 hours'
                    )::INTEGER,
                    'restrictions_applied', COUNT(*) FILTER (
                        WHERE a.action = 'SECURITY_RESTRICTION_APPLIED' AND a.created_at >= pg_catalog.now() - INTERVAL '24 hours'
                    )::INTEGER,
                    'restrictions_removed', COUNT(*) FILTER (
                        WHERE a.action = 'SECURITY_RESTRICTION_REMOVED' AND a.created_at >= pg_catalog.now() - INTERVAL '24 hours'
                    )::INTEGER
                ),
                'd7', jsonb_build_object(
                    'reviewed', COUNT(*) FILTER (
                        WHERE a.action = 'SECURITY_FLAG_REVIEWED' AND a.created_at >= pg_catalog.now() - INTERVAL '7 days'
                    )::INTEGER,
                    'resolved', COUNT(*) FILTER (
                        WHERE a.action = 'SECURITY_FLAG_RESOLVED' AND a.created_at >= pg_catalog.now() - INTERVAL '7 days'
                    )::INTEGER,
                    'dismissed', COUNT(*) FILTER (
                        WHERE a.action = 'SECURITY_FLAG_DISMISSED' AND a.created_at >= pg_catalog.now() - INTERVAL '7 days'
                    )::INTEGER,
                    'restrictions_applied', COUNT(*) FILTER (
                        WHERE a.action = 'SECURITY_RESTRICTION_APPLIED' AND a.created_at >= pg_catalog.now() - INTERVAL '7 days'
                    )::INTEGER,
                    'restrictions_removed', COUNT(*) FILTER (
                        WHERE a.action = 'SECURITY_RESTRICTION_REMOVED' AND a.created_at >= pg_catalog.now() - INTERVAL '7 days'
                    )::INTEGER
                ),
                'd30', jsonb_build_object(
                    'reviewed', COUNT(*) FILTER (
                        WHERE a.action = 'SECURITY_FLAG_REVIEWED' AND a.created_at >= pg_catalog.now() - INTERVAL '30 days'
                    )::INTEGER,
                    'resolved', COUNT(*) FILTER (
                        WHERE a.action = 'SECURITY_FLAG_RESOLVED' AND a.created_at >= pg_catalog.now() - INTERVAL '30 days'
                    )::INTEGER,
                    'dismissed', COUNT(*) FILTER (
                        WHERE a.action = 'SECURITY_FLAG_DISMISSED' AND a.created_at >= pg_catalog.now() - INTERVAL '30 days'
                    )::INTEGER,
                    'restrictions_applied', COUNT(*) FILTER (
                        WHERE a.action = 'SECURITY_RESTRICTION_APPLIED' AND a.created_at >= pg_catalog.now() - INTERVAL '30 days'
                    )::INTEGER,
                    'restrictions_removed', COUNT(*) FILTER (
                        WHERE a.action = 'SECURITY_RESTRICTION_REMOVED' AND a.created_at >= pg_catalog.now() - INTERVAL '30 days'
                    )::INTEGER
                )
            )
        ) AS obj,
        i.created_at AS created_sort
        FROM private.staff_accounts AS s
        INNER JOIN private.security_staff_identities AS i ON i.auth_user_id = s.auth_user_id
        LEFT JOIN private.security_staff_actions AS a
            ON a.actor_user_id = s.auth_user_id
           AND a.actor_role = 'security'
        WHERE s.role = 'security'
        GROUP BY s.auth_user_id, s.login_name, s.display_name, s.status, s.last_seen_at, i.created_at
    ) AS item;

    RETURN jsonb_build_object('ok', true, 'rows', v_rows);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_security_team_activity(
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_limit INTEGER;
    v_offset INTEGER;
    v_total INTEGER;
    v_rows jsonb;
BEGIN
    PERFORM private.get_current_owner_context();
    v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
    v_offset := GREATEST(COALESCE(p_offset, 0), 0);

    SELECT COUNT(*)::INTEGER INTO v_total FROM private.security_staff_actions;

    SELECT COALESCE(jsonb_agg(item.obj ORDER BY item.created_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT jsonb_build_object(
            'at', a.created_at,
            'employee_login', COALESCE(s.login_name, ''),
            'employee_name', COALESCE(s.display_name, ''),
            'actor_role', a.actor_role,
            'action', a.action,
            'player_public_id', a.player_public_id,
            'target', a.target_id,
            'reason', a.reason,
            'result', a.result
        ) AS obj,
        a.created_at
        FROM private.security_staff_actions AS a
        LEFT JOIN private.staff_accounts AS s ON s.auth_user_id = a.actor_user_id
        ORDER BY a.created_at DESC
        LIMIT v_limit
        OFFSET v_offset
    ) AS item;

    RETURN jsonb_build_object('ok', true, 'rows', v_rows, 'total', v_total);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_set_security_staff_status(
    p_auth_user_id UUID,
    p_status TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_owner UUID;
    v_status TEXT;
    v_row private.staff_accounts%ROWTYPE;
BEGIN
    SELECT o.auth_user_id INTO v_owner FROM private.get_current_owner_context() AS o;
    v_status := lower(BTRIM(COALESCE(p_status, '')));
    IF v_status NOT IN ('active', 'disabled') THEN
        RAISE EXCEPTION 'STAFF_STATUS_INVALID';
    END IF;

    SELECT * INTO v_row
    FROM private.staff_accounts AS s
    WHERE s.auth_user_id = p_auth_user_id
      AND s.role = 'security'
    FOR UPDATE;

    IF v_row.auth_user_id IS NULL THEN
        RAISE EXCEPTION 'STAFF_ACCOUNT_NOT_FOUND';
    END IF;

    UPDATE private.staff_accounts
    SET status = v_status
    WHERE auth_user_id = p_auth_user_id
      AND role = 'security';

    PERFORM private.security_record_action(
        v_owner,
        'owner',
        'OWNER_SET_SECURITY_STAFF_STATUS',
        'security_staff',
        p_auth_user_id::text,
        NULL,
        v_status,
        'ok'
    );

    RETURN jsonb_build_object(
        'ok', true,
        'auth_user_id', p_auth_user_id,
        'login', v_row.login_name,
        'display_name', v_row.display_name,
        'status', v_status
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_audit_security_password_reset(p_auth_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_owner UUID;
    v_row private.staff_accounts%ROWTYPE;
BEGIN
    SELECT o.auth_user_id INTO v_owner FROM private.get_current_owner_context() AS o;

    SELECT * INTO v_row
    FROM private.staff_accounts AS s
    WHERE s.auth_user_id = p_auth_user_id
      AND s.role = 'security';

    IF v_row.auth_user_id IS NULL THEN
        RAISE EXCEPTION 'STAFF_ACCOUNT_NOT_FOUND';
    END IF;

    PERFORM private.security_record_action(
        v_owner,
        'owner',
        'OWNER_RESET_SECURITY_PASSWORD',
        'security_staff',
        p_auth_user_id::text,
        NULL,
        NULL,
        'ok'
    );

    RETURN jsonb_build_object(
        'ok', true,
        'auth_user_id', p_auth_user_id,
        'login', v_row.login_name
    );
END;
$fn$;


ALTER TABLE private.staff_audit_log
DROP CONSTRAINT IF EXISTS staff_audit_log_actor_role_check;

ALTER TABLE private.staff_audit_log
ADD CONSTRAINT staff_audit_log_actor_role_check
CHECK (
  actor_role IS NULL
  OR actor_role IN (
    'owner',
    'manager',
    'cashier',
    'security',
    'system'
  )
);


REVOKE ALL ON FUNCTION private.security_staff_actions_append_only() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.security_record_action(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.security_flag_action_name(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.security_resolve_risk_flag(UUID, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.security_flags_overview() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.security_player_dossier(UUID) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.security_current_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_current_staff() TO authenticated;

REVOKE ALL ON FUNCTION public.security_security_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_security_overview() TO authenticated;

REVOKE ALL ON FUNCTION public.security_list_security_flags(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_list_security_flags(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.security_player_security(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_player_security(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.security_resolve_security_flag(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_resolve_security_flag(UUID, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.security_player_security_restriction(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_player_security_restriction(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.security_set_player_security_restriction(TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_set_player_security_restriction(TEXT, BOOLEAN, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.security_activity_feed(INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_activity_feed(INTEGER, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.security_lookup_login_email(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_lookup_login_email(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.owner_provision_security_staff(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_provision_security_staff(UUID, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.owner_list_security_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_list_security_staff() TO authenticated;

REVOKE ALL ON FUNCTION public.owner_security_team_activity(INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_security_team_activity(INTEGER, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.owner_set_security_staff_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_set_security_staff_status(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.owner_audit_security_password_reset(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_audit_security_password_reset(UUID) TO authenticated;

COMMIT;
