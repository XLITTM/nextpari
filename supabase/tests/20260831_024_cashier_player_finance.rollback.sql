-- NEXTPARI PHASE 024A.1
-- Executable BEGIN/ROLLBACK test for cashier ↔ player finance.
--
-- NOT a migration. Do NOT COMMIT. Do NOT run outside a single
-- transaction. Temporary migration_state='active' is local to
-- this transaction and discarded by ROLLBACK.
--
-- Requires 023 + 024 already applied on the database you test.
-- Live IDs (test file only — never in production functions):
--   cashier auth              de04491b-344d-4af1-81e8-bce3f53f21ac
--   legacy cashier            0393d651-e13a-4f04-ba7d-352f63bc62a5
--   cashier operational acct  27f26a0a-5831-47f2-8ddf-321a80317e6f
--   player public_id          110790
--   player auth/profile       bc5d66cd-5e18-4352-b7f8-ea99029758e0
--   player wallet             3ea1677a-d664-47c3-b019-0635b643d6e5
--
-- psql:  \i this file   (file has BEGIN/ROLLBACK)

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.np_set_jwt(p_sub UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $jwt$
BEGIN
    PERFORM set_config('request.jwt.claim.sub', p_sub::TEXT, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config(
        'request.jwt.claims',
        json_build_object('sub', p_sub::TEXT, 'role', 'authenticated')::TEXT,
        true
    );
END;
$jwt$;

CREATE OR REPLACE FUNCTION pg_temp.np_expect_error(p_sql TEXT, p_needle TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $ex$
DECLARE
    v_raised BOOLEAN := FALSE;
    v_msg TEXT;
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION
        WHEN OTHERS THEN
            v_raised := TRUE;
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    END;

    IF v_raised IS NOT TRUE THEN
        RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED: % [%]', p_needle, p_sql;
    END IF;

    IF v_msg NOT ILIKE '%' || p_needle || '%' THEN
        RAISE EXCEPTION 'UNEXPECTED_ERROR: expected % got % [%]', p_needle, v_msg, p_sql;
    END IF;
END;
$ex$;

CREATE OR REPLACE FUNCTION pg_temp.np_assert(p_ok BOOLEAN, p_msg TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $as$
BEGIN
    IF p_ok IS NOT TRUE THEN
        RAISE EXCEPTION 'ASSERT: %', p_msg;
    END IF;
END;
$as$;

SELECT pg_temp.np_set_jwt('de04491b-344d-4af1-81e8-bce3f53f21ac');

-- ============================================================
-- 0. SNAPSHOT (pre-activation)
-- ============================================================

CREATE TEMP TABLE np_snap ON COMMIT DROP AS
SELECT
    (SELECT COUNT(*)::BIGINT FROM private.operational_transfers) AS transfers,
    (SELECT COUNT(*)::BIGINT FROM private.operational_ledger) AS op_ledger,
    (SELECT COUNT(*)::BIGINT FROM private.wallet_ledger) AS wallet_ledger,
    (SELECT COUNT(*)::BIGINT FROM private.cashier_player_payout_requests) AS payouts,
    (SELECT COUNT(*)::BIGINT FROM private.staff_audit_log
        WHERE action_type IN ('CASHIER_DEPOSITED_PLAYER', 'CASHIER_PAID_PLAYER')) AS audit_rows;

SELECT pg_temp.np_assert(
    (SELECT id FROM private.operational_accounts
     WHERE id = '27f26a0a-5831-47f2-8ddf-321a80317e6f')
    = '27f26a0a-5831-47f2-8ddf-321a80317e6f',
    'agent01 operational account exists'
);

SELECT pg_temp.np_assert(
    (SELECT available_balance FROM private.operational_accounts
     WHERE id = '27f26a0a-5831-47f2-8ddf-321a80317e6f') = 3550,
    'agent01 operational baseline is 3550'
);

SELECT pg_temp.np_assert(
    (SELECT migration_state FROM private.operational_accounts
     WHERE id = '27f26a0a-5831-47f2-8ddf-321a80317e6f') = 'staging',
    'agent01 still staging before temp activation'
);

SELECT pg_temp.np_assert(
    (SELECT COUNT(*) FROM private.operational_accounts WHERE migration_state = 'active') = 0,
    'no live operational accounts before temp activation'
);

SELECT pg_temp.np_assert(
    (SELECT p.id FROM public.profiles AS p WHERE p.id = 'bc5d66cd-5e18-4352-b7f8-ea99029758e0')
    = 'bc5d66cd-5e18-4352-b7f8-ea99029758e0',
    'canonical test player profile 110790'
);

SELECT pg_temp.np_assert(
    (SELECT w.available_balance FROM private.wallet_accounts AS w
     WHERE w.wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5') = 0
    AND (SELECT w.locked_balance FROM private.wallet_accounts AS w
         WHERE w.wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5') = 0
    AND (SELECT w.status FROM private.wallet_accounts AS w
         WHERE w.wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5') = 'active',
    'player 110790 wallet 0/0 active'
);

-- ============================================================
-- A. STAGING SAFETY (before any activation)
-- ============================================================

SELECT pg_temp.np_expect_error(
    $q$SELECT public.cashier_deposit_player('110790', 10, 'rollback:stage-dep', NULL)$q$,
    'OPERATIONAL_ACCOUNT_NOT_ACTIVE'
);

SELECT pg_temp.np_expect_error(
    $q$SELECT public.cashier_confirm_player_payout('0123456789abcdef', 'rollback:stage-pay')$q$,
    'OPERATIONAL_ACCOUNT_NOT_ACTIVE'
);

SELECT pg_temp.np_set_jwt('bc5d66cd-5e18-4352-b7f8-ea99029758e0');
SELECT pg_temp.np_expect_error(
    $q$SELECT public.player_request_cashier_payout(10, 'rollback:stage-hold')$q$,
    'OPERATIONAL_ACCOUNT_NOT_ACTIVE'
);
SELECT pg_temp.np_set_jwt('de04491b-344d-4af1-81e8-bce3f53f21ac');

SELECT pg_temp.np_assert(
    (SELECT COUNT(*) FROM private.operational_transfers) = (SELECT transfers FROM np_snap),
    'staging: no operational_transfers'
);
SELECT pg_temp.np_assert(
    (SELECT COUNT(*) FROM private.operational_ledger) = (SELECT op_ledger FROM np_snap),
    'staging: no operational_ledger'
);
SELECT pg_temp.np_assert(
    (SELECT COUNT(*) FROM private.wallet_ledger) = (SELECT wallet_ledger FROM np_snap),
    'staging: no wallet_ledger'
);
SELECT pg_temp.np_assert(
    (SELECT COUNT(*) FROM private.cashier_player_payout_requests) = (SELECT payouts FROM np_snap),
    'staging: no payout request'
);

-- ============================================================
-- TEMPORARY ACTIVATION — exact account 27f26a0a-... ONLY
-- ============================================================

UPDATE private.operational_accounts
SET migration_state = 'active'
WHERE id = '27f26a0a-5831-47f2-8ddf-321a80317e6f';

SELECT pg_temp.np_assert(
    (SELECT COUNT(*) FROM private.operational_accounts WHERE migration_state = 'active') = 1
    AND (SELECT id FROM private.operational_accounts WHERE migration_state = 'active')
        = '27f26a0a-5831-47f2-8ddf-321a80317e6f',
    'only agent01 operational account activated'
);

-- Fund player 110790 via existing Wallet Core (not treasury).
SELECT e.ledger_id
FROM private.apply_wallet_entry(
    '3ea1677a-d664-47c3-b019-0635b643d6e5'::UUID,
    200,
    0,
    'CASH_DEPOSIT',
    'system',
    'rollback:fund-110790',
    'rollback_test',
    '024a1',
    'system',
    NULL,
    jsonb_build_object('phase', '024a.1-rollback')
) AS e;

-- ============================================================
-- B/C/D. DEPOSIT + exact duplicate + conflict
-- ============================================================

SELECT pg_temp.np_set_jwt('de04491b-344d-4af1-81e8-bce3f53f21ac');

CREATE TEMP TABLE np_dep ON COMMIT DROP AS
SELECT public.cashier_deposit_player('110790', 10, 'rollback:dep-1', '024a.1') AS payload;

SELECT pg_temp.np_assert(
    (SELECT payload->>'is_duplicate' FROM np_dep) = 'false',
    'B. deposit is not duplicate'
);

DO $dep$
DECLARE
    v_tid UUID;
    v_dup jsonb;
    v_avail NUMERIC;
BEGIN
    v_tid := (SELECT (payload->>'transfer_id')::UUID FROM np_dep);

    PERFORM pg_temp.np_assert(
        (SELECT available_balance FROM private.operational_accounts
         WHERE id = '27f26a0a-5831-47f2-8ddf-321a80317e6f') = 3540,
        'B. cashier op after deposit=3540'
    );
    PERFORM pg_temp.np_assert(
        (SELECT float_balance FROM public.cashiers
         WHERE id = '0393d651-e13a-4f04-ba7d-352f63bc62a5') = 3540,
        'B. legacy float mirror=3540'
    );

    SELECT w.available_balance INTO v_avail
    FROM private.wallet_accounts AS w
    WHERE w.wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5';
    PERFORM pg_temp.np_assert(v_avail = 210, format('B. player available after fund+deposit=%s', v_avail));

    PERFORM pg_temp.np_assert(
        (SELECT COUNT(*) FROM private.operational_transfers WHERE id = v_tid) = 1,
        'B. one operational transfer'
    );
    PERFORM pg_temp.np_assert(
        (SELECT COUNT(*) FROM private.operational_ledger WHERE transfer_id = v_tid) = 1,
        'B. one operational ledger'
    );
    PERFORM pg_temp.np_assert(
        (SELECT COUNT(*) FROM private.wallet_ledger
         WHERE reference_type = 'operational_transfer'
           AND reference_id = v_tid::TEXT
           AND operation_type = 'CASH_DEPOSIT') = 1,
        'B. one CASH_DEPOSIT wallet ledger'
    );
    PERFORM pg_temp.np_assert(
        (SELECT transfer_type FROM private.operational_transfers WHERE id = v_tid)
        = 'CASHIER_TO_PLAYER',
        'B. CASHIER_TO_PLAYER'
    );

    v_dup := public.cashier_deposit_player('110790', 10, 'rollback:dep-1', '024a.1');
    PERFORM pg_temp.np_assert(v_dup->>'is_duplicate' = 'true', 'C. exact duplicate is_duplicate');
    PERFORM pg_temp.np_assert((v_dup->>'transfer_id')::UUID = v_tid, 'C. same transfer id');
    PERFORM pg_temp.np_assert(
        (SELECT COUNT(*) FROM private.operational_ledger WHERE transfer_id = v_tid) = 1,
        'C. no second operational ledger'
    );
    PERFORM pg_temp.np_assert(
        (SELECT COUNT(*) FROM private.wallet_ledger
         WHERE reference_id = v_tid::TEXT AND operation_type = 'CASH_DEPOSIT') = 1,
        'C. no second wallet ledger'
    );
    PERFORM pg_temp.np_assert(
        (SELECT available_balance FROM private.operational_accounts
         WHERE id = '27f26a0a-5831-47f2-8ddf-321a80317e6f') = 3540,
        'C. duplicate does not move cashier money'
    );
END;
$dep$;

SELECT pg_temp.np_expect_error(
    $q$SELECT public.cashier_deposit_player('110790', 11, 'rollback:dep-1', '024a.1')$q$,
    'IDEMPOTENCY_KEY_CONFLICT'
);

-- ============================================================
-- E/F/G. PAYOUT HOLD + exact duplicate + amount conflict
-- ============================================================

DO $hold$
DECLARE
    v_avail_before NUMERIC;
    v_locked_before NUMERIC;
    v_avail_after NUMERIC;
    v_locked_after NUMERIC;
    v_req jsonb;
    v_dup jsonb;
    v_code TEXT;
    v_id UUID;
    v_op_before NUMERIC;
    v_holds BIGINT;
BEGIN
    SELECT a.available_balance, a.locked_balance
    INTO v_avail_before, v_locked_before
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5';

    SELECT a.available_balance INTO v_op_before
    FROM private.operational_accounts AS a
    WHERE a.id = '27f26a0a-5831-47f2-8ddf-321a80317e6f';

    PERFORM pg_temp.np_set_jwt('bc5d66cd-5e18-4352-b7f8-ea99029758e0');
    v_req := public.player_request_cashier_payout(50, 'rollback:hold-1');
    PERFORM pg_temp.np_assert(v_req->>'is_duplicate' = 'false', 'E. hold not duplicate');
    PERFORM pg_temp.np_assert(v_req->>'status' = 'pending', 'E. hold pending');
    PERFORM pg_temp.np_assert(v_req->>'expires_at' IS NOT NULL, 'E. expires_at populated');
    v_code := v_req->>'code';
    v_id := (v_req->>'id')::UUID;
    PERFORM pg_temp.np_assert(v_code ~ '^[0-9a-f]{16}$', 'E. 16-hex CSPRNG code');

    SELECT a.available_balance, a.locked_balance
    INTO v_avail_after, v_locked_after
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5';

    PERFORM pg_temp.np_assert(v_avail_after = v_avail_before - 50, 'E. available decreases 50');
    PERFORM pg_temp.np_assert(v_locked_after = v_locked_before + 50, 'E. locked increases 50');
    PERFORM pg_temp.np_assert(
        (SELECT COUNT(*) FROM private.wallet_ledger
         WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5'
           AND operation_type = 'WITHDRAWAL_HOLD'
           AND idempotency_key = 'payout-hold:bc5d66cd-5e18-4352-b7f8-ea99029758e0:rollback:hold-1') = 1,
        'E. WITHDRAWAL_HOLD ledger exists'
    );

    SELECT COUNT(*) INTO v_holds
    FROM private.cashier_player_payout_requests
    WHERE id = v_id AND status = 'pending';
    PERFORM pg_temp.np_assert(v_holds = 1, 'E. one canonical pending request');

    PERFORM pg_temp.np_assert(
        (SELECT available_balance FROM private.operational_accounts
         WHERE id = '27f26a0a-5831-47f2-8ddf-321a80317e6f') = v_op_before,
        'E. cashier op unchanged on hold'
    );

    v_dup := public.player_request_cashier_payout(50, 'rollback:hold-1');
    PERFORM pg_temp.np_assert(v_dup->>'is_duplicate' = 'true', 'F. duplicate hold');
    PERFORM pg_temp.np_assert((v_dup->>'id')::UUID = v_id, 'F. same request id');
    PERFORM pg_temp.np_assert(v_dup->>'code' = v_code, 'F. same code');
    PERFORM pg_temp.np_assert(
        (SELECT locked_balance FROM private.wallet_accounts
         WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5') = v_locked_after,
        'F. no second hold'
    );
    PERFORM pg_temp.np_assert(
        (SELECT COUNT(*) FROM private.wallet_ledger
         WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5'
           AND operation_type = 'WITHDRAWAL_HOLD'
           AND idempotency_key = 'payout-hold:bc5d66cd-5e18-4352-b7f8-ea99029758e0:rollback:hold-1') = 1,
        'F. no second wallet ledger'
    );

    PERFORM pg_temp.np_expect_error(
        $q$SELECT public.player_request_cashier_payout(51, 'rollback:hold-1')$q$,
        'IDEMPOTENCY_KEY_CONFLICT'
    );
    PERFORM pg_temp.np_assert(
        (SELECT locked_balance FROM private.wallet_accounts
         WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5') = v_locked_after,
        'G. conflict does not add hold'
    );

    CREATE TEMP TABLE np_hold ON COMMIT DROP AS
    SELECT v_code AS code, v_id AS id, v_avail_after AS avail_after_hold,
           v_locked_after AS locked_after_hold, v_op_before AS op_unchanged;
END;
$hold$;

-- ============================================================
-- H/I/J. CONFIRM + exact duplicate + different key already paid
-- ============================================================

SELECT pg_temp.np_set_jwt('de04491b-344d-4af1-81e8-bce3f53f21ac');

DO $confirm$
DECLARE
    v_code TEXT;
    v_id UUID;
    v_avail_before NUMERIC;
    v_locked_before NUMERIC;
    v_avail_after NUMERIC;
    v_locked_after NUMERIC;
    v_op_before NUMERIC;
    v_op_after NUMERIC;
    v_float NUMERIC;
    v_res jsonb;
    v_tid UUID;
    v_retry jsonb;
BEGIN
    SELECT code, id, avail_after_hold, locked_after_hold
    INTO v_code, v_id, v_avail_before, v_locked_before
    FROM np_hold;

    SELECT a.available_balance INTO v_op_before
    FROM private.operational_accounts AS a
    WHERE a.id = '27f26a0a-5831-47f2-8ddf-321a80317e6f';

    v_res := public.cashier_confirm_player_payout(v_code, 'rollback:pay-1');
    PERFORM pg_temp.np_assert(v_res->>'status' = 'paid', 'H. confirm paid');
    PERFORM pg_temp.np_assert(v_res->>'is_duplicate' = 'false', 'H. confirm not duplicate');
    v_tid := (v_res->>'transfer_id')::UUID;

    PERFORM pg_temp.np_assert(
        (SELECT status FROM private.cashier_player_payout_requests WHERE id = v_id) = 'paid',
        'H. pending → paid'
    );
    PERFORM pg_temp.np_assert(
        (SELECT paid_at IS NOT NULL FROM private.cashier_player_payout_requests WHERE id = v_id),
        'H. paid_at set'
    );
    PERFORM pg_temp.np_assert(
        (SELECT paid_by_legacy_cashier_id FROM private.cashier_player_payout_requests WHERE id = v_id)
        = '0393d651-e13a-4f04-ba7d-352f63bc62a5',
        'H. paid cashier identity stored'
    );

    SELECT a.available_balance, a.locked_balance
    INTO v_avail_after, v_locked_after
    FROM private.wallet_accounts AS a
    WHERE a.wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5';

    PERFORM pg_temp.np_assert(v_locked_after = v_locked_before - 50, 'H. locked decreases');
    PERFORM pg_temp.np_assert(v_avail_after = v_avail_before, 'H. available not debited again');

    SELECT a.available_balance INTO v_op_after
    FROM private.operational_accounts AS a
    WHERE a.id = '27f26a0a-5831-47f2-8ddf-321a80317e6f';
    PERFORM pg_temp.np_assert(v_op_after = v_op_before + 50, 'H. cashier op +50');

    SELECT c.float_balance INTO v_float
    FROM public.cashiers AS c
    WHERE c.id = '0393d651-e13a-4f04-ba7d-352f63bc62a5';
    PERFORM pg_temp.np_assert(v_float = v_op_after, 'H. legacy float mirrors canonical');

    PERFORM pg_temp.np_assert(
        (SELECT transfer_type FROM private.operational_transfers WHERE id = v_tid)
        = 'PLAYER_TO_CASHIER',
        'H. PLAYER_TO_CASHIER'
    );
    PERFORM pg_temp.np_assert(
        (SELECT COUNT(*) FROM private.wallet_ledger
         WHERE reference_id = v_tid::TEXT
           AND operation_type = 'WITHDRAWAL_COMPLETE') = 1,
        'H. WITHDRAWAL_COMPLETE ledger'
    );

    v_retry := public.cashier_confirm_player_payout(v_code, 'rollback:pay-1');
    PERFORM pg_temp.np_assert(v_retry->>'is_duplicate' = 'true', 'I. same confirm key duplicate');
    PERFORM pg_temp.np_assert((v_retry->>'transfer_id')::UUID = v_tid, 'I. retry same transfer');

    PERFORM pg_temp.np_expect_error(
        format(
            'SELECT public.cashier_confirm_player_payout(%L, %L)',
            v_code,
            'rollback:pay-other-key'
        ),
        'PAYOUT_ALREADY_PAID'
    );

    CREATE TEMP TABLE np_pay ON COMMIT DROP AS
    SELECT v_code AS code, v_tid AS transfer_id, v_id AS payout_id,
           v_op_after AS op_after, v_avail_after AS avail_after;
END;
$confirm$;

-- ============================================================
-- K/L. CANCEL → WITHDRAWAL_RELEASE + duplicate
-- ============================================================

DO $cancel$
DECLARE
    v_hold jsonb;
    v_cancel jsonb;
    v_dup jsonb;
    v_id UUID;
    v_avail_before NUMERIC;
    v_locked_before NUMERIC;
    v_avail_after NUMERIC;
    v_locked_after NUMERIC;
    v_op NUMERIC;
    v_rel BIGINT;
BEGIN
    SELECT available_balance, locked_balance
    INTO v_avail_before, v_locked_before
    FROM private.wallet_accounts
    WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5';

    SELECT available_balance INTO v_op
    FROM private.operational_accounts
    WHERE id = '27f26a0a-5831-47f2-8ddf-321a80317e6f';

    PERFORM pg_temp.np_set_jwt('bc5d66cd-5e18-4352-b7f8-ea99029758e0');
    v_hold := public.player_request_cashier_payout(20, 'rollback:hold-cancel');
    v_id := (v_hold->>'id')::UUID;

    v_cancel := public.player_cancel_cashier_payout(v_id, 'rollback:cancel-1');
    PERFORM pg_temp.np_assert(v_cancel->>'status' = 'cancelled', 'K. cancelled');
    PERFORM pg_temp.np_assert(v_cancel->>'is_duplicate' = 'false', 'K. cancel not duplicate');
    PERFORM pg_temp.np_assert(
        (SELECT cancelled_at IS NOT NULL FROM private.cashier_player_payout_requests WHERE id = v_id),
        'K. cancelled_at set'
    );

    SELECT available_balance, locked_balance
    INTO v_avail_after, v_locked_after
    FROM private.wallet_accounts
    WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5';
    PERFORM pg_temp.np_assert(v_avail_after = v_avail_before, 'K. available restored');
    PERFORM pg_temp.np_assert(v_locked_after = v_locked_before, 'K. locked restored');

    SELECT COUNT(*) INTO v_rel
    FROM private.wallet_ledger
    WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5'
      AND operation_type = 'WITHDRAWAL_RELEASE'
      AND idempotency_key = 'payout-release:' || v_id::TEXT;
    PERFORM pg_temp.np_assert(v_rel = 1, 'K. exactly one WITHDRAWAL_RELEASE');

    PERFORM pg_temp.np_assert(
        (SELECT available_balance FROM private.operational_accounts
         WHERE id = '27f26a0a-5831-47f2-8ddf-321a80317e6f') = v_op,
        'K. cashier op unchanged on cancel'
    );

    v_dup := public.player_cancel_cashier_payout(v_id, 'rollback:cancel-1');
    PERFORM pg_temp.np_assert(v_dup->>'is_duplicate' = 'true', 'L. cancel duplicate');
    PERFORM pg_temp.np_assert((v_dup->>'id')::UUID = v_id, 'L. same payout id');
    PERFORM pg_temp.np_assert(
        (SELECT COUNT(*) FROM private.wallet_ledger
         WHERE idempotency_key = 'payout-release:' || v_id::TEXT
           AND operation_type = 'WITHDRAWAL_RELEASE') = 1,
        'L. no second release'
    );

    PERFORM pg_temp.np_set_jwt('de04491b-344d-4af1-81e8-bce3f53f21ac');
    PERFORM pg_temp.np_expect_error(
        format(
            'SELECT public.cashier_confirm_player_payout(%L, %L)',
            v_hold->>'code',
            'rollback:pay-cancelled'
        ),
        'PAYOUT_CANCELLED'
    );

    CREATE TEMP TABLE np_cancel ON COMMIT DROP AS
    SELECT v_id AS id, v_hold->>'code' AS code;
END;
$cancel$;

-- ============================================================
-- M/N. EXPIRY → WITHDRAWAL_RELEASE; expired cannot be paid
-- ============================================================

DO $exp$
DECLARE
    v_hold jsonb;
    v_id UUID;
    v_exp jsonb;
    v_dup jsonb;
    v_lazy jsonb;
    v_hold2 jsonb;
    v_id2 UUID;
    v_avail_before NUMERIC;
    v_op NUMERIC;
    v_rel BIGINT;
BEGIN
    SELECT available_balance INTO v_avail_before
    FROM private.wallet_accounts
    WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5';
    SELECT available_balance INTO v_op
    FROM private.operational_accounts
    WHERE id = '27f26a0a-5831-47f2-8ddf-321a80317e6f';

    PERFORM pg_temp.np_set_jwt('bc5d66cd-5e18-4352-b7f8-ea99029758e0');
    v_hold := public.player_request_cashier_payout(15, 'rollback:hold-exp');
    v_id := (v_hold->>'id')::UUID;

    UPDATE private.cashier_player_payout_requests
    SET expires_at = now() - INTERVAL '1 hour'
    WHERE id = v_id;

    v_exp := private.expire_cashier_player_payout(v_id);
    PERFORM pg_temp.np_assert(v_exp->>'status' = 'expired', 'M. status expired');
    PERFORM pg_temp.np_assert(v_exp->>'is_duplicate' = 'false', 'M. expire not duplicate');
    PERFORM pg_temp.np_assert(
        (SELECT available_balance FROM private.wallet_accounts
         WHERE wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5') = v_avail_before,
        'M. available restored'
    );

    SELECT COUNT(*) INTO v_rel
    FROM private.wallet_ledger
    WHERE operation_type = 'WITHDRAWAL_RELEASE'
      AND idempotency_key = 'payout-release:' || v_id::TEXT;
    PERFORM pg_temp.np_assert(v_rel = 1, 'M. exactly one WITHDRAWAL_RELEASE');

    v_dup := private.expire_cashier_player_payout(v_id);
    PERFORM pg_temp.np_assert(v_dup->>'is_duplicate' = 'true', 'M. expire idempotent');
    PERFORM pg_temp.np_assert(
        (SELECT COUNT(*) FROM private.wallet_ledger
         WHERE idempotency_key = 'payout-release:' || v_id::TEXT) = 1,
        'M. no second release on expire retry'
    );

    PERFORM pg_temp.np_set_jwt('de04491b-344d-4af1-81e8-bce3f53f21ac');
    PERFORM pg_temp.np_expect_error(
        format(
            'SELECT public.cashier_confirm_player_payout(%L, %L)',
            v_hold->>'code',
            'rollback:pay-exp'
        ),
        'PAYOUT_EXPIRED'
    );
    PERFORM pg_temp.np_assert(
        (SELECT available_balance FROM private.operational_accounts
         WHERE id = '27f26a0a-5831-47f2-8ddf-321a80317e6f') = v_op,
        'N. expired payout cannot credit cashier'
    );
    PERFORM pg_temp.np_assert(
        (SELECT COUNT(*) FROM private.operational_transfers
         WHERE player_wallet_id = '3ea1677a-d664-47c3-b019-0635b643d6e5'
           AND transfer_type = 'PLAYER_TO_CASHIER') = 1,
        'N. still only the earlier paid transfer'
    );

    -- Lazy confirm path: pending + past due must RETURN (not RAISE) after release.
    PERFORM pg_temp.np_set_jwt('bc5d66cd-5e18-4352-b7f8-ea99029758e0');
    v_hold2 := public.player_request_cashier_payout(12, 'rollback:hold-lazy-exp');
    v_id2 := (v_hold2->>'id')::UUID;
    UPDATE private.cashier_player_payout_requests
    SET expires_at = now() - INTERVAL '1 hour'
    WHERE id = v_id2;

    PERFORM pg_temp.np_set_jwt('de04491b-344d-4af1-81e8-bce3f53f21ac');
    v_lazy := public.cashier_confirm_player_payout(v_hold2->>'code', 'rollback:pay-lazy-exp');
    PERFORM pg_temp.np_assert(v_lazy->>'ok' = 'false', 'N. lazy expire returns not raises');
    PERFORM pg_temp.np_assert(v_lazy->>'error' = 'PAYOUT_EXPIRED', 'N. lazy PAYOUT_EXPIRED');
    PERFORM pg_temp.np_assert(
        (SELECT status FROM private.cashier_player_payout_requests WHERE id = v_id2) = 'expired',
        'N. lazy confirm expired the request'
    );
    PERFORM pg_temp.np_assert(
        (SELECT COUNT(*) FROM private.wallet_ledger
         WHERE idempotency_key = 'payout-release:' || v_id2::TEXT
           AND operation_type = 'WITHDRAWAL_RELEASE') = 1,
        'N. lazy confirm released once'
    );
    PERFORM pg_temp.np_assert(
        (SELECT available_balance FROM private.operational_accounts
         WHERE id = '27f26a0a-5831-47f2-8ddf-321a80317e6f') = v_op,
        'N. lazy expire did not pay cashier'
    );
END;
$exp$;

-- ============================================================
-- O. cancelled cannot be paid (already asserted in K; re-check)
-- ============================================================

SELECT pg_temp.np_set_jwt('de04491b-344d-4af1-81e8-bce3f53f21ac');
SELECT pg_temp.np_expect_error(
    format(
        'SELECT public.cashier_confirm_player_payout(%L, %L)',
        (SELECT code FROM np_cancel),
        'rollback:pay-cancel-2'
    ),
    'PAYOUT_CANCELLED'
);

-- ============================================================
-- P. insufficient locked consistency
-- ============================================================

DO $bad$
DECLARE
    v_hold jsonb;
BEGIN
    PERFORM pg_temp.np_set_jwt('bc5d66cd-5e18-4352-b7f8-ea99029758e0');
    v_hold := public.player_request_cashier_payout(10, 'rollback:hold-unlock');
    PERFORM e.ledger_id
    FROM private.apply_wallet_entry(
        '3ea1677a-d664-47c3-b019-0635b643d6e5'::UUID,
        10,
        -10,
        'WITHDRAWAL_RELEASE',
        'withdrawal',
        'rollback:unlock-hold',
        'rollback_test',
        v_hold->>'id',
        'system',
        NULL,
        '{}'::jsonb
    ) AS e;
    PERFORM pg_temp.np_set_jwt('de04491b-344d-4af1-81e8-bce3f53f21ac');
    PERFORM pg_temp.np_expect_error(
        format(
            'SELECT public.cashier_confirm_player_payout(%L, %L)',
            v_hold->>'code',
            'rollback:pay-unlock'
        ),
        'INSUFFICIENT_LOCKED_BALANCE'
    );
END;
$bad$;

-- ============================================================
-- Q/R. no second cashier credit / wallet debit
-- ============================================================

SELECT pg_temp.np_assert(
    (SELECT COUNT(*) FROM private.operational_transfers
     WHERE id = (SELECT transfer_id FROM np_pay)) = 1,
    'Q. no second PLAYER_TO_CASHIER transfer'
);
SELECT pg_temp.np_assert(
    (SELECT COUNT(*) FROM private.wallet_ledger
     WHERE reference_id = (SELECT transfer_id::TEXT FROM np_pay)
       AND operation_type = 'WITHDRAWAL_COMPLETE') = 1,
    'R. no second WITHDRAWAL_COMPLETE'
);
SELECT pg_temp.np_assert(
    (SELECT available_balance FROM private.operational_accounts
     WHERE id = '27f26a0a-5831-47f2-8ddf-321a80317e6f') = (SELECT op_after FROM np_pay),
    'Q. no second cashier credit'
);

-- Wrong/nonexistent code
SELECT pg_temp.np_expect_error(
    $q$SELECT public.cashier_confirm_player_payout('ffffffffffffffff', 'rollback:missing')$q$,
    'PAYOUT_NOT_FOUND'
);

-- ============================================================
-- S. ROLLBACK restores balances, ledgers, requests, audit,
--    and migration_state.
-- ============================================================
ROLLBACK;
