BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 042
-- OWNER PLAYER DEBIT + SAFE CASHIER DEPOSIT REVERSAL
-- Sequence: 042 (after 041 withdrawal ledger).
--
-- Repository only. DO NOT APPLY from this change.
-- Extends the existing canonical transfer engine.
-- Does NOT rewrite private.apply_wallet_entry.
-- Does NOT mutate public.wallets.
-- Does NOT restore public.manager_adjust_player_balance.
-- Does NOT change PLAYER_TO_CASHIER payout semantics.
-- ============================================================


-- ============================================================
-- 1. TABLE CHECKS (additive values)
-- ============================================================

ALTER TABLE private.operational_transfers
    DROP CONSTRAINT IF EXISTS operational_transfers_type_check;

ALTER TABLE private.operational_transfers
    ADD CONSTRAINT operational_transfers_type_check
    CHECK (
        transfer_type IN (
            'CAPITAL_IN',
            'TREASURY_TO_MANAGER',
            'TREASURY_TO_CASHIER',
            'MANAGER_TO_CASHIER',
            'CASHIER_TO_MANAGER',
            'CASHIER_TO_TREASURY',
            'TREASURY_TO_PLAYER',
            'CASHIER_TO_PLAYER',
            'PLAYER_TO_CASHIER',
            'PLAYER_TO_TREASURY',
            'CASHIER_DEPOSIT_REVERSAL'
        )
    );

ALTER TABLE private.operational_transfers
    DROP CONSTRAINT IF EXISTS operational_transfers_shape_check;

ALTER TABLE private.operational_transfers
    ADD CONSTRAINT operational_transfers_shape_check
    CHECK (
        (
            transfer_type = 'CAPITAL_IN'
            AND from_account_id IS NULL
            AND to_account_id IS NOT NULL
            AND player_wallet_id IS NULL
        )
        OR (
            transfer_type IN ('TREASURY_TO_PLAYER', 'CASHIER_TO_PLAYER')
            AND from_account_id IS NOT NULL
            AND to_account_id IS NULL
            AND player_wallet_id IS NOT NULL
        )
        OR (
            transfer_type IN ('PLAYER_TO_CASHIER', 'PLAYER_TO_TREASURY', 'CASHIER_DEPOSIT_REVERSAL')
            AND from_account_id IS NULL
            AND to_account_id IS NOT NULL
            AND player_wallet_id IS NOT NULL
        )
        OR (
            transfer_type IN (
                'TREASURY_TO_MANAGER',
                'TREASURY_TO_CASHIER',
                'MANAGER_TO_CASHIER',
                'CASHIER_TO_MANAGER',
                'CASHIER_TO_TREASURY'
            )
            AND from_account_id IS NOT NULL
            AND to_account_id IS NOT NULL
            AND player_wallet_id IS NULL
        )
    );

ALTER TABLE private.operational_ledger
    DROP CONSTRAINT IF EXISTS operational_ledger_operation_type_check;

ALTER TABLE private.operational_ledger
    ADD CONSTRAINT operational_ledger_operation_type_check
    CHECK (
        operation_type IN (
            'OPENING_BALANCE',
            'CAPITAL_IN',
            'TREASURY_TO_MANAGER',
            'TREASURY_TO_CASHIER',
            'MANAGER_TO_CASHIER',
            'CASHIER_TO_MANAGER',
            'CASHIER_TO_TREASURY',
            'TREASURY_TO_PLAYER',
            'CASHIER_TO_PLAYER',
            'PLAYER_TO_CASHIER',
            'PLAYER_TO_TREASURY',
            'CASHIER_DEPOSIT_REVERSAL'
        )
    );


-- ============================================================
-- 1b. WALLET CORE + OPERATIONAL SOURCE_MODULE CHECKS
-- Preserve ALL existing values on the named live constraints,
-- then add OWNER_DEBIT, CASH_DEPOSIT_REVERSAL, and owner.
-- ============================================================

DO $chk$
DECLARE
    r RECORD;
    v_def TEXT;
    v_vals TEXT[] := ARRAY[]::TEXT[];
    v_tok TEXT;
    v_sql TEXT;
    v_matches TEXT[];
BEGIN
    PERFORM pg_catalog.set_config('search_path', '', true);

    FOR r IN
        SELECT *
        FROM (
            VALUES
            (
                'wallet_ledger'::TEXT,
                'wallet_ledger_operation_type_check'::TEXT,
                'operation_type'::TEXT,
                ARRAY[
                    'CASH_DEPOSIT',
                    'TREASURY_FUNDING',
                    'WITHDRAWAL_HOLD',
                    'WITHDRAWAL_RELEASE',
                    'WITHDRAWAL_COMPLETE',
                    'CASINO_BET',
                    'CASINO_WIN',
                    'CASINO_REFUND',
                    'OPENING_BALANCE',
                    'OWNER_DEBIT',
                    'CASH_DEPOSIT_REVERSAL'
                ]::TEXT[]
            ),
            (
                'wallet_ledger'::TEXT,
                'wallet_ledger_source_module_check'::TEXT,
                'source_module'::TEXT,
                ARRAY[
                    'mobcash',
                    'treasury',
                    'casino',
                    'withdrawal',
                    'system',
                    'manager',
                    'owner'
                ]::TEXT[]
            ),
            (
                'operational_ledger'::TEXT,
                'operational_ledger_source_module_check'::TEXT,
                'source_module'::TEXT,
                ARRAY[
                    'treasury',
                    'manager',
                    'mobcash',
                    'migration',
                    'system',
                    'owner'
                ]::TEXT[]
            )
        ) AS t(tbl, cons, col, extras)
    LOOP
        SELECT pg_catalog.pg_get_constraintdef(c.oid)
        INTO v_def
        FROM pg_catalog.pg_constraint AS c
        INNER JOIN pg_catalog.pg_class AS rel ON rel.oid = c.conrelid
        INNER JOIN pg_catalog.pg_namespace AS n ON n.oid = rel.relnamespace
        WHERE n.nspname = 'private'
          AND rel.relname = r.tbl
          AND c.conname = r.cons;

        IF v_def IS NULL THEN
            RAISE EXCEPTION '% not found', r.cons;
        END IF;

        v_vals := ARRAY[]::TEXT[];
        FOR v_matches IN
            SELECT pg_catalog.regexp_matches(v_def, '''([^'']+)''', 'g')
        LOOP
            v_tok := v_matches[1];
            IF v_tok IS NOT NULL AND NOT v_tok = ANY (v_vals) THEN
                v_vals := pg_catalog.array_append(v_vals, v_tok);
            END IF;
        END LOOP;

        IF COALESCE(pg_catalog.array_length(v_vals, 1), 0) = 0 THEN
            RAISE EXCEPTION 'failed to parse existing values for %', r.cons;
        END IF;

        FOREACH v_tok IN ARRAY r.extras LOOP
            IF NOT v_tok = ANY (v_vals) THEN
                v_vals := pg_catalog.array_append(v_vals, v_tok);
            END IF;
        END LOOP;

        v_sql := pg_catalog.format(
            'ALTER TABLE private.%I DROP CONSTRAINT %I',
            r.tbl,
            r.cons
        );
        EXECUTE v_sql;

        v_sql := pg_catalog.format(
            'ALTER TABLE private.%I ADD CONSTRAINT %I CHECK (%I IN (%s))',
            r.tbl,
            r.cons,
            r.col,
            (
                SELECT pg_catalog.string_agg(pg_catalog.quote_literal(x), ', ' ORDER BY x)
                FROM pg_catalog.unnest(v_vals) AS x
            )
        );
        EXECUTE v_sql;
    END LOOP;
END
$chk$;


-- ============================================================
-- 2. SHAPE TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION private.operational_transfers_enforce_shape()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $tg$
DECLARE
    v_from_type TEXT;
    v_to_type TEXT;
    v_from_currency TEXT;
    v_to_currency TEXT;
BEGIN
    IF NEW.from_account_id IS NOT NULL THEN
        SELECT a.account_type, a.currency
        INTO v_from_type, v_from_currency
        FROM private.operational_accounts AS a
        WHERE a.id = NEW.from_account_id;

        IF v_from_type IS NULL THEN
            RAISE EXCEPTION 'FROM_ACCOUNT_NOT_FOUND';
        END IF;
        IF v_from_currency IS DISTINCT FROM NEW.currency THEN
            RAISE EXCEPTION 'FROM_ACCOUNT_CURRENCY_MISMATCH';
        END IF;
    END IF;

    IF NEW.to_account_id IS NOT NULL THEN
        SELECT a.account_type, a.currency
        INTO v_to_type, v_to_currency
        FROM private.operational_accounts AS a
        WHERE a.id = NEW.to_account_id;

        IF v_to_type IS NULL THEN
            RAISE EXCEPTION 'TO_ACCOUNT_NOT_FOUND';
        END IF;
        IF v_to_currency IS DISTINCT FROM NEW.currency THEN
            RAISE EXCEPTION 'TO_ACCOUNT_CURRENCY_MISMATCH';
        END IF;
    END IF;

    IF NEW.transfer_type = 'CAPITAL_IN'
       AND v_to_type IS DISTINCT FROM 'company_treasury' THEN
        RAISE EXCEPTION 'CAPITAL_IN_REQUIRES_TREASURY';
    ELSIF NEW.transfer_type = 'TREASURY_TO_MANAGER'
          AND (
              v_from_type IS DISTINCT FROM 'company_treasury'
              OR v_to_type IS DISTINCT FROM 'manager'
          ) THEN
        RAISE EXCEPTION 'TREASURY_TO_MANAGER_SHAPE_INVALID';
    ELSIF NEW.transfer_type = 'TREASURY_TO_CASHIER'
          AND (
              v_from_type IS DISTINCT FROM 'company_treasury'
              OR v_to_type IS DISTINCT FROM 'cashier'
          ) THEN
        RAISE EXCEPTION 'TREASURY_TO_CASHIER_SHAPE_INVALID';
    ELSIF NEW.transfer_type = 'MANAGER_TO_CASHIER'
          AND (
              v_from_type IS DISTINCT FROM 'manager'
              OR v_to_type IS DISTINCT FROM 'cashier'
          ) THEN
        RAISE EXCEPTION 'MANAGER_TO_CASHIER_SHAPE_INVALID';
    ELSIF NEW.transfer_type = 'CASHIER_TO_MANAGER'
          AND (
              v_from_type IS DISTINCT FROM 'cashier'
              OR v_to_type IS DISTINCT FROM 'manager'
          ) THEN
        RAISE EXCEPTION 'CASHIER_TO_MANAGER_SHAPE_INVALID';
    ELSIF NEW.transfer_type = 'CASHIER_TO_TREASURY'
          AND (
              v_from_type IS DISTINCT FROM 'cashier'
              OR v_to_type IS DISTINCT FROM 'company_treasury'
          ) THEN
        RAISE EXCEPTION 'CASHIER_TO_TREASURY_SHAPE_INVALID';
    ELSIF NEW.transfer_type = 'TREASURY_TO_PLAYER'
          AND v_from_type IS DISTINCT FROM 'company_treasury' THEN
        RAISE EXCEPTION 'TREASURY_TO_PLAYER_REQUIRES_TREASURY';
    ELSIF NEW.transfer_type = 'CASHIER_TO_PLAYER'
          AND v_from_type IS DISTINCT FROM 'cashier' THEN
        RAISE EXCEPTION 'CASHIER_TO_PLAYER_REQUIRES_CASHIER';
    ELSIF NEW.transfer_type = 'PLAYER_TO_CASHIER'
          AND v_to_type IS DISTINCT FROM 'cashier' THEN
        RAISE EXCEPTION 'PLAYER_TO_CASHIER_REQUIRES_CASHIER';
    ELSIF NEW.transfer_type = 'PLAYER_TO_TREASURY'
          AND v_to_type IS DISTINCT FROM 'company_treasury' THEN
        RAISE EXCEPTION 'PLAYER_TO_TREASURY_REQUIRES_TREASURY';
    ELSIF NEW.transfer_type = 'CASHIER_DEPOSIT_REVERSAL'
          AND v_to_type IS DISTINCT FROM 'cashier' THEN
        RAISE EXCEPTION 'CASHIER_DEPOSIT_REVERSAL_REQUIRES_CASHIER';
    END IF;

    RETURN NEW;
END;
$tg$;

REVOKE ALL ON FUNCTION private.operational_transfers_enforce_shape() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.operational_transfers_enforce_shape() FROM anon, authenticated;


-- ============================================================
-- 3. ENGINE (same signature; additive types only)
-- ============================================================

CREATE OR REPLACE FUNCTION private.apply_operational_transfer(
    p_transfer_type TEXT,
    p_amount NUMERIC,
    p_currency TEXT,
    p_idempotency_key TEXT,
    p_from_account_id UUID DEFAULT NULL,
    p_to_account_id UUID DEFAULT NULL,
    p_player_wallet_id UUID DEFAULT NULL,
    p_actor_user_id UUID DEFAULT NULL,
    p_actor_role TEXT DEFAULT 'system',
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
    transfer_id UUID,
    is_duplicate BOOLEAN,
    from_balance_after NUMERIC,
    to_balance_after NUMERIC,
    player_balance_after NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_type TEXT;
    v_currency TEXT;
    v_key TEXT;
    v_actor_role TEXT;
    v_metadata JSONB;
    v_amount NUMERIC(20,2);
    v_existing private.operational_transfers%ROWTYPE;
    v_from private.operational_accounts%ROWTYPE;
    v_to private.operational_accounts%ROWTYPE;
    v_lock_first UUID;
    v_lock_second UUID;
    v_row private.operational_accounts%ROWTYPE;
    v_staff_role TEXT;
    v_staff_status TEXT;
    v_network_id UUID;
    v_source_module TEXT;
    v_wallet_currency TEXT;
    v_wallet_available NUMERIC;
    v_wallet_status TEXT;
    v_wallet_locked NUMERIC;
    v_calculated NUMERIC;
    v_from_after NUMERIC(20,2);
    v_to_after NUMERIC(20,2);
    v_player_after NUMERIC(20,2);
    v_transfer_id UUID;
    v_player_actor TEXT;
    v_max NUMERIC := 999999999999999999.99;
    v_baseline BIGINT;
BEGIN
    -- --------------------------------------------------------
    -- AMOUNT (before NUMERIC(20,2) assignment)
    -- --------------------------------------------------------
    IF p_amount IS NULL THEN
        RAISE EXCEPTION 'AMOUNT_REQUIRED';
    END IF;

    IF p_amount IN (
        'NaN'::NUMERIC,
        'Infinity'::NUMERIC,
        '-Infinity'::NUMERIC
    ) THEN
        RAISE EXCEPTION 'AMOUNT_NOT_FINITE';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'AMOUNT_NOT_POSITIVE';
    END IF;

    IF p_amount <> ROUND(p_amount, 2) THEN
        RAISE EXCEPTION 'AMOUNT_SCALE_INVALID';
    END IF;

    IF p_amount > v_max THEN
        RAISE EXCEPTION 'AMOUNT_OVERFLOW';
    END IF;

    v_amount := ROUND(p_amount, 2);

    -- --------------------------------------------------------
    -- TEXT / JSON INPUT
    -- --------------------------------------------------------
    v_type := upper(BTRIM(COALESCE(p_transfer_type, '')));
    IF v_type NOT IN (
        'CAPITAL_IN',
        'TREASURY_TO_MANAGER',
        'TREASURY_TO_CASHIER',
        'MANAGER_TO_CASHIER',
        'CASHIER_TO_MANAGER',
        'CASHIER_TO_TREASURY',
        'TREASURY_TO_PLAYER',
        'CASHIER_TO_PLAYER',
        'PLAYER_TO_CASHIER',
        'PLAYER_TO_TREASURY',
        'CASHIER_DEPOSIT_REVERSAL'
    ) THEN
        RAISE EXCEPTION 'TRANSFER_TYPE_INVALID';
    END IF;

    v_currency := upper(BTRIM(COALESCE(p_currency, '')));
    IF v_currency !~ '^[A-Z]{3,10}$' THEN
        RAISE EXCEPTION 'CURRENCY_INVALID';
    END IF;

    v_key := BTRIM(COALESCE(p_idempotency_key, ''));
    IF v_key = '' THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
    END IF;
    IF char_length(v_key) > 250 THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_TOO_LONG';
    END IF;

    v_actor_role := lower(BTRIM(COALESCE(p_actor_role, 'system')));
    IF v_actor_role NOT IN ('owner', 'manager', 'cashier', 'system', 'migration') THEN
        RAISE EXCEPTION 'ACTOR_ROLE_INVALID';
    END IF;

    v_metadata := COALESCE(p_metadata, '{}'::jsonb);
    IF jsonb_typeof(v_metadata) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'METADATA_MUST_BE_OBJECT';
    END IF;
    IF pg_catalog.pg_column_size(v_metadata) > 16384 THEN
        RAISE EXCEPTION 'METADATA_TOO_LARGE';
    END IF;

    -- Staff user-id / active-status checks wait until after
    -- duplicate-idempotency resolution (NEW transfers only).

    -- --------------------------------------------------------
    -- SHAPE (semantic, before locks)
    -- --------------------------------------------------------
    IF v_type = 'CAPITAL_IN' THEN
        IF p_from_account_id IS NOT NULL
           OR p_to_account_id IS NULL
           OR p_player_wallet_id IS NOT NULL THEN
            RAISE EXCEPTION 'TRANSFER_SHAPE_INVALID';
        END IF;
    ELSIF v_type IN ('TREASURY_TO_PLAYER', 'CASHIER_TO_PLAYER') THEN
        IF p_from_account_id IS NULL
           OR p_to_account_id IS NOT NULL
           OR p_player_wallet_id IS NULL THEN
            RAISE EXCEPTION 'TRANSFER_SHAPE_INVALID';
        END IF;
    ELSIF v_type = 'PLAYER_TO_CASHIER' THEN
        IF p_from_account_id IS NOT NULL
           OR p_to_account_id IS NULL
           OR p_player_wallet_id IS NULL THEN
            RAISE EXCEPTION 'TRANSFER_SHAPE_INVALID';
        END IF;
    ELSIF v_type IN ('PLAYER_TO_TREASURY', 'CASHIER_DEPOSIT_REVERSAL') THEN
        IF p_from_account_id IS NOT NULL
           OR p_to_account_id IS NULL
           OR p_player_wallet_id IS NULL THEN
            RAISE EXCEPTION 'TRANSFER_SHAPE_INVALID';
        END IF;
    ELSE
        IF p_from_account_id IS NULL
           OR p_to_account_id IS NULL
           OR p_player_wallet_id IS NOT NULL
           OR p_from_account_id = p_to_account_id THEN
            RAISE EXCEPTION 'TRANSFER_SHAPE_INVALID';
        END IF;
    END IF;

    -- --------------------------------------------------------
    -- IDEMPOTENCY ADVISORY LOCK (transaction-scoped)
    -- --------------------------------------------------------
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'nextpari:operational-transfer:' || v_key,
            0
        )
    );

    SELECT t.*
    INTO v_existing
    FROM private.operational_transfers AS t
    WHERE t.idempotency_key = v_key;

    IF FOUND THEN
        IF v_existing.transfer_type = v_type
           AND v_existing.from_account_id IS NOT DISTINCT FROM p_from_account_id
           AND v_existing.to_account_id IS NOT DISTINCT FROM p_to_account_id
           AND v_existing.player_wallet_id IS NOT DISTINCT FROM p_player_wallet_id
           AND v_existing.currency = v_currency
           AND v_existing.amount = v_amount
           AND v_existing.actor_user_id IS NOT DISTINCT FROM p_actor_user_id
           AND v_existing.actor_role IS NOT DISTINCT FROM v_actor_role
        THEN
            IF v_existing.from_account_id IS NOT NULL THEN
                BEGIN
                    SELECT l.balance_after
                    INTO STRICT from_balance_after
                    FROM private.operational_ledger AS l
                    WHERE l.transfer_id = v_existing.id
                      AND l.account_id = v_existing.from_account_id;
                EXCEPTION
                    WHEN no_data_found OR too_many_rows THEN
                        RAISE EXCEPTION 'TRANSFER_LEDGER_INCONSISTENT';
                END;
            END IF;

            IF v_existing.to_account_id IS NOT NULL THEN
                BEGIN
                    SELECT l.balance_after
                    INTO STRICT to_balance_after
                    FROM private.operational_ledger AS l
                    WHERE l.transfer_id = v_existing.id
                      AND l.account_id = v_existing.to_account_id;
                EXCEPTION
                    WHEN no_data_found OR too_many_rows THEN
                        RAISE EXCEPTION 'TRANSFER_LEDGER_INCONSISTENT';
                END;
            END IF;

            IF v_existing.player_wallet_id IS NOT NULL THEN
                BEGIN
                    SELECT l.available_after
                    INTO STRICT player_balance_after
                    FROM private.wallet_ledger AS l
                    WHERE l.wallet_id = v_existing.player_wallet_id
                      AND l.reference_type = 'operational_transfer'
                      AND l.reference_id = v_existing.id::TEXT
                      AND l.operation_type = CASE v_existing.transfer_type
                        WHEN 'CASHIER_TO_PLAYER' THEN 'CASH_DEPOSIT'
                        WHEN 'PLAYER_TO_CASHIER' THEN 'WITHDRAWAL_COMPLETE'
                        WHEN 'PLAYER_TO_TREASURY' THEN 'OWNER_DEBIT'
                        WHEN 'CASHIER_DEPOSIT_REVERSAL' THEN 'CASH_DEPOSIT_REVERSAL'
                        ELSE 'TREASURY_FUNDING'
                    END;
                EXCEPTION
                    WHEN no_data_found OR too_many_rows THEN
                        RAISE EXCEPTION 'TRANSFER_LEDGER_INCONSISTENT';
                END;
            END IF;

            transfer_id := v_existing.id;
            is_duplicate := true;
            RETURN NEXT;
            RETURN;
        END IF;

        RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
    END IF;

    -- --------------------------------------------------------
    -- NEW TRANSFER: staff actor identity (mutable status)
    -- Exact duplicate already returned above.
    -- --------------------------------------------------------
    IF v_actor_role IN ('owner', 'manager', 'cashier') THEN
        IF p_actor_user_id IS NULL THEN
            RAISE EXCEPTION 'STAFF_ACTOR_USER_REQUIRED';
        END IF;

        SELECT s.role, s.status
        INTO v_staff_role, v_staff_status
        FROM private.staff_accounts AS s
        WHERE s.auth_user_id = p_actor_user_id;

        IF v_staff_role IS NULL
           OR v_staff_role IS DISTINCT FROM v_actor_role
           OR v_staff_status IS DISTINCT FROM 'active' THEN
            RAISE EXCEPTION 'STAFF_ACTOR_INVALID';
        END IF;
    END IF;

    -- --------------------------------------------------------
    -- LOCK OPERATIONAL ACCOUNTS
    -- Two-sided: deterministic UUID order (not transfer direction).
    -- TREASURY_TO_PLAYER / CAPITAL_IN: single operational lock.
    -- --------------------------------------------------------
    IF p_from_account_id IS NOT NULL AND p_to_account_id IS NOT NULL THEN
        IF p_from_account_id < p_to_account_id THEN
            v_lock_first := p_from_account_id;
            v_lock_second := p_to_account_id;
        ELSE
            v_lock_first := p_to_account_id;
            v_lock_second := p_from_account_id;
        END IF;

        SELECT a.*
        INTO v_row
        FROM private.operational_accounts AS a
        WHERE a.id = v_lock_first
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'OPERATIONAL_ACCOUNT_NOT_FOUND';
        END IF;
        IF v_row.id = p_from_account_id THEN
            v_from := v_row;
        ELSE
            v_to := v_row;
        END IF;

        SELECT a.*
        INTO v_row
        FROM private.operational_accounts AS a
        WHERE a.id = v_lock_second
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'OPERATIONAL_ACCOUNT_NOT_FOUND';
        END IF;
        IF v_row.id = p_from_account_id THEN
            v_from := v_row;
        ELSE
            v_to := v_row;
        END IF;
    ELSIF p_from_account_id IS NOT NULL THEN
        SELECT a.*
        INTO v_from
        FROM private.operational_accounts AS a
        WHERE a.id = p_from_account_id
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'OPERATIONAL_ACCOUNT_NOT_FOUND';
        END IF;
    ELSIF p_to_account_id IS NOT NULL THEN
        SELECT a.*
        INTO v_to
        FROM private.operational_accounts AS a
        WHERE a.id = p_to_account_id
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'OPERATIONAL_ACCOUNT_NOT_FOUND';
        END IF;
    END IF;

    -- --------------------------------------------------------
    -- STAGING GATE + STATUS + CURRENCY + ACCOUNT TYPES
    -- --------------------------------------------------------
    IF p_from_account_id IS NOT NULL THEN
        IF v_from.migration_state IS DISTINCT FROM 'active'
           OR v_from.status IS DISTINCT FROM 'active' THEN
            RAISE EXCEPTION 'OPERATIONAL_ACCOUNT_NOT_ACTIVE';
        END IF;
        IF v_from.currency IS DISTINCT FROM v_currency THEN
            RAISE EXCEPTION 'CURRENCY_MISMATCH';
        END IF;
    END IF;

    IF p_to_account_id IS NOT NULL THEN
        IF v_to.migration_state IS DISTINCT FROM 'active'
           OR v_to.status IS DISTINCT FROM 'active' THEN
            RAISE EXCEPTION 'OPERATIONAL_ACCOUNT_NOT_ACTIVE';
        END IF;
        IF v_to.currency IS DISTINCT FROM v_currency THEN
            RAISE EXCEPTION 'CURRENCY_MISMATCH';
        END IF;
    END IF;

    IF v_type = 'CAPITAL_IN' THEN
        IF v_to.account_type IS DISTINCT FROM 'company_treasury' THEN
            RAISE EXCEPTION 'TRANSFER_SHAPE_INVALID';
        END IF;
    ELSIF v_type = 'TREASURY_TO_MANAGER' THEN
        IF v_from.account_type IS DISTINCT FROM 'company_treasury'
           OR v_to.account_type IS DISTINCT FROM 'manager' THEN
            RAISE EXCEPTION 'TRANSFER_SHAPE_INVALID';
        END IF;
    ELSIF v_type = 'TREASURY_TO_CASHIER' THEN
        IF v_from.account_type IS DISTINCT FROM 'company_treasury'
           OR v_to.account_type IS DISTINCT FROM 'cashier' THEN
            RAISE EXCEPTION 'TRANSFER_SHAPE_INVALID';
        END IF;
    ELSIF v_type = 'MANAGER_TO_CASHIER' THEN
        IF v_from.account_type IS DISTINCT FROM 'manager'
           OR v_to.account_type IS DISTINCT FROM 'cashier' THEN
            RAISE EXCEPTION 'TRANSFER_SHAPE_INVALID';
        END IF;
    ELSIF v_type = 'CASHIER_TO_MANAGER' THEN
        IF v_from.account_type IS DISTINCT FROM 'cashier'
           OR v_to.account_type IS DISTINCT FROM 'manager' THEN
            RAISE EXCEPTION 'TRANSFER_SHAPE_INVALID';
        END IF;
    ELSIF v_type = 'CASHIER_TO_TREASURY' THEN
        IF v_from.account_type IS DISTINCT FROM 'cashier'
           OR v_to.account_type IS DISTINCT FROM 'company_treasury' THEN
            RAISE EXCEPTION 'TRANSFER_SHAPE_INVALID';
        END IF;
    ELSIF v_type = 'TREASURY_TO_PLAYER' THEN
        IF v_from.account_type IS DISTINCT FROM 'company_treasury' THEN
            RAISE EXCEPTION 'TRANSFER_SHAPE_INVALID';
        END IF;
    ELSIF v_type = 'CASHIER_TO_PLAYER' THEN
        IF v_from.account_type IS DISTINCT FROM 'cashier' THEN
            RAISE EXCEPTION 'TRANSFER_SHAPE_INVALID';
        END IF;
    ELSIF v_type = 'PLAYER_TO_CASHIER' THEN
        IF v_to.account_type IS DISTINCT FROM 'cashier' THEN
            RAISE EXCEPTION 'TRANSFER_SHAPE_INVALID';
        END IF;
    ELSIF v_type = 'PLAYER_TO_TREASURY' THEN
        IF v_to.account_type IS DISTINCT FROM 'company_treasury' THEN
            RAISE EXCEPTION 'TRANSFER_SHAPE_INVALID';
        END IF;
    ELSIF v_type = 'CASHIER_DEPOSIT_REVERSAL' THEN
        IF v_to.account_type IS DISTINCT FROM 'cashier' THEN
            RAISE EXCEPTION 'TRANSFER_SHAPE_INVALID';
        END IF;
    END IF;

    -- --------------------------------------------------------
    -- NETWORK (derived; no caller-supplied network_id)
    -- --------------------------------------------------------
    IF v_type IN ('MANAGER_TO_CASHIER', 'CASHIER_TO_MANAGER') THEN
        IF v_from.network_id IS NULL
           OR v_to.network_id IS NULL
           OR v_from.network_id IS DISTINCT FROM v_to.network_id THEN
            RAISE EXCEPTION 'NETWORK_SCOPE_VIOLATION';
        END IF;
        v_network_id := v_from.network_id;
    ELSIF v_type = 'TREASURY_TO_MANAGER' THEN
        v_network_id := v_to.network_id;
    ELSIF v_type = 'TREASURY_TO_CASHIER' THEN
        v_network_id := v_to.network_id;
    ELSIF v_type = 'CASHIER_TO_TREASURY' THEN
        v_network_id := v_from.network_id;
    ELSIF v_type = 'CASHIER_TO_PLAYER' THEN
        v_network_id := v_from.network_id;
    ELSIF v_type = 'PLAYER_TO_CASHIER' THEN
        v_network_id := v_to.network_id;
    ELSIF v_type = 'CASHIER_DEPOSIT_REVERSAL' THEN
        v_network_id := v_to.network_id;
    ELSIF v_type = 'PLAYER_TO_TREASURY' THEN
        v_network_id := NULL;
    ELSE
        v_network_id := NULL;
    END IF;

    -- --------------------------------------------------------
    -- PLAYER WALLET LOCK
    -- Operational row is already locked above.
    -- Cross-core order: OPERATIONAL ACCOUNT → PLAYER WALLET.
    -- apply_wallet_entry later FOR UPDATE on the same row
    -- in this transaction (lock already held).
    -- Never lock player wallet before operational accounts.
    -- --------------------------------------------------------
    IF v_type IN ('TREASURY_TO_PLAYER', 'CASHIER_TO_PLAYER', 'PLAYER_TO_CASHIER', 'PLAYER_TO_TREASURY', 'CASHIER_DEPOSIT_REVERSAL') THEN
        SELECT
            w.currency,
            w.available_balance,
            w.locked_balance,
            w.status
        INTO
            v_wallet_currency,
            v_wallet_available,
            v_wallet_locked,
            v_wallet_status
        FROM private.wallet_accounts AS w
        WHERE w.wallet_id = p_player_wallet_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'PLAYER_WALLET_NOT_FOUND';
        END IF;
        IF v_wallet_currency IS DISTINCT FROM v_currency THEN
            RAISE EXCEPTION 'CURRENCY_MISMATCH';
        END IF;
        IF v_wallet_status IS DISTINCT FROM 'active' THEN
            RAISE EXCEPTION 'PLAYER_WALLET_NOT_ACTIVE';
        END IF;
        IF v_type = 'PLAYER_TO_CASHIER' AND v_wallet_locked < v_amount THEN
            RAISE EXCEPTION 'INSUFFICIENT_LOCKED_BALANCE';
        END IF;
        IF v_type IN ('PLAYER_TO_TREASURY', 'CASHIER_DEPOSIT_REVERSAL') THEN
            IF v_wallet_available < v_amount THEN
                RAISE EXCEPTION 'INSUFFICIENT_AVAILABLE_BALANCE';
            END IF;
            v_calculated := v_wallet_available - v_amount;
            IF v_calculated < 0 THEN
                RAISE EXCEPTION 'INSUFFICIENT_AVAILABLE_BALANCE';
            END IF;
        END IF;
        IF v_type = 'CASHIER_DEPOSIT_REVERSAL' THEN
            v_baseline := NULLIF(BTRIM(COALESCE(v_metadata->>'original_deposit_entry_no', '')), '')::BIGINT;
            IF v_baseline IS NULL THEN
                RAISE EXCEPTION 'CASHIER_REVERSAL_DEPOSIT_ENTRY_NOT_FOUND';
            END IF;
            IF EXISTS (
                SELECT 1
                FROM private.wallet_ledger AS l
                WHERE l.wallet_id = p_player_wallet_id
                  AND l.entry_no > v_baseline
                  AND (l.available_delta < 0 OR l.locked_delta > 0)
            ) THEN
                RAISE EXCEPTION 'CASHIER_REVERSAL_PLAYER_ACTIVITY';
            END IF;
        END IF;
    END IF;

    -- --------------------------------------------------------
    -- FUNDS + OVERFLOW (unconstrained math, then assign NUMERIC(20,2))
    -- Writes happen only after these checks.
    -- --------------------------------------------------------
    IF v_type NOT IN ('CAPITAL_IN', 'PLAYER_TO_CASHIER', 'PLAYER_TO_TREASURY', 'CASHIER_DEPOSIT_REVERSAL') THEN
        IF v_from.available_balance < v_amount THEN
            RAISE EXCEPTION 'INSUFFICIENT_OPERATIONAL_BALANCE';
        END IF;
        v_calculated := v_from.available_balance - v_amount;
        IF v_calculated < 0 THEN
            RAISE EXCEPTION 'INSUFFICIENT_OPERATIONAL_BALANCE';
        END IF;
        v_from_after := v_calculated;
    END IF;

    IF v_type NOT IN ('TREASURY_TO_PLAYER', 'CASHIER_TO_PLAYER') THEN
        v_calculated := v_to.available_balance + v_amount;
        IF v_calculated > v_max THEN
            RAISE EXCEPTION 'OPERATIONAL_BALANCE_OVERFLOW';
        END IF;
        v_to_after := v_calculated;
    END IF;

    IF v_type IN ('TREASURY_TO_PLAYER', 'CASHIER_TO_PLAYER') THEN
        v_calculated := v_wallet_available + v_amount;
        IF v_calculated > v_max THEN
            RAISE EXCEPTION 'PLAYER_BALANCE_OVERFLOW';
        END IF;
    END IF;

    v_source_module := CASE v_type
        WHEN 'MANAGER_TO_CASHIER' THEN 'manager'
        WHEN 'CASHIER_TO_MANAGER' THEN 'mobcash'
        WHEN 'CASHIER_TO_TREASURY' THEN 'mobcash'
        WHEN 'CASHIER_TO_PLAYER' THEN 'mobcash'
        WHEN 'PLAYER_TO_CASHIER' THEN 'mobcash'
        WHEN 'CASHIER_DEPOSIT_REVERSAL' THEN 'mobcash'
        WHEN 'PLAYER_TO_TREASURY' THEN 'owner'
        ELSE 'treasury'
    END;

    -- --------------------------------------------------------
    -- TRANSFER JOURNAL (completed; rolls back on later failure)
    -- --------------------------------------------------------
    INSERT INTO private.operational_transfers (
        idempotency_key,
        transfer_type,
        from_account_id,
        to_account_id,
        player_wallet_id,
        currency,
        amount,
        actor_user_id,
        actor_role,
        network_id,
        metadata
    )
    VALUES (
        v_key,
        v_type,
        p_from_account_id,
        p_to_account_id,
        p_player_wallet_id,
        v_currency,
        v_amount,
        p_actor_user_id,
        v_actor_role,
        v_network_id,
        v_metadata
    )
    RETURNING id INTO v_transfer_id;

    -- --------------------------------------------------------
    -- LEDGER + CANONICAL BALANCE (version/updated_at via trigger)
    -- --------------------------------------------------------
    IF v_type = 'CAPITAL_IN' THEN
        INSERT INTO private.operational_ledger (
            account_id,
            transfer_id,
            currency,
            delta,
            balance_before,
            balance_after,
            operation_type,
            source_module,
            reference_type,
            reference_id,
            entry_key,
            actor_type,
            actor_user_id,
            metadata
        )
        VALUES (
            v_to.id,
            v_transfer_id,
            v_currency,
            v_amount,
            v_to.available_balance,
            v_to_after,
            v_type,
            v_source_module,
            'operational_transfer',
            v_transfer_id::TEXT,
            'transfer:' || v_transfer_id::TEXT || ':credit:' || v_to.id::TEXT,
            v_actor_role,
            p_actor_user_id,
            jsonb_build_object('operational_transfer_id', v_transfer_id)
        );

        UPDATE private.operational_accounts
        SET available_balance = v_to_after
        WHERE id = v_to.id;

    ELSIF v_type IN ('TREASURY_TO_PLAYER', 'CASHIER_TO_PLAYER') THEN
        INSERT INTO private.operational_ledger (
            account_id,
            transfer_id,
            currency,
            delta,
            balance_before,
            balance_after,
            operation_type,
            source_module,
            reference_type,
            reference_id,
            entry_key,
            actor_type,
            actor_user_id,
            metadata
        )
        VALUES (
            v_from.id,
            v_transfer_id,
            v_currency,
            -v_amount,
            v_from.available_balance,
            v_from_after,
            v_type,
            v_source_module,
            'operational_transfer',
            v_transfer_id::TEXT,
            'transfer:' || v_transfer_id::TEXT || ':debit:' || v_from.id::TEXT,
            v_actor_role,
            p_actor_user_id,
            jsonb_build_object('operational_transfer_id', v_transfer_id)
        );

        UPDATE private.operational_accounts
        SET available_balance = v_from_after
        WHERE id = v_from.id;

        v_player_actor := CASE
            WHEN v_actor_role IN ('owner', 'manager', 'cashier', 'system', 'migration')
                THEN v_actor_role
            ELSE 'system'
        END;

        SELECT e.available_balance
        INTO v_player_after
        FROM private.apply_wallet_entry(
            p_player_wallet_id,
            v_amount,
            0,
            CASE WHEN v_type = 'CASHIER_TO_PLAYER' THEN 'CASH_DEPOSIT' ELSE 'TREASURY_FUNDING' END,
            CASE WHEN v_type = 'CASHIER_TO_PLAYER' THEN 'mobcash' ELSE 'treasury' END,
            'operational-transfer:' || v_transfer_id::TEXT || ':player-credit',
            'operational_transfer',
            v_transfer_id::TEXT,
            v_player_actor,
            CASE WHEN p_actor_user_id IS NULL THEN NULL ELSE p_actor_user_id::TEXT END,
            jsonb_build_object('operational_transfer_id', v_transfer_id)
        ) AS e;

    ELSIF v_type IN ('PLAYER_TO_TREASURY', 'CASHIER_DEPOSIT_REVERSAL') THEN
        INSERT INTO private.operational_ledger (
            account_id,
            transfer_id,
            currency,
            delta,
            balance_before,
            balance_after,
            operation_type,
            source_module,
            reference_type,
            reference_id,
            entry_key,
            actor_type,
            actor_user_id,
            metadata
        )
        VALUES (
            v_to.id,
            v_transfer_id,
            v_currency,
            v_amount,
            v_to.available_balance,
            v_to_after,
            v_type,
            v_source_module,
            'operational_transfer',
            v_transfer_id::TEXT,
            'transfer:' || v_transfer_id::TEXT || ':credit:' || v_to.id::TEXT,
            v_actor_role,
            p_actor_user_id,
            jsonb_build_object('operational_transfer_id', v_transfer_id)
        );

        UPDATE private.operational_accounts
        SET available_balance = v_to_after
        WHERE id = v_to.id;

        v_player_actor := CASE
            WHEN v_actor_role IN ('owner', 'manager', 'cashier', 'system', 'migration')
                THEN v_actor_role
            ELSE 'system'
        END;

        SELECT e.available_balance
        INTO v_player_after
        FROM private.apply_wallet_entry(
            p_player_wallet_id,
            -v_amount,
            0,
            CASE WHEN v_type = 'PLAYER_TO_TREASURY' THEN 'OWNER_DEBIT' ELSE 'CASH_DEPOSIT_REVERSAL' END,
            CASE WHEN v_type = 'PLAYER_TO_TREASURY' THEN 'owner' ELSE 'mobcash' END,
            'operational-transfer:' || v_transfer_id::TEXT || ':player-available-debit',
            'operational_transfer',
            v_transfer_id::TEXT,
            v_player_actor,
            CASE WHEN p_actor_user_id IS NULL THEN NULL ELSE p_actor_user_id::TEXT END,
            jsonb_build_object('operational_transfer_id', v_transfer_id)
        ) AS e;

    ELSIF v_type = 'PLAYER_TO_CASHIER' THEN
        INSERT INTO private.operational_ledger (
            account_id,
            transfer_id,
            currency,
            delta,
            balance_before,
            balance_after,
            operation_type,
            source_module,
            reference_type,
            reference_id,
            entry_key,
            actor_type,
            actor_user_id,
            metadata
        )
        VALUES (
            v_to.id,
            v_transfer_id,
            v_currency,
            v_amount,
            v_to.available_balance,
            v_to_after,
            v_type,
            v_source_module,
            'operational_transfer',
            v_transfer_id::TEXT,
            'transfer:' || v_transfer_id::TEXT || ':credit:' || v_to.id::TEXT,
            v_actor_role,
            p_actor_user_id,
            jsonb_build_object('operational_transfer_id', v_transfer_id)
        );

        UPDATE private.operational_accounts
        SET available_balance = v_to_after
        WHERE id = v_to.id;

        v_player_actor := CASE
            WHEN v_actor_role IN ('owner', 'manager', 'cashier', 'system', 'migration')
                THEN v_actor_role
            ELSE 'system'
        END;

        SELECT e.available_balance
        INTO v_player_after
        FROM private.apply_wallet_entry(
            p_player_wallet_id,
            0,
            -v_amount,
            'WITHDRAWAL_COMPLETE',
            'mobcash',
            'operational-transfer:' || v_transfer_id::TEXT || ':player-debit',
            'operational_transfer',
            v_transfer_id::TEXT,
            v_player_actor,
            CASE WHEN p_actor_user_id IS NULL THEN NULL ELSE p_actor_user_id::TEXT END,
            jsonb_build_object('operational_transfer_id', v_transfer_id)
        ) AS e;

    ELSE
        INSERT INTO private.operational_ledger (
            account_id,
            transfer_id,
            currency,
            delta,
            balance_before,
            balance_after,
            operation_type,
            source_module,
            reference_type,
            reference_id,
            entry_key,
            actor_type,
            actor_user_id,
            metadata
        )
        VALUES (
            v_from.id,
            v_transfer_id,
            v_currency,
            -v_amount,
            v_from.available_balance,
            v_from_after,
            v_type,
            v_source_module,
            'operational_transfer',
            v_transfer_id::TEXT,
            'transfer:' || v_transfer_id::TEXT || ':debit:' || v_from.id::TEXT,
            v_actor_role,
            p_actor_user_id,
            jsonb_build_object('operational_transfer_id', v_transfer_id)
        );

        INSERT INTO private.operational_ledger (
            account_id,
            transfer_id,
            currency,
            delta,
            balance_before,
            balance_after,
            operation_type,
            source_module,
            reference_type,
            reference_id,
            entry_key,
            actor_type,
            actor_user_id,
            metadata
        )
        VALUES (
            v_to.id,
            v_transfer_id,
            v_currency,
            v_amount,
            v_to.available_balance,
            v_to_after,
            v_type,
            v_source_module,
            'operational_transfer',
            v_transfer_id::TEXT,
            'transfer:' || v_transfer_id::TEXT || ':credit:' || v_to.id::TEXT,
            v_actor_role,
            p_actor_user_id,
            jsonb_build_object('operational_transfer_id', v_transfer_id)
        );

        UPDATE private.operational_accounts
        SET available_balance = v_from_after
        WHERE id = v_from.id;

        UPDATE private.operational_accounts
        SET available_balance = v_to_after
        WHERE id = v_to.id;
    END IF;

    -- --------------------------------------------------------
    -- LEGACY CASHIER FLOAT MIRROR (canonical → float only)
    -- --------------------------------------------------------
    IF p_from_account_id IS NOT NULL
       AND v_from.account_type = 'cashier'
       AND v_from.legacy_cashier_id IS NOT NULL THEN
        UPDATE public.cashiers
        SET float_balance = v_from_after,
            updated_at = pg_catalog.now()
        WHERE id = v_from.legacy_cashier_id;
    END IF;

    IF p_to_account_id IS NOT NULL
       AND v_to.account_type = 'cashier'
       AND v_to.legacy_cashier_id IS NOT NULL THEN
        UPDATE public.cashiers
        SET float_balance = v_to_after,
            updated_at = pg_catalog.now()
        WHERE id = v_to.legacy_cashier_id;
    END IF;

    transfer_id := v_transfer_id;
    is_duplicate := false;
    from_balance_after := v_from_after;
    to_balance_after := v_to_after;
    player_balance_after := v_player_after;
    RETURN NEXT;
    RETURN;
END;
$fn$;


REVOKE ALL ON FUNCTION private.apply_operational_transfer(
    TEXT, NUMERIC, TEXT, TEXT, UUID, UUID, UUID, UUID, TEXT, JSONB
) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.apply_operational_transfer(
    TEXT, NUMERIC, TEXT, TEXT, UUID, UUID, UUID, UUID, TEXT, JSONB
) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION private.apply_operational_transfer(
    TEXT, NUMERIC, TEXT, TEXT, UUID, UUID, UUID, UUID, TEXT, JSONB
) TO service_role;



COMMENT ON FUNCTION private.apply_operational_transfer(TEXT, NUMERIC, TEXT, TEXT, UUID, UUID, UUID, UUID, TEXT, JSONB) IS
'Canonical operational transfer engine. Additive 042 types: PLAYER_TO_TREASURY (OWNER_DEBIT available) and CASHIER_DEPOSIT_REVERSAL (CASH_DEPOSIT_REVERSAL available). PLAYER_TO_CASHIER still consumes LOCKED via WITHDRAWAL_COMPLETE. Lock order: operational account then player wallet.';


-- ============================================================
-- 4. CASHIER DEPOSIT REVERSAL REGISTRY
-- ============================================================

CREATE TABLE IF NOT EXISTS private.cashier_deposit_reversals (
    original_transfer_id UUID PRIMARY KEY
        REFERENCES private.operational_transfers(id)
        ON DELETE RESTRICT,
    reversal_transfer_id UUID NOT NULL UNIQUE
        REFERENCES private.operational_transfers(id)
        ON DELETE RESTRICT,
    cashier_auth_user_id UUID NOT NULL
        REFERENCES auth.users(id)
        ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    request_idempotency_key TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS cashier_deposit_reversals_reversal_uidx
    ON private.cashier_deposit_reversals (reversal_transfer_id);

REVOKE ALL ON TABLE private.cashier_deposit_reversals FROM PUBLIC;
REVOKE ALL ON TABLE private.cashier_deposit_reversals FROM anon, authenticated;


-- ============================================================
-- 5. OWNER DEBIT PLAYER
-- ============================================================

CREATE OR REPLACE FUNCTION public.owner_debit_player(
    p_player_id TEXT,
    p_amount NUMERIC,
    p_idempotency_key TEXT,
    p_reason TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_owner UUID;
    v_key TEXT;
    v_reason TEXT;
    v_player RECORD;
    v_treasury RECORD;
    v_engine_key TEXT;
    v_result RECORD;
BEGIN
    SELECT o.auth_user_id
    INTO v_owner
    FROM private.get_current_owner_context() AS o;

    v_reason := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
    IF v_reason IS NULL THEN
        RAISE EXCEPTION 'REASON_REQUIRED';
    END IF;
    IF char_length(v_reason) > 500 THEN
        RAISE EXCEPTION 'REASON_TOO_LONG';
    END IF;

    v_key := private.owner_require_idempotency_key(p_idempotency_key);
    v_engine_key := 'owner-debit-player:' || v_owner::TEXT || ':' || v_key;

    SELECT r.wallet_id, r.public_id, r.currency
    INTO v_player
    FROM private.cashier_resolve_player_by_public_id(p_player_id) AS r;

    SELECT a.id, a.currency
    INTO v_treasury
    FROM private.operational_accounts AS a
    WHERE a.account_type = 'company_treasury'
      AND a.status = 'active'
      AND a.migration_state = 'active'
      AND a.currency = v_player.currency
    ORDER BY CASE WHEN a.currency = 'TMTM' THEN 0 ELSE 1 END, a.created_at ASC
    LIMIT 1;

    IF v_treasury.id IS NULL THEN
        RAISE EXCEPTION 'TREASURY_NOT_FOUND';
    END IF;

    SELECT e.transfer_id, e.is_duplicate, e.from_balance_after, e.to_balance_after, e.player_balance_after
    INTO v_result
    FROM private.apply_operational_transfer(
        'PLAYER_TO_TREASURY',
        p_amount,
        v_player.currency,
        v_engine_key,
        NULL,
        v_treasury.id,
        v_player.wallet_id,
        v_owner,
        'owner',
        jsonb_build_object(
            'player_public_id', v_player.public_id,
            'reason', v_reason
        )
    ) AS e;

    IF v_result.is_duplicate IS NOT TRUE THEN
        PERFORM private.append_staff_audit(
            'OWNER_DEBITED_PLAYER',
            'player',
            v_player.public_id,
            'owner',
            jsonb_build_object(
                'player_public_id', v_player.public_id,
                'amount', p_amount,
                'currency', v_player.currency,
                'transfer_id', v_result.transfer_id,
                'reason', v_reason
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'transfer_id', v_result.transfer_id,
        'is_duplicate', v_result.is_duplicate,
        'amount', p_amount,
        'currency', v_player.currency,
        'player_public_id', v_player.public_id,
        'player_balance_after', v_result.player_balance_after,
        'treasury_balance_after', v_result.to_balance_after
    );
END;
$fn$;

REVOKE ALL ON FUNCTION public.owner_debit_player(TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_debit_player(TEXT, NUMERIC, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_debit_player(TEXT, NUMERIC, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.owner_debit_player(TEXT, NUMERIC, TEXT, TEXT) IS
'Owner JWT only. Debits player AVAILABLE into company treasury as PLAYER_TO_TREASURY / OWNER_DEBIT. Reason required. Resolves player wallet and treasury internally. Never returns wallet or treasury UUIDs.';


-- ============================================================
-- 6. CASHIER REVERSE OWN DEPOSIT
-- ============================================================

CREATE OR REPLACE FUNCTION public.cashier_reverse_player_deposit(
    p_original_transfer_id UUID,
    p_idempotency_key TEXT,
    p_reason TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_op RECORD;
    v_key TEXT;
    v_reason TEXT;
    v_engine_key TEXT;
    v_orig private.operational_transfers%ROWTYPE;
    v_existing private.cashier_deposit_reversals%ROWTYPE;
    v_entry_no BIGINT;
    v_public_id TEXT;
    v_result RECORD;
    v_now TIMESTAMPTZ;
    v_until TIMESTAMPTZ;
BEGIN
    IF p_original_transfer_id IS NULL THEN
        RAISE EXCEPTION 'TRANSFER_ID_REQUIRED';
    END IF;

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

    v_reason := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
    IF v_reason IS NULL THEN
        RAISE EXCEPTION 'REASON_REQUIRED';
    END IF;
    IF char_length(v_reason) > 500 THEN
        RAISE EXCEPTION 'REASON_TOO_LONG';
    END IF;

    v_key := private.owner_require_idempotency_key(p_idempotency_key);
    v_engine_key := 'cashier-deposit-reversal:' || v_ctx.auth_user_id::TEXT || ':' || v_key;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'nextpari:cashier-deposit-reversal:' || p_original_transfer_id::TEXT,
            0
        )
    );

    SELECT t.*
    INTO v_orig
    FROM private.operational_transfers AS t
    WHERE t.id = p_original_transfer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TRANSFER_NOT_FOUND';
    END IF;

    IF v_orig.transfer_type IS DISTINCT FROM 'CASHIER_TO_PLAYER'
       OR v_orig.actor_user_id IS DISTINCT FROM v_ctx.auth_user_id
       OR v_orig.from_account_id IS DISTINCT FROM v_op.account_id
       OR v_orig.player_wallet_id IS NULL THEN
        RAISE EXCEPTION 'CASHIER_REVERSAL_NOT_ALLOWED';
    END IF;

    SELECT r.*
    INTO v_existing
    FROM private.cashier_deposit_reversals AS r
    WHERE r.original_transfer_id = v_orig.id
    FOR UPDATE;

    v_now := pg_catalog.now();
    v_until := v_orig.created_at + INTERVAL '5 minutes';

    IF FOUND THEN
        IF v_existing.request_idempotency_key IS DISTINCT FROM v_key THEN
            RAISE EXCEPTION 'CASHIER_DEPOSIT_ALREADY_REVERSED';
        END IF;
    ELSE
        IF v_now > v_until THEN
            RAISE EXCEPTION 'CASHIER_REVERSAL_WINDOW_EXPIRED';
        END IF;
    END IF;

    BEGIN
        SELECT l.entry_no
        INTO STRICT v_entry_no
        FROM private.wallet_ledger AS l
        WHERE l.wallet_id = v_orig.player_wallet_id
          AND l.reference_type = 'operational_transfer'
          AND l.reference_id = v_orig.id::TEXT
          AND l.operation_type = 'CASH_DEPOSIT';
    EXCEPTION
        WHEN no_data_found OR too_many_rows THEN
            RAISE EXCEPTION 'CASHIER_REVERSAL_DEPOSIT_ENTRY_NOT_FOUND';
    END;

    v_public_id := NULLIF(BTRIM(COALESCE(v_orig.metadata->>'player_public_id', '')), '');
    IF v_public_id IS NULL THEN
        SELECT COALESCE(w.public_id, p.public_id)
        INTO v_public_id
        FROM private.wallet_accounts AS a
        LEFT JOIN public.wallets AS w ON w.id = a.wallet_id
        LEFT JOIN public.profiles AS p ON p.wallet_id = a.wallet_id
        WHERE a.wallet_id = v_orig.player_wallet_id;
    END IF;

    SELECT e.transfer_id, e.is_duplicate, e.from_balance_after, e.to_balance_after, e.player_balance_after
    INTO v_result
    FROM private.apply_operational_transfer(
        'CASHIER_DEPOSIT_REVERSAL',
        v_orig.amount,
        v_orig.currency,
        v_engine_key,
        NULL,
        v_op.account_id,
        v_orig.player_wallet_id,
        v_ctx.auth_user_id,
        'cashier',
        jsonb_build_object(
            'original_transfer_id', v_orig.id,
            'original_deposit_entry_no', v_entry_no::TEXT,
            'player_public_id', v_public_id,
            'reason', v_reason
        )
    ) AS e;

    INSERT INTO private.cashier_deposit_reversals (
        original_transfer_id,
        reversal_transfer_id,
        cashier_auth_user_id,
        request_idempotency_key
    )
    VALUES (
        v_orig.id,
        v_result.transfer_id,
        v_ctx.auth_user_id,
        v_key
    )
    ON CONFLICT (original_transfer_id) DO NOTHING;

    SELECT r.*
    INTO v_existing
    FROM private.cashier_deposit_reversals AS r
    WHERE r.original_transfer_id = v_orig.id;

    IF v_existing.reversal_transfer_id IS DISTINCT FROM v_result.transfer_id THEN
        RAISE EXCEPTION 'CASHIER_DEPOSIT_ALREADY_REVERSED';
    END IF;

    PERFORM private.cashier_revalidate_legacy_cashier(
        v_ctx.legacy_cashier_id,
        v_ctx.network_id
    );

    IF v_result.is_duplicate IS NOT TRUE THEN
        PERFORM private.append_staff_audit(
            'CASHIER_REVERSED_PLAYER_DEPOSIT',
            'player',
            COALESCE(v_public_id, v_orig.id::TEXT),
            'cashier_self',
            jsonb_build_object(
                'original_transfer_id', v_orig.id,
                'reversal_transfer_id', v_result.transfer_id,
                'player_public_id', v_public_id,
                'amount', v_orig.amount,
                'currency', v_orig.currency,
                'reason', v_reason,
                'original_created_at', v_orig.created_at,
                'reversed_at', pg_catalog.now()
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'original_transfer_id', v_orig.id,
        'reversal_transfer_id', v_result.transfer_id,
        'player_public_id', v_public_id,
        'amount', v_orig.amount,
        'currency', v_orig.currency,
        'cashier_balance_after', v_result.to_balance_after,
        'player_balance_after', v_result.player_balance_after,
        'reversed_at', pg_catalog.now(),
        'is_duplicate', v_result.is_duplicate,
        'reversible_until', v_until
    );
END;
$fn$;

REVOKE ALL ON FUNCTION public.cashier_reverse_player_deposit(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cashier_reverse_player_deposit(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.cashier_reverse_player_deposit(UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.cashier_reverse_player_deposit(UUID, TEXT, TEXT) IS
'Cashier JWT only. Reverses one own CASHIER_TO_PLAYER deposit in full within 5 minutes if the player has not later consumed available or locked funds. Amount/wallet/cashier IDs are derived from the original transfer.';


-- ============================================================
-- 7. CASHIER HISTORY SAFETY FIELDS
-- ============================================================

CREATE OR REPLACE FUNCTION public.cashier_list_operational_transfers(
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_limit INTEGER;
    v_offset INTEGER;
    v_account UUID;
    v_total INTEGER;
    v_rows jsonb;
BEGIN
    SELECT
        c.auth_user_id,
        c.network_id,
        c.legacy_cashier_id
    INTO v_ctx
    FROM private.get_current_cashier_context() AS c;

    v_limit := private.owner_require_limit(p_limit, 100);
    v_offset := private.owner_require_offset(p_offset);

    SELECT a.id
    INTO v_account
    FROM private.operational_accounts AS a
    WHERE a.account_type = 'cashier'
      AND a.legacy_cashier_id = v_ctx.legacy_cashier_id
      AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
    ORDER BY CASE WHEN a.currency = 'TMTM' THEN 0 ELSE 1 END, a.created_at ASC
    LIMIT 1;

    IF v_account IS NULL THEN
        RAISE EXCEPTION 'CASHIER_OPERATIONAL_ACCOUNT_NOT_FOUND';
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_total
    FROM private.operational_transfers AS t
    WHERE t.from_account_id = v_account
       OR t.to_account_id = v_account;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', t.id,
            'transfer_no', t.transfer_no,
            'transfer_type', t.transfer_type,
            'currency', t.currency,
            'amount', t.amount,
            'from_account_id', t.from_account_id,
            'to_account_id', t.to_account_id,
            'actor_role', t.actor_role,
            'created_at', t.created_at,
            'player_public_id', t.player_public_id,
            'reversible_until', t.reversible_until,
            'reversal_status', t.reversal_status
        )
    ), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT
            x.id,
            x.transfer_no,
            x.transfer_type,
            x.currency,
            x.amount,
            x.from_account_id,
            x.to_account_id,
            x.actor_role,
            x.created_at,
            CASE
                WHEN x.transfer_type = 'CASHIER_TO_PLAYER'
                    THEN NULLIF(BTRIM(COALESCE(x.metadata->>'player_public_id', '')), '')
                ELSE NULL
            END AS player_public_id,
            CASE
                WHEN x.transfer_type = 'CASHIER_TO_PLAYER'
                    THEN x.created_at + INTERVAL '5 minutes'
                ELSE NULL
            END AS reversible_until,
            CASE
                WHEN x.transfer_type IS DISTINCT FROM 'CASHIER_TO_PLAYER' THEN NULL
                WHEN r.original_transfer_id IS NOT NULL THEN 'reversed'
                WHEN pg_catalog.now() > x.created_at + INTERVAL '5 minutes' THEN 'expired'
                ELSE 'reversible'
            END AS reversal_status
        FROM private.operational_transfers AS x
        LEFT JOIN private.cashier_deposit_reversals AS r
            ON r.original_transfer_id = x.id
        WHERE x.from_account_id = v_account
           OR x.to_account_id = v_account
        ORDER BY x.created_at DESC, x.transfer_no DESC
        LIMIT v_limit
        OFFSET v_offset
    ) AS t;

    RETURN jsonb_build_object(
        'rows', COALESCE(v_rows, '[]'::jsonb),
        'total', COALESCE(v_total, 0),
        'limit', v_limit,
        'offset', v_offset
    );
END;
$fn$;

REVOKE ALL ON FUNCTION public.cashier_list_operational_transfers(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cashier_list_operational_transfers(INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.cashier_list_operational_transfers(INTEGER, INTEGER) TO authenticated;


-- ============================================================
-- 8. LEGACY MANAGER PLAYER DEBIT STAYS REVOKED
-- ============================================================

REVOKE ALL ON FUNCTION public.manager_adjust_player_balance(uuid, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_adjust_player_balance(uuid, text, numeric, text) FROM anon, authenticated;

COMMIT;
