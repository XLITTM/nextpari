import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import type { CashierAuthGatewayPorts } from '../staff/cashierAuthService.js';
import { CASHIER_ACCESS_COOKIE, CASHIER_REFRESH_COOKIE } from '../staff/cashierCookies.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from '../staff/ownerCookies.js';
import {
  CANONICAL_CASHIER_MONEY_RPCS,
  handleCashierControlRequest,
} from './cashierControlHttp.js';
import type { CashierRpcPort } from './cashierRpc.js';

const ACCESS = 'cashier-access-token';
const REFRESH = 'cashier-refresh-token';
const CASHIER_ID = '0393d651-e13a-4f04-ba7d-352f63bc62a5';
const NETWORK_ID = '11111111-1111-1111-1111-111111111111';
const AUTH_USER = 'de04491b-344d-4af1-81e8-bce3f53f21ac';
const ORIGINAL = '11111111-1111-4111-8111-111111111111';
const REVERSAL = '22222222-2222-4222-8222-222222222222';

const CASHIER_CTX = {
  role: 'cashier',
  status: 'active',
  auth_user_id: AUTH_USER,
  display_name: 'agent01',
  network_id: NETWORK_ID,
  legacy_cashier_id: CASHIER_ID,
};

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const sql = readFileSync(
  join(root, 'supabase/migrations/20260913163000_owner_player_debit_cashier_reversal_042.sql'),
  'utf8',
);
const payoutSql = readFileSync(
  join(root, 'supabase/migrations/20260831_024_cashier_player_finance_api.sql'),
  'utf8',
);
const managerSql = readFileSync(
  join(root, 'supabase/migrations/20260831_020_manager_operational_finance.sql'),
  'utf8',
);
const httpSrc = readFileSync(join(here, 'cashierControlHttp.ts'), 'utf8');
const screen = readFileSync(join(root, 'src/screens/MobcashAgentScreen.tsx'), 'utf8');
const services = readFileSync(join(root, 'src/cashier/services.ts'), 'utf8');
const agents = readFileSync(join(root, 'src/pages/manager/ManagerAgentsPage.tsx'), 'utf8');

function cashierCookie(): string {
  return [
    `${CASHIER_ACCESS_COOKIE}=${encodeURIComponent(ACCESS)}`,
    `${CASHIER_REFRESH_COOKIE}=${encodeURIComponent(REFRESH)}`,
  ].join('; ');
}

function createAuthPorts(context: unknown = CASHIER_CTX): CashierAuthGatewayPorts {
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
  const rpcFactory = (accessToken: string): CashierRpcPort => ({
    async invoke(name, args) {
      calls.push({ token: accessToken, name, args });
      if (
        args
        && (
          'p_amount' in args && name === 'cashier_reverse_player_deposit'
          || 'p_wallet_id' in args
          || 'p_cashier_id' in args
          || 'p_operational_account_id' in args
          || 'p_player_id' in args
        )
      ) {
        throw new Error('browser authority leaked into reversal RPC args');
      }
      if (handler) return handler(name, args);
      if (name === 'cashier_reverse_player_deposit') {
        return {
          ok: true,
          original_transfer_id: args?.p_original_transfer_id,
          reversal_transfer_id: REVERSAL,
          player_public_id: '110790',
          amount: 100,
          currency: 'TMTM',
          cashier_balance_after: 3550,
          player_balance_after: 20,
          reversed_at: '2026-09-13T12:00:00Z',
          is_duplicate: false,
          wallet_id: 'wallet-uuid-secret',
        };
      }
      throw staffError('OPERATIONAL_ACCOUNT_NOT_ACTIVE', 409);
    },
  });
  return { calls, rpcFactory };
}

async function reverse(
  body: unknown,
  opts?: { session?: CashierAuthGatewayPorts; rpc?: ReturnType<typeof createRpc>; transferId?: string },
) {
  const rpc = opts?.rpc ?? createRpc();
  const result = await handleCashierControlRequest(
    {
      method: 'POST',
      pathname: `/api/cashier/deposits/${opts?.transferId ?? ORIGINAL}/reverse`,
      cookie: cashierCookie(),
      cookieSecure: true,
      body,
    },
    { sessionPorts: opts?.session ?? createAuthPorts(), rpcFactory: rpc.rpcFactory },
  );
  return { result, rpc };
}

describe('cashier deposit reversal HTTP', () => {
  it('reverses own deposit by original transfer id without amount or wallet authority', async () => {
    const { result, rpc } = await reverse({ idempotencyKey: 'rev-1', reason: 'неверная сумма' });
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'cashier_reverse_player_deposit');
    assert.deepEqual(rpc.calls[0]?.args, {
      p_original_transfer_id: ORIGINAL,
      p_idempotency_key: 'rev-1',
      p_reason: 'неверная сумма',
    });
    const data = result.body.data as Record<string, unknown>;
    assert.equal(data.originalTransferId, ORIGINAL);
    assert.equal(data.reversalTransferId, REVERSAL);
    assert.equal(data.amount, 100);
    assert.equal(data.playerPublicId, '110790');
    assert.equal(JSON.stringify(result.body).includes('wallet-uuid-secret'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(rpc.calls[0]?.args ?? {}, 'p_amount'), false);
  });

  it('rejects amount, missing reason, and non-UUID transfer id', async () => {
    const amount = await reverse({ idempotencyKey: 'rev-1', reason: 'x', amount: 10 });
    assert.equal(amount.result.status, 400);
    assert.equal(amount.result.body.error, 'FIELD_FORBIDDEN');
    assert.equal(amount.rpc.calls.length, 0);

    const reason = await reverse({ idempotencyKey: 'rev-1', reason: ' ' });
    assert.equal(reason.result.status, 400);
    assert.equal(reason.result.body.error, 'REASON_REQUIRED');

    const badId = await reverse(
      { idempotencyKey: 'rev-1', reason: 'x' },
      { transferId: '110790' },
    );
    assert.equal(badId.result.status, 400);
    assert.equal(badId.result.body.error, 'TRANSFER_ID_INVALID');
  });

  it('maps window, activity, and already-reversed conflicts', async () => {
    for (const code of [
      'CASHIER_REVERSAL_WINDOW_EXPIRED',
      'CASHIER_REVERSAL_PLAYER_ACTIVITY',
      'CASHIER_DEPOSIT_ALREADY_REVERSED',
    ]) {
      const rpc = createRpc(() => {
        throw staffError(code, 409);
      });
      const { result } = await reverse({ idempotencyKey: 'rev-1', reason: 'x' }, { rpc });
      assert.equal(result.status, 409);
      assert.equal(result.body.error, code);
    }
  });

  it('owner/manager/player cannot use cashier reversal', async () => {
    for (const ctx of [
      { role: 'owner', status: 'active', auth_user_id: 'o' },
      { role: 'manager', status: 'active', auth_user_id: 'm' },
      { role: 'player', status: 'active', auth_user_id: 'p' },
    ]) {
      const { result, rpc } = await reverse(
        { idempotencyKey: 'rev-1', reason: 'x' },
        { session: createAuthPorts(ctx) },
      );
      assert.equal(result.status, 403);
      assert.equal(rpc.calls.length, 0);
    }
  });

  it('owner cookies are not cashier reversal authority', async () => {
    const result = await handleCashierControlRequest(
      {
        method: 'POST',
        pathname: `/api/cashier/deposits/${ORIGINAL}/reverse`,
        cookie: [
          `${OWNER_ACCESS_COOKIE}=${encodeURIComponent(ACCESS)}`,
          `${OWNER_REFRESH_COOKIE}=${encodeURIComponent(REFRESH)}`,
        ].join('; '),
        cookieSecure: true,
        body: { idempotencyKey: 'rev-1', reason: 'x' },
      },
      { sessionPorts: createAuthPorts(), rpcFactory: createRpc().rpcFactory },
    );
    assert.equal(result.status, 401);
  });
});

describe('cashier deposit reversal SQL/UI contract (not executed)', () => {
  it('reverses only own CASHIER_TO_PLAYER full amount within 5 minutes without later activity', () => {
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.cashier_reverse_player_deposit\(/);
    assert.match(sql, /'CASHIER_DEPOSIT_REVERSAL'/);
    assert.match(sql, /CASH_DEPOSIT_REVERSAL/);
    assert.match(sql, /INTERVAL '5 minutes'/);
    assert.match(sql, /CASHIER_REVERSAL_WINDOW_EXPIRED/);
    assert.match(sql, /CASHIER_REVERSAL_PLAYER_ACTIVITY/);
    assert.match(sql, /CASHIER_DEPOSIT_ALREADY_REVERSED/);
    assert.match(sql, /available_delta < 0 OR l\.locked_delta > 0/);
    assert.match(sql, /entry_no > v_baseline/);
    assert.match(sql, /operation_type = 'CASH_DEPOSIT'/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS private\.cashier_deposit_reversals/);
    assert.match(sql, /original_transfer_id UUID PRIMARY KEY/);
    assert.match(sql, /CASHIER_REVERSED_PLAYER_DEPOSIT/);
    assert.match(sql, /get_current_cashier_context_locked/);
    assert.match(sql, /p_from_account_id IS NOT NULL/);
    assert.equal(/CREATE OR REPLACE FUNCTION public\.cashier_confirm_player_payout\(/.test(sql), false);
    assert.match(payoutSql, /CREATE OR REPLACE FUNCTION public\.cashier_confirm_player_payout\(/);
    assert.match(payoutSql, /'PLAYER_TO_CASHIER'/);
    assert.match(sql, /'WITHDRAWAL_COMPLETE'/);
    assert.equal(/UPDATE\s+public\.wallets/.test(sql), false);
    assert.equal(/CREATE OR REPLACE FUNCTION private\.apply_wallet_entry\(/.test(sql), false);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.manager_adjust_player_balance/);
  });

  it('preserves manager collection and does not add manager player debit', () => {
    assert.match(managerSql, /CREATE OR REPLACE FUNCTION public\.manager_collect_cashier\(/);
    assert.match(managerSql, /'CASHIER_TO_MANAGER'/);
    assert.match(managerSql, /'MANAGER_TO_CASHIER'/);
    assert.match(agents, /Снять \/ Инкассация/);
    assert.match(agents, /postManagerCollect/);
    assert.equal(agents.includes('owner_debit_player'), false);
    assert.equal(httpSrc.includes('manager_adjust_player_balance'), false);
    assert.equal([...CANONICAL_CASHIER_MONEY_RPCS].includes('cashier_reverse_player_deposit'), true);
  });

  it('cashier history can reverse own deposit and payout UI stays separate', () => {
    assert.match(screen, /Отменить пополнение/);
    assert.match(screen, /Причина отмены/);
    assert.match(screen, /Можно отменить ещё/);
    assert.match(screen, /cashierReversalErrorMessage/);
    assert.match(screen, /postCashierPayoutConfirm/);
    assert.match(screen, /\[0-9a-f\]\{16\}/);
    assert.match(services, /cashierDepositReversePath/);
    assert.match(services, /Прошло больше 5 минут/);
    assert.match(services, /игрок уже использовал средства/);
    assert.match(services, /Это пополнение уже отменено/);
    assert.equal(services.includes('p_wallet_id'), false);
    assert.equal(httpSrc.includes("rpc.invoke('cashier_deposit_to_player')"), false);
  });
});
