BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 067
-- FIX FUND ATTRIBUTION WALLET LEDGER KEY
--
-- Sequence: after 066 (cashier_fund_attribution_review).
-- Repository-only. NOT applied by this change.
-- Does NOT modify migration 066.
-- Does NOT enable enforcement.
-- Does NOT rewrite private.apply_wallet_entry.
-- Does NOT mutate existing balances.
--
-- private.wallet_ledger has idempotency_key, not entry_key.
-- Phase 066 trigger private.fund_attribution_on_wallet_ledger()
-- referenced NEW.entry_key and failed at runtime:
--   record "new" has no field "entry_key"
-- This hotfix replaces only those wallet-ledger field references.
-- Attribution-ledger entry_key / p_entry_key / wallet_ledger_entry_key
-- remain unchanged.
-- ============================================================

CREATE OR REPLACE FUNCTION private.fund_attribution_on_wallet_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
DECLARE
    v_currency TEXT;
    v_display TEXT;
    v_pre_avail NUMERIC;
    v_pre_locked NUMERIC;
    v_avail NUMERIC;
    v_locked NUMERIC;
    v_op TEXT;
    v_minor NUMERIC(40, 0);
    v_cashier UUID;
    v_scope TEXT;
    v_ref TEXT;
    v_related TEXT;
    v_hold_ref TEXT;
    v_state TEXT;
    v_has_snapshot BOOLEAN;
BEGIN
    v_op := NEW.operation_type;
    IF v_op IS NULL THEN
        RETURN NEW;
    END IF;

    IF v_op = 'OPENING_BALANCE' THEN
        RETURN NEW;
    END IF;

    IF v_op IN ('WITHDRAWAL_HOLD', 'WITHDRAWAL_RELEASE', 'WITHDRAWAL_COMPLETE') THEN
        SELECT a.currency, a.available_balance, a.locked_balance
        INTO v_currency, v_avail, v_locked
        FROM private.wallet_accounts AS a
        WHERE a.wallet_id = NEW.wallet_id;
        IF v_currency IS NULL THEN
            RETURN NEW;
        END IF;
        v_display := COALESCE(private.wallet_display_currency(v_currency), 'TMT');
        v_pre_avail := v_avail - COALESCE(NEW.available_delta, 0);
        v_pre_locked := v_locked - COALESCE(NEW.locked_delta, 0);
        PERFORM private.ensure_fund_attribution_initialized(NEW.wallet_id, v_pre_avail, v_pre_locked);

        SELECT s.state INTO v_state
        FROM private.player_fund_attribution_state AS s
        WHERE s.wallet_id = NEW.wallet_id
          AND s.currency = v_currency;
        IF v_state IS DISTINCT FROM 'active' AND v_state IS DISTINCT FROM 'inconsistent' THEN
            RETURN NEW;
        END IF;

        v_hold_ref := private.attribution_resolve_hold_ref(
            NEW.reference_type, NEW.reference_id, NEW.idempotency_key, NEW.metadata
        );
        IF v_hold_ref IS NULL THEN
            RETURN NEW;
        END IF;

        IF v_op = 'WITHDRAWAL_HOLD' THEN
            -- Cash selected-cashier-first reserve runs BEFORE this HOLD.
            -- Existing parts make this trigger idempotent (no double reserve).
            IF EXISTS (
                SELECT 1 FROM private.player_fund_hold_parts AS h WHERE h.hold_ref = v_hold_ref
            ) THEN
                RETURN NEW;
            END IF;
            v_minor := private.currency_amount_to_minor(v_display, ABS(COALESCE(NEW.available_delta, 0)));
            PERFORM private.attribution_reserve_withdrawal(
                NEW.wallet_id, v_currency, v_minor, NULL,
                v_hold_ref, 'attr-hold:' || v_hold_ref, NEW.idempotency_key
            );
            RETURN NEW;
        END IF;

        IF v_op = 'WITHDRAWAL_RELEASE' THEN
            PERFORM private.attribution_release_hold(
                v_hold_ref,
                'attr-release:' || NEW.idempotency_key,
                NEW.idempotency_key
            );
            RETURN NEW;
        END IF;

        PERFORM private.attribution_complete_hold(
            v_hold_ref,
            'attr-complete:' || NEW.idempotency_key,
            NEW.idempotency_key
        );
        RETURN NEW;
    END IF;

    SELECT a.currency, a.available_balance, a.locked_balance
    INTO v_currency, v_avail, v_locked
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = NEW.wallet_id;

    IF v_currency IS NULL THEN
        RETURN NEW;
    END IF;
    v_display := COALESCE(private.wallet_display_currency(v_currency), 'TMT');
    v_pre_avail := v_avail - COALESCE(NEW.available_delta, 0);
    v_pre_locked := v_locked - COALESCE(NEW.locked_delta, 0);
    PERFORM private.ensure_fund_attribution_initialized(NEW.wallet_id, v_pre_avail, v_pre_locked);

    v_scope := COALESCE(NULLIF(BTRIM(NEW.reference_type), ''), 'wallet');
    v_ref := COALESCE(NULLIF(BTRIM(NEW.reference_id), ''), NEW.idempotency_key);

    IF v_op = 'CASH_DEPOSIT' THEN
        v_minor := private.currency_amount_to_minor(v_display, NEW.available_delta);
        SELECT oa.legacy_cashier_id
        INTO v_cashier
        FROM private.operational_transfers AS t
        INNER JOIN private.operational_accounts AS oa ON oa.id = t.from_account_id
        WHERE t.id = NULLIF(NEW.reference_id, '')::UUID
        LIMIT 1;
        IF v_cashier IS NULL THEN
            PERFORM private.apply_fund_attribution_delta(
                NEW.wallet_id, v_currency, 'house', NULL, v_minor, 0,
                'attr:' || NEW.idempotency_key || ':house',
                v_scope, v_ref, NEW.idempotency_key,
                jsonb_build_object('phase', 'deposit_uncorrelated')
            );
            PERFORM private.mark_fund_attribution_inconsistent(NEW.wallet_id, v_currency);
        ELSE
            PERFORM private.apply_fund_attribution_delta(
                NEW.wallet_id, v_currency, 'cashier', v_cashier, v_minor, 0,
                'attr:' || NEW.idempotency_key || ':cashier',
                v_scope, v_ref, NEW.idempotency_key,
                jsonb_build_object('phase', 'cashier_deposit')
            );
        END IF;
        RETURN NEW;
    END IF;

    IF v_op = 'TREASURY_FUNDING' THEN
        v_minor := private.currency_amount_to_minor(v_display, NEW.available_delta);
        PERFORM private.apply_fund_attribution_delta(
            NEW.wallet_id, v_currency, 'treasury', NULL, v_minor, 0,
            'attr:' || NEW.idempotency_key || ':treasury',
            v_scope, v_ref, NEW.idempotency_key,
            jsonb_build_object('phase', 'treasury_credit')
        );
        RETURN NEW;
    END IF;

    IF v_op IN ('CASH_DEPOSIT_REVERSAL', 'OWNER_DEBIT') THEN
        v_minor := private.currency_amount_to_minor(v_display, ABS(NEW.available_delta));
        IF v_op = 'CASH_DEPOSIT_REVERSAL' THEN
            SELECT oa.legacy_cashier_id
            INTO v_cashier
            FROM private.operational_transfers AS t
            INNER JOIN private.operational_accounts AS oa ON oa.id = t.to_account_id
            WHERE t.id = NULLIF(NEW.reference_id, '')::UUID
            LIMIT 1;
            IF v_cashier IS NOT NULL THEN
                PERFORM private.apply_fund_attribution_delta(
                    NEW.wallet_id, v_currency, 'cashier', v_cashier, -v_minor, 0,
                    'attr:' || NEW.idempotency_key || ':cashier',
                    v_scope, v_ref, NEW.idempotency_key,
                    jsonb_build_object('phase', 'cashier_reversal')
                );
                RETURN NEW;
            END IF;
        END IF;
        PERFORM private.attribution_consume_available(
            NEW.wallet_id, v_currency, v_minor,
            'attr:' || NEW.idempotency_key,
            v_scope, v_ref, NEW.idempotency_key, FALSE
        );
        RETURN NEW;
    END IF;

    -- Native sports place: consume current mix and freeze an immutable stake snapshot.
    -- Native sports re-settlement debit (existing snapshot): consume using that snapshot,
    -- never current wallet percentages.
    IF v_op = 'SPORTS_BET' AND COALESCE(NEW.available_delta, 0) < 0 THEN
        v_minor := private.currency_amount_to_minor(v_display, ABS(NEW.available_delta));
        SELECT EXISTS (
            SELECT 1
            FROM private.player_stake_attribution AS s
            WHERE s.stake_scope = v_scope
              AND s.stake_ref = v_ref
        ) INTO v_has_snapshot;
        IF v_has_snapshot THEN
            PERFORM private.attribution_consume_from_snapshot(
                NEW.wallet_id, v_currency, v_minor,
                v_scope, v_ref,
                'attr:' || NEW.idempotency_key,
                NEW.idempotency_key
            );
        ELSE
            PERFORM private.attribution_consume_available(
                NEW.wallet_id, v_currency, v_minor,
                'attr:' || NEW.idempotency_key,
                v_scope, v_ref, NEW.idempotency_key, TRUE
            );
        END IF;
        RETURN NEW;
    END IF;

    -- Native sports settlement/refund credits the ORIGINAL stake snapshot.
    IF v_op IN ('SPORTS_WIN', 'SPORTS_REFUND') AND COALESCE(NEW.available_delta, 0) > 0 THEN
        v_minor := private.currency_amount_to_minor(v_display, NEW.available_delta);
        PERFORM private.attribution_credit_from_snapshot(
            NEW.wallet_id, v_currency, v_minor,
            v_scope, v_ref,
            'attr:' || NEW.idempotency_key,
            NEW.idempotency_key
        );
        RETURN NEW;
    END IF;

    IF v_op = 'CASINO_BET' AND COALESCE(NEW.available_delta, 0) < 0 THEN
        v_minor := private.currency_amount_to_minor(v_display, ABS(NEW.available_delta));
        PERFORM private.attribution_consume_available(
            NEW.wallet_id, v_currency, v_minor,
            'attr:' || NEW.idempotency_key,
            v_scope, v_ref, NEW.idempotency_key, TRUE
        );
        RETURN NEW;
    END IF;

    IF v_op IN ('CASINO_WIN', 'CASINO_REFUND') AND COALESCE(NEW.available_delta, 0) > 0 THEN
        v_minor := private.currency_amount_to_minor(v_display, NEW.available_delta);
        v_related := NULLIF(BTRIM(COALESCE(NEW.metadata->>'related_transaction_id', '')), '');
        IF v_related IS NULL AND to_regclass('private.betconstruct_transactions') IS NOT NULL THEN
            -- BetConstruct sports BetResulted and casino Deposit insert the
            -- provider row AFTER the wallet credit. related_transaction_id is
            -- therefore often unavailable here. Do not guess latest cashier.
            -- Uncorrelated credits fail closed to house + inconsistent.
            SELECT t.related_transaction_id
            INTO v_related
            FROM private.betconstruct_transactions AS t
            WHERE t.external_transaction_id = v_ref
            ORDER BY t.created_at DESC
            LIMIT 1;
        END IF;
        PERFORM private.attribution_credit_from_snapshot(
            NEW.wallet_id, v_currency, v_minor,
            v_scope, COALESCE(v_related, v_ref),
            'attr:' || NEW.idempotency_key,
            NEW.idempotency_key
        );
        RETURN NEW;
    END IF;

    -- Unknown credits are never assigned to a cashier. Unknown debits consume
    -- current mix fail-closed (no silent recolor).
    IF COALESCE(NEW.available_delta, 0) > 0 THEN
        v_minor := private.currency_amount_to_minor(v_display, NEW.available_delta);
        PERFORM private.apply_fund_attribution_delta(
            NEW.wallet_id, v_currency, 'house', NULL, v_minor, 0,
            'attr:' || NEW.idempotency_key || ':house',
            v_scope, v_ref, NEW.idempotency_key,
            jsonb_build_object('phase', 'uncategorized_credit')
        );
    ELSIF COALESCE(NEW.available_delta, 0) < 0 THEN
        v_minor := private.currency_amount_to_minor(v_display, ABS(NEW.available_delta));
        PERFORM private.attribution_consume_available(
            NEW.wallet_id, v_currency, v_minor,
            'attr:' || NEW.idempotency_key,
            v_scope, v_ref, NEW.idempotency_key, FALSE
        );
    END IF;

    RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION private.fund_attribution_on_wallet_ledger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.fund_attribution_on_wallet_ledger() TO service_role;

COMMIT;
