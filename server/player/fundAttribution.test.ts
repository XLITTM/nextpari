import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { handleCashierControlRequest } from '../cashier/cashierControlHttp.js';
import { handleManagerControlRequest } from '../manager/managerControlHttp.js';
import { handleOwnerControlRequest } from '../owner/ownerControlHttp.js';
import type { OwnerRpcPort } from '../owner/ownerRpc.js';
import { handleSecurityControlRequest } from '../security/securityControlHttp.js';
import {
  SECURITY_ALLOWED_RPCS,
  SECURITY_DENIED_RPCS,
  type SecurityRpcPort,
} from '../security/securityRpc.js';
import { staffError } from '../staff/errors.js';
import { CASHIER_ACCESS_COOKIE, CASHIER_REFRESH_COOKIE } from '../staff/cashierCookies.js';
import { MANAGER_ACCESS_COOKIE, MANAGER_REFRESH_COOKIE } from '../staff/managerCookies.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from '../staff/ownerCookies.js';
import { SECURITY_ACCESS_COOKIE, SECURITY_REFRESH_COOKIE } from '../staff/securityCookies.js';
import { PLAYER_ACCESS_COOKIE, PLAYER_REFRESH_COOKIE } from './playerCookies.js';
import { handlePlayerWithdrawalsRequest } from './playerWithdrawalHttp.js';
import type { PlayerGameGatewayPorts } from './playerGamesService.js';
import {
  PLAYER_REJECT_PROPORTION_NOTICE,
  PLAYER_REVIEW_NOTICE,
  amountToMinor,
  allocateLargestRemainder,
  allocateLargestRemainderExact,
  applyHoldParts,
  classifyCashWithdrawal,
  consumeAvailable,
  creditFromSnapshot,
  decideAttributionLedgerReplay,
  reserveWithdrawal,
  type AttributionLedgerIdentity,
  type AttributionWeight,
} from './fundAttributionMath.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const sql = readFileSync(
  join(root, 'supabase/migrations/20260918190000_cashier_fund_attribution_review.sql'),
  'utf8',
);
const REVIEW_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const PLAYER_ACCESS = 'player-access-token';
const PLAYER_REFRESH = 'player-refresh-token';
const SECURITY_ACCESS = 'security-access-token';
const SECURITY_REFRESH = 'security-refresh-token';
const OWNER_ACCESS = 'owner-access-token';
const OWNER_REFRESH = 'owner-refresh-token';
const MANAGER_ACCESS = 'manager-access-token';
const MANAGER_REFRESH = 'manager-refresh-token';
const CASHIER_ACCESS = 'cashier-access-token';
const CASHIER_REFRESH = 'cashier-refresh-token';

const CASHIER_A = '11111111-1111-4111-8111-111111111111';
const CASHIER_B = '22222222-2222-4222-8222-222222222222';

function bucket(kind: AttributionWeight['sourceKind'], cashierId: string | null, minor: number): AttributionWeight {
  return { sourceKind: kind, sourceCashierId: cashierId, weightMinor: minor };
}

function byCashier(parts: Array<{ sourceCashierId: string | null; allocatedMinor: number }>, cashierId: string): number {
  return parts.find((part) => part.sourceCashierId === cashierId)?.allocatedMinor ?? 0;
}

function playerPorts(payload?: Record<string, unknown>) {
  const rpcs: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const ports: PlayerGameGatewayPorts & { rpcs: typeof rpcs } = {
    rpcs,
    async signInWithPassword() {
      throw staffError('AUTH_FAILED', 401);
    },
    async signUp() {
      throw staffError('AUTH_FAILED', 401);
    },
    async refreshSession() {
      return { accessToken: PLAYER_ACCESS, refreshToken: PLAYER_REFRESH };
    },
    async getAuthUser() {
      return { id: '11111111-2222-3333-4444-555555555555', email: 'player@nextpari.test' };
    },
    async ensurePlayerAccount() {
      return { walletId: 'w-active', publicId: '110790', legacyBalance: 50, migrationState: 'active' };
    },
    async loadOwnWallet() {
      return { balance: 50, currency: 'TMTM', status: 'active', publicId: '110790' };
    },
    async savePlayerProfile() {},
    gameRpc() {
      return {
        async invoke(name: string, args?: Record<string, unknown>) {
          rpcs.push({ name, args });
          return payload ?? { ok: true, rows: [{ id: 'dest-token', city: 'Мары', label: 'касса' }] };
        },
      };
    },
  };
  return ports;
}

function securityRpc() {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const rpcFactory = (): SecurityRpcPort => ({
    async invoke(name, args) {
      calls.push({ name, args });
      return { ok: true, rpc: name, args: args ?? null };
    },
  });
  return { calls, rpcFactory };
}

function ownerRpc() {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const rpcFactory = (): OwnerRpcPort => ({
    async invoke(name, args) {
      calls.push({ name, args });
      return { ok: true, rpc: name, args: args ?? null };
    },
  });
  return { calls, rpcFactory };
}

describe('fund attribution math A-M', () => {
  it('A. different cashiers: clean 10 at B, review entire 500 and 2010 at B, no split', () => {
    const a = 2000_00;
    const b = 10_00;
    assert.equal(classifyCashWithdrawal({
      requestedMinor: 10_00,
      selectedCashierAvailableMinor: b,
      state: 'active',
    }), 'clean');
    assert.equal(classifyCashWithdrawal({
      requestedMinor: 500_00,
      selectedCashierAvailableMinor: b,
      state: 'active',
    }), 'review');
    assert.equal(classifyCashWithdrawal({
      requestedMinor: 2010_00,
      selectedCashierAvailableMinor: b,
      state: 'active',
    }), 'review');
    const reserved = reserveWithdrawal({
      buckets: [
        bucket('cashier', CASHIER_A, a),
        bucket('cashier', CASHIER_B, b),
      ],
      requestedMinor: 500_00,
      selectedCashierId: CASHIER_B,
    });
    assert.equal(byCashier(reserved, CASHIER_B), 10_00);
    assert.equal(byCashier(reserved, CASHIER_A), 490_00);
    assert.equal(reserved.reduce((sum, part) => sum + part.allocatedMinor, 0), 500_00);
    assert.equal(sql.includes('split payout'), false);
    assert.equal(sql.includes('first free'), false);
    assert.match(sql, /v_need_review := \(v_minor > COALESCE\(v_selected_avail, 0\)\)/);
    assert.match(sql, /v_issue_code := FALSE/);
  });

  it('B. REQUIRED: A 2000 lost, B 500 wins 10000, B owns 10000, clean B withdrawal', () => {
    let a = 2000_00;
    let bAvail = 0;
    const lost = consumeAvailable([bucket('cashier', CASHIER_A, a)], 2000_00);
    assert.equal(byCashier(lost, CASHIER_A), 2000_00);
    a -= byCashier(lost, CASHIER_A);
    assert.equal(a, 0);

    bAvail = 500_00;
    const stakeB = consumeAvailable([
      bucket('cashier', CASHIER_A, a),
      bucket('cashier', CASHIER_B, bAvail),
    ], 500_00);
    assert.equal(byCashier(stakeB, CASHIER_B), 500_00);
    assert.equal(byCashier(stakeB, CASHIER_A), 0);
    bAvail -= 500_00;

    const credited = creditFromSnapshot(stakeB, 10000_00);
    assert.equal(byCashier(credited, CASHIER_B), 10000_00);
    assert.equal(byCashier(credited, CASHIER_A), 0);
    a += byCashier(credited, CASHIER_A);
    bAvail += byCashier(credited, CASHIER_B);
    assert.equal(a, 0);
    assert.equal(bAvail, 10000_00);
    assert.equal(classifyCashWithdrawal({
      requestedMinor: 10000_00,
      selectedCashierAvailableMinor: bAvail,
      state: 'active',
    }), 'clean');
    assert.match(sql, /SPORTS_BET/);
    assert.match(sql, /SPORTS_WIN/);
    assert.match(sql, /attribution_credit_from_snapshot/);
    assert.match(sql, /player_stake_attribution/);
    assert.equal(sql.includes('lifetime deposit'), false);
  });

  it('B-sports. A 2000 lost, B 500 settles 10000: A stays 0, B owns 10000', () => {
    let a = 2000_00;
    let bAvail = 0;
    const lost = consumeAvailable([bucket('cashier', CASHIER_A, a)], 2000_00);
    a -= byCashier(lost, CASHIER_A);
    assert.equal(a, 0);

    bAvail = 500_00;
    const stakeB = consumeAvailable([
      bucket('cashier', CASHIER_A, a),
      bucket('cashier', CASHIER_B, bAvail),
    ], 500_00);
    assert.equal(byCashier(stakeB, CASHIER_B), 500_00);
    assert.equal(byCashier(stakeB, CASHIER_A), 0);

    const credited = creditFromSnapshot(stakeB, 10000_00);
    a += byCashier(credited, CASHIER_A);
    bAvail = byCashier(credited, CASHIER_B);
    assert.equal(a, 0);
    assert.equal(bAvail, 10000_00);
    assert.match(sql, /IF v_op = 'SPORTS_BET'/);
    assert.match(sql, /IF v_op IN \('SPORTS_WIN', 'SPORTS_REFUND'\)/);
    assert.match(sql, /wallet_ledger_native_sports_operation/);
    assert.match(sql, /Native sports settlement\/refund credits the ORIGINAL stake snapshot/);
    assert.match(sql, /attribution_credit_from_snapshot/);
  });

  it('C. mixed stake 80/20 inherits profit mix', () => {
    const snapshot = consumeAvailable([
      bucket('cashier', CASHIER_A, 800_00),
      bucket('cashier', CASHIER_B, 200_00),
    ], 1000_00);
    assert.equal(byCashier(snapshot, CASHIER_A), 800_00);
    assert.equal(byCashier(snapshot, CASHIER_B), 200_00);
    const win = creditFromSnapshot(snapshot, 10000_00);
    assert.equal(byCashier(win, CASHIER_A), 8000_00);
    assert.equal(byCashier(win, CASHIER_B), 2000_00);
    assert.match(sql, /SPORTS_WIN/);
  });

  it('D. refund restores the original mix', () => {
    const snapshot = consumeAvailable([
      bucket('cashier', CASHIER_A, 800_00),
      bucket('cashier', CASHIER_B, 200_00),
    ], 1000_00);
    const refund = creditFromSnapshot(snapshot, 1000_00);
    assert.equal(byCashier(refund, CASHIER_A), 800_00);
    assert.equal(byCashier(refund, CASHIER_B), 200_00);
    assert.match(sql, /CASINO_REFUND/);
    assert.match(sql, /SPORTS_REFUND/);
  });

  it('E. cash withdrawal SQL uses active wallet, never profiles.wallet_id', () => {
    const payoutFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.player_request_cashier_payout'),
      sql.indexOf('CREATE OR REPLACE FUNCTION private.withdrawal_public_json'),
    );
    assert.match(payoutFn, /withdrawal_lock_player_wallet/);
    assert.match(payoutFn, /CASH withdrawal MUST use the active wallet, never profiles\.wallet_id/);
    assert.equal(/FROM\s+public\.profiles/.test(payoutFn), false);
    const createFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.player_create_withdrawal'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.cashier_confirm_player_payout'),
    );
    assert.match(createFn, /withdrawal_lock_player_wallet/);
    assert.equal(/FROM\s+public\.profiles/.test(createFn), false);
  });

  it('F. Security/Owner may review; Manager/Cashier/Player cannot; Security cannot payout', () => {
    assert.equal(SECURITY_ALLOWED_RPCS.includes('security_approve_withdrawal_review'), true);
    assert.equal(SECURITY_ALLOWED_RPCS.includes('security_reject_withdrawal_review'), true);
    assert.equal(SECURITY_DENIED_RPCS.includes('cashier_confirm_player_payout'), true);
    assert.equal(SECURITY_DENIED_RPCS.includes('cashier_lookup_player_payout'), true);
    assert.match(sql, /IF p_actor_role NOT IN \('security', 'owner'\) THEN RAISE EXCEPTION 'SECURITY_REQUIRED'/);
    assert.match(sql, /PERFORM private\.get_current_security_context\(\)/);
    assert.match(sql, /PERFORM private\.get_current_owner_context\(\)/);
    assert.equal(sql.includes('get_current_manager_context'), false);
    const decide = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION private.withdrawal_review_decide'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.security_withdrawal_review_summary'),
    );
    assert.equal(decide.includes('get_current_cashier_context'), false);
    assert.match(sql, /Does not complete payout or move money/);
  });

  it('G. player and cashier public JSON never expose attribution', () => {
    const publicJson = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION private.withdrawal_public_json'),
      sql.indexOf('DROP FUNCTION IF EXISTS public.player_create_withdrawal'),
    );
    assert.equal(publicJson.includes('attribution_snapshot'), false);
    assert.equal(publicJson.includes('cross_cashier_amount'), false);
    assert.equal(publicJson.includes('source_kind'), false);
    assert.equal(publicJson.includes('selected_cashier_amount'), false);
    const lookupReturn = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.cashier_lookup_player_payout"),
      sql.indexOf('CREATE OR REPLACE FUNCTION private.withdrawal_review_staff_json'),
    );
    assert.match(lookupReturn, /v_status := 'unavailable'/);
    assert.match(lookupReturn, /jsonb_build_object\('ok', true, 'player_public_id'/);
    assert.equal(lookupReturn.includes('cross_cashier_amount'), false);
    assert.equal(lookupReturn.includes('attribution_snapshot'), false);
    assert.equal(lookupReturn.includes('source_kind'), false);
  });

  it('H. rejection releases HOLD, restores attribution, exact Russian player text', () => {
    assert.equal(
      PLAYER_REJECT_PROPORTION_NOTICE,
      'Вывод отклонён. Сумма вывода должна быть пропорциональна сумме пополнений через выбранную кассу. Для дополнительной информации обратитесь в поддержку.',
    );
    assert.match(sql, /private\.player_cashier_proportion_reject_notice/);
    assert.match(sql, /release_cashier_player_payout_hold/);
    assert.match(sql, /player_notice_code = 'rejected_cashier_proportion'/);
    assert.match(sql, /attribution_release_hold/);
  });

  it('I. approval does not move money and only selected cashier may pay', () => {
    const decide = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION private.withdrawal_review_decide'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.security_withdrawal_review_summary'),
    );
    assert.equal(decide.includes('apply_wallet_entry'), false);
    assert.equal(decide.includes('apply_operational_transfer'), false);
    assert.match(decide, /issue_cashier_payout_code/);
    assert.match(sql, /selected_legacy_cashier_id IS DISTINCT FROM v_ctx\.legacy_cashier_id/);
    assert.match(sql, /RAISE EXCEPTION 'PAYOUT_UNAVAILABLE'/);
  });

  it('J. currency scale: TMT 2dp, UZS 0dp, no silent rounding', () => {
    assert.equal(amountToMinor('12.34', 2), 1234);
    assert.equal(amountToMinor('1000', 0), 1000);
    assert.throws(() => amountToMinor('1.001', 2), /CURRENCY_AMOUNT_SCALE_INVALID/);
    assert.throws(() => amountToMinor('10.5', 0), /CURRENCY_AMOUNT_SCALE_INVALID/);
    assert.match(sql, /require_currency_amount_scale/);
    assert.match(sql, /currency_amount_to_minor/);
    assert.equal(sql.includes('silently round'), false);
  });

  it('K. attribution ledger idempotency conflicts on same key + different payload', () => {
    assert.match(sql, /ATTRIBUTION_IDEMPOTENCY_CONFLICT/);
    assert.match(sql, /player_fund_attribution_ledger_key_uidx/);
    assert.match(sql, /owner_require_idempotency_key/);
    const deltaFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION private.apply_fund_attribution_delta'),
      sql.indexOf('CREATE OR REPLACE FUNCTION private.mark_fund_attribution_inconsistent'),
    );
    assert.match(deltaFn, /l\.wallet_id IS NOT DISTINCT FROM p_wallet_id/);
    assert.match(deltaFn, /l\.currency IS NOT DISTINCT FROM p_currency/);
    assert.match(deltaFn, /l\.source_kind IS NOT DISTINCT FROM p_source_kind/);
    assert.match(deltaFn, /l\.source_cashier_id IS NOT DISTINCT FROM p_source_cashier_id/);
    assert.match(deltaFn, /l\.available_delta_minor IS NOT DISTINCT FROM p_available_delta/);
    assert.match(deltaFn, /l\.reserved_delta_minor IS NOT DISTINCT FROM p_reserved_delta/);
    assert.match(deltaFn, /l\.reference_type IS NOT DISTINCT FROM p_reference_type/);
    assert.match(deltaFn, /l\.reference_id IS NOT DISTINCT FROM p_reference_id/);
    assert.match(deltaFn, /l\.wallet_ledger_entry_key IS NOT DISTINCT FROM p_wallet_ledger_entry_key/);
    assert.match(deltaFn, /Metadata is informational and is not part of this bind/);
    assert.equal(deltaFn.includes('UPDATE private.player_fund_attribution_ledger'), false);
  });

  it('L. legacy funds are not assigned to last cashier; withdrawal needs review', () => {
    assert.match(sql, /'legacy'/);
    assert.match(sql, /ensure_fund_attribution_initialized/);
    assert.equal(sql.includes('last cashier'), false);
    assert.equal(classifyCashWithdrawal({
      requestedMinor: 1000_00,
      selectedCashierAvailableMinor: 0,
      state: 'active',
    }), 'review');
  });

  it('M. reconciliation is read-only and mismatch forces review, never auto-patches money', () => {
    const recon = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION private.fund_attribution_reconciliation'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.owner_fund_attribution_reconciliation'),
    );
    assert.equal(recon.includes('UPDATE private.wallet_accounts'), false);
    assert.equal(recon.includes('apply_wallet_entry'), false);
    assert.match(sql, /mark_fund_attribution_inconsistent/);
    assert.equal(classifyCashWithdrawal({
      requestedMinor: 10_00,
      selectedCashierAvailableMinor: 10_00,
      state: 'inconsistent',
    }), 'review');
  });

  it('Hamilton allocation is deterministic and remainder is assigned stably', () => {
    const parts = [
      bucket('cashier', CASHIER_A, 2),
      bucket('cashier', CASHIER_B, 1),
    ];
    const first = allocateLargestRemainder(parts, 100);
    const second = allocateLargestRemainder(parts, 100);
    assert.deepEqual(first, second);
    assert.equal(first.reduce((sum, part) => sum + part.allocatedMinor, 0), 100);
  });

  it('stake 500 from 800/200 consumes 400/100', () => {
    const consumed = consumeAvailable([
      bucket('cashier', CASHIER_A, 800_00),
      bucket('cashier', CASHIER_B, 200_00),
    ], 500_00);
    assert.equal(byCashier(consumed, CASHIER_A), 400_00);
    assert.equal(byCashier(consumed, CASHIER_B), 100_00);
  });
});

describe('attribution ledger entry_key payload binding', () => {
  const stored: AttributionLedgerIdentity = {
    entryKey: 'attr:entry-1:cashier',
    walletId: 'wallet-1',
    currency: 'TMTM',
    sourceKind: 'cashier',
    sourceCashierId: CASHIER_A,
    availableDeltaMinor: 4000n,
    reservedDeltaMinor: 0n,
    referenceType: 'sports_bet',
    referenceId: 'bet-1',
    walletLedgerEntryKey: 'sports-bet:bet-1',
  };

  it('1. same entry key and complete immutable payload is an idempotent replay', () => {
    assert.equal(decideAttributionLedgerReplay(stored, { ...stored }), 'replay');
  });

  it('2. same entry key with different available delta is a conflict', () => {
    assert.equal(
      decideAttributionLedgerReplay(stored, { ...stored, availableDeltaMinor: 5000n }),
      'conflict',
    );
  });

  it('3. same entry key with different reserved delta is a conflict', () => {
    assert.equal(
      decideAttributionLedgerReplay(stored, { ...stored, reservedDeltaMinor: 4000n }),
      'conflict',
    );
  });

  it('4. same entry key with different source cashier is a conflict', () => {
    assert.equal(
      decideAttributionLedgerReplay(stored, { ...stored, sourceCashierId: CASHIER_B }),
      'conflict',
    );
  });

  it('5. same entry key with different reference_type is a conflict', () => {
    assert.equal(
      decideAttributionLedgerReplay(stored, { ...stored, referenceType: 'casino_round' }),
      'conflict',
    );
  });

  it('6. same entry key with different reference_id is a conflict', () => {
    assert.equal(
      decideAttributionLedgerReplay(stored, { ...stored, referenceId: 'bet-2' }),
      'conflict',
    );
  });

  it('7. same entry key with different wallet_ledger_entry_key is a conflict', () => {
    assert.equal(
      decideAttributionLedgerReplay(stored, { ...stored, walletLedgerEntryKey: 'sports-bet:bet-2' }),
      'conflict',
    );
  });
});

describe('fund attribution SQL contract (not executed)', () => {
  it('creates internal tables, revokes browser access, enforcement defaults OFF', () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS private\.player_fund_attribution/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS private\.player_fund_attribution_ledger/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS private\.player_stake_attribution/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS private\.cashier_payout_destinations/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS private\.withdrawal_attribution_reviews/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS private\.withdrawal_attribution_review_audit/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS private\.player_fund_attribution_state/);
    assert.match(sql, /enforcement_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(sql, /VALUES \(1, FALSE\)/);
    assert.equal(sql.includes('enforcement_enabled = TRUE'), false);
    assert.equal(sql.includes('agent02'), false);
    for (const table of [
      'private.player_fund_attribution',
      'private.player_fund_attribution_ledger',
      'private.player_stake_attribution',
      'private.withdrawal_attribution_reviews',
      'private.cashier_payout_destinations',
    ]) {
      assert.match(sql, new RegExp(`REVOKE ALL ON TABLE ${table.replace('.', '\\.')} FROM PUBLIC`));
      assert.match(sql, new RegExp(`REVOKE ALL ON TABLE ${table.replace('.', '\\.')} FROM anon, authenticated`));
    }
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION private.apply_wallet_entry'), false);
    assert.equal(sql.includes('supabase db push'), false);
  });

  it('does not trust free-text city/point as financial authorization when enforcement is on', () => {
    assert.match(sql, /resolve_live_payout_destination/);
    assert.match(sql, /PAYOUT_DESTINATION_REQUIRED/);
    assert.match(sql, /migration_state = 'active'/);
    assert.match(sql, /public_token/);
    assert.equal(sql.includes('INSERT INTO private.cashier_payout_destinations'), false);
  });

  it('dual-writes from wallet_ledger trigger without rewriting apply_wallet_entry', () => {
    assert.match(sql, /CREATE TRIGGER wallet_ledger_fund_attribution/);
    assert.match(sql, /AFTER INSERT ON private\.wallet_ledger/);
    assert.match(sql, /CASH_DEPOSIT/);
    assert.match(sql, /TREASURY_FUNDING/);
    assert.match(sql, /CASINO_BET/);
    assert.match(sql, /CASINO_WIN/);
    assert.match(sql, /SPORTS_BET/);
    assert.match(sql, /SPORTS_WIN/);
    assert.match(sql, /SPORTS_REFUND/);
    assert.match(sql, /uncorrelated_credit/);
    assert.match(sql, /Do not guess latest cashier/);
  });

  it('player notices are exact and PIN is withheld during review', () => {
    assert.equal(PLAYER_REVIEW_NOTICE, 'Заявка на вывод находится на рассмотрении.');
    assert.match(sql, /v_notice := 'under_review'/);
    assert.match(sql, /v_code := NULL/);
  });

  it('enforcement OFF cash uses nullable scalars, not an unassigned RECORD', () => {
    const createFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.player_create_withdrawal'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.cashier_confirm_player_payout'),
    );
    assert.match(createFn, /v_dest_id UUID := NULL/);
    assert.match(createFn, /v_dest_cashier UUID := NULL/);
    assert.equal(createFn.includes('v_destination RECORD'), false);
    assert.equal(createFn.includes('v_destination.legacy_cashier_id'), false);
    assert.equal(createFn.includes('v_destination.destination_id'), false);
    assert.match(createFn, /Enforcement OFF: preserve legacy city\/point cash flow/);
    assert.match(createFn, /CASH_PICKUP_REQUIRED/);
    assert.match(createFn, /player_request_cashier_payout\(\s*\n\s*v_amount, v_key, v_dest_cashier, v_dest_id, v_issue_code/);
    assert.match(sql, /enforcement_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
  });

  it('stores minor units as NUMERIC(40, 0) and Hamilton multiplies without BIGINT', () => {
    assert.match(sql, /available_minor NUMERIC\(40, 0\)/);
    assert.match(sql, /reserved_minor NUMERIC\(40, 0\)/);
    assert.match(sql, /stake_minor NUMERIC\(40, 0\)/);
    assert.match(sql, /p_amount_minor NUMERIC/);
    assert.equal(/p_amount_minor BIGINT/.test(sql), false);
    assert.equal(/available_minor BIGINT/.test(sql), false);
    assert.match(sql, /trunc\(\(trunc\(p_amount_minor\) \* s\.weight_minor\) \/ t\.total_weight\)/);
    assert.match(sql, /amount × weight cannot overflow BIGINT/);
  });

  it('HOLD/RELEASE/COMPLETE attribution is identity-scoped and cash is not double-reserved', () => {
    assert.match(sql, /Reserve attribution BEFORE Wallet Ledger HOLD/);
    assert.match(sql, /Existing parts make this trigger idempotent \(no double reserve\)/);
    assert.match(sql, /attribution_resolve_hold_ref/);
    assert.match(sql, /wd-hold:' \|\| v_existing\.id::TEXT/);
    assert.match(sql, /Do not open cashier review merely because attribution exists/);
    const createFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.player_create_withdrawal'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.cashier_confirm_player_payout'),
    );
    assert.equal(createFn.includes("v_need_review := TRUE"), false);
  });
});

describe('fund attribution HTTP privacy and permissions', () => {
  it('player destinations RPC never asks for a cashier id and strips browser cashier_id', async () => {
    const ports = playerPorts();
    const listed = await handlePlayerWithdrawalsRequest(
      {
        method: 'GET',
        pathname: '/api/player/payout-destinations',
        cookie: `${PLAYER_ACCESS_COOKIE}=${PLAYER_ACCESS}; ${PLAYER_REFRESH_COOKIE}=${PLAYER_REFRESH}`,
        cookieSecure: true,
      },
      ports,
    );
    assert.equal(listed.status, 200);
    assert.equal(ports.rpcs[0]?.name, 'player_list_cash_payout_destinations');
    const created = await handlePlayerWithdrawalsRequest(
      {
        method: 'POST',
        pathname: '/api/player/withdrawals',
        cookie: `${PLAYER_ACCESS_COOKIE}=${PLAYER_ACCESS}; ${PLAYER_REFRESH_COOKIE}=${PLAYER_REFRESH}`,
        cookieSecure: true,
        body: {
          method: 'cash',
          amount: 40,
          methodLabel: 'Cash',
          idempotencyKey: 'cash-1',
          cashPickupCity: 'Мары',
          cashPickupPoint: 'касса',
          payoutDestinationId: 'dest-token',
          cashierId: 'forged-cashier',
          walletId: 'wallet-a',
        },
      },
      ports,
    );
    assert.equal(created.status, 200);
    assert.equal(created.body.ok, true);
    const args = ports.rpcs[1]?.args ?? {};
    assert.equal(args.p_payout_destination_id, 'dest-token');
    assert.equal('p_cashier_id' in args, false);
    assert.equal('p_wallet_id' in args, false);
    assert.equal(JSON.stringify(created.body).includes('attribution'), false);
    assert.equal(JSON.stringify(created.body).includes('cross_cashier'), false);
  });

  it('enforcement-OFF legacy cash: city/point without payoutDestinationId still creates a withdrawal RPC', async () => {
    const ports = playerPorts({
      ok: true,
      id: 'wd-legacy',
      method: 'cash',
      status: 'pending',
      pin_code: 'deadbeefdeadbeef',
    });
    const created = await handlePlayerWithdrawalsRequest(
      {
        method: 'POST',
        pathname: '/api/player/withdrawals',
        cookie: `${PLAYER_ACCESS_COOKIE}=${PLAYER_ACCESS}; ${PLAYER_REFRESH_COOKIE}=${PLAYER_REFRESH}`,
        cookieSecure: true,
        body: {
          method: 'cash',
          amount: 40,
          methodLabel: 'Cash',
          idempotencyKey: 'legacy-cash-1',
          cashPickupCity: 'Мары',
          cashPickupPoint: 'касса',
        },
      },
      ports,
    );
    assert.equal(created.status, 200);
    assert.equal(created.body.ok, true);
    const args = ports.rpcs[0]?.args ?? {};
    assert.equal(ports.rpcs[0]?.name, 'player_create_withdrawal');
    assert.equal(args.p_method, 'cash');
    assert.equal(args.p_cash_pickup_city, 'Мары');
    assert.equal(args.p_cash_pickup_point, 'касса');
    assert.equal(args.p_payout_destination_id, null);
    assert.equal('p_cashier_id' in args, false);
  });

  it('Security can start/approve/reject review and cannot confirm cashier payout', async () => {
    const rpc = securityRpc();
    const session = {
      async lookupLoginEmail() {
        throw staffError('AUTH_FAILED', 401);
      },
      async signInWithPassword() {
        throw staffError('AUTH_FAILED', 401);
      },
      async refreshSession() {
        return { accessToken: SECURITY_ACCESS, refreshToken: SECURITY_REFRESH };
      },
      async currentStaffContext() {
        return {
          role: 'security',
          status: 'active',
          auth_user_id: 'sec-uid',
          display_name: 'Security',
          login: 'security01',
        };
      },
    };
    const cookie = `${SECURITY_ACCESS_COOKIE}=${SECURITY_ACCESS}; ${SECURITY_REFRESH_COOKIE}=${SECURITY_REFRESH}`;
    const summary = await handleSecurityControlRequest(
      { method: 'GET', pathname: '/api/security/withdrawal-reviews/summary', cookie, cookieSecure: true },
      { sessionPorts: session, rpcFactory: rpc.rpcFactory },
    );
    assert.equal(summary.status, 200);
    assert.equal(rpc.calls[0]?.name, 'security_withdrawal_review_summary');

    const approve = await handleSecurityControlRequest(
      {
        method: 'POST',
        pathname: `/api/security/withdrawal-reviews/${REVIEW_ID}/approve`,
        cookie,
        cookieSecure: true,
        body: { reason: 'ok after investigation', idempotencyKey: 'rev-1' },
      },
      { sessionPorts: session, rpcFactory: rpc.rpcFactory },
    );
    assert.equal(approve.status, 200);
    assert.equal(rpc.calls.at(-1)?.name, 'security_approve_withdrawal_review');

    const payout = await handleSecurityControlRequest(
      {
        method: 'POST',
        pathname: '/api/security/payouts/confirm',
        cookie,
        cookieSecure: true,
        body: { code: 'deadbeefdeadbeef', idempotencyKey: 'pay' },
      },
      { sessionPorts: session, rpcFactory: rpc.rpcFactory },
    );
    assert.equal(payout.status, 404);
    assert.equal(SECURITY_DENIED_RPCS.includes('cashier_confirm_player_payout'), true);
  });

  it('Owner has the same review RPCs', async () => {
    const rpc = ownerRpc();
    const result = await handleOwnerControlRequest(
      {
        method: 'POST',
        pathname: `/api/owner/withdrawal-reviews/${REVIEW_ID}/reject`,
        cookie: `${OWNER_ACCESS_COOKIE}=${OWNER_ACCESS}; ${OWNER_REFRESH_COOKIE}=${OWNER_REFRESH}`,
        cookieSecure: true,
        body: { reason: 'mismatch', idempotencyKey: 'own-1' },
      },
      {
        sessionPorts: {
          async signInWithPassword() {
            throw staffError('AUTH_FAILED', 401);
          },
          async refreshSession() {
            return { accessToken: OWNER_ACCESS, refreshToken: OWNER_REFRESH };
          },
          async currentStaffContext() {
            return { role: 'owner', status: 'active', auth_user_id: 'owner-uid', display_name: 'Owner', network_id: null };
          },
        },
        rpcFactory: rpc.rpcFactory,
      },
    );
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'owner_reject_withdrawal_review');
  });

  it('Manager cannot reach review decision routes', async () => {
    const result = await handleManagerControlRequest({
      method: 'POST',
      pathname: `/api/manager/withdrawal-reviews/${REVIEW_ID}/approve`,
      cookie: `${MANAGER_ACCESS_COOKIE}=${MANAGER_ACCESS}; ${MANAGER_REFRESH_COOKIE}=${MANAGER_REFRESH}`,
      cookieSecure: true,
      body: { reason: 'no', idempotencyKey: 'mgr-1' },
    });
    assert.equal(result.status, 404);
  });

  it('Cashier cannot reach review decision routes', async () => {
    const result = await handleCashierControlRequest({
      method: 'POST',
      pathname: `/api/cashier/withdrawal-reviews/${REVIEW_ID}/approve`,
      cookie: `${CASHIER_ACCESS_COOKIE}=${CASHIER_ACCESS}; ${CASHIER_REFRESH_COOKIE}=${CASHIER_REFRESH}`,
      cookieSecure: true,
      body: { reason: 'no', idempotencyKey: 'csh-1' },
    });
    assert.equal(result.status, 404);
  });

  it('Player APIs have no review decision route', async () => {
    const ports = playerPorts();
    const result = await handlePlayerWithdrawalsRequest(
      {
        method: 'POST',
        pathname: '/api/player/withdrawal-reviews/approve',
        cookie: `${PLAYER_ACCESS_COOKIE}=${PLAYER_ACCESS}; ${PLAYER_REFRESH_COOKIE}=${PLAYER_REFRESH}`,
        cookieSecure: true,
        body: { reason: 'no' },
      },
      ports,
    );
    assert.equal(result.status, 404);
    assert.equal(ports.rpcs.length, 0);
  });
});

describe('fund attribution HOLD alignment and NUMERIC overflow', () => {
  it('crypto/ewallet HOLD then RELEASE then COMPLETE keeps sums aligned with wallet available/locked', () => {
    const startAvail = 1000_00;
    const startLocked = 0;
    const buckets = [
      bucket('cashier', CASHIER_A, 800_00),
      bucket('cashier', CASHIER_B, 200_00),
    ];
    assert.equal(buckets.reduce((sum, part) => sum + part.weightMinor, 0), startAvail);

    const holdMinor = 250_00;
    const holdParts = reserveWithdrawal({
      buckets,
      requestedMinor: holdMinor,
      selectedCashierId: null,
    });
    assert.equal(holdParts.reduce((sum, part) => sum + part.allocatedMinor, 0), holdMinor);
    const held = applyHoldParts(buckets, holdParts);
    const walletAvailAfterHold = startAvail - holdMinor;
    const walletLockedAfterHold = startLocked + holdMinor;
    assert.equal(held.available.reduce((sum, part) => sum + part.weightMinor, 0), walletAvailAfterHold);
    assert.equal(held.reserved.reduce((sum, part) => sum + part.allocatedMinor, 0), walletLockedAfterHold);

    const walletAvailAfterRelease = walletAvailAfterHold + holdMinor;
    const walletLockedAfterRelease = walletLockedAfterHold - holdMinor;
    const releasedAvail = held.available.map((bucket) => {
      const part = holdParts.find(
        (row) => row.sourceKind === bucket.sourceKind && row.sourceCashierId === bucket.sourceCashierId,
      );
      return { ...bucket, weightMinor: bucket.weightMinor + (part?.allocatedMinor ?? 0) };
    });
    assert.equal(releasedAvail.reduce((sum, part) => sum + part.weightMinor, 0), walletAvailAfterRelease);
    assert.equal(0, walletLockedAfterRelease);

    const walletAvailAfterComplete = walletAvailAfterHold;
    const walletLockedAfterComplete = 0;
    assert.equal(held.available.reduce((sum, part) => sum + part.weightMinor, 0), walletAvailAfterComplete);
    assert.equal(walletLockedAfterComplete, 0);
    assert.match(sql, /IF v_op IN \('WITHDRAWAL_HOLD', 'WITHDRAWAL_RELEASE', 'WITHDRAWAL_COMPLETE'\)/);
  });

  it('large-value Hamilton product exceeds signed BIGINT and still allocates exactly', () => {
    const bigintMax = 9223372036854775807n;
    const amount = 10n ** 18n;
    const weight = 10n ** 18n;
    assert.equal(amount * weight > bigintMax, true);
    const parts = allocateLargestRemainderExact(
      [
        { sourceKind: 'cashier', sourceCashierId: CASHIER_A, weightMinor: weight },
        { sourceKind: 'cashier', sourceCashierId: CASHIER_B, weightMinor: weight },
      ],
      amount,
    );
    const sum = parts.reduce((total, part) => total + part.allocatedMinor, 0n);
    assert.equal(sum, amount);
    assert.equal(parts.find((part) => part.sourceCashierId === CASHIER_A)?.allocatedMinor, 5n * 10n ** 17n);
    assert.equal(parts.find((part) => part.sourceCashierId === CASHIER_B)?.allocatedMinor, 5n * 10n ** 17n);
    assert.match(sql, /NUMERIC\(40, 0\)/);
    assert.equal(Number.isSafeInteger(Number(amount * weight)), false);
  });
});

describe('isolated SQL migration execution', () => {
  it('does not apply 066 and reports whether a disposable Postgres is available', () => {
    const docker = spawnSync('docker', ['--version'], { encoding: 'utf8', windowsHide: true });
    const psql = spawnSync('psql', ['--version'], { encoding: 'utf8', windowsHide: true });
    const dockerOk = docker.status === 0;
    const psqlOk = psql.status === 0;
    assert.equal(sql.includes('supabase db push'), false);
    assert.equal(sql.includes('INSERT INTO private.cashier_payout_destinations'), false);
    if (!dockerOk && !psqlOk) {
      assert.equal(process.env.NEXTPARI_SQL_EXECUTION_PASSED, undefined);
      return;
    }
    assert.ok(dockerOk || psqlOk);
  });
});
