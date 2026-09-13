BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 044
-- SEQUENTIAL PLAYER IDs + VERIFIED EMAIL BINDING
-- Sequence: after 043 (owner debit audit visibility).
--
-- Repository only. DO NOT APPLY from this change.
-- Existing public_id values are never rewritten.
-- New accounts allocate from a locked singleton counter.
-- Email OTP hashes are stored; raw OTP codes never persist.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS private;


-- ============================================================
-- A. SEQUENTIAL PLAYER PUBLIC ID COUNTER
-- ============================================================

CREATE TABLE IF NOT EXISTS private.player_public_id_counter (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE,
    next_value INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT player_public_id_counter_singleton_true CHECK (singleton IS TRUE),
    CONSTRAINT player_public_id_counter_next_value_check
        CHECK (next_value BETWEEN 1 AND 1000000)
);

REVOKE ALL ON TABLE private.player_public_id_counter FROM PUBLIC;
REVOKE ALL ON TABLE private.player_public_id_counter FROM anon, authenticated;

INSERT INTO private.player_public_id_counter (singleton, next_value)
VALUES (TRUE, 1)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION private.allocate_next_player_public_id()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_next INTEGER;
    v_candidate TEXT;
BEGIN
    SELECT c.next_value
    INTO v_next
    FROM private.player_public_id_counter AS c
    WHERE c.singleton IS TRUE
    FOR UPDATE;

    IF v_next IS NULL THEN
        RAISE EXCEPTION 'PUBLIC_ID_COUNTER_MISSING';
    END IF;

    LOOP
        IF v_next > 999999 THEN
            RAISE EXCEPTION 'PUBLIC_ID_SPACE_EXHAUSTED';
        END IF;

        v_candidate := pg_catalog.lpad(v_next::TEXT, 6, '0');

        IF NOT EXISTS (
            SELECT 1 FROM public.wallets AS w WHERE w.public_id = v_candidate
        ) AND NOT EXISTS (
            SELECT 1 FROM public.profiles AS p WHERE p.public_id = v_candidate
        ) THEN
            UPDATE private.player_public_id_counter AS c
            SET next_value = v_next + 1,
                updated_at = now()
            WHERE c.singleton IS TRUE;

            RETURN v_candidate;
        END IF;

        v_next := v_next + 1;
    END LOOP;
END;
$fn$;

REVOKE ALL ON FUNCTION private.allocate_next_player_public_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.allocate_next_player_public_id() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.allocate_next_player_public_id() TO service_role;


CREATE OR REPLACE FUNCTION public.ensure_player_account()
RETURNS TABLE (
    wallet_id UUID,
    public_id TEXT,
    legacy_balance NUMERIC,
    migration_state TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_wallet_id UUID;
    v_public_id TEXT;
    v_profile_exists BOOLEAN;
    v_candidate TEXT;
    v_other_wallet UUID;
    v_account_owner UUID;
    v_is_blocked BOOLEAN;
    v_balance NUMERIC;
    v_currency TEXT;
    v_auth_email TEXT;
    v_auth_phone TEXT;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM private.staff_accounts AS s
        WHERE s.auth_user_id = v_uid
    ) THEN
        RAISE EXCEPTION 'STAFF_ACCOUNT_CANNOT_PROVISION_PLAYER';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_uid::TEXT, 0)
    );

    IF EXISTS (
        SELECT 1
        FROM private.staff_accounts AS s
        WHERE s.auth_user_id = v_uid
    ) THEN
        RAISE EXCEPTION 'STAFF_ACCOUNT_CANNOT_PROVISION_PLAYER';
    END IF;

    SELECT p.wallet_id, p.public_id
    INTO v_wallet_id, v_public_id
    FROM public.profiles AS p
    WHERE p.id = v_uid
    FOR UPDATE;

    v_profile_exists := FOUND;

    IF v_wallet_id IS NOT NULL THEN
        SELECT w.id, w.public_id, w.balance, w.currency, w.is_blocked
        INTO v_wallet_id, v_public_id, v_balance, v_currency, v_is_blocked
        FROM public.wallets AS w
        WHERE w.id = v_wallet_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'PLAYER_WALLET_MISSING';
        END IF;
    ELSE
        v_candidate := private.allocate_next_player_public_id();

        INSERT INTO public.wallets (balance, currency, public_id, is_blocked)
        VALUES (0, 'TMTM', v_candidate, false)
        RETURNING id, public_id, balance, currency, is_blocked
        INTO v_wallet_id, v_public_id, v_balance, v_currency, v_is_blocked;
    END IF;

    SELECT COALESCE(u.email, ''), COALESCE(u.phone, '')
    INTO v_auth_email, v_auth_phone
    FROM auth.users AS u
    WHERE u.id = v_uid;

    IF NOT v_profile_exists THEN
        INSERT INTO public.profiles (id, wallet_id, public_id, phone, email)
        VALUES (
            v_uid,
            v_wallet_id,
            v_public_id,
            COALESCE(v_auth_phone, ''),
            COALESCE(v_auth_email, '')
        );
    ELSE
        UPDATE public.profiles AS p
        SET wallet_id = COALESCE(p.wallet_id, v_wallet_id),
            public_id = COALESCE(NULLIF(BTRIM(COALESCE(p.public_id, '')), ''), v_public_id)
        WHERE p.id = v_uid;
    END IF;

    SELECT a.wallet_id
    INTO v_other_wallet
    FROM private.wallet_accounts AS a
    WHERE a.owner_user_id = v_uid
      AND a.wallet_id IS DISTINCT FROM v_wallet_id
    LIMIT 1;
    IF v_other_wallet IS NOT NULL THEN
        RAISE EXCEPTION 'USER_ALREADY_HAS_ANOTHER_WALLET';
    END IF;

    SELECT a.owner_user_id
    INTO v_account_owner
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = v_wallet_id
    FOR UPDATE;

    IF FOUND THEN
        IF v_account_owner IS NOT NULL AND v_account_owner IS DISTINCT FROM v_uid THEN
            RAISE EXCEPTION 'WALLET_ALREADY_OWNED';
        END IF;
        UPDATE private.wallet_accounts AS a
        SET owner_user_id = v_uid,
            updated_at = pg_catalog.now()
        WHERE a.wallet_id = v_wallet_id;
    ELSE
        INSERT INTO private.wallet_accounts (
            wallet_id,
            owner_user_id,
            currency,
            available_balance,
            locked_balance,
            status,
            migration_state
        )
        VALUES (
            v_wallet_id,
            v_uid,
            COALESCE(v_currency, 'TMTM'),
            COALESCE(v_balance, 0),
            0,
            CASE WHEN COALESCE(v_is_blocked, FALSE) THEN 'blocked' ELSE 'active' END,
            'staging'
        );
    END IF;

    UPDATE public.profiles AS p
    SET wallet_id = v_wallet_id,
        public_id = v_public_id
    WHERE p.id = v_uid
      AND (
          p.wallet_id IS DISTINCT FROM v_wallet_id
          OR p.public_id IS DISTINCT FROM v_public_id
      );

    RETURN QUERY
    SELECT
        w.id,
        w.public_id,
        w.balance,
        a.migration_state
    FROM public.wallets AS w
    JOIN private.wallet_accounts AS a ON a.wallet_id = w.id
    WHERE w.id = v_wallet_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.ensure_player_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_player_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_player_account() TO authenticated;


-- ============================================================
-- B. EMAIL VERIFICATION CHALLENGES
-- ============================================================

CREATE TABLE IF NOT EXISTS private.player_email_verification_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    email_normalized TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    resend_available_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT player_email_verification_email_check
        CHECK (char_length(email_normalized) BETWEEN 3 AND 254),
    CONSTRAINT player_email_verification_hash_check
        CHECK (char_length(code_hash) >= 32),
    CONSTRAINT player_email_verification_attempts_check
        CHECK (attempt_count >= 0 AND max_attempts = 5)
);

CREATE INDEX IF NOT EXISTS player_email_challenges_user_created_idx
    ON private.player_email_verification_challenges (auth_user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS player_email_challenges_active_uidx
    ON private.player_email_verification_challenges (auth_user_id)
    WHERE consumed_at IS NULL;

REVOKE ALL ON TABLE private.player_email_verification_challenges FROM PUBLIC;
REVOKE ALL ON TABLE private.player_email_verification_challenges FROM anon, authenticated;


CREATE OR REPLACE FUNCTION private.player_email_is_taken(
    p_email TEXT,
    p_self UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_email TEXT;
BEGIN
    v_email := lower(btrim(COALESCE(p_email, '')));
    IF v_email = '' THEN
        RETURN FALSE;
    END IF;
    IF EXISTS (
        SELECT 1
        FROM auth.users AS u
        WHERE lower(btrim(COALESCE(u.email, ''))) = v_email
          AND u.id IS DISTINCT FROM p_self
          AND lower(btrim(COALESCE(u.email, ''))) NOT LIKE '%@auth.nextpari.invalid'
    ) THEN
        RETURN TRUE;
    END IF;
    IF EXISTS (
        SELECT 1
        FROM public.profiles AS p
        WHERE lower(btrim(COALESCE(p.email, ''))) = v_email
          AND p.id IS DISTINCT FROM p_self
          AND lower(btrim(COALESCE(p.email, ''))) NOT LIKE '%@auth.nextpari.invalid'
    ) THEN
        RETURN TRUE;
    END IF;
    RETURN FALSE;
END;
$fn$;

REVOKE ALL ON FUNCTION private.player_email_is_taken(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.player_email_is_taken(TEXT, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.player_email_is_taken(TEXT, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.player_email_is_taken(p_email TEXT, p_self UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    RETURN private.player_email_is_taken(p_email, p_self);
END;
$fn$;

REVOKE ALL ON FUNCTION public.player_email_is_taken(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_email_is_taken(TEXT, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_email_is_taken(TEXT, UUID) TO service_role;


CREATE OR REPLACE FUNCTION private.player_email_challenge_create(
    p_auth_user_id UUID,
    p_email TEXT,
    p_code_hash TEXT,
    p_expires_at TIMESTAMPTZ,
    p_resend_available_at TIMESTAMPTZ
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_email TEXT;
    v_sends INTEGER;
    v_latest TIMESTAMPTZ;
    v_id UUID;
BEGIN
    IF p_auth_user_id IS NULL THEN
        RAISE EXCEPTION 'JWT_REQUIRED';
    END IF;
    v_email := lower(btrim(COALESCE(p_email, '')));
    IF v_email = '' OR char_length(v_email) > 254 THEN
        RAISE EXCEPTION 'INVALID_EMAIL';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'nextpari:player-email:' || p_auth_user_id::TEXT,
            0
        )
    );

    IF private.player_email_is_taken(v_email, p_auth_user_id) THEN
        RAISE EXCEPTION 'EMAIL_UNAVAILABLE';
    END IF;

    SELECT COUNT(*)
    INTO v_sends
    FROM private.player_email_verification_challenges AS c
    WHERE c.auth_user_id = p_auth_user_id
      AND c.created_at > now() - INTERVAL '1 hour';
    IF v_sends >= 5 THEN
        RAISE EXCEPTION 'EMAIL_SEND_RATE_LIMITED';
    END IF;

    SELECT MAX(c.resend_available_at)
    INTO v_latest
    FROM private.player_email_verification_challenges AS c
    WHERE c.auth_user_id = p_auth_user_id;
    IF v_latest IS NOT NULL AND v_latest > now() THEN
        RAISE EXCEPTION 'EMAIL_RESEND_COOLDOWN';
    END IF;

    UPDATE private.player_email_verification_challenges AS c
    SET consumed_at = now()
    WHERE c.auth_user_id = p_auth_user_id
      AND c.consumed_at IS NULL;

    INSERT INTO private.player_email_verification_challenges (
        auth_user_id,
        email_normalized,
        code_hash,
        expires_at,
        attempt_count,
        max_attempts,
        resend_available_at
    )
    VALUES (
        p_auth_user_id,
        v_email,
        p_code_hash,
        p_expires_at,
        0,
        5,
        p_resend_available_at
    )
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('id', v_id, 'email', v_email);
END;
$fn$;

REVOKE ALL ON FUNCTION private.player_email_challenge_create(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.player_email_challenge_create(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.player_email_challenge_create(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

CREATE OR REPLACE FUNCTION public.player_email_challenge_create(
    p_auth_user_id UUID,
    p_email TEXT,
    p_code_hash TEXT,
    p_expires_at TIMESTAMPTZ,
    p_resend_available_at TIMESTAMPTZ
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    RETURN private.player_email_challenge_create(
        p_auth_user_id,
        p_email,
        p_code_hash,
        p_expires_at,
        p_resend_available_at
    );
END;
$fn$;

REVOKE ALL ON FUNCTION public.player_email_challenge_create(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_email_challenge_create(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_email_challenge_create(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;


CREATE OR REPLACE FUNCTION private.player_email_challenge_mark_unusable(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    UPDATE private.player_email_verification_challenges
    SET consumed_at = now(),
        expires_at = now(),
        resend_available_at = now()
    WHERE id = p_id
      AND consumed_at IS NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION private.player_email_challenge_mark_unusable(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.player_email_challenge_mark_unusable(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.player_email_challenge_mark_unusable(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.player_email_challenge_mark_unusable(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.player_email_challenge_mark_unusable(p_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.player_email_challenge_mark_unusable(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_email_challenge_mark_unusable(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_email_challenge_mark_unusable(UUID) TO service_role;


CREATE OR REPLACE FUNCTION private.player_email_challenge_active(p_auth_user_id UUID)
RETURNS TABLE (
    id UUID,
    email_normalized TEXT,
    code_hash TEXT,
    expires_at TIMESTAMPTZ,
    attempt_count INTEGER,
    max_attempts INTEGER,
    consumed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.email_normalized,
        c.code_hash,
        c.expires_at,
        c.attempt_count,
        c.max_attempts,
        c.consumed_at
    FROM private.player_email_verification_challenges AS c
    WHERE c.auth_user_id = p_auth_user_id
      AND c.consumed_at IS NULL
    ORDER BY c.created_at DESC
    LIMIT 1;
END;
$fn$;

REVOKE ALL ON FUNCTION private.player_email_challenge_active(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.player_email_challenge_active(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.player_email_challenge_active(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.player_email_challenge_active(p_auth_user_id UUID)
RETURNS TABLE (
    id UUID,
    email_normalized TEXT,
    code_hash TEXT,
    expires_at TIMESTAMPTZ,
    attempt_count INTEGER,
    max_attempts INTEGER,
    consumed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    RETURN QUERY
    SELECT *
    FROM private.player_email_challenge_active(p_auth_user_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.player_email_challenge_active(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_email_challenge_active(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_email_challenge_active(UUID) TO service_role;


CREATE OR REPLACE FUNCTION private.player_email_challenge_register_failure(p_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE private.player_email_verification_challenges
    SET attempt_count = attempt_count + 1
    WHERE id = p_id
      AND consumed_at IS NULL
    RETURNING attempt_count INTO v_count;
    RETURN COALESCE(v_count, 0);
END;
$fn$;

REVOKE ALL ON FUNCTION private.player_email_challenge_register_failure(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.player_email_challenge_register_failure(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.player_email_challenge_register_failure(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.player_email_challenge_register_failure(p_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    RETURN private.player_email_challenge_register_failure(p_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.player_email_challenge_register_failure(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_email_challenge_register_failure(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_email_challenge_register_failure(UUID) TO service_role;


CREATE OR REPLACE FUNCTION private.player_email_challenge_consume(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ok BOOLEAN := FALSE;
BEGIN
    UPDATE private.player_email_verification_challenges
    SET consumed_at = now()
    WHERE id = p_id
      AND consumed_at IS NULL
      AND expires_at > now()
      AND attempt_count < max_attempts
    RETURNING TRUE INTO v_ok;
    RETURN COALESCE(v_ok, FALSE);
END;
$fn$;

REVOKE ALL ON FUNCTION private.player_email_challenge_consume(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.player_email_challenge_consume(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.player_email_challenge_consume(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.player_email_challenge_consume(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    RETURN private.player_email_challenge_consume(p_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.player_email_challenge_consume(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_email_challenge_consume(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_email_challenge_consume(UUID) TO service_role;


CREATE OR REPLACE FUNCTION private.player_sync_verified_email(
    p_auth_user_id UUID,
    p_email TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_email TEXT;
BEGIN
    IF p_auth_user_id IS NULL THEN
        RAISE EXCEPTION 'JWT_REQUIRED';
    END IF;
    v_email := lower(btrim(COALESCE(p_email, '')));
    IF v_email = '' OR char_length(v_email) > 254 THEN
        RAISE EXCEPTION 'INVALID_EMAIL';
    END IF;
    UPDATE public.profiles
    SET email = v_email
    WHERE id = p_auth_user_id;
END;
$fn$;

REVOKE ALL ON FUNCTION private.player_sync_verified_email(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.player_sync_verified_email(UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.player_sync_verified_email(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.player_sync_verified_email(p_auth_user_id UUID, p_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.player_sync_verified_email(p_auth_user_id, p_email);
END;
$fn$;

REVOKE ALL ON FUNCTION public.player_sync_verified_email(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_sync_verified_email(UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_sync_verified_email(UUID, TEXT) TO service_role;

COMMIT;
