import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import { handleOwnerControlRequest } from '../owner/ownerControlHttp.js';
import type { OwnerRpcPort } from '../owner/ownerRpc.js';
import type { OwnerAuthGatewayPorts } from '../staff/ownerAuthService.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from '../staff/ownerCookies.js';
import { PLAYER_ACCESS_COOKIE, PLAYER_REFRESH_COOKIE } from './playerCookies.js';
import { handlePlayerWithdrawalsRequest } from './playerWithdrawalHttp.js';
import type { PlayerGameGatewayPorts } from './playerGamesService.js';
import { CANONICAL_CASHIER_MONEY_RPCS } from '../cashier/cashierControlHttp.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260913133000_withdrawal_ledger_041.sql'),
  'utf8',
);

const WITHDRAWAL_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const PLAYER_ACCESS = 'player-access-token';
const PLAYER_REFRESH = 'player-refresh-token';
const OWNER_ACCESS = 'owner-access-token';
const OWNER_REFRESH = 'owner-refresh-token';

function playerCookie(): string {
  return `${PLAYER_ACCESS_COOKIE}=${encodeURIComponent(PLAYER_ACCESS)}; ${PLAYER_REFRESH_COOKIE}=${encodeURIComponent(PLAYER_REFRESH)}`;
}

function ownerCookie(): string {
  return `${OWNER_ACCESS_COOKIE}=${encodeURIComponent(OWNER_ACCESS)}; ${OWNER_REFRESH_COOKIE}=${encodeURIComponent(OWNER_REFRESH)}`;
}

function createPlayerPorts(init?: {
  rpcError?: string;
  rpcPayload?: Record<string, unknown>;
}): PlayerGameGatewayPorts & { rpcs: Array<{ token: string; name: string; args?: Record<string, unknown> }> } {
  const rpcs: Array<{ token: string; name: string; args?: Record<string, unknown> }> = [];
  return {
    rpcs,
    async signInWithPassword() {
      throw staffError('AUTH_FAILED', 401);
    },
    async signUp() {
      throw staffError('AUTH_FAILED', 401);
    },
    async refreshSession() {
      return { accessToken: 'player-access-rotated', refreshToken: 'player-refresh-rotated' };
    },
    async getAuthUser() {
      return { id: '11111111-2222-3333-4444-555555555555', email: 'player@nextpari.test' };
    },
    async ensurePlayerAccount() {
      return { walletId: 'w1', publicId: '110790', legacyBalance: 50, migrationState: 'active' };
    },
    async loadOwnWallet() {
      return { balance: 50, currency: 'TMTM', status: 'active', publicId: '110790' };
    },
    async savePlayerProfile() {},
    gameRpc(accessToken: string) {
      return {
        async invoke(name: string, args?: Record<string, unknown>) {
          rpcs.push({ token: accessToken, name, args });
          if (init?.rpcError) throw staffError(init.rpcError, init.rpcError === 'AUTH_REQUIRED' ? 401 : 409);
          return init?.rpcPayload ?? { ok: true, id: WITHDRAWAL_ID, status: 'pending', amount: 10, is_duplicate: false };
        },
      };
    },
  };
}

function ownerAuth(): OwnerAuthGatewayPorts {
  return {
    async signInWithPassword() {
      return { accessToken: OWNER_ACCESS, refreshToken: OWNER_REFRESH };
    },
    async refreshSession() {
      return { accessToken: OWNER_ACCESS, refreshToken: OWNER_REFRESH };
    },
    async currentStaffContext() {
      return { role: 'owner', status: 'active', auth_user_id: 'owner-uid', display_name: 'Owner', network_id: null };
    },
  };
}

function ownerRpc() {
  const calls: Array<{ token: string; name: string; args?: Record<string, unknown> }> = [];
  const rpcFactory = (accessToken: string): OwnerRpcPort => ({
    async invoke(name, args) {
      calls.push({ token: accessToken, name, args });
      return { ok: true, is_duplicate: name.includes('reject') && calls.filter((c) => c.name === name).length > 1, id: WITHDRAWAL_ID };
    },
  });
  return { calls, rpcFactory };
}

describe('withdrawal ledger SQL contract (not executed)', () => {
  it('holds via Wallet Core and does not mutate public.wallets or rewrite apply_wallet_entry', () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS private\.player_withdrawal_requests/);
    assert.match(migration, /WITHDRAWAL_HOLD/);
    assert.match(migration, /WITHDRAWAL_RELEASE/);
    assert.match(migration, /WITHDRAWAL_COMPLETE/);
    assert.match(migration, /public\.player_request_cashier_payout/);
    assert.equal(migration.includes('CREATE OR REPLACE FUNCTION private.apply_wallet_entry'), false);
    assert.equal(/UPDATE\s+public\.wallets/.test(migration), false);
    assert.equal(/INSERT INTO public\.wallets/.test(migration), false);
    assert.equal(migration.includes('DROP TABLE'), false);
    assert.equal(migration.includes('nextpari.withdrawal_requests.v1'), false);
  });

  it('does not grant anon financial mutation and revokes legacy public.withdrawal_requests', () => {
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.player_create_withdrawal/);
    assert.match(migration, /TO authenticated/);
    assert.equal(/GRANT EXECUTE ON FUNCTION public\.player_create_withdrawal[\s\S]{0,80}TO anon/.test(migration), false);
    assert.match(migration, /REVOKE ALL ON TABLE public\.withdrawal_requests FROM anon, authenticated/);
    assert.match(migration, /REVOKE ALL ON TABLE private\.player_withdrawal_requests FROM anon, authenticated/);
    assert.equal(migration.includes('GRANT INSERT ON TABLE private.wallet_ledger'), false);
  });

  it('binds player create to auth.uid and ignores browser authority columns as inputs', () => {
    const createAt = migration.indexOf('CREATE OR REPLACE FUNCTION public.player_create_withdrawal');
    const create = migration.slice(createAt, migration.indexOf('CREATE OR REPLACE FUNCTION public.player_list_withdrawals'));
    assert.match(create, /v_uid := auth\.uid\(\)/);
    assert.match(create, /AUTH_REQUIRED/);
    assert.match(create, /AMOUNT_NOT_POSITIVE/);
    assert.match(create, /private\.owner_require_idempotency_key/);
    assert.equal(create.includes('p_wallet_id'), false);
    assert.equal(create.includes('p_player_id'), false);
    assert.equal(create.includes('p_auth_user_id'), false);
    assert.equal(create.includes('p_cashier_id'), false);
    assert.equal(create.includes('p_balance'), false);
  });

  it('rejects once with a single WITHDRAWAL_RELEASE and does not pay cash from owner', () => {
    const rejectAt = migration.indexOf('CREATE OR REPLACE FUNCTION public.owner_reject_withdrawal');
    const reject = migration.slice(rejectAt, migration.indexOf('CREATE OR REPLACE FUNCTION public.owner_mark_withdrawal_paid'));
    assert.match(reject, /private\.get_current_owner_context\(\)/);
    assert.match(reject, /reject_idempotency_key IS NOT DISTINCT FROM v_key/);
    assert.match(reject, /is_duplicate', true/);
    assert.match(reject, /wd-release:' \|\| v_row\.id::TEXT/);
    assert.match(reject, /WITHDRAWAL_RELEASE/);
    assert.match(reject, /private\.release_cashier_player_payout_hold/);
    assert.equal(reject.includes('UPDATE public.wallets'), false);

    const paidAt = migration.indexOf('CREATE OR REPLACE FUNCTION public.owner_mark_withdrawal_paid');
    const paid = migration.slice(paidAt);
    assert.match(paid, /WITHDRAWAL_CASH_REQUIRES_CASHIER/);
    assert.match(paid, /WITHDRAWAL_COMPLETE/);
    assert.match(paid, /wd-complete:' \|\| v_row\.id::TEXT/);
    assert.match(paid, /status IS DISTINCT FROM 'approved'/);
  });
});

describe('player withdrawal HTTP gateway', () => {
  it('requires a player session', async () => {
    const ports = createPlayerPorts();
    const result = await handlePlayerWithdrawalsRequest(
      { method: 'POST', pathname: '/api/player/withdrawals', cookieSecure: true, body: { method: 'card', amount: 10, methodLabel: 'Card', idempotencyKey: 'k1', destinationRef: '4111111111111111' } },
      ports,
    );
    assert.equal(result.status, 401);
    assert.equal(ports.rpcs.length, 0);
  });

  it('rejects zero/negative amount before RPC', async () => {
    const ports = createPlayerPorts();
    const zero = await handlePlayerWithdrawalsRequest(
      { method: 'POST', pathname: '/api/player/withdrawals', cookie: playerCookie(), cookieSecure: true, body: { method: 'card', amount: 0, methodLabel: 'Card', idempotencyKey: 'k1', destinationRef: '1111' } },
      ports,
    );
    assert.equal(zero.status, 400);
    assert.equal(zero.body.error, 'AMOUNT_NOT_POSITIVE');
    const negative = await handlePlayerWithdrawalsRequest(
      { method: 'POST', pathname: '/api/player/withdrawals', cookie: playerCookie(), cookieSecure: true, body: { method: 'card', amount: -5, methodLabel: 'Card', idempotencyKey: 'k1', destinationRef: '1111' } },
      ports,
    );
    assert.equal(negative.status, 400);
    assert.equal(ports.rpcs.length, 0);
  });

  it('maps insufficient funds from the wallet ledger', async () => {
    const ports = createPlayerPorts({ rpcError: 'INSUFFICIENT_AVAILABLE_BALANCE' });
    const result = await handlePlayerWithdrawalsRequest(
      { method: 'POST', pathname: '/api/player/withdrawals', cookie: playerCookie(), cookieSecure: true, body: { method: 'card', amount: 10, methodLabel: 'Card', idempotencyKey: 'k1', destinationRef: '1111' } },
      ports,
    );
    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'INSUFFICIENT_AVAILABLE_BALANCE');
  });

  it('sends one create RPC and ignores browser wallet/player/cashier authority', async () => {
    const ports = createPlayerPorts({ rpcPayload: { ok: true, id: WITHDRAWAL_ID, is_duplicate: false, amount: 25, status: 'pending' } });
    const result = await handlePlayerWithdrawalsRequest(
      {
        method: 'POST',
        pathname: '/api/player/withdrawals',
        cookie: playerCookie(),
        cookieSecure: true,
        body: {
          method: 'card',
          amount: 25,
          methodLabel: 'Карта',
          idempotencyKey: 'same-key',
          destinationRef: '4111111111111111',
          walletId: 'forged-wallet',
          playerId: 'forged-player',
          cashierId: 'forged-cashier',
          balance: 9999,
          status: 'paid',
        },
      },
      ports,
    );
    assert.equal(result.status, 200);
    assert.equal(ports.rpcs.length, 1);
    assert.equal(ports.rpcs[0]?.name, 'player_create_withdrawal');
    assert.equal(ports.rpcs[0]?.args?.p_amount, 25);
    assert.equal(ports.rpcs[0]?.args?.p_idempotency_key, 'same-key');
    assert.equal('p_wallet_id' in (ports.rpcs[0]?.args ?? {}), false);
    assert.equal('p_player_id' in (ports.rpcs[0]?.args ?? {}), false);
    assert.equal('p_cashier_id' in (ports.rpcs[0]?.args ?? {}), false);
    assert.equal(ports.rpcs[0]?.token, PLAYER_ACCESS);
  });

  it('duplicate idempotency payload is returned by the RPC without a second client invent', async () => {
    const ports = createPlayerPorts({ rpcPayload: { ok: true, id: WITHDRAWAL_ID, is_duplicate: true, amount: 25, status: 'pending' } });
    const first = await handlePlayerWithdrawalsRequest(
      { method: 'POST', pathname: '/api/player/withdrawals', cookie: playerCookie(), cookieSecure: true, body: { method: 'ewallet', amount: 25, methodLabel: 'Wallet', idempotencyKey: 'dup', destinationRef: '12345678' } },
      ports,
    );
    const second = await handlePlayerWithdrawalsRequest(
      { method: 'POST', pathname: '/api/player/withdrawals', cookie: playerCookie(), cookieSecure: true, body: { method: 'ewallet', amount: 25, methodLabel: 'Wallet', idempotencyKey: 'dup', destinationRef: '12345678' } },
      ports,
    );
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(ports.rpcs.length, 2);
    assert.equal(ports.rpcs[0]?.args?.p_idempotency_key, 'dup');
    assert.equal(ports.rpcs[1]?.args?.p_idempotency_key, 'dup');
  });
});

describe('owner withdrawal HTTP gateway', () => {
  it('lists through owner_list_withdrawals and requires owner session', async () => {
    const rpc = ownerRpc();
    const listed = await handleOwnerControlRequest(
      { method: 'GET', pathname: '/api/owner/withdrawals', search: '?status=pending', cookie: ownerCookie(), cookieSecure: true },
      { sessionPorts: ownerAuth(), rpcFactory: rpc.rpcFactory },
    );
    assert.equal(listed.status, 200);
    assert.equal(rpc.calls[0]?.name, 'owner_list_withdrawals');

    const missing = await handleOwnerControlRequest(
      { method: 'GET', pathname: '/api/owner/withdrawals', cookieSecure: true },
      { sessionPorts: ownerAuth(), rpcFactory: rpc.rpcFactory },
    );
    assert.equal(missing.status, 401);
  });

  it('approve / reject / paid are idempotent RPCs keyed from the owner JWT', async () => {
    const rpc = ownerRpc();
    const approve = await handleOwnerControlRequest(
      { method: 'POST', pathname: `/api/owner/withdrawals/${WITHDRAWAL_ID}/approve`, cookie: ownerCookie(), cookieSecure: true, body: { idempotencyKey: 'a1', playerId: 'forged' } },
      { sessionPorts: ownerAuth(), rpcFactory: rpc.rpcFactory },
    );
    const reject1 = await handleOwnerControlRequest(
      { method: 'POST', pathname: `/api/owner/withdrawals/${WITHDRAWAL_ID}/reject`, cookie: ownerCookie(), cookieSecure: true, body: { reason: 'docs', idempotencyKey: 'r1' } },
      { sessionPorts: ownerAuth(), rpcFactory: rpc.rpcFactory },
    );
    const reject2 = await handleOwnerControlRequest(
      { method: 'POST', pathname: `/api/owner/withdrawals/${WITHDRAWAL_ID}/reject`, cookie: ownerCookie(), cookieSecure: true, body: { reason: 'docs', idempotencyKey: 'r1' } },
      { sessionPorts: ownerAuth(), rpcFactory: rpc.rpcFactory },
    );
    const paid = await handleOwnerControlRequest(
      { method: 'POST', pathname: `/api/owner/withdrawals/${WITHDRAWAL_ID}/paid`, cookie: ownerCookie(), cookieSecure: true, body: { idempotencyKey: 'p1' } },
      { sessionPorts: ownerAuth(), rpcFactory: rpc.rpcFactory },
    );
    assert.equal(approve.status, 200);
    assert.equal(reject1.status, 200);
    assert.equal(reject2.status, 200);
    assert.equal(paid.status, 200);
    assert.equal(rpc.calls[0]?.name, 'owner_approve_withdrawal');
    assert.equal(rpc.calls[1]?.name, 'owner_reject_withdrawal');
    assert.equal(rpc.calls[2]?.name, 'owner_reject_withdrawal');
    assert.equal(rpc.calls[1]?.args?.p_idempotency_key, rpc.calls[2]?.args?.p_idempotency_key);
    assert.equal(rpc.calls[3]?.name, 'owner_mark_withdrawal_paid');
    assert.equal('p_player_id' in (rpc.calls[0]?.args ?? {}), false);
  });
});

describe('browser financial authority removed; cashier cash path unchanged', () => {
  it('does not keep localStorage withdrawal authority or markWithdrawalPaidByPin', () => {
    const requests = readFileSync(join(root, 'src/lib/withdrawalRequests.ts'), 'utf8');
    const cash = readFileSync(join(root, 'src/lib/playerCashPayout.ts'), 'utf8');
    const wallet = readFileSync(join(root, 'src/screens/WalletScreen.tsx'), 'utf8');
    assert.equal(requests.includes('localStorage'), false);
    assert.equal(requests.includes('sessionStorage'), false);
    assert.equal(requests.includes('markWithdrawalPaidByPin'), false);
    assert.equal(requests.includes('nextpari.withdrawal_requests.v1'), false);
    assert.match(requests, /\/api\/player\/withdrawals/);
    assert.equal(cash.includes('localStorage'), false);
    assert.equal(wallet.includes('Math.random()'), false);
    assert.equal(wallet.includes('applyBalance(result.newBalance)'), false);
    assert.equal(existsSync(join(root, 'src/lib/cashier.ts')), false);
  });

  it('keeps canonical cashier payout lookup/confirm', () => {
    assert.deepEqual([...CANONICAL_CASHIER_MONEY_RPCS], [
      'cashier_deposit_player',
      'cashier_lookup_player_payout',
      'cashier_confirm_player_payout',
    ]);
    const http = readFileSync(join(root, 'server/cashier/cashierControlHttp.ts'), 'utf8');
    assert.match(http, /cashier_confirm_player_payout/);
    assert.equal(http.includes("invoke('cashier_payout_by_code'"), false);
  });
});
