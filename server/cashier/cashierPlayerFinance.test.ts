import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import type { CashierAuthGatewayPorts } from '../staff/cashierAuthService.js';
import { CASHIER_ACCESS_COOKIE, CASHIER_REFRESH_COOKIE } from '../staff/cashierCookies.js';
import { MANAGER_ACCESS_COOKIE, MANAGER_REFRESH_COOKIE } from '../staff/managerCookies.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from '../staff/ownerCookies.js';
import {
  CANONICAL_CASHIER_MONEY_RPCS,
  CASHIER_MONEY_RPC_DENYLIST,
  handleCashierControlRequest,
} from './cashierControlHttp.js';
import type { CashierRpcPort } from './cashierRpc.js';

const ACCESS = 'cashier-access-token';
const REFRESH = 'cashier-refresh-token';
const ACCESS2 = 'cashier-access-rotated';
const REFRESH2 = 'cashier-refresh-rotated';
const CASHIER_ID = '0393d651-e13a-4f04-ba7d-352f63bc62a5';
const NETWORK_ID = '11111111-1111-1111-1111-111111111111';
const AUTH_USER = 'de04491b-344d-4af1-81e8-bce3f53f21ac';
const PLAYER_PUBLIC = '110790';
const PAYOUT_CODE = '0123456789abcdef';

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
const engineSql = readFileSync(
  join(root, 'supabase/migrations/20260831_023_cashier_player_transfer_engine.sql'),
  'utf8',
);
const apiSql = readFileSync(
  join(root, 'supabase/migrations/20260831_024_cashier_player_finance_api.sql'),
  'utf8',
);
const rollbackSql = readFileSync(
  join(root, 'supabase/tests/20260831_024_cashier_player_finance.rollback.sql'),
  'utf8',
);
const httpSrc = readFileSync(join(here, 'cashierControlHttp.ts'), 'utf8');
const rpcSrc = readFileSync(join(here, 'cashierRpc.ts'), 'utf8');
const screen = readFileSync(join(root, 'src/screens/MobcashAgentScreen.tsx'), 'utf8');
const services = readFileSync(join(root, 'src/cashier/services.ts'), 'utf8');

function cashierCookie(access = ACCESS, refresh = REFRESH): string {
  return [
    `${CASHIER_ACCESS_COOKIE}=${encodeURIComponent(access)}`,
    `${CASHIER_REFRESH_COOKIE}=${encodeURIComponent(refresh)}`,
  ].join('; ');
}

function createAuthPorts(init?: { context?: unknown; accessFailOnce?: boolean }): CashierAuthGatewayPorts & {
  refreshes: string[];
} {
  const refreshes: string[] = [];
  let accessAttempts = 0;
  return {
    refreshes,
    async signInWithPassword() {
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async refreshSession(refreshToken) {
      refreshes.push(refreshToken);
      return { accessToken: ACCESS2, refreshToken: REFRESH2 };
    },
    async currentStaffContext(accessToken) {
      accessAttempts += 1;
      if (init?.accessFailOnce && accessAttempts === 1 && accessToken === ACCESS) {
        throw staffError('JWT_INVALID', 401);
      }
      return init?.context ?? CASHIER_CTX;
    },
  };
}

function createRpc(handler?: (name: string, args?: Record<string, unknown>) => unknown) {
  const calls: Array<{ token: string; name: string; args?: Record<string, unknown> }> = [];
  const rpcFactory = (accessToken: string): CashierRpcPort => ({
    async invoke(name, args) {
      calls.push({ token: accessToken, name, args });
      if (CASHIER_MONEY_RPC_DENYLIST.includes(name as typeof CASHIER_MONEY_RPC_DENYLIST[number])) {
        throw new Error(`legacy money rpc invoked: ${name}`);
      }
      if (
        args
        && (
          'p_cashier_id' in args
          || 'cashierId' in args
          || 'p_network_id' in args
          || 'p_operational_account_id' in args
          || 'p_actor_user_id' in args
          || 'p_actor_role' in args
          || 'p_wallet_id' in args
        )
      ) {
        throw new Error('browser authority leaked into RPC args');
      }
      if (handler) return handler(name, args);
      if (name === 'cashier_deposit_player') {
        return {
          ok: true,
          transfer_id: 'dep-1',
          is_duplicate: false,
          amount: args?.p_amount,
          currency: 'TMTM',
          cashier_balance_after: 3540,
          player_balance_after: 10,
          player_public_id: args?.p_player_public_id,
        };
      }
      if (name === 'cashier_lookup_player_payout') {
        return {
          ok: true,
          id: 'pay-1',
          player_public_id: PLAYER_PUBLIC,
          amount: 150,
          currency: 'TMTM',
          status: 'pending',
        };
      }
      if (name === 'cashier_confirm_player_payout') {
        return {
          ok: true,
          is_duplicate: false,
          transfer_id: 'payout-1',
          amount: 150,
          currency: 'TMTM',
          cashier_balance_after: 3700,
          status: 'paid',
        };
      }
      throw staffError('OPERATIONAL_ACCOUNT_NOT_ACTIVE', 409);
    },
  });
  return { calls, rpcFactory };
}

async function call(
  method: string,
  pathname: string,
  opts?: { cookie?: string; body?: unknown; session?: CashierAuthGatewayPorts; rpc?: ReturnType<typeof createRpc> },
) {
  const rpc = opts?.rpc ?? createRpc();
  const result = await handleCashierControlRequest(
    {
      method,
      pathname,
      cookie: opts?.cookie ?? cashierCookie(),
      cookieSecure: true,
      body: opts?.body,
    },
    { sessionPorts: opts?.session ?? createAuthPorts(), rpcFactory: rpc.rpcFactory },
  );
  return { result, rpc };
}

describe('cashier player finance BFF', () => {
  it('1-4. deposit uses JWT RPC with public_id + amount + idempotency only', async () => {
    const { result, rpc } = await call('POST', '/api/cashier/deposits', {
      body: {
        playerPublicId: PLAYER_PUBLIC,
        amount: 10,
        idempotencyKey: 'dep-1',
        cashierId: CASHIER_ID,
        networkId: NETWORK_ID,
        operationalAccountId: 'op-x',
        actorUserId: AUTH_USER,
        actorRole: 'owner',
        walletId: 'wallet-from-browser',
      },
    });
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'cashier_deposit_player');
    assert.equal(rpc.calls[0]?.token, ACCESS);
    assert.deepEqual(rpc.calls[0]?.args, {
      p_player_public_id: PLAYER_PUBLIC,
      p_amount: 10,
      p_idempotency_key: 'dep-1',
      p_note: null,
    });
  });

  it('6/9. staging deposit surfaces OPERATIONAL_ACCOUNT_NOT_ACTIVE', async () => {
    const rpc = createRpc(() => {
      throw staffError('OPERATIONAL_ACCOUNT_NOT_ACTIVE', 409);
    });
    const { result } = await call('POST', '/api/cashier/deposits', {
      rpc,
      body: { playerPublicId: PLAYER_PUBLIC, amount: 10, idempotencyKey: 'dep-stage' },
    });
    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'OPERATIONAL_ACCOUNT_NOT_ACTIVE');
  });

  it('7. invalid player public id rejected before RPC wallet UUID', async () => {
    const { result, rpc } = await call('POST', '/api/cashier/deposits', {
      body: { playerPublicId: 'not-a-player', amount: 10, idempotencyKey: 'dep-bad' },
    });
    assert.equal(result.status, 404);
    assert.equal(result.body.error, 'PLAYER_NOT_FOUND');
    assert.equal(rpc.calls.length, 0);
  });

  it('8. inactive cashier rejected', async () => {
    const { result, rpc } = await call('POST', '/api/cashier/deposits', {
      session: createAuthPorts({ context: { ...CASHIER_CTX, status: 'disabled' } }),
      body: { playerPublicId: PLAYER_PUBLIC, amount: 10, idempotencyKey: 'dep-inactive' },
    });
    assert.equal(result.status, 403);
    assert.equal(rpc.calls.length, 0);
  });

  it('11-14. payout lookup + confirm; replay uses same RPC args', async () => {
    const lookup = await call('GET', `/api/cashier/payouts/${PAYOUT_CODE}`);
    assert.equal(lookup.result.status, 200);
    assert.equal(lookup.rpc.calls[0]?.name, 'cashier_lookup_player_payout');
    assert.deepEqual(lookup.rpc.calls[0]?.args, { p_code: PAYOUT_CODE });

    const confirm = await call('POST', `/api/cashier/payouts/${PAYOUT_CODE}/confirm`, {
      body: { idempotencyKey: 'pay-1', cashierId: CASHIER_ID, amount: 999 },
    });
    assert.equal(confirm.result.status, 200);
    assert.equal(confirm.rpc.calls[0]?.name, 'cashier_confirm_player_payout');
    assert.deepEqual(confirm.rpc.calls[0]?.args, {
      p_code: PAYOUT_CODE,
      p_idempotency_key: 'pay-1',
    });
  });

  it('16-18. expired / cancelled / already-paid mapped from RPC', async () => {
    for (const code of ['PAYOUT_EXPIRED', 'PAYOUT_CANCELLED', 'PAYOUT_ALREADY_PAID'] as const) {
      const rpc = createRpc(() => {
        throw staffError(code, 409);
      });
      const { result } = await call('POST', `/api/cashier/payouts/${PAYOUT_CODE}/confirm`, {
        rpc,
        body: { idempotencyKey: 'pay-fail' },
      });
      assert.equal(result.status, 409);
      assert.equal(result.body.error, code);
    }
  });

  it('21. Owner/Manager cookies cannot call cashier money routes', async () => {
    const owner = await call('POST', '/api/cashier/deposits', {
      cookie: `${OWNER_ACCESS_COOKIE}=o; ${OWNER_REFRESH_COOKIE}=or`,
      body: { playerPublicId: PLAYER_PUBLIC, amount: 10, idempotencyKey: 'x' },
    });
    const manager = await call('POST', '/api/cashier/deposits', {
      cookie: `${MANAGER_ACCESS_COOKIE}=m; ${MANAGER_REFRESH_COOKIE}=mr`,
      body: { playerPublicId: PLAYER_PUBLIC, amount: 10, idempotencyKey: 'x' },
    });
    assert.equal(owner.result.status, 401);
    assert.equal(manager.result.status, 401);
    assert.equal(owner.rpc.calls.length, 0);
    assert.equal(manager.rpc.calls.length, 0);
  });

  it('10. missing cookie → 401', async () => {
    const { result, rpc } = await call('POST', '/api/cashier/deposits', {
      cookie: '',
      body: { playerPublicId: PLAYER_PUBLIC, amount: 10, idempotencyKey: 'x' },
    });
    assert.equal(result.status, 401);
    assert.equal(rpc.calls.length, 0);
  });

  it('11. session refresh rotates cookies on money POST', async () => {
    const session = createAuthPorts({ accessFailOnce: true });
    const { result } = await call('POST', '/api/cashier/deposits', {
      session,
      body: { playerPublicId: PLAYER_PUBLIC, amount: 10, idempotencyKey: 'rot' },
    });
    assert.equal(result.status, 200);
    const cookies = (result.cookies ?? []).join(';');
    assert.equal(cookies.includes(ACCESS2), true);
    assert.equal(cookies.includes(REFRESH2), true);
  });

  it('22-23. user JWT; no service_role business authority', () => {
    assert.match(rpcSrc, /createUserJwtClient/);
    assert.equal(rpcSrc.includes('createServiceRoleClient'), false);
    assert.equal(rpcSrc.includes('service_role'), false);
    assert.equal(httpSrc.includes('createServiceRoleClient'), false);
    assert.deepEqual([...CANONICAL_CASHIER_MONEY_RPCS], [
      'cashier_deposit_player',
      'cashier_lookup_player_payout',
      'cashier_confirm_player_payout',
    ]);
    assert.match(httpSrc, /assertCashierPayoutRateLimit/);
  });

  it('24-25. active cashier UI uses canonical BFF; no legacy money RPC', () => {
    assert.equal(screen.includes('postCashierDeposit'), true);
    assert.equal(screen.includes('postCashierPayoutConfirm'), true);
    assert.equal(screen.includes('fetchCashierPayout'), true);
    assert.match(screen, /Финансовые операции активны/);
    assert.match(screen, /Financial activation pending/);
    assert.match(screen, /\[0-9a-f\]\{16\}/);
    assert.equal(screen.includes('cashier_deposit_to_player'), false);
    assert.equal(screen.includes('cashier_payout_by_code'), false);
    assert.equal(services.includes("from '../lib/cashier'"), false);
    assert.match(httpSrc, /cashier_deposit_player/);
    assert.equal(httpSrc.includes("rpc.invoke('cashier_deposit_to_player')"), false);
    assert.equal(httpSrc.includes("rpc.invoke('cashier_payout_by_code')"), false);
  });

  it('lazy confirm PAYOUT_EXPIRED payload maps to HTTP 409 so SQL release can commit', async () => {
    const rpc = createRpc(() => ({
      ok: false,
      error: 'PAYOUT_EXPIRED',
      status: 'expired',
    }));
    const { result } = await call('POST', `/api/cashier/payouts/${PAYOUT_CODE}/confirm`, {
      rpc,
      body: { idempotencyKey: 'pay-lazy-exp' },
    });
    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'PAYOUT_EXPIRED');
  });
});

describe('cashier player finance SQL contract (not executed)', () => {
  it('adds CASHIER_TO_PLAYER and PLAYER_TO_CASHIER without dropping existing types', () => {
    assert.match(engineSql, /'CASHIER_TO_PLAYER'/);
    assert.match(engineSql, /'PLAYER_TO_CASHIER'/);
    assert.match(engineSql, /'TREASURY_TO_MANAGER'/);
    assert.match(engineSql, /'TREASURY_TO_CASHIER'/);
    assert.match(engineSql, /'MANAGER_TO_CASHIER'/);
    assert.match(engineSql, /'CASHIER_TO_MANAGER'/);
    assert.match(engineSql, /'TREASURY_TO_PLAYER'/);
    assert.match(engineSql, /CASH_DEPOSIT/);
    assert.match(engineSql, /WITHDRAWAL_COMPLETE/);
    assert.equal(/\bSET\s+migration_state\s*=/.test(engineSql), false);
    assert.equal(/UPDATE\s+private\.operational_accounts[\s\S]{0,120}migration_state\s*=/.test(engineSql), false);
  });

  it('public cashier money RPCs are JWT-only and staging-gated', () => {
    assert.match(apiSql, /CREATE OR REPLACE FUNCTION public\.cashier_deposit_player\(/);
    assert.match(apiSql, /CREATE OR REPLACE FUNCTION public\.player_request_cashier_payout\(/);
    assert.match(apiSql, /CREATE OR REPLACE FUNCTION public\.player_cancel_cashier_payout\(/);
    assert.match(apiSql, /CREATE OR REPLACE FUNCTION private\.expire_cashier_player_payout\(/);
    assert.match(apiSql, /WITHDRAWAL_RELEASE/);
    assert.match(apiSql, /cashier_require_platform_ops_active/);
    assert.match(apiSql, /cashier_require_own_ops_active/);
    assert.match(apiSql, /CREATE UNIQUE INDEX IF NOT EXISTS cashier_player_payout_code_uidx/);
    assert.equal(/cashier_player_payout_code_uidx[\s\S]{0,80}WHERE status = 'pending'/.test(apiSql), false);
    assert.match(apiSql, /IDEMPOTENCY_KEY_CONFLICT/);
    assert.match(apiSql, /cashier_player_payout_status_shape/);
    assert.equal(apiSql.includes('110790'), false);
    assert.equal(apiSql.includes('27f26a0a-5831-47f2-8ddf-321a80317e6f'), false);
    assert.equal(apiSql.includes('bc5d66cd-5e18-4352-b7f8-ea99029758e0'), false);
    assert.match(apiSql, /CREATE OR REPLACE FUNCTION public\.cashier_lookup_player_payout\(/);
    assert.match(apiSql, /CREATE OR REPLACE FUNCTION public\.cashier_confirm_player_payout\(/);
    assert.match(apiSql, /gen_random_bytes\(8\)/);
    assert.match(apiSql, /\^\[0-9a-f\]\{16\}\$/);
    assert.match(apiSql, /private\.get_current_cashier_context_locked\(\)/);
    assert.match(apiSql, /FOR UPDATE/);
    assert.match(apiSql, /OPERATIONAL_ACCOUNT_NOT_ACTIVE/);
    assert.match(apiSql, /GRANT EXECUTE ON FUNCTION public\.cashier_deposit_player/);
    assert.match(apiSql, /REVOKE ALL ON FUNCTION public\.cashier_deposit_to_player/);
    assert.match(apiSql, /REVOKE ALL ON FUNCTION public\.cashier_payout_by_code/);
    assert.equal(/\bSET\s+migration_state\s*=/.test(apiSql), false);
  });

  it('lock order is staff → request → operational → wallet', () => {
    assert.match(engineSql, /OPERATIONAL ACCOUNT → PLAYER WALLET/);
    assert.match(apiSql, /get_current_cashier_context_locked/);
    const confirmAt = apiSql.indexOf('CREATE OR REPLACE FUNCTION public.cashier_confirm_player_payout');
    const confirm = apiSql.slice(confirmAt);
    const staffLock = confirm.indexOf('get_current_cashier_context_locked');
    const ownOps = confirm.indexOf('cashier_require_own_ops_active');
    const requestLock = confirm.indexOf('FOR UPDATE');
    const engineCall = confirm.indexOf("'PLAYER_TO_CASHIER'");
    assert.equal(
      staffLock >= 0 && ownOps > staffLock && requestLock > ownOps && engineCall > requestLock,
      true,
    );
    assert.equal(confirm.includes('cashier_require_platform_ops_active'), false);
  });

  it('rollback fixture uses live player 110790 and exact op account only', () => {
    assert.match(rollbackSql, /110790/);
    assert.match(rollbackSql, /bc5d66cd-5e18-4352-b7f8-ea99029758e0/);
    assert.match(rollbackSql, /3ea1677a-d664-47c3-b019-0635b643d6e5/);
    assert.match(rollbackSql, /27f26a0a-5831-47f2-8ddf-321a80317e6f/);
    assert.equal(rollbackSql.includes('882341'), false);
    assert.match(rollbackSql, /WHERE id = '27f26a0a-5831-47f2-8ddf-321a80317e6f'/);
    assert.equal(/SET migration_state = 'active'[\s\S]{0,80}legacy_cashier_id/.test(rollbackSql), false);
    assert.match(rollbackSql, /^ROLLBACK;\s*$/m);
    assert.equal(/\bCOMMIT\s*;/.test(rollbackSql), false);
    assert.match(rollbackSql, /player_cancel_cashier_payout/);
    assert.match(rollbackSql, /expire_cashier_player_payout/);
    assert.match(rollbackSql, /EXPECTED_ERROR_NOT_RAISED/);
    assert.match(rollbackSql, /GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT/);
    assert.equal(rollbackSql.includes("RAISE EXCEPTION 'expected error % from %'"), false);
  });

  it('does not rewrite Wallet Core apply_wallet_entry', () => {
    assert.equal(engineSql.includes('CREATE OR REPLACE FUNCTION private.apply_wallet_entry'), false);
    assert.equal(apiSql.includes('CREATE OR REPLACE FUNCTION private.apply_wallet_entry'), false);
    assert.match(engineSql, /private\.apply_wallet_entry\(/);
    assert.match(apiSql, /private\.apply_wallet_entry\(/);
  });
});
