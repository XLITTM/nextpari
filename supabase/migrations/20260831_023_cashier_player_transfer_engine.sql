BEGIN;

-- ============================================================
-- NEXTPARI PHASE 024A
-- CASHIER ↔ PLAYER TRANSFER TYPES (engine extension)
-- Sequence: 023 (after 022 cashier operational read API).
--
-- Additive only. Existing transfer types stay valid.
-- Does NOT change migration_state.
-- Does NOT GRANT public money RPCs.
-- Does NOT call public cashier_deposit_to_player / cashier_payout_by_code.
-- Wallet Core private.apply_wallet_entry body is not rewritten;
-- this engine calls it with existing CASH_DEPOSIT / WITHDRAWAL_COMPLETE.
--
-- New types:
--   CASHIER_TO_PLAYER  from=cashier op, to=NULL, player wallet required
--                      cashier available_balance decreases
--                      player available_balance increases (CASH_DEPOSIT)
--   PLAYER_TO_CASHIER  from=NULL, to=cashier op, player wallet required
--                      player locked_balance decreases (WITHDRAWAL_COMPLETE)
--                      cashier available_balance increases
--
-- CROSS-CORE LOCK ORDER (unchanged direction):
--   1. advisory idempotency lock
--   2. operational account(s) FOR UPDATE
--      two-sided: deterministic UUID order
--      cashier↔player: the single cashier operational row
--   3. player wallet FOR UPDATE
--   4. apply_wallet_entry re-locks the same wallet row
-- Never lock player wallet before operational accounts.
--
-- Staging accounts still raise OPERATIONAL_ACCOUNT_NOT_ACTIVE
-- before any ledger/balance write.
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
            'PLAYER_TO_CASHIER'
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
            transfer_type = 'PLAYER_TO_CASHIER'
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
            'PLAYER_TO_CASHIER'
        )
    );


-- ============================================================
-- 2. SHAPE TRIGGER (account-type pairs)
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
        'PLAYER_TO_CASHIER'
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
    IF v_type IN ('TREASURY_TO_PLAYER', 'CASHIER_TO_PLAYER', 'PLAYER_TO_CASHIER') THEN
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
    END IF;

    -- --------------------------------------------------------
    -- FUNDS + OVERFLOW (unconstrained math, then assign NUMERIC(20,2))
    -- Writes happen only after these checks.
    -- --------------------------------------------------------
    IF v_type NOT IN ('CAPITAL_IN', 'PLAYER_TO_CASHIER') THEN
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

COMMENT ON FUNCTION private.apply_operational_transfer(
    TEXT, NUMERIC, TEXT, TEXT, UUID, UUID, UUID, UUID, TEXT, JSONB
) IS
'Atomic operational transfer engine. Additive CASHIER_TO_PLAYER and PLAYER_TO_CASHIER. Lock order: operational account FOR UPDATE, then player wallet FOR UPDATE; apply_wallet_entry re-locks the same wallet row. Requires operational migration_state=active. Browser NO EXECUTE.';

COMMIT;
