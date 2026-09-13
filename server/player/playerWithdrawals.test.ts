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

  it('legacy public.withdrawal_requests cleanup is skipped when the table is absent', () => {
    const guardAt = migration.indexOf("to_regclass('public.withdrawal_requests')");
    const dropAt = migration.indexOf('DROP POLICY IF EXISTS "anon_select_withdrawals"');
    const revokeAt = migration.lastIndexOf('REVOKE ALL ON TABLE public.withdrawal_requests');
    assert.ok(guardAt > 0, 'to_regclass guard');
    assert.match(migration, /IF to_regclass\('public\.withdrawal_requests'\) IS NOT NULL THEN/);
    assert.match(migration, /EXECUTE 'DROP POLICY IF EXISTS "anon_select_withdrawals" ON public\.withdrawal_requests'/);
    assert.match(migration, /EXECUTE 'REVOKE ALL ON TABLE public\.withdrawal_requests FROM anon, authenticated'/);
    assert.ok(dropAt > guardAt);
    assert.ok(revokeAt > guardAt);
    assert.equal(migration.includes('CREATE TABLE public.withdrawal_requests'), false);
    assert.equal(migration.includes('CREATE TABLE IF NOT EXISTS public.withdrawal_requests'), false);
    const tail = migration.slice(migration.indexOf('GRANT EXECUTE ON FUNCTION public.owner_mark_withdrawal_paid'));
    assert.equal(/^[\s\S]*DROP POLICY IF EXISTS "anon_select_withdrawals" ON public\.withdrawal_requests;/m.test(tail.replace(/EXECUTE '[^']*'/g, '')), false);
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
    assert.match(create, /CARD_WITHDRAWAL_PROVIDER_REQUIRED/);
    assert.match(create, /CASH_WITHDRAWAL_BELOW_MIN/);
    assert.match(create, /v_method = 'cash' AND v_amount < 40/);
    assert.match(create, /v_existing.destination_ref IS DISTINCT FROM v_dest/);
    assert.match(create, /v_existing.cash_pickup_city IS DISTINCT FROM v_city/);
    assert.match(create, /v_existing.cash_pickup_point IS DISTINCT FROM v_point/);
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
    assert.match(paid, /CARD_WITHDRAWAL_PROVIDER_REQUIRED/);
    assert.match(paid, /WITHDRAWAL_COMPLETE/);
    assert.match(paid, /wd-complete:' \|\| v_row\.id::TEXT/);
    assert.match(paid, /status IS DISTINCT FROM 'approved'/);
  });

  it('keeps card destination as last 4 digits and never stores a full PAN', () => {
    const sanitizeAt = migration.indexOf('CREATE OR REPLACE FUNCTION private.withdrawal_sanitize_destination');
    const sanitize = migration.slice(sanitizeAt, migration.indexOf('CREATE OR REPLACE FUNCTION private.withdrawal_effective_status'));
    assert.match(sanitize, /RETURN right\(v_digits, 4\)/);
    assert.equal(sanitize.includes('pgp_sym_encrypt'), false);
    const createAt = migration.indexOf('CREATE OR REPLACE FUNCTION public.player_create_withdrawal');
    const create = migration.slice(createAt, migration.indexOf('CREATE OR REPLACE FUNCTION public.player_list_withdrawals'));
    const cardRaiseAt = create.indexOf("IF v_method = 'card' THEN");
    const destAt = create.indexOf('private.withdrawal_sanitize_destination');
    assert.ok(cardRaiseAt > 0 && destAt > cardRaiseAt);
    assert.match(create, /RAISE EXCEPTION 'CARD_WITHDRAWAL_PROVIDER_REQUIRED'/);
    const approveAt = migration.indexOf('CREATE OR REPLACE FUNCTION public.owner_approve_withdrawal');
    const approve = migration.slice(approveAt, migration.indexOf('CREATE OR REPLACE FUNCTION public.owner_reject_withdrawal'));
    assert.match(approve, /CARD_WITHDRAWAL_PROVIDER_REQUIRED/);
  });

  it('expired cash payouts release the hold exactly once through canonical expire helpers', () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION private.withdrawal_reconcile_expired_cash/);
    assert.equal(migration.includes('CREATE OR REPLACE FUNCTION private.expire_cashier_player_payout'), false);
    assert.equal(migration.includes('CREATE OR REPLACE FUNCTION private.expire_due_cashier_player_payouts'), false);
    const helperAt = migration.indexOf('CREATE OR REPLACE FUNCTION private.withdrawal_reconcile_expired_cash');
    const helper = migration.slice(helperAt, migration.indexOf('CREATE OR REPLACE FUNCTION public.player_create_withdrawal'));
    assert.match(helper, /private.expire_due_cashier_player_payouts\(100\)/);
    assert.match(helper, /private.expire_cashier_player_payout\(v_id\)/);
    assert.match(helper, /SET status = 'expired'/);
    assert.equal(/UPDATE\s+public\.wallets/.test(helper), false);
    const listAt = migration.indexOf('CREATE OR REPLACE FUNCTION public.player_list_withdrawals');
    const list = migration.slice(listAt, migration.indexOf('CREATE OR REPLACE FUNCTION public.owner_list_withdrawals'));
    assert.match(list, /private.withdrawal_reconcile_expired_cash\(v_uid\)/);
    const ownerListAt = migration.indexOf('CREATE OR REPLACE FUNCTION public.owner_list_withdrawals');
    const ownerList = migration.slice(ownerListAt, migration.indexOf('CREATE OR REPLACE FUNCTION public.owner_approve_withdrawal'));
    assert.match(ownerList, /private.withdrawal_reconcile_expired_cash\(NULL\)/);
    const expireSql = readFileSync(
      join(root, 'supabase/migrations/20260831_024_cashier_player_finance_api.sql'),
      'utf8',
    );
    const expireAt = expireSql.indexOf('CREATE OR REPLACE FUNCTION private.expire_cashier_player_payout');
    const expireFn = expireSql.slice(expireAt, expireSql.indexOf('CREATE OR REPLACE FUNCTION private.expire_due_cashier_player_payouts'));
    assert.match(expireFn, /IF v_req.status = 'expired' THEN/);
    assert.match(expireFn, /is_duplicate', true/);
    assert.match(expireFn, /private.release_cashier_player_payout_hold/);
  });

  it('revokes authenticated execute on legacy player cash create/cancel and leaves cashier lookup/confirm', () => {
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION public\.player_request_cashier_payout\(NUMERIC, TEXT\) FROM PUBLIC/,
    );
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION public\.player_request_cashier_payout\(NUMERIC, TEXT\) FROM anon, authenticated/,
    );
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION public\.player_cancel_cashier_payout\(UUID, TEXT\) FROM PUBLIC/,
    );
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION public\.player_cancel_cashier_payout\(UUID, TEXT\) FROM anon, authenticated/,
    );
    assert.match(
      migration,
      /GRANT EXECUTE ON FUNCTION public\.player_request_cashier_payout\(NUMERIC, TEXT\) TO service_role/,
    );
    assert.match(
      migration,
      /GRANT EXECUTE ON FUNCTION public\.player_cancel_cashier_payout\(UUID, TEXT\) TO service_role/,
    );
    assert.equal(
      /GRANT EXECUTE ON FUNCTION public\.player_request_cashier_payout[\s\S]{0,80}TO authenticated/.test(migration),
      false,
    );
    assert.equal(
      /GRANT EXECUTE ON FUNCTION public\.player_cancel_cashier_payout[\s\S]{0,80}TO authenticated/.test(migration),
      false,
    );
    assert.equal(migration.includes('REVOKE ALL ON FUNCTION public.cashier_lookup_player_payout'), false);
    assert.equal(migration.includes('REVOKE ALL ON FUNCTION public.cashier_confirm_player_payout'), false);
    assert.match(migration, /public.player_request_cashier_payout\(v_amount, v_key\)/);
  });
});

describe('player withdrawal HTTP gateway', () => {
  it('requires a player session', async () => {
    const ports = createPlayerPorts();
    const result = await handlePlayerWithdrawalsRequest(
      { method: 'POST', pathname: '/api/player/withdrawals', cookieSecure: true, body: { method: 'ewallet', amount: 10, methodLabel: 'Wallet', idempotencyKey: 'k1', destinationRef: '12345678' } },
      ports,
    );
    assert.equal(result.status, 401);
    assert.equal(ports.rpcs.length, 0);
  });

  it('rejects zero/negative amount before RPC', async () => {
    const ports = createPlayerPorts();
    const zero = await handlePlayerWithdrawalsRequest(
      { method: 'POST', pathname: '/api/player/withdrawals', cookie: playerCookie(), cookieSecure: true, body: { method: 'ewallet', amount: 0, methodLabel: 'Wallet', idempotencyKey: 'k1', destinationRef: '12345678' } },
      ports,
    );
    assert.equal(zero.status, 400);
    assert.equal(zero.body.error, 'AMOUNT_NOT_POSITIVE');
    const negative = await handlePlayerWithdrawalsRequest(
      { method: 'POST', pathname: '/api/player/withdrawals', cookie: playerCookie(), cookieSecure: true, body: { method: 'ewallet', amount: -5, methodLabel: 'Wallet', idempotencyKey: 'k1', destinationRef: '12345678' } },
      ports,
    );
    assert.equal(negative.status, 400);
    assert.equal(ports.rpcs.length, 0);
    const nan = await handlePlayerWithdrawalsRequest(
      { method: 'POST', pathname: '/api/player/withdrawals', cookie: playerCookie(), cookieSecure: true, body: { method: 'ewallet', amount: Number.NaN, methodLabel: 'Wallet', idempotencyKey: 'k1', destinationRef: '12345678' } },
      ports,
    );
    const inf = await handlePlayerWithdrawalsRequest(
      { method: 'POST', pathname: '/api/player/withdrawals', cookie: playerCookie(), cookieSecure: true, body: { method: 'ewallet', amount: Number.POSITIVE_INFINITY, methodLabel: 'Wallet', idempotencyKey: 'k1', destinationRef: '12345678' } },
      ports,
    );
    assert.equal(nan.status, 400);
    assert.equal(nan.body.error, 'AMOUNT_NOT_POSITIVE');
    assert.equal(inf.status, 400);
    assert.equal(inf.body.error, 'AMOUNT_NOT_POSITIVE');
  });

  it('rejects more than 2 decimal places instead of rounding', async () => {
    const ports = createPlayerPorts();
    const result = await handlePlayerWithdrawalsRequest(
      { method: 'POST', pathname: '/api/player/withdrawals', cookie: playerCookie(), cookieSecure: true, body: { method: 'ewallet', amount: 10.123, methodLabel: 'Wallet', idempotencyKey: 'k1', destinationRef: '12345678' } },
      ports,
    );
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'AMOUNT_SCALE_INVALID');
    assert.equal(ports.rpcs.length, 0);
  });

  it('accepts 10 / 10.1 / 10.12 without rewriting the amount', async () => {
    const ports = createPlayerPorts();
    for (const amount of [10, 10.1, 10.12]) {
      const result = await handlePlayerWithdrawalsRequest(
        { method: 'POST', pathname: '/api/player/withdrawals', cookie: playerCookie(), cookieSecure: true, body: { method: 'ewallet', amount, methodLabel: 'Wallet', idempotencyKey: `k-${amount}`, destinationRef: '12345678' } },
        ports,
      );
      assert.equal(result.status, 200, String(amount));
      assert.equal(ports.rpcs.at(-1)?.args?.p_amount, amount);
    }
    assert.equal(ports.rpcs.length, 3);
  });

  it('rejects cash below 40 TMTM and accepts 40', async () => {
    const below = createPlayerPorts();
    const low = await handlePlayerWithdrawalsRequest(
      {
        method: 'POST',
        pathname: '/api/player/withdrawals',
        cookie: playerCookie(),
        cookieSecure: true,
        body: { method: 'cash', amount: 39.99, methodLabel: 'Cash', idempotencyKey: 'cash-low', city: 'Ashgabat', point: 'Point 1' },
      },
      below,
    );
    assert.equal(low.status, 400);
    assert.equal(low.body.error, 'CASH_WITHDRAWAL_BELOW_MIN');
    assert.equal(below.rpcs.length, 0);

    const ok = createPlayerPorts();
    const allowed = await handlePlayerWithdrawalsRequest(
      {
        method: 'POST',
        pathname: '/api/player/withdrawals',
        cookie: playerCookie(),
        cookieSecure: true,
        body: { method: 'cash', amount: 40, methodLabel: 'Cash', idempotencyKey: 'cash-min', city: 'Ashgabat', point: 'Point 1' },
      },
      ok,
    );
    assert.equal(allowed.status, 200);
    assert.equal(ok.rpcs.length, 1);
    assert.equal(ok.rpcs[0]?.args?.p_amount, 40);
    assert.equal(ok.rpcs[0]?.args?.p_method, 'cash');
  });

  it('maps insufficient funds from the wallet ledger', async () => {
    const ports = createPlayerPorts({ rpcError: 'INSUFFICIENT_AVAILABLE_BALANCE' });
    const result = await handlePlayerWithdrawalsRequest(
      { method: 'POST', pathname: '/api/player/withdrawals', cookie: playerCookie(), cookieSecure: true, body: { method: 'ewallet', amount: 10, methodLabel: 'Wallet', idempotencyKey: 'k1', destinationRef: '12345678' } },
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
          method: 'crypto',
          amount: 25,
          methodLabel: 'USDT',
          idempotencyKey: 'same-key',
          destinationRef: 'TXYZCRYPTOADDR1111111111111111111',
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

  it('rejects card create without forwarding a PAN to RPC', async () => {
    const ports = createPlayerPorts();
    const result = await handlePlayerWithdrawalsRequest(
      {
        method: 'POST',
        pathname: '/api/player/withdrawals',
        cookie: playerCookie(),
        cookieSecure: true,
        body: {
          method: 'card',
          amount: 25,
          methodLabel: 'Card',
          idempotencyKey: 'card-key',
          destinationRef: '4111111111111111',
        },
      },
      ports,
    );
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'CARD_WITHDRAWAL_PROVIDER_REQUIRED');
    assert.equal(ports.rpcs.length, 0);
  });

  it('maps same idempotency key with a different destination as a conflict', async () => {
    const ports = createPlayerPorts({ rpcError: 'IDEMPOTENCY_KEY_CONFLICT' });
    const result = await handlePlayerWithdrawalsRequest(
      {
        method: 'POST',
        pathname: '/api/player/withdrawals',
        cookie: playerCookie(),
        cookieSecure: true,
        body: { method: 'crypto', amount: 25, methodLabel: 'USDT', idempotencyKey: 'dup', destinationRef: 'OTHERADDR' },
      },
      ports,
    );
    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'IDEMPOTENCY_KEY_CONFLICT');
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

  it('owner parser and UI keep destination fields and never show a cash PIN', () => {
    const services = readFileSync(join(root, 'src/owner/services.ts'), 'utf8');
    const panel = readFileSync(join(root, 'src/owner/WithdrawalsPanel.tsx'), 'utf8');
    const wallet = readFileSync(join(root, 'src/screens/WalletScreen.tsx'), 'utf8');
    assert.match(services, /destinationRef: item.destination_ref == null && item.destinationRef == null/);
    assert.match(services, /cashPickupCity: item.cash_pickup_city == null && item.cashPickupCity == null/);
    assert.match(services, /cashPickupPoint: item.cash_pickup_point == null && item.cashPickupPoint == null/);
    assert.match(panel, /destinationText\(row\)/);
    assert.match(panel, /row.destinationRef/);
    assert.match(panel, /row.cashPickupCity/);
    assert.match(panel, /row.cashPickupPoint/);
    assert.equal(panel.includes('pin_code'), false);
    assert.equal(panel.includes('secret_code'), false);
    assert.equal(panel.includes('secretCode'), false);
    assert.match(panel, /!cash && !card && approved/);
    assert.match(wallet, /Exclude<WithdrawalMethod, 'other' \| 'card'>/);
    assert.equal(wallet.includes("method: 'card'"), false);
    assert.equal(wallet.includes('4111111111111111'), false);
  });
});
