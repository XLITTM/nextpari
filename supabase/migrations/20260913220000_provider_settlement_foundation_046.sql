BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 046
-- PROVIDER SETTLEMENT / GGR ACCOUNTING FOUNDATION
-- Sequence: after 045 (one-click sequential ID RETURNING hotfix).
--
-- Repository only. DO NOT APPLY from this change.
--
-- Provider accounting is a separate domain from Wallet Ledger.
-- This migration MUST NOT call private.apply_wallet_entry,
-- MUST NOT mutate public.wallets / private.wallet_accounts /
-- private.wallet_ledger, and MUST NOT move player money.
--
-- Provider identity reuses the existing TEXT key convention from
-- private.sports_bets.provider, private.sports_bet_legs.provider,
-- and private.sports_settlement_events.provider (e.g. lsports).
-- public.providers_mapping remains a sports-entity map only.
--
-- BetB2B is a future adapter target, not a seeded registry row.
-- No commercial fee, guessed hold formula, minimum monthly fee, or invoice
-- payment is configured here.
-- ============================================================


CREATE TABLE IF NOT EXISTS private.provider_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_key TEXT NOT NULL,
    product TEXT NOT NULL,
    external_transaction_id TEXT NOT NULL,
    related_transaction_id TEXT,
    kind TEXT NOT NULL,
    amount NUMERIC(20, 2) NOT NULL,
    currency TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    economic_effect NUMERIC(20, 2) NOT NULL,
    CONSTRAINT provider_ledger_provider_key_check
        CHECK (char_length(provider_key) BETWEEN 1 AND 64 AND provider_key = lower(provider_key)),
    CONSTRAINT provider_ledger_product_check
        CHECK (product IN ('sports', 'casino')),
    CONSTRAINT provider_ledger_kind_check
        CHECK (kind IN ('stake', 'bet', 'payout', 'win', 'refund', 'void', 'rollback')),
    CONSTRAINT provider_ledger_kind_product_check
        CHECK (
            (product = 'sports' AND kind IN ('stake', 'payout', 'refund', 'void', 'rollback'))
            OR (product = 'casino' AND kind IN ('bet', 'win', 'refund', 'void', 'rollback'))
        ),
    CONSTRAINT provider_ledger_external_id_check
        CHECK (char_length(BTRIM(external_transaction_id)) BETWEEN 1 AND 128),
    CONSTRAINT provider_ledger_related_check
        CHECK (
            kind NOT IN ('refund', 'void', 'rollback')
            OR char_length(BTRIM(COALESCE(related_transaction_id, ''))) BETWEEN 1 AND 128
        ),
    CONSTRAINT provider_ledger_amount_positive
        CHECK (amount > 0 AND amount = ROUND(amount, 2)),
    CONSTRAINT provider_ledger_currency_check
        CHECK (currency ~ '^[A-Z]{3,8}$'),
    CONSTRAINT provider_ledger_economic_effect_scale
        CHECK (economic_effect = ROUND(economic_effect, 2)),
    CONSTRAINT provider_ledger_provider_tx_uidx
        UNIQUE (provider_key, external_transaction_id)
);

COMMENT ON TABLE private.provider_ledger IS
'Canonical provider transaction ledger for internal GGR. Separate from Wallet Ledger / player money. Idempotent on (provider_key, external_transaction_id).';

COMMENT ON COLUMN private.provider_ledger.economic_effect IS
'Normalized GGR contribution: stake/bet = +amount, payout/win = -amount, refund/void/rollback = inverse of the referenced event.';

COMMENT ON COLUMN private.provider_ledger.provider_key IS
'TEXT provider identity, same convention as private.sports_bets.provider. Not a UUID registry and not public.providers_mapping.';

CREATE UNIQUE INDEX IF NOT EXISTS provider_ledger_neutralization_uidx
    ON private.provider_ledger (provider_key, related_transaction_id)
    WHERE kind IN ('refund', 'void', 'rollback')
      AND related_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS provider_ledger_occurred_idx
    ON private.provider_ledger (provider_key, product, currency, occurred_at);

CREATE INDEX IF NOT EXISTS provider_ledger_related_idx
    ON private.provider_ledger (provider_key, related_transaction_id)
    WHERE related_transaction_id IS NOT NULL;


CREATE TABLE IF NOT EXISTS private.provider_settlement_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_key TEXT NOT NULL,
    product TEXT NOT NULL,
    currency TEXT NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    internal_stake_total NUMERIC(20, 2) NOT NULL DEFAULT 0,
    internal_payout_total NUMERIC(20, 2) NOT NULL DEFAULT 0,
    refund_total NUMERIC(20, 2) NOT NULL DEFAULT 0,
    void_total NUMERIC(20, 2) NOT NULL DEFAULT 0,
    rollback_total NUMERIC(20, 2) NOT NULL DEFAULT 0,
    internal_ggr NUMERIC(20, 2) NOT NULL DEFAULT 0,
    provider_reported_ggr NUMERIC(20, 2),
    discrepancy NUMERIC(20, 2)
        GENERATED ALWAYS AS (
            CASE
                WHEN provider_reported_ggr IS NULL THEN NULL
                ELSE ROUND(internal_ggr - provider_reported_ggr, 2)
            END
        ) STORED,
    commercial_terms JSONB,
    commission_fee NUMERIC(20, 2),
    amount_due NUMERIC(20, 2),
    provider_statement_ref TEXT,
    provider_invoice_ref TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT provider_settlement_provider_key_check
        CHECK (char_length(provider_key) BETWEEN 1 AND 64 AND provider_key = lower(provider_key)),
    CONSTRAINT provider_settlement_product_check
        CHECK (product IN ('sports', 'casino')),
    CONSTRAINT provider_settlement_currency_check
        CHECK (currency ~ '^[A-Z]{3,8}$'),
    CONSTRAINT provider_settlement_range_check
        CHECK (period_end > period_start),
    CONSTRAINT provider_settlement_status_check
        CHECK (status IN ('open', 'reconciled', 'invoiced', 'paid', 'dispute')),
    CONSTRAINT provider_settlement_money_scale_check
        CHECK (
            internal_stake_total = ROUND(internal_stake_total, 2)
            AND internal_payout_total = ROUND(internal_payout_total, 2)
            AND refund_total = ROUND(refund_total, 2)
            AND void_total = ROUND(void_total, 2)
            AND rollback_total = ROUND(rollback_total, 2)
            AND internal_ggr = ROUND(internal_ggr, 2)
            AND (provider_reported_ggr IS NULL OR provider_reported_ggr = ROUND(provider_reported_ggr, 2))
            AND (commission_fee IS NULL OR commission_fee = ROUND(commission_fee, 2))
            AND (amount_due IS NULL OR amount_due = ROUND(amount_due, 2))
        ),
    CONSTRAINT provider_settlement_period_uidx
        UNIQUE (provider_key, product, currency, period_start, period_end)
);

COMMENT ON TABLE private.provider_settlement_periods IS
'Provider reconciliation periods. commercial_terms / commission_fee / amount_due stay NULL until a real contract is configured. provider_reported_ggr is never the internal GGR source of truth.';

CREATE INDEX IF NOT EXISTS provider_settlement_status_idx
    ON private.provider_settlement_periods (provider_key, status, period_start DESC);


REVOKE ALL ON TABLE private.provider_ledger FROM PUBLIC;
REVOKE ALL ON TABLE private.provider_ledger FROM anon, authenticated;
REVOKE ALL ON TABLE private.provider_settlement_periods FROM PUBLIC;
REVOKE ALL ON TABLE private.provider_settlement_periods FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE private.provider_ledger TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE private.provider_settlement_periods TO service_role;


CREATE OR REPLACE FUNCTION private.provider_normalize_key(p_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_value TEXT;
BEGIN
    v_value := lower(BTRIM(COALESCE(p_value, '')));
    IF char_length(v_value) BETWEEN 1 AND 64 THEN
        RETURN v_value;
    END IF;
    RAISE EXCEPTION 'PROVIDER_KEY_INVALID';
END;
$fn$;

CREATE OR REPLACE FUNCTION private.provider_normalize_currency(p_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
    v_value TEXT;
BEGIN
    v_value := upper(BTRIM(COALESCE(p_value, '')));
    IF v_value ~ '^[A-Z]{3,8}$' THEN
        RETURN v_value;
    END IF;
    RAISE EXCEPTION 'PROVIDER_CURRENCY_INVALID';
END;
$fn$;

CREATE OR REPLACE FUNCTION private.provider_utc_month_start(p_at TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
    SELECT (date_trunc('month', p_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
$fn$;

CREATE OR REPLACE FUNCTION private.provider_utc_month_end(p_at TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
    SELECT ((date_trunc('month', p_at AT TIME ZONE 'UTC') + INTERVAL '1 month') AT TIME ZONE 'UTC');
$fn$;

CREATE OR REPLACE FUNCTION private.provider_resolve_utc_period(
    p_period TEXT,
    p_from DATE,
    p_to DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_period TEXT;
    v_from DATE;
    v_to DATE;
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
    v_today DATE;
BEGIN
    v_period := lower(BTRIM(COALESCE(p_period, 'month')));
    v_today := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::DATE;

    IF v_period = 'month' THEN
        v_from := date_trunc('month', COALESCE(p_from, v_today)::TIMESTAMP)::DATE;
        v_to := (v_from + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
        v_start := v_from::TIMESTAMP AT TIME ZONE 'UTC';
        v_end := (v_from + INTERVAL '1 month')::TIMESTAMP AT TIME ZONE 'UTC';
    ELSIF v_period = 'custom' THEN
        IF p_from IS NULL OR p_to IS NULL THEN
            RAISE EXCEPTION 'PERIOD_INVALID';
        END IF;
        IF p_to < p_from THEN
            RAISE EXCEPTION 'PERIOD_INVALID';
        END IF;
        IF (p_to - p_from) > 366 THEN
            RAISE EXCEPTION 'PERIOD_TOO_LONG';
        END IF;
        v_from := p_from;
        v_to := p_to;
        v_start := p_from::TIMESTAMP AT TIME ZONE 'UTC';
        v_end := (p_to + 1)::TIMESTAMP AT TIME ZONE 'UTC';
    ELSE
        RAISE EXCEPTION 'PERIOD_INVALID';
    END IF;

    RETURN jsonb_build_object(
        'kind', v_period,
        'timezone', 'UTC',
        'from', v_from,
        'to', v_to,
        'startAt', v_start,
        'endAt', v_end
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.recompute_provider_settlement_period(
    p_provider_key TEXT,
    p_product TEXT,
    p_currency TEXT,
    p_period_start TIMESTAMPTZ,
    p_period_end TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_provider TEXT;
    v_product TEXT;
    v_currency TEXT;
    v_stake NUMERIC(20, 2);
    v_payout NUMERIC(20, 2);
    v_refund NUMERIC(20, 2);
    v_void NUMERIC(20, 2);
    v_rollback NUMERIC(20, 2);
    v_ggr NUMERIC(20, 2);
    v_id UUID;
BEGIN
    v_provider := private.provider_normalize_key(p_provider_key);
    v_product := lower(BTRIM(COALESCE(p_product, '')));
    IF v_product NOT IN ('sports', 'casino') THEN
        RAISE EXCEPTION 'PROVIDER_PRODUCT_INVALID';
    END IF;
    v_currency := private.provider_normalize_currency(p_currency);
    IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end <= p_period_start THEN
        RAISE EXCEPTION 'PERIOD_INVALID';
    END IF;

    SELECT
        COALESCE(SUM(l.amount) FILTER (WHERE l.kind IN ('stake', 'bet')), 0),
        COALESCE(SUM(l.amount) FILTER (WHERE l.kind IN ('payout', 'win')), 0),
        COALESCE(SUM(l.amount) FILTER (WHERE l.kind = 'refund'), 0),
        COALESCE(SUM(l.amount) FILTER (WHERE l.kind = 'void'), 0),
        COALESCE(SUM(l.amount) FILTER (WHERE l.kind = 'rollback'), 0),
        COALESCE(SUM(l.economic_effect), 0)
    INTO v_stake, v_payout, v_refund, v_void, v_rollback, v_ggr
    FROM private.provider_ledger AS l
    WHERE l.provider_key = v_provider
      AND l.product = v_product
      AND l.currency = v_currency
      AND l.occurred_at >= p_period_start
      AND l.occurred_at < p_period_end;

    INSERT INTO private.provider_settlement_periods AS p (
        provider_key,
        product,
        currency,
        period_start,
        period_end,
        internal_stake_total,
        internal_payout_total,
        refund_total,
        void_total,
        rollback_total,
        internal_ggr,
        provider_reported_ggr,
        commercial_terms,
        commission_fee,
        amount_due,
        status
    )
    VALUES (
        v_provider,
        v_product,
        v_currency,
        p_period_start,
        p_period_end,
        ROUND(v_stake, 2),
        ROUND(v_payout, 2),
        ROUND(v_refund, 2),
        ROUND(v_void, 2),
        ROUND(v_rollback, 2),
        ROUND(v_ggr, 2),
        NULL,
        NULL,
        NULL,
        NULL,
        'open'
    )
    ON CONFLICT (provider_key, product, currency, period_start, period_end)
    DO UPDATE SET
        internal_stake_total = EXCLUDED.internal_stake_total,
        internal_payout_total = EXCLUDED.internal_payout_total,
        refund_total = EXCLUDED.refund_total,
        void_total = EXCLUDED.void_total,
        rollback_total = EXCLUDED.rollback_total,
        internal_ggr = EXCLUDED.internal_ggr,
        updated_at = pg_catalog.now()
    RETURNING p.id INTO v_id;

    RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.ingest_provider_transaction(
    p_provider_key TEXT,
    p_product TEXT,
    p_external_transaction_id TEXT,
    p_related_transaction_id TEXT,
    p_kind TEXT,
    p_amount NUMERIC,
    p_currency TEXT,
    p_occurred_at TIMESTAMPTZ,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_provider TEXT;
    v_product TEXT;
    v_kind TEXT;
    v_currency TEXT;
    v_external TEXT;
    v_related TEXT;
    v_amount NUMERIC(20, 2);
    v_effect NUMERIC(20, 2);
    v_existing UUID;
    v_related_effect NUMERIC(20, 2);
    v_related_kind TEXT;
    v_related_product TEXT;
    v_related_currency TEXT;
    v_id UUID;
    v_replayed BOOLEAN := false;
BEGIN
    v_provider := private.provider_normalize_key(p_provider_key);
    v_product := lower(BTRIM(COALESCE(p_product, '')));
    v_kind := lower(BTRIM(COALESCE(p_kind, '')));
    v_currency := private.provider_normalize_currency(p_currency);
    v_external := BTRIM(COALESCE(p_external_transaction_id, ''));
    v_related := NULLIF(BTRIM(COALESCE(p_related_transaction_id, '')), '');

    IF v_product NOT IN ('sports', 'casino') THEN
        RAISE EXCEPTION 'PROVIDER_PRODUCT_INVALID';
    END IF;
    IF v_kind NOT IN ('stake', 'bet', 'payout', 'win', 'refund', 'void', 'rollback') THEN
        RAISE EXCEPTION 'PROVIDER_KIND_INVALID';
    END IF;
    IF v_product = 'sports' AND v_kind IN ('bet', 'win') THEN
        RAISE EXCEPTION 'PROVIDER_KIND_INVALID';
    END IF;
    IF v_product = 'casino' AND v_kind IN ('stake', 'payout') THEN
        RAISE EXCEPTION 'PROVIDER_KIND_INVALID';
    END IF;
    IF char_length(v_external) < 1 OR char_length(v_external) > 128 THEN
        RAISE EXCEPTION 'PROVIDER_TRANSACTION_ID_INVALID';
    END IF;
    IF p_occurred_at IS NULL THEN
        RAISE EXCEPTION 'PROVIDER_OCCURRED_AT_REQUIRED';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> ROUND(p_amount, 2) THEN
        RAISE EXCEPTION 'PROVIDER_AMOUNT_INVALID';
    END IF;
    v_amount := ROUND(p_amount, 2);

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_provider || chr(31) || v_external, 0)
    );

    SELECT l.id
    INTO v_existing
    FROM private.provider_ledger AS l
    WHERE l.provider_key = v_provider
      AND l.external_transaction_id = v_external
    FOR UPDATE;

    IF v_existing IS NOT NULL THEN
        v_replayed := true;
        SELECT
            l.id,
            l.economic_effect
        INTO v_id, v_effect
        FROM private.provider_ledger AS l
        WHERE l.id = v_existing;
        RETURN jsonb_build_object(
            'ok', true,
            'inserted', false,
            'replayed', true,
            'id', v_id,
            'providerKey', v_provider,
            'product', v_product,
            'externalTransactionId', v_external,
            'economicEffect', v_effect,
            'currency', v_currency
        );
    END IF;

    IF v_kind IN ('stake', 'bet') THEN
        v_effect := v_amount;
    ELSIF v_kind IN ('payout', 'win') THEN
        v_effect := ROUND(-v_amount, 2);
    ELSE
        IF v_related IS NULL THEN
            RAISE EXCEPTION 'PROVIDER_RELATED_TRANSACTION_REQUIRED';
        END IF;
        SELECT
            src.economic_effect,
            src.kind,
            src.product,
            src.currency
        INTO v_related_effect, v_related_kind, v_related_product, v_related_currency
        FROM private.provider_ledger AS src
        WHERE src.provider_key = v_provider
          AND src.external_transaction_id = v_related
        FOR UPDATE;
        IF v_related_effect IS NULL THEN
            RAISE EXCEPTION 'PROVIDER_RELATED_TRANSACTION_NOT_FOUND';
        END IF;
        IF v_related_kind IN ('refund', 'void', 'rollback') THEN
            RAISE EXCEPTION 'PROVIDER_RELATED_KIND_INVALID';
        END IF;
        IF v_related_product IS DISTINCT FROM v_product THEN
            RAISE EXCEPTION 'PROVIDER_PRODUCT_MISMATCH';
        END IF;
        IF v_related_currency IS DISTINCT FROM v_currency THEN
            RAISE EXCEPTION 'PROVIDER_CURRENCY_MISMATCH';
        END IF;
        v_effect := ROUND(-v_related_effect, 2);
    END IF;

    INSERT INTO private.provider_ledger AS l (
        provider_key,
        product,
        external_transaction_id,
        related_transaction_id,
        kind,
        amount,
        currency,
        occurred_at,
        metadata,
        economic_effect
    )
    VALUES (
        v_provider,
        v_product,
        v_external,
        v_related,
        v_kind,
        v_amount,
        v_currency,
        p_occurred_at,
        COALESCE(p_metadata, '{}'::jsonb),
        v_effect
    )
    RETURNING l.id INTO v_id;

    PERFORM private.recompute_provider_settlement_period(
        v_provider,
        v_product,
        v_currency,
        private.provider_utc_month_start(p_occurred_at),
        private.provider_utc_month_end(p_occurred_at)
    );

    RETURN jsonb_build_object(
        'ok', true,
        'inserted', true,
        'replayed', false,
        'id', v_id,
        'providerKey', v_provider,
        'product', v_product,
        'externalTransactionId', v_external,
        'economicEffect', v_effect,
        'currency', v_currency
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.provider_ggr_summary_json(
    p_start TIMESTAMPTZ,
    p_end TIMESTAMPTZ,
    p_provider_key TEXT,
    p_product TEXT,
    p_currency TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_provider TEXT;
    v_product TEXT;
    v_currency TEXT;
    v_has_data BOOLEAN;
    v_rows jsonb;
    v_currencies jsonb;
BEGIN
    v_provider := NULLIF(lower(BTRIM(COALESCE(p_provider_key, ''))), '');
    v_product := NULLIF(lower(BTRIM(COALESCE(p_product, ''))), '');
    v_currency := NULLIF(upper(BTRIM(COALESCE(p_currency, ''))), '');
    IF v_product IS NOT NULL AND v_product NOT IN ('sports', 'casino') THEN
        RAISE EXCEPTION 'PROVIDER_PRODUCT_INVALID';
    END IF;
    IF v_currency IS NOT NULL AND v_currency !~ '^[A-Z]{3,8}$' THEN
        RAISE EXCEPTION 'PROVIDER_CURRENCY_INVALID';
    END IF;

    SELECT EXISTS (SELECT 1 FROM private.provider_ledger AS any_row)
    INTO v_has_data;

    SELECT COALESCE(jsonb_agg(row_json ORDER BY row_json->>'providerKey', row_json->>'product', row_json->>'currency'), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT jsonb_build_object(
            'providerKey', agg.provider_key,
            'product', agg.product,
            'currency', agg.currency,
            'stakeTotal', agg.stake_total,
            'payoutTotal', agg.payout_total,
            'refundTotal', agg.refund_total,
            'voidTotal', agg.void_total,
            'rollbackTotal', agg.rollback_total,
            'internalGgr', agg.internal_ggr,
            'providerReportedGgr', per.provider_reported_ggr,
            'discrepancy', per.discrepancy,
            'commercialTerms', per.commercial_terms,
            'commissionFee', per.commission_fee,
            'amountDue', per.amount_due,
            'status', COALESCE(per.status, 'open'),
            'statementRef', per.provider_statement_ref,
            'invoiceRef', per.provider_invoice_ref
        ) AS row_json
        FROM (
            SELECT
                l.provider_key,
                l.product,
                l.currency,
                ROUND(COALESCE(SUM(l.amount) FILTER (WHERE l.kind IN ('stake', 'bet')), 0), 2) AS stake_total,
                ROUND(COALESCE(SUM(l.amount) FILTER (WHERE l.kind IN ('payout', 'win')), 0), 2) AS payout_total,
                ROUND(COALESCE(SUM(l.amount) FILTER (WHERE l.kind = 'refund'), 0), 2) AS refund_total,
                ROUND(COALESCE(SUM(l.amount) FILTER (WHERE l.kind = 'void'), 0), 2) AS void_total,
                ROUND(COALESCE(SUM(l.amount) FILTER (WHERE l.kind = 'rollback'), 0), 2) AS rollback_total,
                ROUND(COALESCE(SUM(l.economic_effect), 0), 2) AS internal_ggr
            FROM private.provider_ledger AS l
            WHERE l.occurred_at >= p_start
              AND l.occurred_at < p_end
              AND (v_provider IS NULL OR l.provider_key = v_provider)
              AND (v_product IS NULL OR l.product = v_product)
              AND (v_currency IS NULL OR l.currency = v_currency)
            GROUP BY l.provider_key, l.product, l.currency
        ) AS agg
        LEFT JOIN private.provider_settlement_periods AS per
            ON per.provider_key = agg.provider_key
           AND per.product = agg.product
           AND per.currency = agg.currency
           AND per.period_start = p_start
           AND per.period_end = p_end
    ) AS listed;

    SELECT COALESCE(jsonb_agg(cur_json ORDER BY cur_json->>'currency'), '[]'::jsonb)
    INTO v_currencies
    FROM (
        SELECT jsonb_build_object(
            'currency', grouped.currency,
            'stakeTotal', grouped.stake_total,
            'payoutTotal', grouped.payout_total,
            'refundTotal', grouped.refund_total,
            'voidTotal', grouped.void_total,
            'rollbackTotal', grouped.rollback_total,
            'internalGgr', grouped.internal_ggr
        ) AS cur_json
        FROM (
            SELECT
                l.currency,
                ROUND(COALESCE(SUM(l.amount) FILTER (WHERE l.kind IN ('stake', 'bet')), 0), 2) AS stake_total,
                ROUND(COALESCE(SUM(l.amount) FILTER (WHERE l.kind IN ('payout', 'win')), 0), 2) AS payout_total,
                ROUND(COALESCE(SUM(l.amount) FILTER (WHERE l.kind = 'refund'), 0), 2) AS refund_total,
                ROUND(COALESCE(SUM(l.amount) FILTER (WHERE l.kind = 'void'), 0), 2) AS void_total,
                ROUND(COALESCE(SUM(l.amount) FILTER (WHERE l.kind = 'rollback'), 0), 2) AS rollback_total,
                ROUND(COALESCE(SUM(l.economic_effect), 0), 2) AS internal_ggr
            FROM private.provider_ledger AS l
            WHERE l.occurred_at >= p_start
              AND l.occurred_at < p_end
              AND (v_provider IS NULL OR l.provider_key = v_provider)
              AND (v_product IS NULL OR l.product = v_product)
              AND (v_currency IS NULL OR l.currency = v_currency)
            GROUP BY l.currency
        ) AS grouped
    ) AS currency_rows;

    RETURN jsonb_build_object(
        'ok', true,
        'hasProviderData', v_has_data,
        'rows', COALESCE(v_rows, '[]'::jsonb),
        'currencies', COALESCE(v_currencies, '[]'::jsonb)
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.owner_provider_ggr_summary(
    p_period TEXT DEFAULT 'month',
    p_from DATE DEFAULT NULL,
    p_to DATE DEFAULT NULL,
    p_provider_key TEXT DEFAULT NULL,
    p_product TEXT DEFAULT NULL,
    p_currency TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_window jsonb;
    v_summary jsonb;
BEGIN
    PERFORM private.get_current_owner_context();
    v_window := private.provider_resolve_utc_period(p_period, p_from, p_to);
    v_summary := private.provider_ggr_summary_json(
        (v_window->>'startAt')::TIMESTAMPTZ,
        (v_window->>'endAt')::TIMESTAMPTZ,
        p_provider_key,
        p_product,
        p_currency
    );
    RETURN v_summary || jsonb_build_object(
        'period', v_window,
        'filters', jsonb_build_object(
            'providerKey', NULLIF(lower(BTRIM(COALESCE(p_provider_key, ''))), ''),
            'product', NULLIF(lower(BTRIM(COALESCE(p_product, ''))), ''),
            'currency', NULLIF(upper(BTRIM(COALESCE(p_currency, ''))), '')
        )
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.owner_list_provider_settlements(
    p_period TEXT DEFAULT 'month',
    p_from DATE DEFAULT NULL,
    p_to DATE DEFAULT NULL,
    p_provider_key TEXT DEFAULT NULL,
    p_product TEXT DEFAULT NULL,
    p_currency TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_window jsonb;
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
    v_provider TEXT;
    v_product TEXT;
    v_currency TEXT;
    v_status TEXT;
    v_has_data BOOLEAN;
    v_rows jsonb;
BEGIN
    PERFORM private.get_current_owner_context();
    v_window := private.provider_resolve_utc_period(p_period, p_from, p_to);
    v_start := (v_window->>'startAt')::TIMESTAMPTZ;
    v_end := (v_window->>'endAt')::TIMESTAMPTZ;
    v_provider := NULLIF(lower(BTRIM(COALESCE(p_provider_key, ''))), '');
    v_product := NULLIF(lower(BTRIM(COALESCE(p_product, ''))), '');
    v_currency := NULLIF(upper(BTRIM(COALESCE(p_currency, ''))), '');
    v_status := NULLIF(lower(BTRIM(COALESCE(p_status, ''))), '');
    IF v_product IS NOT NULL AND v_product NOT IN ('sports', 'casino') THEN
        RAISE EXCEPTION 'PROVIDER_PRODUCT_INVALID';
    END IF;
    IF v_currency IS NOT NULL AND v_currency !~ '^[A-Z]{3,8}$' THEN
        RAISE EXCEPTION 'PROVIDER_CURRENCY_INVALID';
    END IF;
    IF v_status IS NOT NULL AND v_status NOT IN ('open', 'reconciled', 'invoiced', 'paid', 'dispute') THEN
        RAISE EXCEPTION 'PROVIDER_STATUS_INVALID';
    END IF;

    SELECT EXISTS (SELECT 1 FROM private.provider_ledger AS any_row)
    INTO v_has_data;

    SELECT COALESCE(jsonb_agg(row_json ORDER BY row_json->>'periodStart' DESC, row_json->>'providerKey', row_json->>'product'), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT jsonb_build_object(
            'id', p.id,
            'providerKey', p.provider_key,
            'product', p.product,
            'currency', p.currency,
            'periodStart', p.period_start,
            'periodEnd', p.period_end,
            'stakeTotal', p.internal_stake_total,
            'payoutTotal', p.internal_payout_total,
            'refundTotal', p.refund_total,
            'voidTotal', p.void_total,
            'rollbackTotal', p.rollback_total,
            'internalGgr', p.internal_ggr,
            'providerReportedGgr', p.provider_reported_ggr,
            'discrepancy', p.discrepancy,
            'commercialTerms', p.commercial_terms,
            'commissionFee', p.commission_fee,
            'amountDue', p.amount_due,
            'status', p.status,
            'statementRef', p.provider_statement_ref,
            'invoiceRef', p.provider_invoice_ref
        ) AS row_json
        FROM private.provider_settlement_periods AS p
        WHERE p.period_start < v_end
          AND p.period_end > v_start
          AND (v_provider IS NULL OR p.provider_key = v_provider)
          AND (v_product IS NULL OR p.product = v_product)
          AND (v_currency IS NULL OR p.currency = v_currency)
          AND (v_status IS NULL OR p.status = v_status)
    ) AS listed;

    RETURN jsonb_build_object(
        'ok', true,
        'hasProviderData', v_has_data,
        'period', v_window,
        'filters', jsonb_build_object(
            'providerKey', v_provider,
            'product', v_product,
            'currency', v_currency,
            'status', v_status
        ),
        'rows', COALESCE(v_rows, '[]'::jsonb)
    );
END;
$fn$;


REVOKE ALL ON FUNCTION private.provider_normalize_key(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.provider_normalize_currency(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.provider_utc_month_start(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.provider_utc_month_end(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.provider_resolve_utc_period(TEXT, DATE, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.recompute_provider_settlement_period(TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.ingest_provider_transaction(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.provider_ggr_summary_json(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.provider_normalize_key(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION private.provider_normalize_currency(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION private.provider_utc_month_start(TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION private.provider_utc_month_end(TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION private.provider_resolve_utc_period(TEXT, DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION private.recompute_provider_settlement_period(TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION private.ingest_provider_transaction(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION private.provider_ggr_summary_json(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.owner_provider_ggr_summary(TEXT, DATE, DATE, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_provider_ggr_summary(TEXT, DATE, DATE, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.owner_list_provider_settlements(TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_list_provider_settlements(TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_provider_ggr_summary(TEXT, DATE, DATE, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_list_provider_settlements(TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.owner_provider_ggr_summary(TEXT, DATE, DATE, TEXT, TEXT, TEXT) IS
'Owner JWT read-only internal GGR summary. UTC periods. Never mixes currencies. Does not ingest provider events.';

COMMENT ON FUNCTION public.owner_list_provider_settlements(TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT) IS
'Owner JWT read-only settlement period list. Manager/cashier/player are denied via get_current_owner_context.';

COMMENT ON FUNCTION private.ingest_provider_transaction(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, JSONB) IS
'Service-role provider accounting ingest. Idempotent. No Wallet Ledger writes. No browser GRANT.';

COMMIT;
