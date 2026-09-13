import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { OwnerAuthGatewayPorts } from '../staff/ownerAuthService.js';
import { CASHIER_ACCESS_COOKIE, CASHIER_REFRESH_COOKIE } from '../staff/cashierCookies.js';
import { MANAGER_ACCESS_COOKIE, MANAGER_REFRESH_COOKIE } from '../staff/managerCookies.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from '../staff/ownerCookies.js';
import { handleOwnerControlRequest } from './ownerControlHttp.js';
import type { OwnerRpcPort } from './ownerRpc.js';

const ACCESS = 'owner-access-token';
const REFRESH = 'owner-refresh-token';
const PLAYER_PUBLIC = '110790';
const TRANSFER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const sql = readFileSync(
  join(root, 'supabase/migrations/20260913163000_owner_player_debit_cashier_reversal_042.sql'),
  'utf8',
);
const sql043 = readFileSync(
  join(root, 'supabase/migrations/20260913173500_owner_debit_audit_visibility_043.sql'),
  'utf8',
);
const httpSrc = readFileSync(join(here, 'ownerControlHttp.ts'), 'utf8');
const playersUi = readFileSync(join(root, 'src/owner/PlayersPanel.tsx'), 'utf8');
const services = readFileSync(join(root, 'src/owner/services.ts'), 'utf8');
const managerHttp = readFileSync(join(root, 'server/manager/managerControlHttp.ts'), 'utf8');

const OWNER_CTX = {
  role: 'owner',
  status: 'active',
  auth_user_id: 'owner-uid',
  display_name: 'Owner',
  network_id: null,
};

function cookieHeader(): string {
  return [
    `${OWNER_ACCESS_COOKIE}=${encodeURIComponent(ACCESS)}`,
    `${OWNER_REFRESH_COOKIE}=${encodeURIComponent(REFRESH)}`,
  ].join('; ');
}

function createAuthPorts(context: unknown = OWNER_CTX): OwnerAuthGatewayPorts {
  return {
    async signInWithPassword() {
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async refreshSession() {
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async currentStaffContext() {
      return context;
    },
  };
}

function createRpc(handler?: (name: string, args?: Record<string, unknown>) => unknown) {
  const calls: Array<{ token: string; name: string; args?: Record<string, unknown> }> = [];
  const rpcFactory = (accessToken: string): OwnerRpcPort => ({
    async invoke(name, args) {
      calls.push({ token: accessToken, name, args });
      if (handler) return handler(name, args);
      return {
        ok: true,
        transfer_id: TRANSFER,
        is_duplicate: false,
        amount: args?.p_amount,
        currency: 'TMTM',
        player_public_id: args?.p_player_id,
        player_balance_after: 20,
        treasury_balance_after: 1100,
        wallet_id: 'wallet-uuid-secret',
        treasury_id: 'treasury-uuid-secret',
      };
    },
  });
  return { calls, rpcFactory };
}

async function debit(
  body: unknown,
  opts?: { session?: OwnerAuthGatewayPorts; rpc?: ReturnType<typeof createRpc>; cookie?: string },
) {
  const rpc = opts?.rpc ?? createRpc();
  const result = await handleOwnerControlRequest(
    {
      method: 'POST',
      pathname: `/api/owner/players/${PLAYER_PUBLIC}/debit`,
      cookie: opts?.cookie ?? cookieHeader(),
      cookieSecure: true,
      body,
    },
    { sessionPorts: opts?.session ?? createAuthPorts(), rpcFactory: rpc.rpcFactory },
  );
  return { result, rpc };
}

describe('owner player debit HTTP', () => {
  it('owner can fund player via existing fund RPC and debit via owner_debit_player', async () => {
    const fundRpc = createRpc();
    const fund = await handleOwnerControlRequest(
      {
        method: 'POST',
        pathname: '/api/owner/fund',
        cookie: cookieHeader(),
        cookieSecure: true,
        body: { targetType: 'player', targetId: PLAYER_PUBLIC, amount: 100, idempotencyKey: 'fund-1' },
      },
      { sessionPorts: createAuthPorts(), rpcFactory: fundRpc.rpcFactory },
    );
    assert.equal(fund.status, 200);
    assert.equal(fundRpc.calls[0]?.name, 'owner_fund_player');

    const { result, rpc } = await debit({
      amount: 100,
      idempotencyKey: 'debit-1',
      reason: 'correction',
    });
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'owner_debit_player');
    assert.deepEqual(rpc.calls[0]?.args, {
      p_player_id: PLAYER_PUBLIC,
      p_amount: 100,
      p_idempotency_key: 'debit-1',
      p_reason: 'correction',
    });
    const dumped = JSON.stringify(result.body);
    assert.equal(dumped.includes('wallet-uuid-secret'), false);
    assert.equal(dumped.includes('treasury-uuid-secret'), false);
    assert.equal((result.body.data as { treasury_balance_after?: unknown }).treasury_balance_after, 1100);
    assert.equal((result.body.data as { player_balance_after?: unknown }).player_balance_after, 20);
  });

  it('rejects zero, overscale amount, missing reason, and wallet UUID', async () => {
    const zero = await debit({ amount: 0, idempotencyKey: 'k', reason: 'x' });
    assert.equal(zero.result.status, 400);
    assert.equal(zero.result.body.error, 'AMOUNT_NOT_POSITIVE');
    assert.equal(zero.rpc.calls.length, 0);

    const scale = await debit({ amount: 1.001, idempotencyKey: 'k', reason: 'x' });
    assert.equal(scale.result.status, 400);
    assert.equal(scale.result.body.error, 'AMOUNT_SCALE_INVALID');

    const reason = await debit({ amount: 10, idempotencyKey: 'k', reason: '  ' });
    assert.equal(reason.result.status, 400);
    assert.equal(reason.result.body.error, 'REASON_REQUIRED');

    const wallet = await handleOwnerControlRequest(
      {
        method: 'POST',
        pathname: '/api/owner/players/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/debit',
        cookie: cookieHeader(),
        cookieSecure: true,
        body: { amount: 10, idempotencyKey: 'k', reason: 'x' },
      },
      { sessionPorts: createAuthPorts(), rpcFactory: createRpc().rpcFactory },
    );
    assert.equal(wallet.status, 400);
    assert.equal(wallet.body.error, 'PLAYER_WALLET_ID_FORBIDDEN');

    const forbidden = await debit({
      amount: 10,
      idempotencyKey: 'k',
      reason: 'x',
      walletId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    });
    assert.equal(forbidden.result.status, 400);
    assert.equal(forbidden.result.body.error, 'FIELD_FORBIDDEN');
  });

  it('manager cannot debit player', async () => {
    const { result, rpc } = await debit(
      { amount: 10, idempotencyKey: 'k', reason: 'x' },
      { session: createAuthPorts({ role: 'manager', status: 'active', auth_user_id: 'm' }) },
    );
    assert.equal(result.status, 403);
    assert.equal(rpc.calls.length, 0);
  });

  it('cashier cannot debit player', async () => {
    const { result, rpc } = await debit(
      { amount: 10, idempotencyKey: 'k', reason: 'x' },
      { session: createAuthPorts({ role: 'cashier', status: 'active', auth_user_id: 'c' }) },
    );
    assert.equal(result.status, 403);
    assert.equal(rpc.calls.length, 0);
  });

  it('player cannot debit player', async () => {
    const { result, rpc } = await debit(
      { amount: 10, idempotencyKey: 'k', reason: 'x' },
      { session: createAuthPorts({ role: 'player', status: 'active', auth_user_id: 'p' }) },
    );
    assert.equal(result.status, 403);
    assert.equal(rpc.calls.length, 0);
  });

  it('does not accept manager or cashier cookies as owner debit authority', async () => {
    const managerCookie = [
      `${MANAGER_ACCESS_COOKIE}=${encodeURIComponent(ACCESS)}`,
      `${MANAGER_REFRESH_COOKIE}=${encodeURIComponent(REFRESH)}`,
    ].join('; ');
    const cashierCookie = [
      `${CASHIER_ACCESS_COOKIE}=${encodeURIComponent(ACCESS)}`,
      `${CASHIER_REFRESH_COOKIE}=${encodeURIComponent(REFRESH)}`,
    ].join('; ');
    const manager = await debit(
      { amount: 10, idempotencyKey: 'k', reason: 'x' },
      { cookie: managerCookie },
    );
    const cashier = await debit(
      { amount: 10, idempotencyKey: 'k', reason: 'x' },
      { cookie: cashierCookie },
    );
    assert.equal(manager.result.status, 401);
    assert.equal(cashier.result.status, 401);
    assert.equal(manager.rpc.calls.length, 0);
    assert.equal(cashier.rpc.calls.length, 0);
  });
});

describe('owner player debit SQL/UI contract (not executed)', () => {
  it('adds PLAYER_TO_TREASURY available debit without rewriting wallet core or payout', () => {
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.owner_debit_player\(/);
    assert.match(sql, /'PLAYER_TO_TREASURY'/);
    assert.match(sql, /OWNER_DEBIT/);
    assert.match(sql, /WHEN 'PLAYER_TO_TREASURY' THEN 'owner'/);
    assert.match(sql, /OWNER_DEBITED_PLAYER/);
    assert.match(sql, /REASON_REQUIRED/);
    assert.match(sql, /INSUFFICIENT_AVAILABLE_BALANCE/);
    assert.match(sql, /-v_amount/);
    assert.match(sql, /private\.apply_operational_transfer\(/);
    assert.match(sql, /private\.apply_wallet_entry\(/);
    assert.equal(/CREATE OR REPLACE FUNCTION private\.apply_wallet_entry\(/.test(sql), false);
    assert.equal(/UPDATE\s+public\.wallets/.test(sql), false);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.owner_debit_player/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.owner_debit_player/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.manager_adjust_player_balance/);
    assert.equal(/GRANT EXECUTE ON FUNCTION public\.manager_adjust_player_balance/.test(sql), false);
    assert.match(sql, /WITHDRAWAL_COMPLETE/);
    assert.equal(/operation_type = 'WITHDRAWAL_COMPLETE'[\s\S]{0,80}PLAYER_TO_TREASURY/.test(sql), false);
  });

  it('extends wallet_ledger and operational_ledger checks without dropping existing values', () => {
    const start = sql.indexOf('1b. WALLET CORE + OPERATIONAL SOURCE_MODULE CHECKS');
    const end = sql.indexOf('-- 2. SHAPE TRIGGER');
    assert.equal(start >= 0, true);
    assert.equal(end > start, true);
    const block = sql.slice(start, end);
    assert.match(block, /wallet_ledger_operation_type_check/);
    assert.match(block, /wallet_ledger_source_module_check/);
    assert.match(block, /operational_ledger_source_module_check/);
    assert.match(block, /pg_catalog\.pg_get_constraintdef/);
    assert.match(block, /failed to parse existing values/);
    assert.match(block, /not found/);
    for (const value of [
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
      'CASH_DEPOSIT_REVERSAL',
    ]) {
      assert.equal(block.includes(`'${value}'`), true, value);
    }
    const opStart = block.indexOf('wallet_ledger_operation_type_check');
    const srcStart = block.indexOf('wallet_ledger_source_module_check');
    const opSrcStart = block.indexOf('operational_ledger_source_module_check');
    const walletOps = block.slice(opStart, srcStart);
    const walletSrc = block.slice(srcStart, opSrcStart);
    const operationalSrc = block.slice(opSrcStart);
    for (const value of [
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
      'CASH_DEPOSIT_REVERSAL',
    ]) {
      assert.equal(walletOps.includes(`'${value}'`), true, `wallet op ${value}`);
    }
    for (const value of ['mobcash', 'treasury', 'casino', 'withdrawal', 'system', 'manager', 'owner']) {
      assert.equal(walletSrc.includes(`'${value}'`), true, `wallet source ${value}`);
    }
    for (const value of ['treasury', 'manager', 'mobcash', 'migration', 'system', 'owner']) {
      assert.equal(operationalSrc.includes(`'${value}'`), true, `operational source ${value}`);
    }
    assert.equal(existsSync(join(root, 'supabase/migrations/20260913163001_owner_player_debit_cashier_reversal_043.sql')), false);
    assert.equal(
      existsSync(join(root, 'supabase/migrations/20260913173500_owner_debit_audit_visibility_043.sql')),
      true,
    );
    assert.equal(
      readdirSync(join(root, 'supabase/migrations')).filter((name) => name.includes('_043.sql')).join(','),
      '20260913173500_owner_debit_audit_visibility_043.sql',
    );
  });

  it('043 keeps owner debit money logic and uses owner_only audit visibility', () => {
    assert.match(sql043, /CREATE OR REPLACE FUNCTION public\.owner_debit_player\(/);
    assert.match(sql043, /SECURITY DEFINER/);
    assert.match(sql043, /SET search_path = ''/);
    assert.match(sql043, /private\.get_current_owner_context\(\)/);
    assert.match(sql043, /'PLAYER_TO_TREASURY'/);
    assert.match(sql043, /OWNER_DEBITED_PLAYER/);
    assert.match(
      sql043,
      /PERFORM private\.append_staff_audit\(\s*'OWNER_DEBITED_PLAYER',\s*'player',\s*v_player\.public_id,\s*'owner_only',/s,
    );
    assert.equal(
      /PERFORM private\.append_staff_audit\(\s*'OWNER_DEBITED_PLAYER',\s*'player',\s*v_player\.public_id,\s*'owner',/s.test(
        sql043,
      ),
      false,
    );
    assert.equal(/CREATE OR REPLACE FUNCTION public\.cashier_reverse_player_deposit\(/.test(sql043), false);
    assert.equal(/CREATE OR REPLACE FUNCTION public\.manager_collect_cashier\(/.test(sql043), false);
    assert.equal(/CREATE OR REPLACE FUNCTION public\.cashier_confirm_player_payout\(/.test(sql043), false);
    assert.equal(/CREATE OR REPLACE FUNCTION private\.apply_wallet_entry\(/.test(sql043), false);
    assert.equal(/UPDATE\s+public\.wallets/.test(sql043), false);
    assert.match(sql043, /REVOKE ALL ON FUNCTION public\.owner_debit_player\(TEXT, NUMERIC, TEXT, TEXT\) FROM PUBLIC;/);
    assert.match(sql043, /REVOKE ALL ON FUNCTION public\.owner_debit_player\(TEXT, NUMERIC, TEXT, TEXT\) FROM anon;/);
    assert.match(
      sql043,
      /GRANT EXECUTE ON FUNCTION public\.owner_debit_player\(TEXT, NUMERIC, TEXT, TEXT\) TO authenticated;/,
    );
  });

  it('UI exposes Списать beside fund and never manager_adjust_player_balance', () => {
    assert.match(playersUi, /Пополнить баланс/);
    assert.match(playersUi, /Списать/);
    assert.match(playersUi, /Списать средства у игрока/);
    assert.match(playersUi, /Причина списания/);
    assert.match(playersUi, /postOwnerPlayerDebit/);
    assert.equal(playersUi.includes('walletId'), false);
    assert.equal(playersUi.includes('manager_adjust_player_balance'), false);
    assert.match(services, /\/api\/owner\/players\//);
    assert.match(services, /\/debit/);
    assert.match(httpSrc, /owner_debit_player/);
    assert.equal(httpSrc.includes('manager_adjust_player_balance'), false);
    assert.equal(managerHttp.includes('owner_debit_player'), false);
    assert.equal(managerHttp.includes("invoke('manager_adjust_player_balance'"), false);
    assert.equal(httpSrc.includes('.from(\'wallets\')'), false);
  });
});
