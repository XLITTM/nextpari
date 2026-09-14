BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 054
-- PLAYER PASSWORD RECOVERY (VERIFIED EMAIL OTP)
-- Sequence: after 053 (owner financial dashboard auth).
--
-- Repository only. DO NOT APPLY from this change.
-- Read-only for money: no Wallet Ledger, treasury, cashier,
-- or player balance mutation.
-- Does not use native Supabase reset-password email links.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS private;


-- ============================================================
-- A. RECOVERY STATE
-- ============================================================

CREATE TABLE IF NOT EXISTS private.player_password_recovery_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_user_id UUID NOT NULL,
    code_digest TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    last_sent_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    CONSTRAINT player_password_recovery_digest_check
        CHECK (char_length(code_digest) = 64 AND code_digest ~ '^[0-9a-f]{64}$'),
    CONSTRAINT player_password_recovery_attempts_check
        CHECK (attempt_count >= 0 AND max_attempts = 5)
);

CREATE INDEX IF NOT EXISTS player_password_recovery_challenges_user_idx
    ON private.player_password_recovery_challenges (player_user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS player_password_recovery_challenges_active_uidx
    ON private.player_password_recovery_challenges (player_user_id)
    WHERE consumed_at IS NULL;

COMMENT ON TABLE private.player_password_recovery_challenges IS
'Password-recovery OTP challenges. HMAC digests only. No raw OTP, password, IP, or device token.';

CREATE TABLE IF NOT EXISTS private.player_password_reset_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_user_id UUID NOT NULL,
    ticket_digest TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    CONSTRAINT player_password_reset_ticket_digest_check
        CHECK (char_length(ticket_digest) = 64 AND ticket_digest ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS player_password_reset_tickets_user_idx
    ON private.player_password_reset_tickets (player_user_id, created_at DESC);

COMMENT ON TABLE private.player_password_reset_tickets IS
'One-time password-reset tickets. HMAC digests only. No raw ticket or password.';

REVOKE ALL ON TABLE private.player_password_recovery_challenges FROM PUBLIC;
REVOKE ALL ON TABLE private.player_password_recovery_challenges FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE private.player_password_reset_tickets FROM PUBLIC;
REVOKE ALL ON TABLE private.player_password_reset_tickets FROM anon, authenticated, service_role;


-- ============================================================
-- B. SECURITY EVENT TYPES
-- ============================================================

ALTER TABLE private.player_security_events
    DROP CONSTRAINT IF EXISTS player_security_event_type_check;

ALTER TABLE private.player_security_events
    ADD CONSTRAINT player_security_event_type_check
    CHECK (event_type IN (
        'LOGIN_SUCCESS',
        'LOGIN_FAILURE',
        'REGISTER_SUCCESS',
        'REGISTER_FAILURE',
        'PASSWORD_CHANGED',
        'EMAIL_VERIFIED',
        'AUTH_RATE_LIMITED',
        'SHARED_DEVICE_SIGNAL',
        'SHARED_NETWORK_SIGNAL',
        'PASSWORD_RECOVERY_REQUESTED',
        'PASSWORD_RECOVERY_VERIFIED',
        'PASSWORD_RECOVERY_COMPLETED'
    ));


-- ============================================================
-- C. PRIVATE LOOKUP (verified email only)
-- ============================================================

CREATE OR REPLACE FUNCTION private.player_password_recovery_lookup(p_identifier TEXT)
RETURNS TABLE (
    player_user_id UUID,
    verified_email TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_raw TEXT;
    v_email TEXT;
    v_digits TEXT;
    v_uid UUID;
    v_hits INTEGER;
BEGIN
    v_raw := btrim(COALESCE(p_identifier, ''));
    IF v_raw = '' THEN
        RETURN;
    END IF;

    IF v_raw ~ '^[0-9]{6}$' THEN
        v_digits := v_raw;
        SELECT COUNT(DISTINCT x.id)
        INTO v_hits
        FROM (
            SELECT p.id
            FROM public.wallets AS w
            JOIN public.profiles AS p ON p.wallet_id = w.id
            JOIN auth.users AS u ON u.id = p.id
            WHERE private.player_digits(w.public_id) = v_digits
            UNION
            SELECT p.id
            FROM public.profiles AS p
            JOIN auth.users AS u ON u.id = p.id
            WHERE private.player_digits(p.public_id) = v_digits
        ) AS x;
        IF v_hits IS DISTINCT FROM 1 THEN
            RETURN;
        END IF;
        SELECT x.id
        INTO v_uid
        FROM (
            SELECT p.id
            FROM public.wallets AS w
            JOIN public.profiles AS p ON p.wallet_id = w.id
            JOIN auth.users AS u ON u.id = p.id
            WHERE private.player_digits(w.public_id) = v_digits
            UNION
            SELECT p.id
            FROM public.profiles AS p
            JOIN auth.users AS u ON u.id = p.id
            WHERE private.player_digits(p.public_id) = v_digits
        ) AS x;
    ELSE
        v_email := lower(v_raw);
        IF v_email NOT LIKE '%_@_%.%' OR position('@' IN v_email) < 2 THEN
            RETURN;
        END IF;
        IF v_email LIKE '%@auth.nextpari.invalid' THEN
            RETURN;
        END IF;
        SELECT COUNT(*)
        INTO v_hits
        FROM auth.users AS u
        WHERE lower(btrim(COALESCE(u.email, ''))) = v_email
          AND u.email_confirmed_at IS NOT NULL
          AND lower(btrim(COALESCE(u.email, ''))) NOT LIKE '%@auth.nextpari.invalid';
        IF v_hits IS DISTINCT FROM 1 THEN
            RETURN;
        END IF;
        SELECT u.id
        INTO v_uid
        FROM auth.users AS u
        WHERE lower(btrim(COALESCE(u.email, ''))) = v_email
          AND u.email_confirmed_at IS NOT NULL
          AND lower(btrim(COALESCE(u.email, ''))) NOT LIKE '%@auth.nextpari.invalid';
    END IF;

    IF v_uid IS NULL THEN
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM private.staff_accounts AS s
        WHERE s.auth_user_id = v_uid
    ) THEN
        RETURN;
    END IF;

    SELECT lower(btrim(COALESCE(u.email, '')))
    INTO v_email
    FROM auth.users AS u
    WHERE u.id = v_uid
      AND u.email_confirmed_at IS NOT NULL
      AND lower(btrim(COALESCE(u.email, ''))) <> ''
      AND lower(btrim(COALESCE(u.email, ''))) NOT LIKE '%@auth.nextpari.invalid';

    IF v_email IS NULL OR v_email = '' THEN
        RETURN;
    END IF;

    player_user_id := v_uid;
    verified_email := v_email;
    RETURN NEXT;
END;
$fn$;

REVOKE ALL ON FUNCTION private.player_password_recovery_lookup(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.player_password_recovery_lookup(TEXT) FROM anon, authenticated, service_role;


-- ============================================================
-- D. PREPARE CHALLENGE
-- ============================================================

CREATE OR REPLACE FUNCTION private.player_password_recovery_prepare(
    p_identifier TEXT,
    p_code_digest TEXT,
    p_expires_at TIMESTAMPTZ
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_key TEXT;
    v_uid UUID;
    v_email TEXT;
    v_sends INTEGER;
    v_latest TIMESTAMPTZ;
    v_id UUID;
BEGIN
    v_key := lower(btrim(COALESCE(p_identifier, '')));
    IF v_key = ''
       OR p_code_digest IS NULL
       OR char_length(p_code_digest) <> 64
       OR p_code_digest !~ '^[0-9a-f]{64}$'
       OR p_expires_at IS NULL THEN
        RETURN jsonb_build_object('eligible', FALSE);
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('nextpari:player-password-recovery:' || v_key, 0)
    );

    SELECT l.player_user_id, l.verified_email
    INTO v_uid, v_email
    FROM private.player_password_recovery_lookup(p_identifier) AS l
    LIMIT 1;

    IF v_uid IS NULL OR v_email IS NULL OR v_email = '' THEN
        RETURN jsonb_build_object('eligible', FALSE);
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'nextpari:player-password-recovery-user:' || v_uid::TEXT,
            0
        )
    );

    SELECT COUNT(*)
    INTO v_sends
    FROM private.player_password_recovery_challenges AS c
    WHERE c.player_user_id = v_uid
      AND c.created_at > pg_catalog.now() - INTERVAL '1 hour';
    IF v_sends >= 5 THEN
        RETURN jsonb_build_object('eligible', FALSE);
    END IF;

    SELECT MAX(c.last_sent_at)
    INTO v_latest
    FROM private.player_password_recovery_challenges AS c
    WHERE c.player_user_id = v_uid;
    IF v_latest IS NOT NULL AND v_latest > pg_catalog.now() - INTERVAL '60 seconds' THEN
        RETURN jsonb_build_object('eligible', FALSE);
    END IF;

    UPDATE private.player_password_recovery_challenges AS c
    SET consumed_at = pg_catalog.now()
    WHERE c.player_user_id = v_uid
      AND c.consumed_at IS NULL;

    INSERT INTO private.player_password_recovery_challenges (
        player_user_id,
        code_digest,
        expires_at,
        attempt_count,
        max_attempts,
        last_sent_at
    )
    VALUES (
        v_uid,
        p_code_digest,
        p_expires_at,
        0,
        5,
        pg_catalog.now()
    )
    RETURNING id INTO v_id;

    RETURN jsonb_build_object(
        'eligible', TRUE,
        'challenge_id', v_id,
        'player_user_id', v_uid,
        'email', v_email
    );
END;
$fn$;

REVOKE ALL ON FUNCTION private.player_password_recovery_prepare(TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.player_password_recovery_prepare(TEXT, TEXT, TIMESTAMPTZ) FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.player_password_recovery_prepare(
    p_identifier TEXT,
    p_code_digest TEXT,
    p_expires_at TIMESTAMPTZ
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    RETURN private.player_password_recovery_prepare(p_identifier, p_code_digest, p_expires_at);
END;
$fn$;

REVOKE ALL ON FUNCTION public.player_password_recovery_prepare(TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_password_recovery_prepare(TEXT, TEXT, TIMESTAMPTZ) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_password_recovery_prepare(TEXT, TEXT, TIMESTAMPTZ) TO service_role;


CREATE OR REPLACE FUNCTION private.player_password_recovery_mark_unusable(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    UPDATE private.player_password_recovery_challenges
    SET consumed_at = pg_catalog.now(),
        expires_at = pg_catalog.now()
    WHERE id = p_id
      AND consumed_at IS NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION private.player_password_recovery_mark_unusable(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.player_password_recovery_mark_unusable(UUID) FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.player_password_recovery_mark_unusable(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.player_password_recovery_mark_unusable(p_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.player_password_recovery_mark_unusable(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_password_recovery_mark_unusable(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_password_recovery_mark_unusable(UUID) TO service_role;


-- ============================================================
-- E. VERIFY OTP → RESET TICKET
-- ============================================================

CREATE OR REPLACE FUNCTION private.player_password_recovery_verify(
    p_challenge_id UUID,
    p_code_digest TEXT,
    p_ticket_digest TEXT,
    p_ticket_expires_at TIMESTAMPTZ
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_row private.player_password_recovery_challenges%ROWTYPE;
    v_ticket UUID;
BEGIN
    IF p_challenge_id IS NULL
       OR p_code_digest IS NULL
       OR char_length(p_code_digest) <> 64
       OR p_ticket_digest IS NULL
       OR char_length(p_ticket_digest) <> 64
       OR p_ticket_expires_at IS NULL THEN
        RETURN jsonb_build_object('ok', FALSE);
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'nextpari:player-password-recovery-challenge:' || p_challenge_id::TEXT,
            0
        )
    );

    SELECT *
    INTO v_row
    FROM private.player_password_recovery_challenges AS c
    WHERE c.id = p_challenge_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_row.consumed_at IS NOT NULL
       OR v_row.verified_at IS NOT NULL
       OR v_row.expires_at <= pg_catalog.now()
       OR v_row.attempt_count >= v_row.max_attempts THEN
        RETURN jsonb_build_object('ok', FALSE);
    END IF;

    IF v_row.code_digest IS DISTINCT FROM p_code_digest THEN
        UPDATE private.player_password_recovery_challenges
        SET attempt_count = attempt_count + 1
        WHERE id = p_challenge_id
          AND consumed_at IS NULL;
        RETURN jsonb_build_object('ok', FALSE);
    END IF;

    UPDATE private.player_password_recovery_challenges
    SET verified_at = pg_catalog.now(),
        consumed_at = pg_catalog.now()
    WHERE id = p_challenge_id
      AND consumed_at IS NULL
      AND verified_at IS NULL
      AND expires_at > pg_catalog.now()
      AND attempt_count < max_attempts
      AND code_digest = p_code_digest;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', FALSE);
    END IF;

    INSERT INTO private.player_password_reset_tickets (
        player_user_id,
        ticket_digest,
        expires_at
    )
    VALUES (
        v_row.player_user_id,
        p_ticket_digest,
        p_ticket_expires_at
    )
    RETURNING id INTO v_ticket;

    RETURN jsonb_build_object(
        'ok', TRUE,
        'player_user_id', v_row.player_user_id,
        'ticket_id', v_ticket
    );
END;
$fn$;

REVOKE ALL ON FUNCTION private.player_password_recovery_verify(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.player_password_recovery_verify(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.player_password_recovery_verify(
    p_challenge_id UUID,
    p_code_digest TEXT,
    p_ticket_digest TEXT,
    p_ticket_expires_at TIMESTAMPTZ
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    RETURN private.player_password_recovery_verify(
        p_challenge_id,
        p_code_digest,
        p_ticket_digest,
        p_ticket_expires_at
    );
END;
$fn$;

REVOKE ALL ON FUNCTION public.player_password_recovery_verify(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_password_recovery_verify(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_password_recovery_verify(UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;


-- ============================================================
-- F. CONSUME RESET TICKET
-- ============================================================

CREATE OR REPLACE FUNCTION private.player_password_recovery_consume_ticket(p_ticket_digest TEXT)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
BEGIN
    IF p_ticket_digest IS NULL OR char_length(p_ticket_digest) <> 64 THEN
        RETURN jsonb_build_object('ok', FALSE);
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'nextpari:player-password-recovery-ticket:' || p_ticket_digest,
            0
        )
    );

    UPDATE private.player_password_reset_tickets
    SET consumed_at = pg_catalog.now()
    WHERE ticket_digest = p_ticket_digest
      AND consumed_at IS NULL
      AND expires_at > pg_catalog.now()
    RETURNING player_user_id INTO v_uid;

    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('ok', FALSE);
    END IF;

    RETURN jsonb_build_object('ok', TRUE, 'player_user_id', v_uid);
END;
$fn$;

REVOKE ALL ON FUNCTION private.player_password_recovery_consume_ticket(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.player_password_recovery_consume_ticket(TEXT) FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.player_password_recovery_consume_ticket(p_ticket_digest TEXT)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    RETURN private.player_password_recovery_consume_ticket(p_ticket_digest);
END;
$fn$;

REVOKE ALL ON FUNCTION public.player_password_recovery_consume_ticket(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_password_recovery_consume_ticket(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_password_recovery_consume_ticket(TEXT) TO service_role;

COMMIT;
