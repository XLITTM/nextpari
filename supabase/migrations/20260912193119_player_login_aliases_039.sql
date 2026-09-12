-- Phase 039: private player login alias resolution (publicId / phone -> auth email)
-- Service-role only. Not a public enumeration API.
-- Not applied by this change.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.player_login_phones (
    phone_digits TEXT PRIMARY KEY,
    auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT player_login_phones_digits_check
        CHECK (phone_digits ~ '^[0-9]{8,15}$')
);

REVOKE ALL ON TABLE private.player_login_phones FROM PUBLIC;
REVOKE ALL ON TABLE private.player_login_phones FROM anon, authenticated;

CREATE OR REPLACE FUNCTION private.player_digits(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
    SELECT NULLIF(regexp_replace(COALESCE(p_value, ''), '[^0-9]', '', 'g'), '');
$fn$;

REVOKE ALL ON FUNCTION private.player_digits(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.player_digits(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.player_digits(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION private.resolve_player_login_email(
    p_kind TEXT,
    p_value TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_kind TEXT;
    v_digits TEXT;
    v_auth UUID;
    v_email TEXT;
    v_hits INT;
BEGIN
    v_kind := lower(btrim(COALESCE(p_kind, '')));

    IF v_kind = 'public_id' THEN
        v_digits := btrim(COALESCE(p_value, ''));
        IF v_digits !~ '^[0-9]{6}$' THEN
            RAISE EXCEPTION 'AUTH_FAILED';
        END IF;

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

        IF v_hits = 0 THEN
            RAISE EXCEPTION 'AUTH_FAILED';
        END IF;
        IF v_hits > 1 THEN
            RAISE EXCEPTION 'AUTH_AMBIGUOUS';
        END IF;

        SELECT x.id
        INTO v_auth
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

        IF v_auth IS NULL THEN
            RAISE EXCEPTION 'AUTH_FAILED';
        END IF;
    ELSIF v_kind = 'phone' THEN
        v_digits := private.player_digits(p_value);
        IF v_digits IS NULL OR v_digits !~ '^[0-9]{8,15}$' THEN
            RAISE EXCEPTION 'AUTH_FAILED';
        END IF;

        SELECT COUNT(*)
        INTO v_hits
        FROM (
            SELECT DISTINCT x.id
            FROM (
                SELECT t.auth_user_id AS id
                FROM private.player_login_phones AS t
                WHERE t.phone_digits = v_digits
                UNION
                SELECT u.id
                FROM auth.users AS u
                WHERE private.player_digits(u.phone) = v_digits
                UNION
                SELECT u.id
                FROM auth.users AS u
                WHERE private.player_digits(u.raw_user_meta_data ->> 'phone') = v_digits
                UNION
                SELECT p.id
                FROM public.profiles AS p
                JOIN auth.users AS u ON u.id = p.id
                WHERE private.player_digits(p.phone) = v_digits
            ) AS x
        ) AS hits;

        IF v_hits > 1 THEN
            RAISE EXCEPTION 'AUTH_AMBIGUOUS';
        END IF;
        IF v_hits = 0 THEN
            RAISE EXCEPTION 'AUTH_FAILED';
        END IF;

        SELECT x.id
        INTO v_auth
        FROM (
            SELECT t.auth_user_id AS id
            FROM private.player_login_phones AS t
            WHERE t.phone_digits = v_digits
            UNION
            SELECT u.id
            FROM auth.users AS u
            WHERE private.player_digits(u.phone) = v_digits
            UNION
            SELECT u.id
            FROM auth.users AS u
            WHERE private.player_digits(u.raw_user_meta_data ->> 'phone') = v_digits
            UNION
            SELECT p.id
            FROM public.profiles AS p
            JOIN auth.users AS u ON u.id = p.id
            WHERE private.player_digits(p.phone) = v_digits
        ) AS x;
    ELSE
        RAISE EXCEPTION 'AUTH_FAILED';
    END IF;

    SELECT u.email
    INTO v_email
    FROM auth.users AS u
    WHERE u.id = v_auth;

    IF v_email IS NULL OR btrim(v_email) = '' THEN
        RAISE EXCEPTION 'AUTH_FAILED';
    END IF;

    RETURN v_email;
END;
$fn$;

REVOKE ALL ON FUNCTION private.resolve_player_login_email(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.resolve_player_login_email(TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.resolve_player_login_email(TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_player_login_email(
    p_kind TEXT,
    p_value TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    RETURN private.resolve_player_login_email(p_kind, p_value);
END;
$fn$;

REVOKE ALL ON FUNCTION public.resolve_player_login_email(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_player_login_email(TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_player_login_email(TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION private.claim_player_login_phone(
    p_auth_user_id UUID,
    p_phone TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_digits TEXT;
    v_existing UUID;
    v_hits INT;
BEGIN
    IF p_auth_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_FAILED';
    END IF;
    v_digits := private.player_digits(p_phone);
    IF v_digits IS NULL OR v_digits !~ '^[0-9]{8,15}$' THEN
        RAISE EXCEPTION 'INVALID_PHONE';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('nextpari:player-login-phone:' || v_digits, 0)
    );

    SELECT COUNT(DISTINCT x.id)
    INTO v_hits
    FROM (
        SELECT t.auth_user_id AS id
        FROM private.player_login_phones AS t
        WHERE t.phone_digits = v_digits
        UNION
        SELECT u.id
        FROM auth.users AS u
        WHERE private.player_digits(u.phone) = v_digits
        UNION
        SELECT u.id
        FROM auth.users AS u
        WHERE private.player_digits(u.raw_user_meta_data ->> 'phone') = v_digits
        UNION
        SELECT p.id
        FROM public.profiles AS p
        JOIN auth.users AS u ON u.id = p.id
        WHERE private.player_digits(p.phone) = v_digits
    ) AS x;

    IF v_hits > 1 THEN
        RAISE EXCEPTION 'PHONE_TAKEN';
    END IF;

    SELECT x.id
    INTO v_existing
    FROM (
        SELECT t.auth_user_id AS id
        FROM private.player_login_phones AS t
        WHERE t.phone_digits = v_digits
        UNION
        SELECT u.id
        FROM auth.users AS u
        WHERE private.player_digits(u.phone) = v_digits
        UNION
        SELECT u.id
        FROM auth.users AS u
        WHERE private.player_digits(u.raw_user_meta_data ->> 'phone') = v_digits
        UNION
        SELECT p.id
        FROM public.profiles AS p
        JOIN auth.users AS u ON u.id = p.id
        WHERE private.player_digits(p.phone) = v_digits
    ) AS x;

    IF v_existing IS NOT NULL AND v_existing IS DISTINCT FROM p_auth_user_id THEN
        RAISE EXCEPTION 'PHONE_TAKEN';
    END IF;

    UPDATE private.player_login_phones
    SET phone_digits = v_digits
    WHERE auth_user_id = p_auth_user_id;

    IF NOT FOUND THEN
        INSERT INTO private.player_login_phones (phone_digits, auth_user_id)
        VALUES (v_digits, p_auth_user_id);
    END IF;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'PHONE_TAKEN';
END;
$fn$;

REVOKE ALL ON FUNCTION private.claim_player_login_phone(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.claim_player_login_phone(UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.claim_player_login_phone(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_player_login_phone(
    p_auth_user_id UUID,
    p_phone TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.claim_player_login_phone(p_auth_user_id, p_phone);
END;
$fn$;

REVOKE ALL ON FUNCTION public.claim_player_login_phone(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_player_login_phone(UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_player_login_phone(UUID, TEXT) TO service_role;

COMMIT;
