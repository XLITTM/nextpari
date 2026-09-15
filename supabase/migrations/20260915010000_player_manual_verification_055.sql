BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 055
-- MANUAL PLAYER VERIFICATION REQUEST + INSTRUCTION DELIVERY
-- Sequence: after 054 (player password recovery).
--
-- Repository only. DO NOT APPLY from this change.
--
-- Verification status is independent of Security restriction.
-- Missing/unverified email MUST NOT enable restriction, hard block,
-- wallet mutation, or permission changes.
-- Security restriction may be enabled only through the existing
-- explicit owner/security setter, and only when this request
-- explicitly asks to apply it in the same authorized action.
-- ============================================================


CREATE TABLE IF NOT EXISTS private.player_manual_verification_requests (
    player_user_id UUID PRIMARY KEY,
    player_public_id TEXT NOT NULL,
    status TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    requested_by UUID NOT NULL,
    requested_by_role TEXT NOT NULL,
    reason TEXT NOT NULL,
    reason_code TEXT,
    restriction_enabled_with_request BOOLEAN NOT NULL DEFAULT FALSE,
    instructions_sent_at TIMESTAMPTZ,
    instructions_send_started_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT player_manual_verification_public_id_check
        CHECK (player_public_id ~ '^[0-9]{6}$'),
    CONSTRAINT player_manual_verification_status_check
        CHECK (status = 'VERIFICATION_REQUIRED'),
    CONSTRAINT player_manual_verification_role_check
        CHECK (requested_by_role IN ('owner', 'security')),
    CONSTRAINT player_manual_verification_reason_check
        CHECK (char_length(BTRIM(reason)) > 0 AND char_length(reason) <= 500),
    CONSTRAINT player_manual_verification_reason_code_check
        CHECK (reason_code IS NULL OR (char_length(BTRIM(reason_code)) > 0 AND char_length(reason_code) <= 64))
);

COMMENT ON TABLE private.player_manual_verification_requests IS
'Canonical current-state manual verification request. Independent of Security restriction, hard block, and Wallet Ledger. Browser roles cannot mutate this table.';


CREATE TABLE IF NOT EXISTS private.player_manual_verification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_user_id UUID NOT NULL,
    player_public_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor_auth_user_id UUID,
    actor_staff_role TEXT,
    reason TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT player_manual_verification_event_type_check
        CHECK (event_type IN ('VERIFICATION_REQUESTED', 'VERIFICATION_INSTRUCTIONS_SENT')),
    CONSTRAINT player_manual_verification_event_role_check
        CHECK (actor_staff_role IS NULL OR actor_staff_role IN ('owner', 'security', 'system'))
);

CREATE INDEX IF NOT EXISTS player_manual_verification_events_player_idx
    ON private.player_manual_verification_events (player_user_id, created_at DESC);

COMMENT ON TABLE private.player_manual_verification_events IS
'Append-only audit of manual verification requests and instruction delivery. Not exposed to the player app.';


CREATE OR REPLACE FUNCTION private.player_manual_verification_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
    RAISE EXCEPTION 'PLAYER_MANUAL_VERIFICATION_EVENTS_IMMUTABLE';
END;
$fn$;

DROP TRIGGER IF EXISTS player_manual_verification_events_no_update
    ON private.player_manual_verification_events;
CREATE TRIGGER player_manual_verification_events_no_update
    BEFORE UPDATE OR DELETE ON private.player_manual_verification_events
    FOR EACH ROW
    EXECUTE FUNCTION private.player_manual_verification_events_append_only();


CREATE OR REPLACE FUNCTION private.player_verified_email(p_player_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_email TEXT;
BEGIN
    IF p_player_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT lower(btrim(COALESCE(u.email, '')))
    INTO v_email
    FROM auth.users AS u
    WHERE u.id = p_player_user_id
      AND u.email_confirmed_at IS NOT NULL
      AND lower(btrim(COALESCE(u.email, ''))) NOT LIKE '%@auth.nextpari.invalid'
    LIMIT 1;

    IF v_email IS NULL OR v_email = '' OR v_email NOT LIKE '%_@_%.__%' THEN
        RETURN NULL;
    END IF;
    RETURN v_email;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_has_verified_email(p_player_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
    SELECT private.player_verified_email(p_player_user_id) IS NOT NULL;
$fn$;


CREATE OR REPLACE FUNCTION private.request_player_manual_verification(
    p_player_user_id UUID,
    p_reason TEXT,
    p_reason_code TEXT,
    p_restrict BOOLEAN,
    p_actor_user_id UUID,
    p_actor_staff_role TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_reason TEXT;
    v_code TEXT;
    v_role TEXT;
    v_public TEXT;
    v_restrict BOOLEAN;
    v_enabled BOOLEAN := FALSE;
    v_row private.player_manual_verification_requests%ROWTYPE;
    v_restricted BOOLEAN := FALSE;
BEGIN
    v_role := BTRIM(COALESCE(p_actor_staff_role, ''));
    IF NOT private.security_restriction_mutator_role_allowed(v_role) THEN
        RAISE EXCEPTION 'MANUAL_VERIFICATION_ACTOR_DENIED';
    END IF;
    IF p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    IF p_player_user_id IS NULL THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;

    v_reason := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
    IF v_reason IS NULL THEN
        RAISE EXCEPTION 'REASON_REQUIRED';
    END IF;
    IF char_length(v_reason) > 500 THEN
        RAISE EXCEPTION 'REASON_TOO_LONG';
    END IF;

    v_code := NULLIF(BTRIM(COALESCE(p_reason_code, '')), '');
    IF v_code IS NOT NULL AND char_length(v_code) > 64 THEN
        RAISE EXCEPTION 'REASON_CODE_INVALID';
    END IF;

    v_public := private.player_security_public_id(p_player_user_id);
    IF v_public IS NULL OR v_public !~ '^[0-9]{6}$' THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;

    v_restrict := COALESCE(p_restrict, FALSE);

    SELECT *
    INTO v_row
    FROM private.player_manual_verification_requests AS r
    WHERE r.player_user_id = p_player_user_id
    FOR UPDATE;

    IF v_row.player_user_id IS NULL THEN
        INSERT INTO private.player_manual_verification_requests (
            player_user_id,
            player_public_id,
            status,
            requested_at,
            requested_by,
            requested_by_role,
            reason,
            reason_code,
            restriction_enabled_with_request
        ) VALUES (
            p_player_user_id,
            v_public,
            'VERIFICATION_REQUIRED',
            pg_catalog.now(),
            p_actor_user_id,
            v_role,
            v_reason,
            v_code,
            FALSE
        )
        RETURNING * INTO v_row;
    ELSE
        UPDATE private.player_manual_verification_requests AS r
        SET
            status = 'VERIFICATION_REQUIRED',
            requested_at = pg_catalog.now(),
            requested_by = p_actor_user_id,
            requested_by_role = v_role,
            reason = v_reason,
            reason_code = v_code,
            instructions_sent_at = NULL,
            instructions_send_started_at = NULL,
            updated_at = pg_catalog.now()
        WHERE r.player_user_id = p_player_user_id
        RETURNING * INTO v_row;
    END IF;

    IF v_restrict THEN
        v_restricted := private.is_player_security_restricted(p_player_user_id);
        IF NOT v_restricted THEN
            PERFORM private.set_player_security_restriction(
                p_player_user_id,
                TRUE,
                v_reason,
                p_actor_user_id,
                v_role
            );
            v_enabled := TRUE;
        END IF;
    END IF;

    UPDATE private.player_manual_verification_requests AS r
    SET
        restriction_enabled_with_request = v_enabled,
        updated_at = pg_catalog.now()
    WHERE r.player_user_id = p_player_user_id
    RETURNING * INTO v_row;

    INSERT INTO private.player_manual_verification_events (
        player_user_id,
        player_public_id,
        event_type,
        actor_auth_user_id,
        actor_staff_role,
        reason,
        payload
    ) VALUES (
        p_player_user_id,
        v_public,
        'VERIFICATION_REQUESTED',
        p_actor_user_id,
        v_role,
        v_reason,
        jsonb_build_object(
            'reason_code', v_code,
            'restriction_enabled_with_request', v_enabled,
            'has_verified_email', private.player_has_verified_email(p_player_user_id)
        )
    );

    PERFORM private.append_staff_audit(
        'PLAYER_MANUAL_VERIFICATION_REQUESTED',
        'player',
        v_public,
        'owner_only',
        jsonb_build_object(
            'player_public_id', v_public,
            'requested_by_role', v_role,
            'restriction_enabled_with_request', v_enabled,
            'has_verified_email', private.player_has_verified_email(p_player_user_id)
        )
    );

    RETURN jsonb_build_object(
        'ok', TRUE,
        'player_public_id', v_public,
        'player_user_id', p_player_user_id,
        'status', v_row.status,
        'requested_at', v_row.requested_at,
        'requested_by', v_row.requested_by,
        'requested_by_role', v_row.requested_by_role,
        'reason', v_row.reason,
        'reason_code', v_row.reason_code,
        'restriction_enabled_with_request', v_row.restriction_enabled_with_request,
        'has_verified_email', private.player_has_verified_email(p_player_user_id),
        'instructions_sent', v_row.instructions_sent_at IS NOT NULL,
        'restricted', private.is_player_security_restricted(p_player_user_id)
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.read_player_manual_verification(
    p_player_user_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_row private.player_manual_verification_requests%ROWTYPE;
    v_public TEXT;
BEGIN
    IF p_player_user_id IS NULL THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;
    v_public := private.player_security_public_id(p_player_user_id);
    IF v_public IS NULL OR v_public !~ '^[0-9]{6}$' THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;

    SELECT *
    INTO v_row
    FROM private.player_manual_verification_requests AS r
    WHERE r.player_user_id = p_player_user_id;

    IF v_row.player_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'ok', TRUE,
            'player_public_id', v_public,
            'verification_requested', FALSE,
            'status', NULL,
            'requested_at', NULL,
            'requested_by', NULL,
            'requested_by_role', NULL,
            'reason', NULL,
            'reason_code', NULL,
            'restriction_enabled_with_request', FALSE,
            'has_verified_email', private.player_has_verified_email(p_player_user_id),
            'instructions_sent', FALSE,
            'restricted', private.is_player_security_restricted(p_player_user_id)
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', TRUE,
        'player_public_id', v_public,
        'verification_requested', TRUE,
        'status', v_row.status,
        'requested_at', v_row.requested_at,
        'requested_by', v_row.requested_by,
        'requested_by_role', v_row.requested_by_role,
        'reason', v_row.reason,
        'reason_code', v_row.reason_code,
        'restriction_enabled_with_request', v_row.restriction_enabled_with_request,
        'has_verified_email', private.player_has_verified_email(p_player_user_id),
        'instructions_sent', v_row.instructions_sent_at IS NOT NULL,
        'restricted', private.is_player_security_restricted(p_player_user_id)
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_manual_verification_safe_notice(
    p_player_user_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_row private.player_manual_verification_requests%ROWTYPE;
    v_has_email BOOLEAN;
BEGIN
    IF p_player_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

    v_has_email := private.player_has_verified_email(p_player_user_id);

    SELECT *
    INTO v_row
    FROM private.player_manual_verification_requests AS r
    WHERE r.player_user_id = p_player_user_id;

    IF v_row.player_user_id IS NULL OR v_row.status IS DISTINCT FROM 'VERIFICATION_REQUIRED' THEN
        RETURN jsonb_build_object(
            'ok', TRUE,
            'verification_requested', FALSE,
            'verification_status', NULL,
            'requested_at', NULL,
            'has_verified_email', v_has_email,
            'bind_email_required', NOT v_has_email,
            'instructions_sent', FALSE
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', TRUE,
        'verification_requested', TRUE,
        'verification_status', v_row.status,
        'requested_at', v_row.requested_at,
        'has_verified_email', v_has_email,
        'bind_email_required', NOT v_has_email,
        'instructions_sent', v_row.instructions_sent_at IS NOT NULL
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_manual_verification_claim_instruction_send(
    p_player_user_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_row private.player_manual_verification_requests%ROWTYPE;
    v_email TEXT;
BEGIN
    IF p_player_user_id IS NULL THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;

    v_email := private.player_verified_email(p_player_user_id);

    SELECT *
    INTO v_row
    FROM private.player_manual_verification_requests AS r
    WHERE r.player_user_id = p_player_user_id
    FOR UPDATE;

    IF v_row.player_user_id IS NULL OR v_row.status IS DISTINCT FROM 'VERIFICATION_REQUIRED' THEN
        RETURN jsonb_build_object('ok', FALSE, 'already_sent', FALSE);
    END IF;
    IF v_row.instructions_sent_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', FALSE, 'already_sent', TRUE);
    END IF;
    IF v_email IS NULL THEN
        RETURN jsonb_build_object('ok', FALSE, 'already_sent', FALSE, 'has_verified_email', FALSE);
    END IF;
    IF v_row.instructions_send_started_at IS NOT NULL
       AND v_row.instructions_send_started_at > (pg_catalog.now() - INTERVAL '2 minutes') THEN
        RETURN jsonb_build_object('ok', FALSE, 'already_sent', TRUE);
    END IF;

    UPDATE private.player_manual_verification_requests AS r
    SET
        instructions_send_started_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE r.player_user_id = p_player_user_id;

    RETURN jsonb_build_object(
        'ok', TRUE,
        'already_sent', FALSE,
        'has_verified_email', TRUE,
        'email', v_email,
        'player_user_id', p_player_user_id
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_manual_verification_mark_instructions_sent(
    p_player_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_updated INTEGER := 0;
    v_public TEXT;
BEGIN
    IF p_player_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    UPDATE private.player_manual_verification_requests AS r
    SET
        instructions_sent_at = COALESCE(r.instructions_sent_at, pg_catalog.now()),
        instructions_send_started_at = NULL,
        updated_at = pg_catalog.now()
    WHERE r.player_user_id = p_player_user_id
      AND r.status = 'VERIFICATION_REQUIRED'
      AND r.instructions_sent_at IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
        RETURN FALSE;
    END IF;

    v_public := private.player_security_public_id(p_player_user_id);
    INSERT INTO private.player_manual_verification_events (
        player_user_id,
        player_public_id,
        event_type,
        actor_staff_role,
        payload
    ) VALUES (
        p_player_user_id,
        COALESCE(v_public, '000000'),
        'VERIFICATION_INSTRUCTIONS_SENT',
        'system',
        jsonb_build_object('channel', 'verified_email')
    );

    RETURN TRUE;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_manual_verification_release_instruction_send(
    p_player_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    IF p_player_user_id IS NULL THEN
        RETURN;
    END IF;
    UPDATE private.player_manual_verification_requests AS r
    SET
        instructions_send_started_at = NULL,
        updated_at = pg_catalog.now()
    WHERE r.player_user_id = p_player_user_id
      AND r.instructions_sent_at IS NULL;
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_player_manual_verification(p_player_id TEXT)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.get_current_owner_context();
    RETURN private.read_player_manual_verification(
        private.player_security_user_id_from_public_id(p_player_id)
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_request_player_manual_verification(
    p_player_id TEXT,
    p_reason TEXT,
    p_restrict BOOLEAN DEFAULT FALSE,
    p_reason_code TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_owner UUID;
BEGIN
    SELECT o.auth_user_id
    INTO v_owner
    FROM private.get_current_owner_context() AS o;

    RETURN private.request_player_manual_verification(
        private.player_security_user_id_from_public_id(p_player_id),
        p_reason,
        p_reason_code,
        COALESCE(p_restrict, FALSE),
        v_owner,
        'owner'
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.security_player_manual_verification(p_player_id TEXT)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
BEGIN
    SELECT * INTO v_ctx FROM private.get_current_security_context();
    RETURN private.read_player_manual_verification(
        private.player_security_user_id_from_public_id(p_player_id)
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.security_request_player_manual_verification(
    p_player_id TEXT,
    p_reason TEXT,
    p_restrict BOOLEAN DEFAULT FALSE,
    p_reason_code TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_result jsonb;
BEGIN
    SELECT * INTO v_ctx FROM private.get_current_security_context();
    v_result := private.request_player_manual_verification(
        private.player_security_user_id_from_public_id(p_player_id),
        p_reason,
        p_reason_code,
        COALESCE(p_restrict, FALSE),
        v_ctx.auth_user_id,
        'security'
    );
    PERFORM private.security_record_action(
        v_ctx.auth_user_id,
        'security',
        'PLAYER_MANUAL_VERIFICATION_REQUESTED',
        'player',
        COALESCE(v_result ->> 'player_public_id', p_player_id),
        COALESCE(v_result ->> 'player_public_id', p_player_id),
        p_reason,
        'ok'
    );
    RETURN v_result;
END;
$fn$;


CREATE OR REPLACE FUNCTION public.player_manual_verification_notice()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    RETURN private.player_manual_verification_safe_notice(v_uid);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.player_manual_verification_claim_instruction_send(p_player_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    RETURN private.player_manual_verification_claim_instruction_send(p_player_user_id);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.player_manual_verification_mark_instructions_sent(p_player_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    RETURN private.player_manual_verification_mark_instructions_sent(p_player_user_id);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.player_manual_verification_release_instruction_send(p_player_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.player_manual_verification_release_instruction_send(p_player_user_id);
END;
$fn$;


REVOKE ALL ON TABLE private.player_manual_verification_requests FROM PUBLIC;
REVOKE ALL ON TABLE private.player_manual_verification_requests FROM anon, authenticated;
REVOKE ALL ON TABLE private.player_manual_verification_requests FROM service_role;
GRANT SELECT ON TABLE private.player_manual_verification_requests TO service_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE private.player_manual_verification_requests FROM service_role;

REVOKE ALL ON TABLE private.player_manual_verification_events FROM PUBLIC;
REVOKE ALL ON TABLE private.player_manual_verification_events FROM anon, authenticated;
REVOKE ALL ON TABLE private.player_manual_verification_events FROM service_role;
GRANT SELECT ON TABLE private.player_manual_verification_events TO service_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE private.player_manual_verification_events FROM service_role;

REVOKE ALL ON FUNCTION private.player_verified_email(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_has_verified_email(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.request_player_manual_verification(UUID, TEXT, TEXT, BOOLEAN, UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.read_player_manual_verification(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_manual_verification_safe_notice(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_manual_verification_claim_instruction_send(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_manual_verification_mark_instructions_sent(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_manual_verification_release_instruction_send(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_manual_verification_events_append_only() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.owner_player_manual_verification(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_player_manual_verification(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.owner_request_player_manual_verification(TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_request_player_manual_verification(TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.security_player_manual_verification(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_player_manual_verification(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.security_request_player_manual_verification(TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_request_player_manual_verification(TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.player_manual_verification_notice() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_manual_verification_notice() TO authenticated;

REVOKE ALL ON FUNCTION public.player_manual_verification_claim_instruction_send(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_manual_verification_claim_instruction_send(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_manual_verification_claim_instruction_send(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.player_manual_verification_mark_instructions_sent(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_manual_verification_mark_instructions_sent(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_manual_verification_mark_instructions_sent(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.player_manual_verification_release_instruction_send(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_manual_verification_release_instruction_send(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_manual_verification_release_instruction_send(UUID) TO service_role;

COMMIT;
