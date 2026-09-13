BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 045
-- ONE-CLICK / NEW-WALLET SEQUENTIAL ID HOTFIX
-- Sequence: after 044 (player identity + email verification).
--
-- Repository only. DO NOT APPLY from this change.
-- Production 044 is already applied. This replaces only the
-- ambiguous INSERT ... RETURNING public_id (SQLSTATE 42702).
-- Existing Player IDs and sequential counter logic are unchanged.
-- ============================================================

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

        INSERT INTO public.wallets AS w (
            balance,
            currency,
            public_id,
            is_blocked
        )
        VALUES (
            0,
            'TMTM',
            v_candidate,
            false
        )
        RETURNING
            w.id,
            w.public_id,
            w.balance,
            w.currency,
            w.is_blocked
        INTO
            v_wallet_id,
            v_public_id,
            v_balance,
            v_currency,
            v_is_blocked;
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

COMMIT;
