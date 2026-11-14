BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION private.complete_player_manual_verification(
    p_player_user_id uuid, p_actor_user_id uuid, p_actor_staff_role text,
    p_reason text, p_confirmed boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
    v_public text;
    v_reason text := nullif(btrim(p_reason), '');
    v_row private.player_manual_verification_requests%ROWTYPE;
BEGIN
    IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
    IF p_actor_staff_role IS NULL OR NOT private.security_restriction_mutator_role_allowed(p_actor_staff_role) THEN
        RAISE EXCEPTION 'MANUAL_VERIFICATION_ACTOR_DENIED';
    END IF;
    IF p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'VERIFICATION_CONFIRMATION_REQUIRED'; END IF;
    IF v_reason IS NULL THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
    IF char_length(v_reason) > 500 THEN RAISE EXCEPTION 'REASON_TOO_LONG'; END IF;
    v_public := private.player_security_public_id(p_player_user_id);
    IF v_public IS NULL OR v_public !~ '^[0-9]{6}$' THEN RAISE EXCEPTION 'PLAYER_NOT_FOUND'; END IF;

    INSERT INTO private.player_manual_verification_requests AS r (
        player_user_id, player_public_id, status, requested_by, requested_by_role, reason,
        completed_at, completed_by, completed_by_role
    ) VALUES (
        p_player_user_id, v_public, 'VERIFIED', p_actor_user_id, p_actor_staff_role, v_reason,
        now(), p_actor_user_id, p_actor_staff_role
    ) ON CONFLICT (player_user_id) DO UPDATE SET
        status = 'VERIFIED', completed_at = EXCLUDED.completed_at, completed_by = EXCLUDED.completed_by,
        completed_by_role = EXCLUDED.completed_by_role, updated_at = EXCLUDED.completed_at
    WHERE r.status <> 'VERIFIED'
    RETURNING * INTO v_row;

    IF FOUND THEN
        INSERT INTO private.player_manual_verification_events (
            player_user_id, player_public_id, event_type, actor_auth_user_id, actor_staff_role, reason
        ) VALUES (p_player_user_id, v_public, 'VERIFICATION_COMPLETED', p_actor_user_id, p_actor_staff_role, v_reason);

        IF p_actor_staff_role = 'security' THEN
            PERFORM private.security_record_action(p_actor_user_id, p_actor_staff_role,
                'PLAYER_MANUAL_VERIFICATION_COMPLETED', 'player', v_public, v_public, v_reason, 'ok');
        ELSE
            PERFORM private.append_staff_audit('PLAYER_MANUAL_VERIFICATION_COMPLETED', 'player', v_public, 'owner_only',
                jsonb_build_object('player_public_id', v_public, 'completed_by_role', p_actor_staff_role, 'reason', v_reason));
        END IF;
    END IF;
    RETURN private.read_player_manual_verification(p_player_user_id);
END;
$fn$;

CREATE FUNCTION public.owner_complete_player_manual_verification(p_player_id text, p_reason text, p_confirmed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_actor uuid;
BEGIN
    SELECT o.auth_user_id INTO v_actor FROM private.get_current_owner_context() o;
    RETURN private.complete_player_manual_verification(
        private.player_security_user_id_from_public_id(p_player_id), v_actor, 'owner', p_reason, p_confirmed);
END;
$fn$;

CREATE FUNCTION public.security_complete_player_manual_verification(p_player_id text, p_reason text, p_confirmed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_actor uuid;
BEGIN
    SELECT s.auth_user_id INTO v_actor FROM private.get_current_security_context() s;
    RETURN private.complete_player_manual_verification(
        private.player_security_user_id_from_public_id(p_player_id), v_actor, 'security', p_reason, p_confirmed);
END;
$fn$;

REVOKE ALL ON FUNCTION private.complete_player_manual_verification(uuid,uuid,text,text,boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.owner_complete_player_manual_verification(text,text,boolean),
    public.security_complete_player_manual_verification(text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_complete_player_manual_verification(text,text,boolean),
    public.security_complete_player_manual_verification(text,text,boolean) TO authenticated;
DROP FUNCTION public.owner_complete_player_manual_verification(text) RESTRICT;
DROP FUNCTION public.security_complete_player_manual_verification(text) RESTRICT;
DROP FUNCTION private.complete_player_manual_verification(uuid,uuid,text) RESTRICT;

-- Security context refreshes last_seen_at and must run in a volatile RPC.
ALTER FUNCTION public.security_player_personal_data_summary(text) VOLATILE;
ALTER FUNCTION public.security_player_manual_verification(text) VOLATILE;

COMMIT;
