BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 057
-- MULTI-CURRENCY WALLETS + REGISTRATION CURRENCY +
-- CURRENCY-SAFE CASHIER DEPOSITS + OWNER USDT RATES
-- Sequence: after 056 (player personal data).
--
-- Repository only. DO NOT APPLY from this change.
-- Historical wallet IDs, balances, and ledger rows are preserved.
-- TMTM remains internal storage compatibility for TMT.
-- ============================================================

CREATE TABLE IF NOT EXISTS private.supported_currencies (
    code TEXT PRIMARY KEY,
    wallet_currency_code TEXT NOT NULL,
    display_name_ru TEXT NOT NULL,
    symbol TEXT NOT NULL DEFAULT '',
    display_scale INTEGER NOT NULL DEFAULT 2,
    registration_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    wallet_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    cashier_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    usdt_deposit_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    limits_configured BOOLEAN NOT NULL DEFAULT FALSE,
    min_stake NUMERIC,
    max_stake NUMERIC,
    max_payout NUMERIC,
    min_deposit NUMERIC,
    min_withdrawal NUMERIC,
    sort_order INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT supported_currencies_code_check
        CHECK (code ~ '^[A-Z]{3}$'),
    CONSTRAINT supported_currencies_wallet_code_check
        CHECK (wallet_currency_code ~ '^[A-Z]{3,4}$'),
    CONSTRAINT supported_currencies_scale_check
        CHECK (display_scale >= 0 AND display_scale <= 8)
);

INSERT INTO private.supported_currencies (
    code, wallet_currency_code, display_name_ru, symbol, display_scale, sort_order
)
VALUES
    ('TMT', 'TMTM', 'Манат', 'm', 2, 10),
    ('USD', 'USD', 'Доллар США', '$', 2, 20),
    ('TRY', 'TRY', 'Турецкая лира', '₺', 2, 30),
    ('UZS', 'UZS', 'Узбекский сум', 'so''m', 0, 40),
    ('RUB', 'RUB', 'Российский рубль', '₽', 2, 50),
    ('KZT', 'KZT', 'Казахстанский тенге', '₸', 2, 60)
ON CONFLICT (code) DO NOTHING;

REVOKE ALL ON TABLE private.supported_currencies FROM PUBLIC;
REVOKE ALL ON TABLE private.supported_currencies FROM anon, authenticated;
GRANT SELECT ON TABLE private.supported_currencies TO service_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE private.supported_currencies FROM service_role;


CREATE OR REPLACE FUNCTION private.wallet_display_currency(p_code TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
    SELECT CASE pg_catalog.upper(BTRIM(COALESCE(p_code, '')))
        WHEN 'TMTM' THEN 'TMT'
        ELSE pg_catalog.upper(BTRIM(COALESCE(p_code, '')))
    END;
$fn$;


CREATE OR REPLACE FUNCTION private.wallet_storage_currency(p_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_display TEXT;
    v_storage TEXT;
BEGIN
    v_display := private.wallet_display_currency(p_code);
    IF v_display = '' THEN
        RETURN NULL;
    END IF;
    SELECT c.wallet_currency_code
    INTO v_storage
    FROM private.supported_currencies AS c
    WHERE c.code = v_display
      AND c.is_active;
    IF v_storage IS NOT NULL THEN
        RETURN v_storage;
    END IF;
    IF v_display = 'TMT' THEN
        RETURN 'TMTM';
    END IF;
    RETURN v_display;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.wallet_currencies_match(p_left TEXT, p_right TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
    SELECT private.wallet_storage_currency(p_left) IS NOT DISTINCT FROM private.wallet_storage_currency(p_right)
        AND private.wallet_storage_currency(p_left) IS NOT NULL;
$fn$;


CREATE OR REPLACE FUNCTION private.provider_facing_currency(p_code TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
    SELECT private.wallet_display_currency(p_code);
$fn$;


CREATE OR REPLACE FUNCTION private.player_require_player_account(p_player_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    IF p_player_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM private.staff_accounts AS s
        WHERE s.auth_user_id = p_player_user_id
    ) THEN
        RAISE EXCEPTION 'STAFF_ACCOUNT';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles AS p
        WHERE p.id = p_player_user_id
    ) THEN
        RAISE EXCEPTION 'PLAYER_ACCOUNT_REQUIRED';
    END IF;
END;
$fn$;


DO $drop_owner_unique$
DECLARE
    v_name TEXT;
BEGIN
    FOR v_name IN
        SELECT c.conname
        FROM pg_catalog.pg_constraint AS c
        JOIN pg_catalog.pg_class AS t ON t.oid = c.conrelid
        JOIN pg_catalog.pg_namespace AS n ON n.oid = t.relnamespace
        WHERE n.nspname = 'private'
          AND t.relname = 'wallet_accounts'
          AND c.contype = 'u'
          AND pg_catalog.pg_get_constraintdef(c.oid) ~* 'owner_user_id'
          AND pg_catalog.pg_get_constraintdef(c.oid) !~* 'currency'
    LOOP
        EXECUTE format('ALTER TABLE private.wallet_accounts DROP CONSTRAINT IF EXISTS %I', v_name);
    END LOOP;

    FOR v_name IN
        SELECT i.relname
        FROM pg_catalog.pg_index AS x
        JOIN pg_catalog.pg_class AS t ON t.oid = x.indrelid
        JOIN pg_catalog.pg_class AS i ON i.oid = x.indexrelid
        JOIN pg_catalog.pg_namespace AS n ON n.oid = t.relnamespace
        WHERE n.nspname = 'private'
          AND t.relname = 'wallet_accounts'
          AND x.indisunique
          AND NOT x.indisprimary
          AND pg_catalog.pg_get_indexdef(x.indexrelid) ~* 'owner_user_id'
          AND pg_catalog.pg_get_indexdef(x.indexrelid) !~* 'currency'
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS private.%I', v_name);
    END LOOP;
END
$drop_owner_unique$;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_accounts_owner_currency_uidx
    ON private.wallet_accounts (owner_user_id, currency)
    WHERE owner_user_id IS NOT NULL;


CREATE TABLE IF NOT EXISTS private.player_wallet_preferences (
    player_user_id UUID PRIMARY KEY REFERENCES public.profiles (id),
    active_wallet_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

REVOKE ALL ON TABLE private.player_wallet_preferences FROM PUBLIC;
REVOKE ALL ON TABLE private.player_wallet_preferences FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE private.player_wallet_preferences TO service_role;
REVOKE DELETE ON TABLE private.player_wallet_preferences FROM service_role;

INSERT INTO private.player_wallet_preferences (player_user_id, active_wallet_id)
SELECT p.id, p.wallet_id
FROM public.profiles AS p
JOIN private.wallet_accounts AS a
    ON a.wallet_id = p.wallet_id
   AND a.owner_user_id = p.id
WHERE p.wallet_id IS NOT NULL
ON CONFLICT (player_user_id) DO NOTHING;


CREATE OR REPLACE FUNCTION private.player_set_active_wallet_id(
    p_player_user_id UUID,
    p_wallet_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_owner UUID;
BEGIN
    IF p_player_user_id IS NULL OR p_wallet_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    SELECT a.owner_user_id
    INTO v_owner
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = p_wallet_id
    FOR UPDATE;
    IF v_owner IS NULL OR v_owner IS DISTINCT FROM p_player_user_id THEN
        RAISE EXCEPTION 'WALLET_NOT_OWNED';
    END IF;
    INSERT INTO private.player_wallet_preferences (player_user_id, active_wallet_id, updated_at)
    VALUES (p_player_user_id, p_wallet_id, pg_catalog.now())
    ON CONFLICT (player_user_id) DO UPDATE
    SET active_wallet_id = EXCLUDED.active_wallet_id,
        updated_at = pg_catalog.now();
    UPDATE public.profiles AS p
    SET wallet_id = p_wallet_id
    WHERE p.id = p_player_user_id
      AND p.wallet_id IS DISTINCT FROM p_wallet_id;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_active_wallet(p_player_user_id UUID)
RETURNS TABLE (
    wallet_id UUID,
    storage_currency TEXT,
    display_currency TEXT,
    available_balance NUMERIC,
    locked_balance NUMERIC,
    status TEXT,
    migration_state TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_wallet UUID;
BEGIN
    PERFORM private.player_require_player_account(p_player_user_id);

    SELECT pref.active_wallet_id
    INTO v_wallet
    FROM private.player_wallet_preferences AS pref
    WHERE pref.player_user_id = p_player_user_id
    FOR UPDATE;

    IF v_wallet IS NULL THEN
        SELECT p.wallet_id
        INTO v_wallet
        FROM public.profiles AS p
        WHERE p.id = p_player_user_id
        FOR UPDATE;
        IF v_wallet IS NOT NULL THEN
            PERFORM private.player_set_active_wallet_id(p_player_user_id, v_wallet);
        END IF;
    END IF;

    IF v_wallet IS NULL THEN
        RAISE EXCEPTION 'PLAYER_WALLET_MISSING';
    END IF;

    RETURN QUERY
    SELECT
        a.wallet_id,
        a.currency,
        private.wallet_display_currency(a.currency),
        a.available_balance,
        a.locked_balance,
        a.status,
        a.migration_state
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = v_wallet
      AND a.owner_user_id = p_player_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PLAYER_WALLET_MISSING';
    END IF;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_wallet_public_json(p_wallet_id UUID, p_player_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_row RECORD;
    v_active UUID;
    v_display TEXT;
BEGIN
    SELECT
        a.wallet_id,
        a.currency,
        a.available_balance,
        a.locked_balance,
        a.status,
        a.migration_state
    INTO v_row
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = p_wallet_id
      AND a.owner_user_id = p_player_user_id;
    IF v_row.wallet_id IS NULL THEN
        RAISE EXCEPTION 'WALLET_NOT_OWNED';
    END IF;
    SELECT pref.active_wallet_id
    INTO v_active
    FROM private.player_wallet_preferences AS pref
    WHERE pref.player_user_id = p_player_user_id;
    v_display := private.wallet_display_currency(v_row.currency);
    RETURN jsonb_build_object(
        'walletId', v_row.wallet_id,
        'currency', v_display,
        'availableBalance', v_row.available_balance,
        'lockedBalance', v_row.locked_balance,
        'status', v_row.status,
        'migrationState', v_row.migration_state,
        'isActive', v_active IS NOT DISTINCT FROM v_row.wallet_id,
        'displayScale', COALESCE((
            SELECT c.display_scale
            FROM private.supported_currencies AS c
            WHERE c.code = v_display
        ), 2),
        'displayNameRu', COALESCE((
            SELECT c.display_name_ru
            FROM private.supported_currencies AS c
            WHERE c.code = v_display
        ), v_display),
        'symbol', COALESCE((
            SELECT c.symbol
            FROM private.supported_currencies AS c
            WHERE c.code = v_display
        ), '')
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.player_create_zero_wallet(
    p_player_user_id UUID,
    p_display_currency TEXT
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_display TEXT;
    v_storage TEXT;
    v_catalog RECORD;
    v_existing UUID;
    v_wallet UUID;
    v_public TEXT;
BEGIN
    PERFORM private.player_require_player_account(p_player_user_id);
    IF pg_catalog.upper(BTRIM(COALESCE(p_display_currency, ''))) = 'TMTM' THEN
        RAISE EXCEPTION 'CURRENCY_UNSUPPORTED';
    END IF;
    v_display := private.wallet_display_currency(p_display_currency);
    SELECT *
    INTO v_catalog
    FROM private.supported_currencies AS c
    WHERE c.code = v_display
      AND c.is_active
      AND c.wallet_enabled;
    IF v_catalog.code IS NULL THEN
        RAISE EXCEPTION 'CURRENCY_UNSUPPORTED';
    END IF;
    v_storage := v_catalog.wallet_currency_code;

    SELECT a.wallet_id
    INTO v_existing
    FROM private.wallet_accounts AS a
    WHERE a.owner_user_id = p_player_user_id
      AND a.currency = v_storage
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
        RAISE EXCEPTION 'CURRENCY_WALLET_ALREADY_EXISTS';
    END IF;

    SELECT p.public_id
    INTO v_public
    FROM public.profiles AS p
    WHERE p.id = p_player_user_id;

    INSERT INTO public.wallets AS w (
        balance,
        currency,
        public_id,
        is_blocked
    )
    VALUES (
        0,
        v_storage,
        NULL,
        false
    )
    RETURNING w.id INTO v_wallet;

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
        v_wallet,
        p_player_user_id,
        v_storage,
        0,
        0,
        'active',
        'staging'
    );

    PERFORM private.player_set_active_wallet_id(p_player_user_id, v_wallet);
    RETURN v_wallet;
END;
$fn$;


DROP FUNCTION IF EXISTS public.ensure_player_account();

CREATE OR REPLACE FUNCTION public.ensure_player_account(p_display_currency TEXT DEFAULT NULL)
RETURNS TABLE (
    wallet_id UUID,
    public_id TEXT,
    legacy_balance NUMERIC,
    migration_state TEXT,
    display_currency TEXT
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
    v_account_owner UUID;
    v_is_blocked BOOLEAN;
    v_balance NUMERIC;
    v_currency TEXT;
    v_auth_email TEXT;
    v_auth_phone TEXT;
    v_display TEXT;
    v_storage TEXT;
    v_catalog RECORD;
    v_active RECORD;
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

    SELECT p.wallet_id, p.public_id
    INTO v_wallet_id, v_public_id
    FROM public.profiles AS p
    WHERE p.id = v_uid
    FOR UPDATE;
    v_profile_exists := FOUND;

    IF EXISTS (
        SELECT 1
        FROM private.wallet_accounts AS a
        WHERE a.owner_user_id = v_uid
    ) THEN
        SELECT *
        INTO v_active
        FROM private.player_active_wallet(v_uid);
        RETURN QUERY
        SELECT
            v_active.wallet_id,
            COALESCE(v_public_id, (
                SELECT p.public_id FROM public.profiles AS p WHERE p.id = v_uid
            )),
            v_active.available_balance,
            v_active.migration_state,
            v_active.display_currency;
        RETURN;
    END IF;

    IF pg_catalog.upper(BTRIM(COALESCE(p_display_currency, ''))) = 'TMTM' THEN
        RAISE EXCEPTION 'CURRENCY_UNSUPPORTED';
    END IF;
    v_display := private.wallet_display_currency(p_display_currency);
    IF v_display IS NULL OR v_display = '' THEN
        RAISE EXCEPTION 'REGISTRATION_CURRENCY_REQUIRED';
    END IF;
    SELECT *
    INTO v_catalog
    FROM private.supported_currencies AS c
    WHERE c.code = v_display
      AND c.is_active
      AND c.registration_enabled;
    IF v_catalog.code IS NULL THEN
        RAISE EXCEPTION 'CURRENCY_UNSUPPORTED';
    END IF;
    v_storage := v_catalog.wallet_currency_code;

    SELECT COALESCE(u.email, ''), COALESCE(u.phone, '')
    INTO v_auth_email, v_auth_phone
    FROM auth.users AS u
    WHERE u.id = v_uid;

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
            v_storage,
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
            currency = COALESCE(a.currency, v_storage),
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
            COALESCE(v_currency, v_storage),
            COALESCE(v_balance, 0),
            0,
            CASE WHEN COALESCE(v_is_blocked, FALSE) THEN 'blocked' ELSE 'active' END,
            'staging'
        );
    END IF;

    PERFORM private.player_set_active_wallet_id(v_uid, v_wallet_id);

    RETURN QUERY
    SELECT
        w.id,
        w.public_id,
        a.available_balance,
        a.migration_state,
        private.wallet_display_currency(a.currency)
    FROM public.wallets AS w
    JOIN private.wallet_accounts AS a ON a.wallet_id = w.id
    WHERE w.id = v_wallet_id;
END;
$fn$;


CREATE OR REPLACE FUNCTION public.player_supported_currencies()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'code', c.code,
        'displayNameRu', c.display_name_ru,
        'symbol', c.symbol,
        'displayScale', c.display_scale,
        'registrationEnabled', c.registration_enabled,
        'walletEnabled', c.wallet_enabled,
        'cashierEnabled', c.cashier_enabled,
        'usdtDepositEnabled', c.usdt_deposit_enabled,
        'sortOrder', c.sort_order
    ) ORDER BY c.sort_order, c.code), '[]'::JSONB)
    FROM private.supported_currencies AS c
    WHERE c.is_active;
$fn$;


CREATE OR REPLACE FUNCTION public.player_wallets()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_active UUID;
BEGIN
    v_uid := auth.uid();
    PERFORM private.player_require_player_account(v_uid);
    SELECT pref.active_wallet_id
    INTO v_active
    FROM private.player_wallet_preferences AS pref
    WHERE pref.player_user_id = v_uid;
    RETURN jsonb_build_object(
        'ok', true,
        'wallets', COALESCE((
            SELECT jsonb_agg(private.player_wallet_public_json(a.wallet_id, v_uid) ORDER BY a.currency)
            FROM private.wallet_accounts AS a
            WHERE a.owner_user_id = v_uid
        ), '[]'::JSONB),
        'activeWalletId', v_active,
        'currencies', public.player_supported_currencies()
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.player_add_wallet(p_currency TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_wallet UUID;
BEGIN
    v_uid := auth.uid();
    PERFORM private.player_require_player_account(v_uid);
    BEGIN
        v_wallet := private.player_create_zero_wallet(v_uid, p_currency);
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM = 'CURRENCY_WALLET_ALREADY_EXISTS' THEN
                RAISE EXCEPTION 'CURRENCY_WALLET_ALREADY_EXISTS';
            END IF;
            RAISE;
    END;
    RETURN private.player_wallet_public_json(v_wallet, v_uid)
        || jsonb_build_object('ok', true);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.player_set_active_wallet(p_currency TEXT DEFAULT NULL, p_wallet_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_wallet UUID;
    v_storage TEXT;
BEGIN
    v_uid := auth.uid();
    PERFORM private.player_require_player_account(v_uid);
    IF p_wallet_id IS NOT NULL THEN
        v_wallet := p_wallet_id;
    ELSE
        v_storage := private.wallet_storage_currency(p_currency);
        SELECT a.wallet_id
        INTO v_wallet
        FROM private.wallet_accounts AS a
        WHERE a.owner_user_id = v_uid
          AND a.currency = v_storage
        LIMIT 1;
    END IF;
    IF v_wallet IS NULL THEN
        RAISE EXCEPTION 'PLAYER_CURRENCY_WALLET_REQUIRED';
    END IF;
    PERFORM private.player_set_active_wallet_id(v_uid, v_wallet);
    RETURN private.player_wallet_public_json(v_wallet, v_uid)
        || jsonb_build_object('ok', true);
END;
$fn$;


CREATE OR REPLACE FUNCTION private.cashier_resolve_player_wallet_for_ops_currency(
    p_player_public_id TEXT,
    p_ops_currency TEXT
)
RETURNS TABLE (
    player_user_id UUID,
    wallet_id UUID,
    public_id TEXT,
    currency TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_raw TEXT;
    v_player UUID;
    v_public TEXT;
    v_storage TEXT;
    v_wallet UUID;
    v_currency TEXT;
    v_status TEXT;
BEGIN
    v_raw := NULLIF(BTRIM(COALESCE(p_player_public_id, '')), '');
    IF v_raw IS NULL OR v_raw !~ '^[0-9]{6}$' THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;
    v_storage := private.wallet_storage_currency(p_ops_currency);
    IF v_storage IS NULL THEN
        RAISE EXCEPTION 'CURRENCY_UNSUPPORTED';
    END IF;

    SELECT p.id, p.public_id
    INTO v_player, v_public
    FROM public.profiles AS p
    WHERE p.public_id = v_raw
    LIMIT 1;
    IF v_player IS NULL THEN
        SELECT a.owner_user_id, COALESCE(p.public_id, w.public_id)
        INTO v_player, v_public
        FROM public.wallets AS w
        JOIN private.wallet_accounts AS a ON a.wallet_id = w.id
        LEFT JOIN public.profiles AS p ON p.id = a.owner_user_id
        WHERE w.public_id = v_raw
        LIMIT 1;
    END IF;
    IF v_player IS NULL THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;

    SELECT a.wallet_id, a.currency, a.status
    INTO v_wallet, v_currency, v_status
    FROM private.wallet_accounts AS a
    WHERE a.owner_user_id = v_player
      AND a.currency = v_storage
    LIMIT 1;

    IF v_wallet IS NULL THEN
        RAISE EXCEPTION 'PLAYER_CURRENCY_WALLET_REQUIRED';
    END IF;
    IF v_status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'PLAYER_WALLET_NOT_ACTIVE';
    END IF;

    RETURN QUERY
    SELECT v_player, v_wallet, COALESCE(v_public, v_raw), v_currency;
END;
$fn$;


CREATE OR REPLACE FUNCTION public.cashier_deposit_player(
    p_player_public_id TEXT,
    p_amount NUMERIC,
    p_idempotency_key TEXT,
    p_note TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_key TEXT;
    v_note TEXT;
    v_player RECORD;
    v_op RECORD;
    v_result RECORD;
    v_engine_key TEXT;
    v_active UUID;
BEGIN
    SELECT
        c.auth_user_id,
        c.network_id,
        c.legacy_cashier_id
    INTO v_ctx
    FROM private.get_current_cashier_context_locked() AS c;

    SELECT r.account_id, r.currency
    INTO v_op
    FROM private.cashier_resolve_own_operational_account(
        v_ctx.legacy_cashier_id,
        v_ctx.network_id
    ) AS r;

    PERFORM private.cashier_require_own_ops_active(v_op.account_id);

    v_key := private.owner_require_idempotency_key(p_idempotency_key);
    v_note := private.owner_trim_reason(p_note);
    v_engine_key := 'cashier-deposit:' || v_ctx.auth_user_id::TEXT || ':' || v_key;

    SELECT r.player_user_id, r.wallet_id, r.public_id, r.currency
    INTO v_player
    FROM private.cashier_resolve_player_wallet_for_ops_currency(p_player_public_id, v_op.currency) AS r;

    IF NOT private.wallet_currencies_match(v_player.currency, v_op.currency) THEN
        RAISE EXCEPTION 'CURRENCY_MISMATCH';
    END IF;

    PERFORM private.require_player_deposit_allowed(v_player.player_user_id);

    SELECT pref.active_wallet_id
    INTO v_active
    FROM private.player_wallet_preferences AS pref
    WHERE pref.player_user_id = v_player.player_user_id;

    SELECT e.transfer_id, e.is_duplicate, e.from_balance_after, e.to_balance_after, e.player_balance_after
    INTO v_result
    FROM private.apply_operational_transfer(
        'CASHIER_TO_PLAYER',
        p_amount,
        v_op.currency,
        v_engine_key,
        v_op.account_id,
        NULL,
        v_player.wallet_id,
        v_ctx.auth_user_id,
        'cashier',
        jsonb_build_object(
            'player_public_id', v_player.public_id,
            'note', v_note
        )
    ) AS e;

    IF v_active IS NOT NULL THEN
        UPDATE private.player_wallet_preferences AS pref
        SET active_wallet_id = v_active,
            updated_at = pref.updated_at
        WHERE pref.player_user_id = v_player.player_user_id
          AND pref.active_wallet_id IS DISTINCT FROM v_active;
        UPDATE public.profiles AS p
        SET wallet_id = v_active
        WHERE p.id = v_player.player_user_id
          AND p.wallet_id IS DISTINCT FROM v_active;
    END IF;

    PERFORM private.cashier_revalidate_legacy_cashier(
        v_ctx.legacy_cashier_id,
        v_ctx.network_id
    );

    IF v_result.is_duplicate IS NOT TRUE THEN
        PERFORM private.append_staff_audit(
            'CASHIER_DEPOSITED_PLAYER',
            'player',
            v_player.public_id,
            'cashier_self',
            jsonb_build_object(
                'transfer_id', v_result.transfer_id,
                'amount', p_amount,
                'currency', private.wallet_display_currency(v_op.currency),
                'player_public_id', v_player.public_id
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'transfer_id', v_result.transfer_id,
        'is_duplicate', v_result.is_duplicate,
        'amount', p_amount,
        'currency', private.wallet_display_currency(v_op.currency),
        'cashier_balance_after', v_result.from_balance_after,
        'player_balance_after', v_result.player_balance_after,
        'player_public_id', v_player.public_id,
        'active_wallet_unchanged', true
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.cashier_confirm_player_payout(
    p_code TEXT,
    p_idempotency_key TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_code TEXT;
    v_key TEXT;
    v_req private.cashier_player_payout_requests%ROWTYPE;
    v_op RECORD;
    v_engine_key TEXT;
    v_result RECORD;
BEGIN
    SELECT
        c.auth_user_id,
        c.network_id,
        c.legacy_cashier_id
    INTO v_ctx
    FROM private.get_current_cashier_context_locked() AS c;

    SELECT r.account_id, r.currency
    INTO v_op
    FROM private.cashier_resolve_own_operational_account(
        v_ctx.legacy_cashier_id,
        v_ctx.network_id
    ) AS r;

    PERFORM private.cashier_require_own_ops_active(v_op.account_id);

    v_code := lower(NULLIF(BTRIM(COALESCE(p_code, '')), ''));
    IF v_code IS NULL OR v_code !~ '^[0-9a-f]{16}$' THEN
        RAISE EXCEPTION 'PAYOUT_CODE_INVALID';
    END IF;

    v_key := private.owner_require_idempotency_key(p_idempotency_key);

    SELECT r.*
    INTO v_req
    FROM private.cashier_player_payout_requests AS r
    WHERE r.secret_code = v_code
      AND r.status = 'pending'
    FOR UPDATE;

    IF NOT FOUND THEN
        SELECT r.*
        INTO v_req
        FROM private.cashier_player_payout_requests AS r
        WHERE r.secret_code = v_code
        ORDER BY r.created_at DESC
        LIMIT 1
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'PAYOUT_NOT_FOUND';
        END IF;
    END IF;

    IF v_req.status = 'paid' THEN
        IF v_req.confirm_idempotency_key IS NOT DISTINCT FROM v_key
           AND v_req.paid_by_staff_auth_id IS NOT DISTINCT FROM v_ctx.auth_user_id THEN
            RETURN jsonb_build_object(
                'ok', true,
                'is_duplicate', true,
                'transfer_id', v_req.operational_transfer_id,
                'amount', v_req.amount,
                'currency', private.wallet_display_currency(v_req.currency),
                'player_public_id', v_req.player_public_id,
                'payout_id', v_req.id,
                'status', 'paid'
            );
        END IF;
        RAISE EXCEPTION 'PAYOUT_ALREADY_PAID';
    END IF;

    IF v_req.status = 'cancelled' THEN
        RAISE EXCEPTION 'PAYOUT_CANCELLED';
    END IF;

    IF v_req.status = 'expired' THEN
        RAISE EXCEPTION 'PAYOUT_EXPIRED';
    END IF;

    IF v_req.status = 'pending' AND v_req.expires_at <= pg_catalog.now() THEN
        PERFORM private.expire_cashier_player_payout(v_req.id);
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'PAYOUT_EXPIRED',
            'status', 'expired',
            'payout_id', v_req.id,
            'is_duplicate', false
        );
    END IF;

    IF v_req.status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'PAYOUT_NOT_PENDING';
    END IF;

    IF NOT private.wallet_currencies_match(v_req.currency, v_op.currency) THEN
        RAISE EXCEPTION 'CURRENCY_MISMATCH';
    END IF;

    v_engine_key := 'cashier-payout:' || v_req.id::TEXT;

    SELECT e.transfer_id, e.is_duplicate, e.from_balance_after, e.to_balance_after, e.player_balance_after
    INTO v_result
    FROM private.apply_operational_transfer(
        'PLAYER_TO_CASHIER',
        v_req.amount,
        v_op.currency,
        v_engine_key,
        NULL,
        v_op.account_id,
        v_req.wallet_id,
        v_ctx.auth_user_id,
        'cashier',
        jsonb_build_object(
            'payout_id', v_req.id,
            'player_public_id', v_req.player_public_id
        )
    ) AS e;

    UPDATE private.cashier_player_payout_requests
    SET
        status = 'paid',
        paid_at = pg_catalog.now(),
        paid_by_legacy_cashier_id = v_ctx.legacy_cashier_id,
        paid_by_staff_auth_id = v_ctx.auth_user_id,
        operational_transfer_id = v_result.transfer_id,
        confirm_idempotency_key = v_key
    WHERE id = v_req.id
      AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYOUT_ALREADY_PAID';
    END IF;

    PERFORM private.cashier_revalidate_legacy_cashier(
        v_ctx.legacy_cashier_id,
        v_ctx.network_id
    );

    IF v_result.is_duplicate IS NOT TRUE THEN
        PERFORM private.append_staff_audit(
            'CASHIER_PAID_PLAYER',
            'player',
            v_req.player_public_id,
            'cashier_self',
            jsonb_build_object(
                'transfer_id', v_result.transfer_id,
                'payout_id', v_req.id,
                'amount', v_req.amount,
                'currency', private.wallet_display_currency(v_op.currency),
                'player_public_id', v_req.player_public_id
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'is_duplicate', v_result.is_duplicate,
        'transfer_id', v_result.transfer_id,
        'amount', v_req.amount,
        'currency', private.wallet_display_currency(v_op.currency),
        'cashier_balance_after', v_result.to_balance_after,
        'player_balance_after', v_result.player_balance_after,
        'player_public_id', v_req.player_public_id,
        'payout_id', v_req.id,
        'status', 'paid'
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION private.game_require_player_context()
RETURNS TABLE (
    user_id UUID,
    wallet_id UUID,
    wallet_status TEXT,
    migration_state TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_active RECORD;
    v_display TEXT;
    v_limits BOOLEAN;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;
    IF EXISTS (
        SELECT 1 FROM private.staff_accounts AS s WHERE s.auth_user_id = v_uid
    ) THEN
        RAISE EXCEPTION 'STAFF_CANNOT_PLAY';
    END IF;

    SELECT * INTO v_active FROM private.player_active_wallet(v_uid);
    IF v_active.status = 'blocked' THEN
        RAISE EXCEPTION 'WALLET_BLOCKED';
    END IF;
    IF v_active.status = 'closed' THEN
        RAISE EXCEPTION 'WALLET_CLOSED';
    END IF;
    IF v_active.status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'PLAYER_WALLET_NOT_ACTIVE';
    END IF;
    IF v_active.migration_state NOT IN ('staging', 'active') THEN
        RAISE EXCEPTION 'PLAYER_WALLET_NOT_ACTIVE';
    END IF;

    v_display := v_active.display_currency;
    IF v_display IS DISTINCT FROM 'TMT' THEN
        SELECT c.limits_configured AND c.min_stake IS NOT NULL
        INTO v_limits
        FROM private.supported_currencies AS c
        WHERE c.code = v_display;
        IF v_limits IS NOT TRUE THEN
            RAISE EXCEPTION 'CURRENCY_LIMITS_UNCONFIGURED';
        END IF;
    END IF;

    RETURN QUERY SELECT v_uid, v_active.wallet_id, v_active.status, v_active.migration_state;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.withdrawal_lock_player_wallet(p_uid UUID)
RETURNS TABLE (
    wallet_id UUID,
    public_id TEXT,
    currency TEXT
)
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_active RECORD;
    v_public TEXT;
BEGIN
    SELECT * INTO v_active FROM private.player_active_wallet(p_uid);
    IF v_active.status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'PLAYER_WALLET_NOT_ACTIVE';
    END IF;
    SELECT p.public_id INTO v_public FROM public.profiles AS p WHERE p.id = p_uid;
    IF v_public IS NULL OR v_public !~ '^[0-9]{6}$' THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND';
    END IF;
    wallet_id := v_active.wallet_id;
    public_id := v_public;
    currency := v_active.storage_currency;
    RETURN NEXT;
END;
$fn$;


CREATE TABLE IF NOT EXISTS private.usdt_deposit_rates (
    target_currency_code TEXT PRIMARY KEY
        REFERENCES private.supported_currencies (code),
    rate NUMERIC,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_by UUID,
    CONSTRAINT usdt_deposit_rates_rate_check
        CHECK (rate IS NULL OR (rate > 0 AND rate < 1000000000))
);

INSERT INTO private.usdt_deposit_rates (target_currency_code, rate, enabled)
SELECT c.code, NULL, FALSE
FROM private.supported_currencies AS c
ON CONFLICT (target_currency_code) DO NOTHING;

REVOKE ALL ON TABLE private.usdt_deposit_rates FROM PUBLIC;
REVOKE ALL ON TABLE private.usdt_deposit_rates FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE private.usdt_deposit_rates TO service_role;
REVOKE DELETE ON TABLE private.usdt_deposit_rates FROM service_role;


CREATE TABLE IF NOT EXISTS private.usdt_deposit_rate_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_currency_code TEXT NOT NULL,
    old_rate NUMERIC,
    new_rate NUMERIC,
    old_enabled BOOLEAN,
    new_enabled BOOLEAN,
    actor_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

REVOKE ALL ON TABLE private.usdt_deposit_rate_events FROM PUBLIC;
REVOKE ALL ON TABLE private.usdt_deposit_rate_events FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE private.usdt_deposit_rate_events TO service_role;
REVOKE UPDATE, DELETE ON TABLE private.usdt_deposit_rate_events FROM service_role;


CREATE TABLE IF NOT EXISTS private.crypto_deposit_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_user_id UUID NOT NULL,
    target_wallet_id UUID NOT NULL,
    source_asset TEXT NOT NULL DEFAULT 'USDT',
    source_amount NUMERIC NOT NULL,
    target_currency_code TEXT NOT NULL,
    rate_snapshot NUMERIC NOT NULL,
    fee_source_amount NUMERIC NOT NULL DEFAULT 0,
    credit_amount NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'QUOTED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT crypto_deposit_quotes_source_check CHECK (source_asset = 'USDT'),
    CONSTRAINT crypto_deposit_quotes_amount_check CHECK (source_amount > 0),
    CONSTRAINT crypto_deposit_quotes_rate_check CHECK (rate_snapshot > 0),
    CONSTRAINT crypto_deposit_quotes_credit_check CHECK (credit_amount >= 0),
    CONSTRAINT crypto_deposit_quotes_status_check
        CHECK (status IN ('QUOTED', 'EXPIRED', 'CONSUMED', 'CANCELLED'))
);

REVOKE ALL ON TABLE private.crypto_deposit_quotes FROM PUBLIC;
REVOKE ALL ON TABLE private.crypto_deposit_quotes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE private.crypto_deposit_quotes TO service_role;
REVOKE DELETE ON TABLE private.crypto_deposit_quotes FROM service_role;


CREATE OR REPLACE FUNCTION public.owner_usdt_deposit_rates()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    PERFORM private.get_current_owner_context();
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'targetCurrencyCode', r.target_currency_code,
            'rate', r.rate,
            'enabled', r.enabled,
            'updatedAt', r.updated_at,
            'updatedBy', r.updated_by
        ) ORDER BY c.sort_order)
        FROM private.usdt_deposit_rates AS r
        JOIN private.supported_currencies AS c ON c.code = r.target_currency_code
    ), '[]'::JSONB);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_set_usdt_deposit_rate(
    p_target_currency_code TEXT,
    p_rate NUMERIC,
    p_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_code TEXT;
    v_old RECORD;
BEGIN
    PERFORM private.get_current_owner_context();
    v_uid := auth.uid();
    v_code := private.wallet_display_currency(p_target_currency_code);
    IF NOT EXISTS (
        SELECT 1 FROM private.supported_currencies AS c WHERE c.code = v_code AND c.is_active
    ) THEN
        RAISE EXCEPTION 'CURRENCY_UNSUPPORTED';
    END IF;
    IF p_rate IS NULL OR p_rate <= 0 OR p_rate >= 1000000000 THEN
        RAISE EXCEPTION 'USDT_RATE_INVALID';
    END IF;

    SELECT r.rate, r.enabled
    INTO v_old
    FROM private.usdt_deposit_rates AS r
    WHERE r.target_currency_code = v_code
    FOR UPDATE;

    INSERT INTO private.usdt_deposit_rate_events (
        target_currency_code, old_rate, new_rate, old_enabled, new_enabled, actor_user_id
    )
    VALUES (
        v_code, v_old.rate, p_rate, COALESCE(v_old.enabled, FALSE), COALESCE(p_enabled, FALSE), v_uid
    );

    INSERT INTO private.usdt_deposit_rates (target_currency_code, rate, enabled, updated_at, updated_by)
    VALUES (v_code, p_rate, COALESCE(p_enabled, FALSE), pg_catalog.now(), v_uid)
    ON CONFLICT (target_currency_code) DO UPDATE
    SET rate = EXCLUDED.rate,
        enabled = EXCLUDED.enabled,
        updated_at = pg_catalog.now(),
        updated_by = EXCLUDED.updated_by;

    RETURN jsonb_build_object(
        'ok', true,
        'targetCurrencyCode', v_code,
        'rate', p_rate,
        'enabled', COALESCE(p_enabled, FALSE)
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.player_usdt_quote_targets()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
BEGIN
    v_uid := auth.uid();
    PERFORM private.player_require_player_account(v_uid);
    RETURN jsonb_build_object(
        'ok', true,
        'targets', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'walletId', a.wallet_id,
                'currency', private.wallet_display_currency(a.currency),
                'availableBalance', a.available_balance,
                'rate', r.rate,
                'enabled', r.enabled
            ) ORDER BY c.sort_order)
            FROM private.wallet_accounts AS a
            JOIN private.supported_currencies AS c
                ON c.wallet_currency_code = a.currency
            JOIN private.usdt_deposit_rates AS r
                ON r.target_currency_code = c.code
            WHERE a.owner_user_id = v_uid
              AND r.enabled
              AND r.rate IS NOT NULL
              AND c.usdt_deposit_enabled
              AND c.is_active
        ), '[]'::JSONB)
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.player_create_usdt_quote(
    p_source_amount NUMERIC,
    p_wallet_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_uid UUID;
    v_wallet RECORD;
    v_display TEXT;
    v_rate NUMERIC;
    v_enabled BOOLEAN;
    v_credit NUMERIC;
    v_id UUID;
    v_expires TIMESTAMPTZ;
BEGIN
    v_uid := auth.uid();
    PERFORM private.player_require_player_account(v_uid);
    PERFORM private.require_player_deposit_allowed(v_uid);
    IF p_source_amount IS NULL OR p_source_amount <= 0 THEN
        RAISE EXCEPTION 'USDT_AMOUNT_INVALID';
    END IF;
    SELECT a.wallet_id, a.currency, a.owner_user_id
    INTO v_wallet
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = p_wallet_id
    FOR UPDATE;
    IF v_wallet.wallet_id IS NULL OR v_wallet.owner_user_id IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'WALLET_NOT_OWNED';
    END IF;
    v_display := private.wallet_display_currency(v_wallet.currency);
    SELECT r.rate, r.enabled
    INTO v_rate, v_enabled
    FROM private.usdt_deposit_rates AS r
    WHERE r.target_currency_code = v_display
    FOR SHARE;
    IF v_rate IS NULL OR v_enabled IS NOT TRUE THEN
        RAISE EXCEPTION 'USDT_RATE_UNAVAILABLE';
    END IF;
    v_credit := (p_source_amount - 0) * v_rate;
    v_expires := pg_catalog.now() + INTERVAL '10 minutes';
    INSERT INTO private.crypto_deposit_quotes (
        player_user_id,
        target_wallet_id,
        source_asset,
        source_amount,
        target_currency_code,
        rate_snapshot,
        fee_source_amount,
        credit_amount,
        status,
        expires_at
    )
    VALUES (
        v_uid,
        v_wallet.wallet_id,
        'USDT',
        p_source_amount,
        v_display,
        v_rate,
        0,
        v_credit,
        'QUOTED',
        v_expires
    )
    RETURNING id INTO v_id;

    RETURN jsonb_build_object(
        'ok', true,
        'quoteId', v_id,
        'sourceAsset', 'USDT',
        'sourceAmount', p_source_amount,
        'targetCurrencyCode', v_display,
        'rateSnapshot', v_rate,
        'feeSourceAmount', 0,
        'creditAmount', v_credit,
        'walletId', v_wallet.wallet_id,
        'status', 'QUOTED',
        'expiresAt', v_expires,
        'providerReady', false
    );
END;
$fn$;


REVOKE ALL ON FUNCTION private.wallet_display_currency(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.wallet_storage_currency(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.wallet_currencies_match(TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.provider_facing_currency(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_require_player_account(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_set_active_wallet_id(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_active_wallet(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_wallet_public_json(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.player_create_zero_wallet(UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.cashier_resolve_player_wallet_for_ops_currency(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.cashier_resolve_player_wallet_for_ops_currency(TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.ensure_player_account(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_player_account(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.player_supported_currencies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_supported_currencies() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.player_wallets() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_wallets() TO authenticated;

REVOKE ALL ON FUNCTION public.player_add_wallet(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_add_wallet(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.player_set_active_wallet(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_set_active_wallet(TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.cashier_deposit_player(TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cashier_deposit_player(TEXT, NUMERIC, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.cashier_confirm_player_payout(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cashier_confirm_player_payout(TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.owner_usdt_deposit_rates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_usdt_deposit_rates() TO authenticated;

REVOKE ALL ON FUNCTION public.owner_set_usdt_deposit_rate(TEXT, NUMERIC, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_set_usdt_deposit_rate(TEXT, NUMERIC, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.player_usdt_quote_targets() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_usdt_quote_targets() TO authenticated;

REVOKE ALL ON FUNCTION public.player_create_usdt_quote(NUMERIC, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_create_usdt_quote(NUMERIC, UUID) TO authenticated;

COMMIT;
