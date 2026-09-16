BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 058
-- MULTI-CURRENCY OPERATIONAL TREASURY
-- OWNER → MANAGER → CASHIER → PLAYER
-- Sequence: after 057 (player multi-currency wallets).
--
-- Repository only. DO NOT APPLY from this change.
-- Existing TMT/TMTM operational account UUIDs, balances,
-- operational ledger, operational transfers, wallet ledger,
-- and pending payouts are preserved.
-- No FX. Same-currency transfers only.
-- Managers/cashiers are NOT auto-assigned non-TMT accounts.
-- public.cashiers.float_balance remains TMT/TMTM diagnostic only.
-- ============================================================

ALTER TABLE private.supported_currencies
    ADD COLUMN IF NOT EXISTS operational_enabled BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE private.supported_currencies
SET operational_enabled = TRUE,
    updated_at = pg_catalog.now()
WHERE code IN ('TMT', 'USD', 'TRY', 'UZS', 'RUB', 'KZT');

CREATE UNIQUE INDEX IF NOT EXISTS operational_accounts_treasury_currency_uidx
    ON private.operational_accounts (currency)
    WHERE account_type = 'company_treasury';

CREATE UNIQUE INDEX IF NOT EXISTS operational_accounts_manager_currency_uidx
    ON private.operational_accounts (legacy_manager_account_id, currency)
    WHERE account_type = 'manager'
      AND legacy_manager_account_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS operational_accounts_cashier_currency_uidx
    ON private.operational_accounts (legacy_cashier_id, currency)
    WHERE account_type = 'cashier'
      AND legacy_cashier_id IS NOT NULL;

INSERT INTO private.operational_accounts (
    account_type,
    currency,
    available_balance,
    status,
    migration_state
)
SELECT
    'company_treasury',
    c.wallet_currency_code,
    0,
    'active',
    'active'
FROM private.supported_currencies AS c
WHERE c.is_active
  AND c.operational_enabled
  AND c.wallet_currency_code IS DISTINCT FROM 'TMTM'
  AND c.code IS DISTINCT FROM 'TMT'
  AND NOT EXISTS (
      SELECT 1
      FROM private.operational_accounts AS a
      WHERE a.account_type = 'company_treasury'
        AND a.currency = c.wallet_currency_code
  );


CREATE OR REPLACE FUNCTION private.require_operational_storage_currency(p_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_storage TEXT;
    v_ok BOOLEAN;
BEGIN
    v_storage := private.wallet_storage_currency(p_code);
    IF v_storage IS NULL THEN
        RAISE EXCEPTION 'CURRENCY_UNSUPPORTED';
    END IF;
    SELECT TRUE
    INTO v_ok
    FROM private.supported_currencies AS c
    WHERE c.wallet_currency_code = v_storage
      AND c.is_active
      AND c.operational_enabled
    LIMIT 1;
    IF v_ok IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'OPERATIONAL_CURRENCY_DISABLED';
    END IF;
    RETURN v_storage;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.operational_display_currency(p_code TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
    SELECT COALESCE(private.wallet_display_currency(p_code), pg_catalog.upper(BTRIM(COALESCE(p_code, ''))));
$fn$;


CREATE OR REPLACE FUNCTION private.insert_zero_operational_account(
    p_account_type TEXT,
    p_storage_currency TEXT,
    p_legacy_manager_account_id UUID,
    p_legacy_cashier_id UUID,
    p_network_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_id UUID;
BEGIN
    IF p_account_type NOT IN ('company_treasury', 'manager', 'cashier') THEN
        RAISE EXCEPTION 'ACCOUNT_TYPE_INVALID';
    END IF;
    INSERT INTO private.operational_accounts (
        account_type,
        currency,
        legacy_manager_account_id,
        legacy_cashier_id,
        network_id,
        available_balance,
        status,
        migration_state
    )
    VALUES (
        p_account_type,
        p_storage_currency,
        p_legacy_manager_account_id,
        p_legacy_cashier_id,
        p_network_id,
        0,
        'active',
        'active'
    )
    RETURNING id INTO v_id;
    RETURN v_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'OPERATIONAL_CURRENCY_ACCOUNT_ALREADY_EXISTS';
END;
$fn$;


CREATE OR REPLACE FUNCTION private.resolve_company_treasury(
    p_storage_currency TEXT,
    p_require_active BOOLEAN
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_id UUID;
    v_status TEXT;
    v_migration TEXT;
BEGIN
    SELECT a.id, a.status, a.migration_state
    INTO v_id, v_status, v_migration
    FROM private.operational_accounts AS a
    WHERE a.account_type = 'company_treasury'
      AND a.currency = p_storage_currency
    ORDER BY a.created_at ASC
    LIMIT 1;
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'TREASURY_NOT_FOUND';
    END IF;
    IF p_require_active AND (v_status IS DISTINCT FROM 'active' OR v_migration IS DISTINCT FROM 'active') THEN
        RAISE EXCEPTION 'OPERATIONAL_ACCOUNT_NOT_ACTIVE';
    END IF;
    RETURN v_id;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.resolve_manager_currency_account(
    p_legacy_manager_id UUID,
    p_network_id UUID,
    p_storage_currency TEXT,
    p_require_active BOOLEAN
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_id UUID;
    v_status TEXT;
    v_migration TEXT;
BEGIN
    SELECT a.id, a.status, a.migration_state
    INTO v_id, v_status, v_migration
    FROM private.operational_accounts AS a
    WHERE a.account_type = 'manager'
      AND a.legacy_manager_account_id = p_legacy_manager_id
      AND a.network_id IS NOT DISTINCT FROM p_network_id
      AND a.currency = p_storage_currency
    LIMIT 1;
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'MANAGER_CURRENCY_ACCOUNT_REQUIRED';
    END IF;
    IF p_require_active AND (v_status IS DISTINCT FROM 'active' OR v_migration IS DISTINCT FROM 'active') THEN
        RAISE EXCEPTION 'OPERATIONAL_ACCOUNT_NOT_ACTIVE';
    END IF;
    RETURN v_id;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.resolve_cashier_currency_account(
    p_legacy_cashier_id UUID,
    p_network_id UUID,
    p_storage_currency TEXT,
    p_require_active BOOLEAN
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_id UUID;
    v_status TEXT;
    v_migration TEXT;
BEGIN
    SELECT a.id, a.status, a.migration_state
    INTO v_id, v_status, v_migration
    FROM private.operational_accounts AS a
    WHERE a.account_type = 'cashier'
      AND a.legacy_cashier_id = p_legacy_cashier_id
      AND a.network_id IS NOT DISTINCT FROM p_network_id
      AND a.currency = p_storage_currency
    LIMIT 1;
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'CASHIER_CURRENCY_ACCOUNT_REQUIRED';
    END IF;
    IF p_require_active AND (v_status IS DISTINCT FROM 'active' OR v_migration IS DISTINCT FROM 'active') THEN
        RAISE EXCEPTION 'OPERATIONAL_ACCOUNT_NOT_ACTIVE';
    END IF;
    RETURN v_id;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.manager_resolve_own_cashier_currency(
    p_cashier_id UUID,
    p_network_id UUID,
    p_display_currency TEXT,
    p_require_active BOOLEAN
)
RETURNS TABLE (
    cashier_id UUID,
    op_account_id UUID,
    currency TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_cashier RECORD;
    v_storage TEXT;
    v_op UUID;
BEGIN
    IF p_cashier_id IS NULL THEN
        RAISE EXCEPTION 'CASHIER_ID_REQUIRED';
    END IF;
    IF p_network_id IS NULL THEN
        RAISE EXCEPTION 'NETWORK_ID_REQUIRED';
    END IF;
    v_storage := private.require_operational_storage_currency(p_display_currency);

    SELECT c.id, c.is_active, c.network_id
    INTO v_cashier
    FROM public.cashiers AS c
    WHERE c.id = p_cashier_id
      AND c.network_id IS NOT DISTINCT FROM p_network_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CASHIER_NOT_FOUND';
    END IF;
    IF p_require_active AND v_cashier.is_active IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'CASHIER_NOT_ACTIVE';
    END IF;

    v_op := private.resolve_cashier_currency_account(
        v_cashier.id,
        v_cashier.network_id,
        v_storage,
        p_require_active
    );

    RETURN QUERY
    SELECT v_cashier.id, v_op, v_storage;
END;
$fn$;


-- Legacy TMT resolver: deterministic TMTM only, never another currency.
CREATE OR REPLACE FUNCTION private.manager_resolve_own_cashier(
    p_cashier_id UUID,
    p_network_id UUID,
    p_require_active BOOLEAN
)
RETURNS TABLE (
    cashier_id UUID,
    op_account_id UUID,
    currency TEXT
)
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
BEGIN
    RETURN QUERY
    SELECT r.cashier_id, r.op_account_id, r.currency
    FROM private.manager_resolve_own_cashier_currency(
        p_cashier_id,
        p_network_id,
        'TMT',
        p_require_active
    ) AS r;
EXCEPTION
    WHEN OTHERS THEN
        IF SQLERRM = 'CASHIER_CURRENCY_ACCOUNT_REQUIRED' THEN
            RAISE EXCEPTION 'CASHIER_NOT_FOUND';
        END IF;
        RAISE;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.cashier_resolve_own_operational_account(
    p_legacy_cashier_id UUID,
    p_network_id UUID
)
RETURNS TABLE (
    account_id UUID,
    currency TEXT
)
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_op RECORD;
BEGIN
    SELECT a.id, a.currency
    INTO v_op
    FROM private.operational_accounts AS a
    WHERE a.account_type = 'cashier'
      AND a.legacy_cashier_id = p_legacy_cashier_id
      AND a.network_id IS NOT DISTINCT FROM p_network_id
      AND a.currency = 'TMTM'
    ORDER BY a.created_at ASC
    LIMIT 1;

    IF v_op.id IS NULL THEN
        RAISE EXCEPTION 'CASHIER_OPERATIONAL_ACCOUNT_NOT_FOUND';
    END IF;

    RETURN QUERY
    SELECT v_op.id, v_op.currency;
END;
$fn$;


CREATE OR REPLACE FUNCTION private.cashiers_keep_tmt_float_mirror()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_tmt NUMERIC;
BEGIN
    SELECT a.available_balance
    INTO v_tmt
    FROM private.operational_accounts AS a
    WHERE a.account_type = 'cashier'
      AND a.legacy_cashier_id = NEW.id
      AND a.currency IN ('TMTM', 'TMT')
    ORDER BY CASE WHEN a.currency = 'TMTM' THEN 0 ELSE 1 END, a.created_at ASC
    LIMIT 1;

    IF v_tmt IS NOT NULL THEN
        NEW.float_balance := v_tmt;
    ELSIF NEW.float_balance IS DISTINCT FROM OLD.float_balance THEN
        NEW.float_balance := OLD.float_balance;
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS cashiers_keep_tmt_float_mirror ON public.cashiers;
CREATE TRIGGER cashiers_keep_tmt_float_mirror
BEFORE UPDATE OF float_balance ON public.cashiers
FOR EACH ROW
EXECUTE FUNCTION private.cashiers_keep_tmt_float_mirror();

COMMENT ON FUNCTION private.cashiers_keep_tmt_float_mirror() IS
'public.cashiers.float_balance is a TMT/TMTM diagnostic mirror only. Non-TMT operational balances must never be written here.';


CREATE OR REPLACE FUNCTION public.owner_treasury_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_owner UUID;
    v_treasury jsonb;
    v_accounts jsonb;
    v_by_currency jsonb;
    v_managers jsonb;
    v_cashiers jsonb;
    v_transfers jsonb;
BEGIN
    SELECT o.auth_user_id
    INTO v_owner
    FROM private.get_current_owner_context() AS o;

    SELECT jsonb_build_object(
        'currency', private.operational_display_currency(a.currency),
        'available_balance', a.available_balance,
        'status', a.status,
        'migration_state', a.migration_state,
        'version', a.version
    )
    INTO v_treasury
    FROM private.operational_accounts AS a
    WHERE a.account_type = 'company_treasury'
      AND a.currency = 'TMTM'
    ORDER BY a.created_at ASC
    LIMIT 1;

    SELECT COALESCE(jsonb_agg(row_json ORDER BY sort_order ASC, display_currency ASC), '[]'::jsonb)
    INTO v_accounts
    FROM (
        SELECT
            COALESCE(c.sort_order, 1000) AS sort_order,
            private.operational_display_currency(a.currency) AS display_currency,
            jsonb_build_object(
                'currency', private.operational_display_currency(a.currency),
                'storage_currency', a.currency,
                'available_balance', a.available_balance,
                'status', a.status,
                'migration_state', a.migration_state,
                'version', a.version
            ) AS row_json
        FROM private.operational_accounts AS a
        LEFT JOIN private.supported_currencies AS c
            ON c.wallet_currency_code = a.currency
        WHERE a.account_type = 'company_treasury'
    ) AS x;

    SELECT COALESCE(jsonb_agg(row_json ORDER BY sort_order ASC, display_currency ASC), '[]'::jsonb)
    INTO v_by_currency
    FROM (
        SELECT
            COALESCE(c.sort_order, 1000) AS sort_order,
            private.operational_display_currency(t.currency) AS display_currency,
            jsonb_build_object(
                'currency', private.operational_display_currency(t.currency),
                'treasury_balance', t.available_balance,
                'manager_count', (
                    SELECT COUNT(*)::INTEGER
                    FROM private.operational_accounts AS m
                    WHERE m.account_type = 'manager'
                      AND m.currency = t.currency
                ),
                'manager_total', (
                    SELECT COALESCE(SUM(m.available_balance), 0)
                    FROM private.operational_accounts AS m
                    WHERE m.account_type = 'manager'
                      AND m.currency = t.currency
                ),
                'cashier_count', (
                    SELECT COUNT(*)::INTEGER
                    FROM private.operational_accounts AS k
                    WHERE k.account_type = 'cashier'
                      AND k.currency = t.currency
                ),
                'cashier_total', (
                    SELECT COALESCE(SUM(k.available_balance), 0)
                    FROM private.operational_accounts AS k
                    WHERE k.account_type = 'cashier'
                      AND k.currency = t.currency
                )
            ) AS row_json
        FROM private.operational_accounts AS t
        LEFT JOIN private.supported_currencies AS c
            ON c.wallet_currency_code = t.currency
        WHERE t.account_type = 'company_treasury'
    ) AS x;

    SELECT jsonb_build_object(
        'count', COUNT(*)::INTEGER,
        'total_balance', COALESCE(SUM(a.available_balance), 0)
    )
    INTO v_managers
    FROM private.operational_accounts AS a
    WHERE a.account_type = 'manager'
      AND a.currency = 'TMTM';

    SELECT jsonb_build_object(
        'count', COUNT(*)::INTEGER,
        'total_balance', COALESCE(SUM(a.available_balance), 0)
    )
    INTO v_cashiers
    FROM private.operational_accounts AS a
    WHERE a.account_type = 'cashier'
      AND a.currency = 'TMTM';

    SELECT COALESCE(jsonb_agg(row_json ORDER BY created_at DESC, transfer_no DESC), '[]'::jsonb)
    INTO v_transfers
    FROM (
        SELECT
            x.created_at,
            x.transfer_no,
            jsonb_build_object(
                'id', x.id,
                'transfer_no', x.transfer_no,
                'transfer_type', x.transfer_type,
                'currency', private.operational_display_currency(x.currency),
                'amount', x.amount,
                'actor_role', x.actor_role,
                'created_at', x.created_at
            ) AS row_json
        FROM private.operational_transfers AS x
        WHERE x.transfer_type IN (
            'CAPITAL_IN',
            'TREASURY_TO_MANAGER',
            'TREASURY_TO_CASHIER',
            'TREASURY_TO_PLAYER',
            'PLAYER_TO_TREASURY'
        )
        ORDER BY x.created_at DESC, x.transfer_no DESC
        LIMIT 50
    ) AS t;

    RETURN jsonb_build_object(
        'treasury', COALESCE(v_treasury, '{}'::jsonb),
        'accounts', COALESCE(v_accounts, '[]'::jsonb),
        'by_currency', COALESCE(v_by_currency, '[]'::jsonb),
        'managers', COALESCE(v_managers, jsonb_build_object('count', 0, 'total_balance', 0)),
        'cashiers', COALESCE(v_cashiers, jsonb_build_object('count', 0, 'total_balance', 0)),
        'recent_transfers', COALESCE(v_transfers, '[]'::jsonb)
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_capital_in(
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
    v_owner UUID;
    v_key TEXT;
    v_note TEXT;
    v_treasury UUID;
    v_result RECORD;
BEGIN
    SELECT o.auth_user_id
    INTO v_owner
    FROM private.get_current_owner_context() AS o;

    v_key := private.owner_require_idempotency_key(p_idempotency_key);
    v_note := private.owner_trim_reason(p_note);
    v_treasury := private.resolve_company_treasury('TMTM', TRUE);

    SELECT e.transfer_id, e.is_duplicate, e.from_balance_after, e.to_balance_after, e.player_balance_after
    INTO v_result
    FROM private.apply_operational_transfer(
        'CAPITAL_IN',
        p_amount,
        'TMTM',
        v_key,
        NULL,
        v_treasury,
        NULL,
        v_owner,
        'owner',
        jsonb_build_object('note', v_note, 'display_currency', 'TMT')
    ) AS e;

    IF v_result.is_duplicate IS NOT TRUE THEN
        PERFORM private.append_staff_audit(
            'OWNER_CAPITAL_IN',
            'treasury',
            v_treasury::TEXT,
            'owner_only',
            jsonb_build_object(
                'transfer_id', v_result.transfer_id,
                'amount', p_amount,
                'currency', 'TMT',
                'note', v_note
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'transfer_id', v_result.transfer_id,
        'is_duplicate', v_result.is_duplicate,
        'amount', p_amount,
        'currency', 'TMT',
        'treasury_balance_after', v_result.to_balance_after
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_capital_in_currency(
    p_currency TEXT,
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
    v_owner UUID;
    v_key TEXT;
    v_note TEXT;
    v_storage TEXT;
    v_display TEXT;
    v_engine_key TEXT;
    v_treasury UUID;
    v_result RECORD;
BEGIN
    SELECT o.auth_user_id
    INTO v_owner
    FROM private.get_current_owner_context() AS o;

    v_storage := private.require_operational_storage_currency(p_currency);
    v_display := private.operational_display_currency(v_storage);
    IF v_storage = 'TMTM' THEN
        RETURN public.owner_capital_in(p_amount, p_idempotency_key, p_note);
    END IF;

    v_key := private.owner_require_idempotency_key(p_idempotency_key);
    v_note := private.owner_trim_reason(p_note);
    v_engine_key := 'owner-capital-in:' || v_owner::TEXT || ':' || v_storage || ':' || v_key;
    v_treasury := private.resolve_company_treasury(v_storage, TRUE);

    SELECT e.transfer_id, e.is_duplicate, e.from_balance_after, e.to_balance_after, e.player_balance_after
    INTO v_result
    FROM private.apply_operational_transfer(
        'CAPITAL_IN',
        p_amount,
        v_storage,
        v_engine_key,
        NULL,
        v_treasury,
        NULL,
        v_owner,
        'owner',
        jsonb_build_object('note', v_note, 'display_currency', v_display)
    ) AS e;

    IF v_result.is_duplicate IS NOT TRUE THEN
        PERFORM private.append_staff_audit(
            'OWNER_CAPITAL_IN',
            'treasury',
            v_treasury::TEXT,
            'owner_only',
            jsonb_build_object(
                'transfer_id', v_result.transfer_id,
                'amount', p_amount,
                'currency', v_display,
                'note', v_note
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'transfer_id', v_result.transfer_id,
        'is_duplicate', v_result.is_duplicate,
        'amount', p_amount,
        'currency', v_display,
        'treasury_balance_after', v_result.to_balance_after
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_fund_manager(
    p_manager_id UUID,
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
    v_owner UUID;
    v_key TEXT;
    v_note TEXT;
    v_manager RECORD;
    v_treasury UUID;
    v_target UUID;
    v_result RECORD;
BEGIN
    SELECT o.auth_user_id
    INTO v_owner
    FROM private.get_current_owner_context() AS o;

    IF p_manager_id IS NULL THEN
        RAISE EXCEPTION 'MANAGER_ID_REQUIRED';
    END IF;

    SELECT m.id, m.network_id, m.is_active
    INTO v_manager
    FROM public.manager_accounts AS m
    WHERE m.id = p_manager_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MANAGER_NOT_FOUND';
    END IF;
    IF v_manager.is_active IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'MANAGER_NOT_ACTIVE';
    END IF;

    v_key := private.owner_require_idempotency_key(p_idempotency_key);
    v_note := private.owner_trim_reason(p_note);
    v_treasury := private.resolve_company_treasury('TMTM', TRUE);
    v_target := private.resolve_manager_currency_account(
        v_manager.id,
        v_manager.network_id,
        'TMTM',
        TRUE
    );

    SELECT e.transfer_id, e.is_duplicate, e.from_balance_after, e.to_balance_after, e.player_balance_after
    INTO v_result
    FROM private.apply_operational_transfer(
        'TREASURY_TO_MANAGER',
        p_amount,
        'TMTM',
        v_key,
        v_treasury,
        v_target,
        NULL,
        v_owner,
        'owner',
        jsonb_build_object('manager_id', v_manager.id, 'note', v_note, 'display_currency', 'TMT')
    ) AS e;

    IF v_result.is_duplicate IS NOT TRUE THEN
        PERFORM private.append_staff_audit(
            'OWNER_FUNDED_MANAGER',
            'manager',
            v_manager.id::TEXT,
            'owner_only',
            jsonb_build_object(
                'transfer_id', v_result.transfer_id,
                'amount', p_amount,
                'currency', 'TMT',
                'manager_id', v_manager.id
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'transfer_id', v_result.transfer_id,
        'is_duplicate', v_result.is_duplicate,
        'amount', p_amount,
        'currency', 'TMT',
        'from_balance_after', v_result.from_balance_after,
        'to_balance_after', v_result.to_balance_after,
        'treasury_balance_after', v_result.from_balance_after,
        'manager_id', v_manager.id
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_fund_manager_currency(
    p_manager_id UUID,
    p_currency TEXT,
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
    v_owner UUID;
    v_key TEXT;
    v_note TEXT;
    v_storage TEXT;
    v_display TEXT;
    v_engine_key TEXT;
    v_manager RECORD;
    v_treasury UUID;
    v_target UUID;
    v_result RECORD;
BEGIN
    SELECT o.auth_user_id
    INTO v_owner
    FROM private.get_current_owner_context() AS o;

    IF p_manager_id IS NULL THEN
        RAISE EXCEPTION 'MANAGER_ID_REQUIRED';
    END IF;
    v_storage := private.require_operational_storage_currency(p_currency);
    v_display := private.operational_display_currency(v_storage);
    IF v_storage = 'TMTM' THEN
        RETURN public.owner_fund_manager(p_manager_id, p_amount, p_idempotency_key, p_note);
    END IF;

    SELECT m.id, m.network_id, m.is_active
    INTO v_manager
    FROM public.manager_accounts AS m
    WHERE m.id = p_manager_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MANAGER_NOT_FOUND';
    END IF;
    IF v_manager.is_active IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'MANAGER_NOT_ACTIVE';
    END IF;

    v_key := private.owner_require_idempotency_key(p_idempotency_key);
    v_note := private.owner_trim_reason(p_note);
    v_engine_key := 'owner-fund-manager:' || v_owner::TEXT || ':' || v_storage || ':' || v_key;
    v_treasury := private.resolve_company_treasury(v_storage, TRUE);
    v_target := private.resolve_manager_currency_account(
        v_manager.id,
        v_manager.network_id,
        v_storage,
        TRUE
    );

    SELECT e.transfer_id, e.is_duplicate, e.from_balance_after, e.to_balance_after, e.player_balance_after
    INTO v_result
    FROM private.apply_operational_transfer(
        'TREASURY_TO_MANAGER',
        p_amount,
        v_storage,
        v_engine_key,
        v_treasury,
        v_target,
        NULL,
        v_owner,
        'owner',
        jsonb_build_object('manager_id', v_manager.id, 'note', v_note, 'display_currency', v_display)
    ) AS e;

    IF v_result.is_duplicate IS NOT TRUE THEN
        PERFORM private.append_staff_audit(
            'OWNER_FUNDED_MANAGER',
            'manager',
            v_manager.id::TEXT,
            'owner_only',
            jsonb_build_object(
                'transfer_id', v_result.transfer_id,
                'amount', p_amount,
                'currency', v_display,
                'manager_id', v_manager.id
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'transfer_id', v_result.transfer_id,
        'is_duplicate', v_result.is_duplicate,
        'amount', p_amount,
        'currency', v_display,
        'from_balance_after', v_result.from_balance_after,
        'to_balance_after', v_result.to_balance_after,
        'treasury_balance_after', v_result.from_balance_after,
        'manager_id', v_manager.id
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_fund_cashier(
    p_cashier_id UUID,
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
    v_owner UUID;
    v_key TEXT;
    v_note TEXT;
    v_cashier RECORD;
    v_treasury UUID;
    v_target UUID;
    v_result RECORD;
BEGIN
    SELECT o.auth_user_id
    INTO v_owner
    FROM private.get_current_owner_context() AS o;

    IF p_cashier_id IS NULL THEN
        RAISE EXCEPTION 'CASHIER_ID_REQUIRED';
    END IF;

    SELECT c.id, c.network_id, c.is_active
    INTO v_cashier
    FROM public.cashiers AS c
    WHERE c.id = p_cashier_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CASHIER_NOT_FOUND';
    END IF;
    IF v_cashier.is_active IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'CASHIER_NOT_ACTIVE';
    END IF;

    v_key := private.owner_require_idempotency_key(p_idempotency_key);
    v_note := private.owner_trim_reason(p_note);
    v_treasury := private.resolve_company_treasury('TMTM', TRUE);
    v_target := private.resolve_cashier_currency_account(
        v_cashier.id,
        v_cashier.network_id,
        'TMTM',
        TRUE
    );

    SELECT e.transfer_id, e.is_duplicate, e.from_balance_after, e.to_balance_after, e.player_balance_after
    INTO v_result
    FROM private.apply_operational_transfer(
        'TREASURY_TO_CASHIER',
        p_amount,
        'TMTM',
        v_key,
        v_treasury,
        v_target,
        NULL,
        v_owner,
        'owner',
        jsonb_build_object('cashier_id', v_cashier.id, 'note', v_note, 'display_currency', 'TMT')
    ) AS e;

    PERFORM private.cashier_revalidate_legacy_cashier(v_cashier.id, v_cashier.network_id);

    IF v_result.is_duplicate IS NOT TRUE THEN
        PERFORM private.append_staff_audit(
            'OWNER_FUNDED_CASHIER',
            'cashier',
            v_cashier.id::TEXT,
            'owner_only',
            jsonb_build_object(
                'transfer_id', v_result.transfer_id,
                'amount', p_amount,
                'currency', 'TMT',
                'cashier_id', v_cashier.id
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'transfer_id', v_result.transfer_id,
        'is_duplicate', v_result.is_duplicate,
        'amount', p_amount,
        'currency', 'TMT',
        'from_balance_after', v_result.from_balance_after,
        'to_balance_after', v_result.to_balance_after,
        'treasury_balance_after', v_result.from_balance_after,
        'cashier_id', v_cashier.id
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_fund_cashier_currency(
    p_cashier_id UUID,
    p_currency TEXT,
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
    v_owner UUID;
    v_key TEXT;
    v_note TEXT;
    v_storage TEXT;
    v_display TEXT;
    v_engine_key TEXT;
    v_cashier RECORD;
    v_treasury UUID;
    v_target UUID;
    v_result RECORD;
BEGIN
    SELECT o.auth_user_id
    INTO v_owner
    FROM private.get_current_owner_context() AS o;

    IF p_cashier_id IS NULL THEN
        RAISE EXCEPTION 'CASHIER_ID_REQUIRED';
    END IF;
    v_storage := private.require_operational_storage_currency(p_currency);
    v_display := private.operational_display_currency(v_storage);
    IF v_storage = 'TMTM' THEN
        RETURN public.owner_fund_cashier(p_cashier_id, p_amount, p_idempotency_key, p_note);
    END IF;

    SELECT c.id, c.network_id, c.is_active
    INTO v_cashier
    FROM public.cashiers AS c
    WHERE c.id = p_cashier_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CASHIER_NOT_FOUND';
    END IF;
    IF v_cashier.is_active IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'CASHIER_NOT_ACTIVE';
    END IF;

    v_key := private.owner_require_idempotency_key(p_idempotency_key);
    v_note := private.owner_trim_reason(p_note);
    v_engine_key := 'owner-fund-cashier:' || v_owner::TEXT || ':' || v_storage || ':' || v_key;
    v_treasury := private.resolve_company_treasury(v_storage, TRUE);
    v_target := private.resolve_cashier_currency_account(
        v_cashier.id,
        v_cashier.network_id,
        v_storage,
        TRUE
    );

    SELECT e.transfer_id, e.is_duplicate, e.from_balance_after, e.to_balance_after, e.player_balance_after
    INTO v_result
    FROM private.apply_operational_transfer(
        'TREASURY_TO_CASHIER',
        p_amount,
        v_storage,
        v_engine_key,
        v_treasury,
        v_target,
        NULL,
        v_owner,
        'owner',
        jsonb_build_object('cashier_id', v_cashier.id, 'note', v_note, 'display_currency', v_display)
    ) AS e;

    PERFORM private.cashier_revalidate_legacy_cashier(v_cashier.id, v_cashier.network_id);

    IF v_result.is_duplicate IS NOT TRUE THEN
        PERFORM private.append_staff_audit(
            'OWNER_FUNDED_CASHIER',
            'cashier',
            v_cashier.id::TEXT,
            'owner_only',
            jsonb_build_object(
                'transfer_id', v_result.transfer_id,
                'amount', p_amount,
                'currency', v_display,
                'cashier_id', v_cashier.id
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'transfer_id', v_result.transfer_id,
        'is_duplicate', v_result.is_duplicate,
        'amount', p_amount,
        'currency', v_display,
        'from_balance_after', v_result.from_balance_after,
        'to_balance_after', v_result.to_balance_after,
        'treasury_balance_after', v_result.from_balance_after,
        'cashier_id', v_cashier.id
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_add_manager_currency(
    p_manager_id UUID,
    p_currency TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_owner UUID;
    v_storage TEXT;
    v_display TEXT;
    v_manager RECORD;
    v_id UUID;
BEGIN
    SELECT o.auth_user_id
    INTO v_owner
    FROM private.get_current_owner_context() AS o;

    IF p_manager_id IS NULL THEN
        RAISE EXCEPTION 'MANAGER_ID_REQUIRED';
    END IF;
    v_storage := private.require_operational_storage_currency(p_currency);
    v_display := private.operational_display_currency(v_storage);

    SELECT m.id, m.network_id, m.is_active
    INTO v_manager
    FROM public.manager_accounts AS m
    WHERE m.id = p_manager_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MANAGER_NOT_FOUND';
    END IF;

    v_id := private.insert_zero_operational_account(
        'manager',
        v_storage,
        v_manager.id,
        NULL,
        v_manager.network_id
    );

    PERFORM private.append_staff_audit(
        'OWNER_ADDED_MANAGER_CURRENCY',
        'manager',
        v_manager.id::TEXT,
        'owner_only',
        jsonb_build_object(
            'manager_id', v_manager.id,
            'currency', v_display,
            'account_id', v_id
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'account_id', v_id,
        'manager_id', v_manager.id,
        'currency', v_display,
        'available_balance', 0
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.owner_add_cashier_currency(
    p_cashier_id UUID,
    p_currency TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_owner UUID;
    v_storage TEXT;
    v_display TEXT;
    v_cashier RECORD;
    v_id UUID;
BEGIN
    SELECT o.auth_user_id
    INTO v_owner
    FROM private.get_current_owner_context() AS o;

    IF p_cashier_id IS NULL THEN
        RAISE EXCEPTION 'CASHIER_ID_REQUIRED';
    END IF;
    v_storage := private.require_operational_storage_currency(p_currency);
    v_display := private.operational_display_currency(v_storage);

    SELECT c.id, c.network_id, c.is_active
    INTO v_cashier
    FROM public.cashiers AS c
    WHERE c.id = p_cashier_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CASHIER_NOT_FOUND';
    END IF;
    IF v_cashier.is_active IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'CASHIER_NOT_ACTIVE';
    END IF;

    v_id := private.insert_zero_operational_account(
        'cashier',
        v_storage,
        NULL,
        v_cashier.id,
        v_cashier.network_id
    );

    PERFORM private.append_staff_audit(
        'OWNER_ADDED_CASHIER_CURRENCY',
        'cashier',
        v_cashier.id::TEXT,
        'owner_only',
        jsonb_build_object(
            'cashier_id', v_cashier.id,
            'currency', v_display,
            'account_id', v_id
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'account_id', v_id,
        'cashier_id', v_cashier.id,
        'currency', v_display,
        'available_balance', 0
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.manager_add_cashier_currency(
    p_cashier_id UUID,
    p_currency TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_storage TEXT;
    v_display TEXT;
    v_cashier RECORD;
    v_id UUID;
BEGIN
    SELECT
        m.auth_user_id,
        m.network_id,
        m.legacy_manager_account_id
    INTO v_ctx
    FROM private.get_current_manager_context() AS m;

    IF p_cashier_id IS NULL THEN
        RAISE EXCEPTION 'CASHIER_ID_REQUIRED';
    END IF;
    v_storage := private.require_operational_storage_currency(p_currency);
    v_display := private.operational_display_currency(v_storage);

    PERFORM private.resolve_manager_currency_account(
        v_ctx.legacy_manager_account_id,
        v_ctx.network_id,
        v_storage,
        TRUE
    );

    SELECT c.id, c.network_id, c.is_active
    INTO v_cashier
    FROM public.cashiers AS c
    WHERE c.id = p_cashier_id
      AND c.network_id IS NOT DISTINCT FROM v_ctx.network_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CASHIER_NOT_FOUND';
    END IF;
    IF v_cashier.is_active IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'CASHIER_NOT_ACTIVE';
    END IF;

    v_id := private.insert_zero_operational_account(
        'cashier',
        v_storage,
        NULL,
        v_cashier.id,
        v_cashier.network_id
    );

    PERFORM private.append_staff_audit(
        'MANAGER_ADDED_CASHIER_CURRENCY',
        'cashier',
        v_cashier.id::TEXT,
        'manager_scope',
        jsonb_build_object(
            'cashier_id', v_cashier.id,
            'currency', v_display,
            'account_id', v_id,
            'network_id', v_ctx.network_id
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'account_id', v_id,
        'cashier_id', v_cashier.id,
        'currency', v_display,
        'available_balance', 0
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.manager_fund_cashier_currency(
    p_cashier_id UUID,
    p_currency TEXT,
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
    v_storage TEXT;
    v_display TEXT;
    v_engine_key TEXT;
    v_cashier RECORD;
    v_manager_account UUID;
    v_result RECORD;
BEGIN
    IF p_cashier_id IS NULL THEN
        RAISE EXCEPTION 'CASHIER_ID_REQUIRED';
    END IF;
    IF p_amount IS NULL THEN
        RAISE EXCEPTION 'AMOUNT_REQUIRED';
    END IF;

    SELECT
        m.auth_user_id,
        m.network_id,
        m.legacy_manager_account_id
    INTO v_ctx
    FROM private.get_current_manager_context() AS m;

    v_storage := private.require_operational_storage_currency(p_currency);
    v_display := private.operational_display_currency(v_storage);
    IF v_storage = 'TMTM' THEN
        RETURN public.manager_fund_cashier(p_cashier_id, p_amount, p_idempotency_key, p_note);
    END IF;

    v_key := private.manager_require_idempotency_key(p_idempotency_key);
    v_note := private.owner_trim_reason(p_note);
    v_engine_key := 'manager-fund-cashier:' || v_ctx.auth_user_id::TEXT || ':' || v_storage || ':' || v_key;

    SELECT r.cashier_id, r.op_account_id, r.currency
    INTO v_cashier
    FROM private.manager_resolve_own_cashier_currency(p_cashier_id, v_ctx.network_id, v_display, TRUE) AS r;

    v_manager_account := private.resolve_manager_currency_account(
        v_ctx.legacy_manager_account_id,
        v_ctx.network_id,
        v_storage,
        TRUE
    );

    SELECT e.transfer_id, e.is_duplicate, e.from_balance_after, e.to_balance_after, e.player_balance_after
    INTO v_result
    FROM private.apply_operational_transfer(
        'MANAGER_TO_CASHIER',
        p_amount,
        v_storage,
        v_engine_key,
        v_manager_account,
        v_cashier.op_account_id,
        NULL,
        v_ctx.auth_user_id,
        'manager',
        jsonb_build_object('cashier_id', v_cashier.cashier_id, 'note', v_note, 'display_currency', v_display)
    ) AS e;

    PERFORM private.manager_revalidate_own_cashier(v_cashier.cashier_id, v_ctx.network_id, TRUE);

    IF v_result.is_duplicate IS NOT TRUE THEN
        PERFORM private.append_staff_audit(
            'MANAGER_FUNDED_CASHIER',
            'cashier',
            v_cashier.cashier_id::TEXT,
            'manager_scope',
            jsonb_build_object(
                'transfer_id', v_result.transfer_id,
                'amount', p_amount,
                'currency', v_display,
                'cashier_id', v_cashier.cashier_id,
                'network_id', v_ctx.network_id
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'transfer_id', v_result.transfer_id,
        'is_duplicate', v_result.is_duplicate,
        'amount', p_amount,
        'currency', v_display,
        'from_balance_after', v_result.from_balance_after,
        'to_balance_after', v_result.to_balance_after,
        'cashier_id', v_cashier.cashier_id
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.manager_collect_cashier_currency(
    p_cashier_id UUID,
    p_currency TEXT,
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
    v_storage TEXT;
    v_display TEXT;
    v_engine_key TEXT;
    v_cashier RECORD;
    v_manager_account UUID;
    v_result RECORD;
BEGIN
    IF p_cashier_id IS NULL THEN
        RAISE EXCEPTION 'CASHIER_ID_REQUIRED';
    END IF;
    IF p_amount IS NULL THEN
        RAISE EXCEPTION 'AMOUNT_REQUIRED';
    END IF;

    SELECT
        m.auth_user_id,
        m.network_id,
        m.legacy_manager_account_id
    INTO v_ctx
    FROM private.get_current_manager_context() AS m;

    v_storage := private.require_operational_storage_currency(p_currency);
    v_display := private.operational_display_currency(v_storage);
    IF v_storage = 'TMTM' THEN
        RETURN public.manager_collect_cashier(p_cashier_id, p_amount, p_idempotency_key, p_note);
    END IF;

    v_key := private.manager_require_idempotency_key(p_idempotency_key);
    v_note := private.owner_trim_reason(p_note);
    v_engine_key := 'manager-collect-cashier:' || v_ctx.auth_user_id::TEXT || ':' || v_storage || ':' || v_key;

    SELECT r.cashier_id, r.op_account_id, r.currency
    INTO v_cashier
    FROM private.manager_resolve_own_cashier_currency(p_cashier_id, v_ctx.network_id, v_display, TRUE) AS r;

    v_manager_account := private.resolve_manager_currency_account(
        v_ctx.legacy_manager_account_id,
        v_ctx.network_id,
        v_storage,
        TRUE
    );

    SELECT e.transfer_id, e.is_duplicate, e.from_balance_after, e.to_balance_after, e.player_balance_after
    INTO v_result
    FROM private.apply_operational_transfer(
        'CASHIER_TO_MANAGER',
        p_amount,
        v_storage,
        v_engine_key,
        v_cashier.op_account_id,
        v_manager_account,
        NULL,
        v_ctx.auth_user_id,
        'manager',
        jsonb_build_object('cashier_id', v_cashier.cashier_id, 'note', v_note, 'display_currency', v_display)
    ) AS e;

    PERFORM private.manager_revalidate_own_cashier(v_cashier.cashier_id, v_ctx.network_id, TRUE);

    IF v_result.is_duplicate IS NOT TRUE THEN
        PERFORM private.append_staff_audit(
            'MANAGER_COLLECTED_CASHIER',
            'cashier',
            v_cashier.cashier_id::TEXT,
            'manager_scope',
            jsonb_build_object(
                'transfer_id', v_result.transfer_id,
                'amount', p_amount,
                'currency', v_display,
                'cashier_id', v_cashier.cashier_id,
                'network_id', v_ctx.network_id
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'transfer_id', v_result.transfer_id,
        'is_duplicate', v_result.is_duplicate,
        'amount', p_amount,
        'currency', v_display,
        'from_balance_after', v_result.from_balance_after,
        'to_balance_after', v_result.to_balance_after,
        'cashier_id', v_cashier.cashier_id
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.manager_operational_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_manager jsonb;
    v_accounts jsonb;
    v_cashiers jsonb;
    v_cashiers_by_currency jsonb;
BEGIN
    SELECT
        m.auth_user_id,
        m.network_id,
        m.legacy_manager_account_id
    INTO v_ctx
    FROM private.get_current_manager_context() AS m;

    SELECT jsonb_build_object(
        'id', a.id,
        'currency', private.operational_display_currency(a.currency),
        'available_balance', a.available_balance,
        'status', a.status,
        'migration_state', a.migration_state,
        'version', a.version
    )
    INTO v_manager
    FROM private.operational_accounts AS a
    WHERE a.account_type = 'manager'
      AND a.legacy_manager_account_id = v_ctx.legacy_manager_account_id
      AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
      AND a.currency = 'TMTM'
    ORDER BY a.created_at ASC
    LIMIT 1;

    IF v_manager IS NULL THEN
        SELECT jsonb_build_object(
            'id', a.id,
            'currency', private.operational_display_currency(a.currency),
            'available_balance', a.available_balance,
            'status', a.status,
            'migration_state', a.migration_state,
            'version', a.version
        )
        INTO v_manager
        FROM private.operational_accounts AS a
        WHERE a.account_type = 'manager'
          AND a.legacy_manager_account_id = v_ctx.legacy_manager_account_id
          AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
        ORDER BY a.created_at ASC
        LIMIT 1;
    END IF;

    IF v_manager IS NULL THEN
        RAISE EXCEPTION 'MANAGER_OPERATIONAL_ACCOUNT_NOT_FOUND';
    END IF;

    SELECT COALESCE(jsonb_agg(row_json ORDER BY sort_order ASC, display_currency ASC), '[]'::jsonb)
    INTO v_accounts
    FROM (
        SELECT
            COALESCE(c.sort_order, 1000) AS sort_order,
            private.operational_display_currency(a.currency) AS display_currency,
            jsonb_build_object(
                'id', a.id,
                'currency', private.operational_display_currency(a.currency),
                'available_balance', a.available_balance,
                'status', a.status,
                'migration_state', a.migration_state,
                'version', a.version
            ) AS row_json
        FROM private.operational_accounts AS a
        LEFT JOIN private.supported_currencies AS c
            ON c.wallet_currency_code = a.currency
        WHERE a.account_type = 'manager'
          AND a.legacy_manager_account_id = v_ctx.legacy_manager_account_id
          AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
    ) AS x;

    SELECT COALESCE(jsonb_agg(row_json ORDER BY login ASC, cashier_id ASC), '[]'::jsonb)
    INTO v_cashiers
    FROM (
        SELECT
            c.login,
            c.id AS cashier_id,
            jsonb_build_object(
                'cashier_id', c.id,
                'login', c.login,
                'full_name', c.full_name,
                'currency', 'TMT',
                'available_balance', a.available_balance,
                'status', a.status,
                'migration_state', a.migration_state,
                'legacy_float_balance', ROUND(COALESCE(c.float_balance, 0), 2)
            ) AS row_json
        FROM public.cashiers AS c
        INNER JOIN private.operational_accounts AS a
            ON a.account_type = 'cashier'
           AND a.legacy_cashier_id = c.id
           AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
           AND a.currency = 'TMTM'
        WHERE c.network_id IS NOT DISTINCT FROM v_ctx.network_id
    ) AS x;

    SELECT COALESCE(jsonb_agg(row_json ORDER BY sort_order ASC, display_currency ASC, login ASC), '[]'::jsonb)
    INTO v_cashiers_by_currency
    FROM (
        SELECT
            COALESCE(sc.sort_order, 1000) AS sort_order,
            private.operational_display_currency(a.currency) AS display_currency,
            c.login,
            jsonb_build_object(
                'cashier_id', c.id,
                'login', c.login,
                'full_name', c.full_name,
                'currency', private.operational_display_currency(a.currency),
                'available_balance', a.available_balance,
                'status', a.status,
                'migration_state', a.migration_state
            ) AS row_json
        FROM public.cashiers AS c
        INNER JOIN private.operational_accounts AS a
            ON a.account_type = 'cashier'
           AND a.legacy_cashier_id = c.id
           AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
        LEFT JOIN private.supported_currencies AS sc
            ON sc.wallet_currency_code = a.currency
        WHERE c.network_id IS NOT DISTINCT FROM v_ctx.network_id
    ) AS x;

    RETURN jsonb_build_object(
        'manager', v_manager,
        'manager_accounts', COALESCE(v_accounts, '[]'::jsonb),
        'cashiers', COALESCE(v_cashiers, '[]'::jsonb),
        'cashiers_by_currency', COALESCE(v_cashiers_by_currency, '[]'::jsonb),
        'activation_pending', (v_manager ->> 'migration_state') IS DISTINCT FROM 'active'
    );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.cashier_operational_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_ctx RECORD;
    v_cashier RECORD;
    v_op RECORD;
    v_accounts jsonb;
    v_any_active BOOLEAN;
BEGIN
    SELECT
        c.auth_user_id,
        c.network_id,
        c.legacy_cashier_id,
        c.display_name
    INTO v_ctx
    FROM private.get_current_cashier_context() AS c;

    SELECT
        x.id,
        x.login,
        x.full_name,
        x.point_name,
        x.city,
        x.network_id,
        x.is_active,
        ROUND(COALESCE(x.float_balance, 0), 2) AS legacy_float
    INTO v_cashier
    FROM public.cashiers AS x
    WHERE x.id = v_ctx.legacy_cashier_id
      AND x.network_id IS NOT DISTINCT FROM v_ctx.network_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CASHIER_NOT_FOUND';
    END IF;

    SELECT
        a.id,
        a.currency,
        a.available_balance,
        a.status,
        a.migration_state,
        a.version
    INTO v_op
    FROM private.operational_accounts AS a
    WHERE a.account_type = 'cashier'
      AND a.legacy_cashier_id = v_ctx.legacy_cashier_id
      AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
      AND a.currency = 'TMTM'
    ORDER BY a.created_at ASC
    LIMIT 1;

    IF v_op.id IS NULL THEN
        SELECT
            a.id,
            a.currency,
            a.available_balance,
            a.status,
            a.migration_state,
            a.version
        INTO v_op
        FROM private.operational_accounts AS a
        WHERE a.account_type = 'cashier'
          AND a.legacy_cashier_id = v_ctx.legacy_cashier_id
          AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
        ORDER BY a.created_at ASC
        LIMIT 1;
    END IF;

    IF v_op.id IS NULL THEN
        RAISE EXCEPTION 'CASHIER_OPERATIONAL_ACCOUNT_NOT_FOUND';
    END IF;

    SELECT COALESCE(jsonb_agg(row_json ORDER BY sort_order ASC, display_currency ASC), '[]'::jsonb)
    INTO v_accounts
    FROM (
        SELECT
            COALESCE(c.sort_order, 1000) AS sort_order,
            private.operational_display_currency(a.currency) AS display_currency,
            jsonb_build_object(
                'account_id', a.id,
                'currency', private.operational_display_currency(a.currency),
                'available_balance', a.available_balance,
                'status', a.status,
                'migration_state', a.migration_state,
                'version', a.version
            ) AS row_json
        FROM private.operational_accounts AS a
        LEFT JOIN private.supported_currencies AS c
            ON c.wallet_currency_code = a.currency
        WHERE a.account_type = 'cashier'
          AND a.legacy_cashier_id = v_ctx.legacy_cashier_id
          AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
    ) AS x;

    SELECT EXISTS (
        SELECT 1
        FROM private.operational_accounts AS a
        WHERE a.account_type = 'cashier'
          AND a.legacy_cashier_id = v_ctx.legacy_cashier_id
          AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
          AND a.status = 'active'
          AND a.migration_state = 'active'
    )
    INTO v_any_active;

    RETURN jsonb_build_object(
        'cashier', jsonb_build_object(
            'cashier_id', v_cashier.id,
            'login', v_cashier.login,
            'full_name', v_cashier.full_name,
            'point_name', v_cashier.point_name,
            'city', v_cashier.city,
            'network_id', v_cashier.network_id,
            'is_active', v_cashier.is_active
        ),
        'operational', jsonb_build_object(
            'account_id', v_op.id,
            'currency', private.operational_display_currency(v_op.currency),
            'available_balance', v_op.available_balance,
            'status', v_op.status,
            'migration_state', v_op.migration_state,
            'version', v_op.version,
            'legacy_float_diagnostic', v_cashier.legacy_float
        ),
        'accounts', COALESCE(v_accounts, '[]'::jsonb),
        'activation_pending', v_any_active IS DISTINCT FROM TRUE
    );
END;
$fn$;


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
    v_total INTEGER;
    v_rows jsonb;
BEGIN
    SELECT
        c.network_id,
        c.legacy_cashier_id
    INTO v_ctx
    FROM private.get_current_cashier_context() AS c;

    v_limit := private.owner_require_limit(p_limit, 100);
    v_offset := private.owner_require_offset(p_offset);

    SELECT COUNT(*)::INTEGER
    INTO v_total
    FROM private.operational_transfers AS t
    WHERE t.from_account_id IN (
            SELECT a.id
            FROM private.operational_accounts AS a
            WHERE a.account_type = 'cashier'
              AND a.legacy_cashier_id = v_ctx.legacy_cashier_id
              AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
        )
       OR t.to_account_id IN (
            SELECT a.id
            FROM private.operational_accounts AS a
            WHERE a.account_type = 'cashier'
              AND a.legacy_cashier_id = v_ctx.legacy_cashier_id
              AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
        );

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', t.id,
            'transfer_no', t.transfer_no,
            'transfer_type', t.transfer_type,
            'currency', private.operational_display_currency(t.currency),
            'amount', t.amount,
            'from_account_id', t.from_account_id,
            'to_account_id', t.to_account_id,
            'actor_role', t.actor_role,
            'created_at', t.created_at
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
            x.created_at
        FROM private.operational_transfers AS x
        WHERE x.from_account_id IN (
                SELECT a.id
                FROM private.operational_accounts AS a
                WHERE a.account_type = 'cashier'
                  AND a.legacy_cashier_id = v_ctx.legacy_cashier_id
                  AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
            )
           OR x.to_account_id IN (
                SELECT a.id
                FROM private.operational_accounts AS a
                WHERE a.account_type = 'cashier'
                  AND a.legacy_cashier_id = v_ctx.legacy_cashier_id
                  AND a.network_id IS NOT DISTINCT FROM v_ctx.network_id
            )
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


CREATE OR REPLACE FUNCTION public.cashier_deposit_player_currency(
    p_player_public_id TEXT,
    p_currency TEXT,
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
    v_storage TEXT;
    v_display TEXT;
    v_player RECORD;
    v_op UUID;
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

    v_storage := private.require_operational_storage_currency(p_currency);
    v_display := private.operational_display_currency(v_storage);
    IF v_storage = 'TMTM' THEN
        RETURN public.cashier_deposit_player(p_player_public_id, p_amount, p_idempotency_key, p_note);
    END IF;

    v_op := private.resolve_cashier_currency_account(
        v_ctx.legacy_cashier_id,
        v_ctx.network_id,
        v_storage,
        TRUE
    );
    PERFORM private.cashier_require_own_ops_active(v_op);
    PERFORM private.cashier_revalidate_legacy_cashier(
        v_ctx.legacy_cashier_id,
        v_ctx.network_id
    );

    v_key := private.owner_require_idempotency_key(p_idempotency_key);
    v_note := private.owner_trim_reason(p_note);
    v_engine_key := 'cashier-deposit:' || v_ctx.auth_user_id::TEXT || ':' || v_storage || ':' || v_key;

    SELECT r.player_user_id, r.wallet_id, r.public_id, r.currency
    INTO v_player
    FROM private.cashier_resolve_player_wallet_for_ops_currency(p_player_public_id, v_storage) AS r;

    IF NOT private.wallet_currencies_match(v_player.currency, v_storage) THEN
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
        v_storage,
        v_engine_key,
        v_op,
        NULL,
        v_player.wallet_id,
        v_ctx.auth_user_id,
        'cashier',
        jsonb_build_object(
            'player_public_id', v_player.public_id,
            'note', v_note,
            'display_currency', v_display
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
                'currency', v_display,
                'player_public_id', v_player.public_id
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'transfer_id', v_result.transfer_id,
        'is_duplicate', v_result.is_duplicate,
        'amount', p_amount,
        'currency', v_display,
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
    v_storage TEXT;
    v_op UUID;
    v_engine_key TEXT;
    v_result RECORD;
BEGIN
    SELECT
        c.auth_user_id,
        c.network_id,
        c.legacy_cashier_id
    INTO v_ctx
    FROM private.get_current_cashier_context_locked() AS c;

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
                'currency', private.operational_display_currency(v_req.currency),
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

    v_storage := private.wallet_storage_currency(v_req.currency);
    IF v_storage IS NULL THEN
        RAISE EXCEPTION 'CURRENCY_UNSUPPORTED';
    END IF;

    BEGIN
        v_op := private.resolve_cashier_currency_account(
            v_ctx.legacy_cashier_id,
            v_ctx.network_id,
            v_storage,
            TRUE
        );
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM = 'CASHIER_CURRENCY_ACCOUNT_REQUIRED' THEN
                RAISE EXCEPTION 'CASHIER_CURRENCY_ACCOUNT_REQUIRED';
            END IF;
            RAISE;
    END;

    PERFORM private.cashier_require_own_ops_active(v_op);
    PERFORM private.cashier_revalidate_legacy_cashier(
        v_ctx.legacy_cashier_id,
        v_ctx.network_id
    );

    IF NOT private.wallet_currencies_match(v_req.currency, v_storage) THEN
        RAISE EXCEPTION 'CURRENCY_MISMATCH';
    END IF;

    v_engine_key := 'cashier-payout:' || v_req.id::TEXT;

    SELECT e.transfer_id, e.is_duplicate, e.from_balance_after, e.to_balance_after, e.player_balance_after
    INTO v_result
    FROM private.apply_operational_transfer(
        'PLAYER_TO_CASHIER',
        v_req.amount,
        v_storage,
        v_engine_key,
        NULL,
        v_op,
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
                'currency', private.operational_display_currency(v_storage),
                'player_public_id', v_req.player_public_id
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'is_duplicate', v_result.is_duplicate,
        'transfer_id', v_result.transfer_id,
        'amount', v_req.amount,
        'currency', private.operational_display_currency(v_storage),
        'cashier_balance_after', v_result.to_balance_after,
        'player_balance_after', v_result.player_balance_after,
        'player_public_id', v_req.player_public_id,
        'payout_id', v_req.id,
        'status', 'paid'
    );
END;
$fn$;


REVOKE ALL ON FUNCTION private.require_operational_storage_currency(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.require_operational_storage_currency(TEXT) TO service_role;
REVOKE ALL ON FUNCTION private.operational_display_currency(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.operational_display_currency(TEXT) TO service_role;
REVOKE ALL ON FUNCTION private.insert_zero_operational_account(TEXT, TEXT, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.insert_zero_operational_account(TEXT, TEXT, UUID, UUID, UUID) TO service_role;
REVOKE ALL ON FUNCTION private.resolve_company_treasury(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.resolve_company_treasury(TEXT, BOOLEAN) TO service_role;
REVOKE ALL ON FUNCTION private.resolve_manager_currency_account(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.resolve_manager_currency_account(UUID, UUID, TEXT, BOOLEAN) TO service_role;
REVOKE ALL ON FUNCTION private.resolve_cashier_currency_account(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.resolve_cashier_currency_account(UUID, UUID, TEXT, BOOLEAN) TO service_role;
REVOKE ALL ON FUNCTION private.manager_resolve_own_cashier_currency(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.manager_resolve_own_cashier_currency(UUID, UUID, TEXT, BOOLEAN) TO service_role;
REVOKE ALL ON FUNCTION private.cashiers_keep_tmt_float_mirror() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.owner_treasury_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_treasury_overview() TO authenticated;
REVOKE ALL ON FUNCTION public.owner_capital_in(NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_capital_in(NUMERIC, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.owner_capital_in_currency(TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_capital_in_currency(TEXT, NUMERIC, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.owner_fund_manager(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_fund_manager(UUID, NUMERIC, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.owner_fund_manager_currency(UUID, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_fund_manager_currency(UUID, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.owner_fund_cashier(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_fund_cashier(UUID, NUMERIC, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.owner_fund_cashier_currency(UUID, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_fund_cashier_currency(UUID, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.owner_add_manager_currency(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_add_manager_currency(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.owner_add_cashier_currency(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_add_cashier_currency(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.manager_add_cashier_currency(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manager_add_cashier_currency(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.manager_fund_cashier_currency(UUID, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manager_fund_cashier_currency(UUID, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.manager_collect_cashier_currency(UUID, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manager_collect_cashier_currency(UUID, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.manager_operational_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manager_operational_overview() TO authenticated;
REVOKE ALL ON FUNCTION public.cashier_operational_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cashier_operational_overview() TO authenticated;
REVOKE ALL ON FUNCTION public.cashier_list_operational_transfers(INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cashier_list_operational_transfers(INTEGER, INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.cashier_deposit_player_currency(TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cashier_deposit_player_currency(TEXT, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.cashier_confirm_player_payout(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cashier_confirm_player_payout(TEXT, TEXT) TO authenticated;

COMMIT;





