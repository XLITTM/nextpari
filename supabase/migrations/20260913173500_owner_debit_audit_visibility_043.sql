BEGIN;
SET LOCAL statement_timeout = '10min';

-- ============================================================
-- NEXTPARI PHASE 043
-- OWNER DEBIT AUDIT VISIBILITY HOTFIX
-- Sequence: after 042 (already applied in production).
--
-- Production public.owner_debit_player currently passes
-- visibility 'owner' into private.append_staff_audit.
-- Live append_staff_audit only accepts:
--   owner_only, manager_scope, cashier_self, system
-- Result: AUDIT_VISIBILITY_INVALID rolls back the debit.
--
-- This replaces only the audit visibility argument.
-- Money engine, grants, and response shape stay unchanged.
-- Repository only. DO NOT APPLY from this change.
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
            'owner_only',
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

COMMIT;
