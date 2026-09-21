import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import type { SecurityAuthGatewayPorts } from '../staff/securityAuthService.js';
import { SECURITY_ACCESS_COOKIE, SECURITY_REFRESH_COOKIE } from '../staff/securityCookies.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from '../staff/ownerCookies.js';
import { handleOwnerControlRequest } from '../owner/ownerControlHttp.js';
import { handleManagerControlRequest } from '../manager/managerControlHttp.js';
import { handleCashierControlRequest } from '../cashier/cashierControlHttp.js';
import { handleSecurityControlRequest } from './securityControlHttp.js';
import { SECURITY_DENIED_RPCS, type SecurityRpcPort } from './securityRpc.js';

const ACCESS = 'security-access-token';
const REFRESH = 'security-refresh-token';
const FLAG_ID = '11111111-1111-4111-8111-111111111111';
const BET_ID = '22222222-2222-4222-8222-222222222222';
const PLAYER_ID = '110790';

const SECURITY_CTX = {
  role: 'security',
  status: 'active',
  auth_user_id: 'sec-uid-1',
  display_name: 'Security One',
  login: 'security01',
};

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

function cookieHeader(access?: string | null, refresh?: string | null): string {
  const parts: string[] = [];
  if (access) parts.push(`${SECURITY_ACCESS_COOKIE}=${encodeURIComponent(access)}`);
  if (refresh) parts.push(`${SECURITY_REFRESH_COOKIE}=${encodeURIComponent(refresh)}`);
  return parts.join('; ');
}

function createAuthPorts(): SecurityAuthGatewayPorts {
  return {
    async lookupLoginEmail() {
      throw staffError('AUTH_FAILED', 401);
    },
    async signInWithPassword() {
      throw staffError('AUTH_FAILED', 401);
    },
    async refreshSession() {
      throw staffError('JWT_INVALID', 401);
    },
    async signOutCurrentSession() {},
    async currentStaffContext() {
      return SECURITY_CTX;
    },
  };
}

function createRpc() {
  const calls: Array<{ token: string; name: string; args?: Record<string, unknown> }> = [];
  const rpcFactory = (accessToken: string): SecurityRpcPort => ({
    async invoke(name, args) {
      calls.push({ token: accessToken, name, args });
      return { ok: true, rpc: name, args: args ?? null };
    },
  });
  return { calls, rpcFactory };
}

async function securityGet(pathname: string, search?: string) {
  const rpc = createRpc();
  const result = await handleSecurityControlRequest(
    {
      method: 'GET',
      pathname,
      search,
      cookie: cookieHeader(ACCESS, REFRESH),
      cookieSecure: true,
    },
    { sessionPorts: createAuthPorts(), rpcFactory: rpc.rpcFactory },
  );
  return { result, rpc };
}

async function securityPost(pathname: string, body: unknown) {
  const rpc = createRpc();
  const result = await handleSecurityControlRequest(
    {
      method: 'POST',
      pathname,
      cookie: cookieHeader(ACCESS, REFRESH),
      cookieSecure: true,
      body,
    },
    { sessionPorts: createAuthPorts(), rpcFactory: rpc.rpcFactory },
  );
  return { result, rpc };
}

describe('security control same-origin BFF', () => {
  it('SECURITY OVERVIEW: ALLOWED', async () => {
    const { result, rpc } = await securityGet('/api/security/overview');
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'security_security_overview');
  });

  it('SECURITY FLAGS: ALLOWED', async () => {
    const { result, rpc } = await securityGet(
      '/api/security/flags',
      '?playerId=110790&flagType=SHARED_DEVICE&priority=high&status=open',
    );
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'security_list_security_flags');
    assert.equal(rpc.calls[0]?.args?.p_player_id, PLAYER_ID);
    assert.equal(rpc.calls[0]?.args?.p_flag_type, 'SHARED_DEVICE');
    assert.equal(rpc.calls[0]?.args?.p_severity, 'high');
    assert.equal(rpc.calls[0]?.args?.p_status, 'open');
  });

  it('SECURITY DOSSIER: ALLOWED', async () => {
    const { result, rpc } = await securityGet(`/api/security/players/${PLAYER_ID}`);
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'security_player_security');
  });

  it('SECURITY SPORTS HISTORY: ALLOWED', async () => {
    const { result, rpc } = await securityGet(`/api/security/players/${PLAYER_ID}/sports`);
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'security_player_sports_bets');
  });

  it('SECURITY SPORTS DETAILS: ALLOWED', async () => {
    const { result, rpc } = await securityGet(`/api/security/players/${PLAYER_ID}/sports/${BET_ID}`);
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'security_player_sports_bet');
  });

  it('SECURITY SPORTS SUMMARY: ALLOWED', async () => {
    const { result, rpc } = await securityGet(`/api/security/players/${PLAYER_ID}/sports/summary`);
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'security_player_sports_summary');
  });

  it('SECURITY FLAG REVIEW: ALLOWED', async () => {
    const { result, rpc } = await securityPost(`/api/security/flags/${FLAG_ID}/review`, {});
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'security_resolve_security_flag');
    assert.equal(rpc.calls[0]?.args?.p_action, 'review');
  });

  it('SECURITY FLAG RESOLVE: ALLOWED with mandatory reason', async () => {
    const missing = await securityPost(`/api/security/flags/${FLAG_ID}/resolve`, {});
    assert.equal(missing.result.status, 400);
    assert.equal(missing.result.body.error, 'REASON_REQUIRED');
    const { result, rpc } = await securityPost(`/api/security/flags/${FLAG_ID}/resolve`, { reason: 'проверено' });
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.args?.p_action, 'resolve');
    assert.equal(rpc.calls[0]?.args?.p_reason, 'проверено');
  });

  it('SECURITY FLAG DISMISS: ALLOWED with mandatory reason', async () => {
    const missing = await securityPost(`/api/security/flags/${FLAG_ID}/dismiss`, {});
    assert.equal(missing.result.status, 400);
    const { result, rpc } = await securityPost(`/api/security/flags/${FLAG_ID}/dismiss`, { reason: 'ложный сигнал' });
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.args?.p_action, 'dismiss');
  });

  it('SECURITY RESTRICTION APPLY: ALLOWED', async () => {
    const { result, rpc } = await securityPost(
      `/api/security/players/${PLAYER_ID}/security-restriction`,
      { restricted: true, reason: 'shared device' },
    );
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'security_set_player_security_restriction');
    assert.equal(rpc.calls[0]?.args?.p_restricted, true);
  });

  it('SECURITY RESTRICTION REMOVE: ALLOWED', async () => {
    const { result, rpc } = await securityPost(
      `/api/security/players/${PLAYER_ID}/security-restriction`,
      { restricted: false, reason: 'cleared' },
    );
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.args?.p_restricted, false);
  });

  it('SECURITY WIN PATTERN SETTINGS: READ ALLOWED, WRITE DENIED', async () => {
    const { result, rpc } = await securityGet('/api/security/win-pattern-settings');
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'security_win_pattern_settings');

    const posted = await securityPost('/api/security/win-pattern-settings', {
      source: 'SPORTS',
      enabled: false,
    });
    assert.equal(posted.result.status, 405);
    assert.equal(posted.rpc.calls.length, 0);
    assert.equal(SECURITY_DENIED_RPCS.includes('owner_set_win_pattern_settings'), true);
  });

  it('SECURITY HARD BLOCK: DENIED', async () => {
    const { result, rpc } = await securityPost(`/api/security/players/${PLAYER_ID}/block`, {
      blocked: true,
      reason: 'no',
    });
    assert.equal(result.status, 404);
    assert.equal(rpc.calls.length, 0);
    const http = readFileSync(join(root, 'server/security/securityControlHttp.ts'), 'utf8');
    assert.equal(http.includes('owner_set_player_blocked'), false);
    assert.equal(SECURITY_DENIED_RPCS.includes('owner_set_player_blocked'), true);
  });

  it('SECURITY MONEY MUTATION: DENIED', async () => {
    for (const path of [
      '/api/security/fund',
      '/api/security/treasury',
      `/api/security/players/${PLAYER_ID}/debit`,
      '/api/security/withdrawals',
    ]) {
      const { result, rpc } = await securityPost(path, { amount: 10 });
      assert.equal(result.status, 404, path);
      assert.equal(rpc.calls.length, 0, path);
    }
    assert.equal(SECURITY_DENIED_RPCS.includes('owner_debit_player'), true);
    assert.equal(SECURITY_DENIED_RPCS.includes('cashier_deposit_player'), true);
  });

  it('SECURITY SPORTS MUTATION: DENIED', async () => {
    const settle = await securityPost(`/api/security/players/${PLAYER_ID}/sports/${BET_ID}/settle`, {});
    assert.equal(settle.result.status, 404);
    const cancel = await securityPost(`/api/security/players/${PLAYER_ID}/sports/${BET_ID}`, { status: 'cancelled' });
    assert.equal(cancel.result.status, 405);
    assert.equal(SECURITY_DENIED_RPCS.includes('sports_settle_bet'), true);
  });

  it('SECURITY PROVIDER SETTLEMENT: DENIED', async () => {
    const { result } = await securityGet('/api/security/provider-settlements');
    assert.equal(result.status, 404);
    assert.equal(SECURITY_DENIED_RPCS.includes('owner_list_provider_settlements'), true);
  });

  it('Security session cannot use Owner/Manager/Cashier APIs', async () => {
    const securityCookie = cookieHeader(ACCESS, REFRESH);
    const deny = {
      async signInWithPassword() {
        throw staffError('AUTH_FAILED', 401);
      },
      async refreshSession() {
        throw staffError('JWT_INVALID', 401);
      },
      async signOutCurrentSession() {},
      async currentStaffContext() {
        throw staffError('JWT_REQUIRED', 401);
      },
    };
    const owner = await handleOwnerControlRequest(
      {
        method: 'GET',
        pathname: '/api/owner/dashboard',
        cookie: securityCookie,
        cookieSecure: true,
      },
      { sessionPorts: deny },
    );
    assert.equal(owner.status, 401);
    const manager = await handleManagerControlRequest(
      {
        method: 'GET',
        pathname: '/api/manager/dashboard',
        cookie: securityCookie,
        cookieSecure: true,
      },
      { sessionPorts: deny },
    );
    assert.equal(manager.status, 401);
    const cashier = await handleCashierControlRequest(
      {
        method: 'GET',
        pathname: '/api/cashier/me',
        cookie: securityCookie,
        cookieSecure: true,
      },
      { sessionPorts: deny },
    );
    assert.equal(cashier.status, 401);
  });

  it('Owner cookies cannot use Security APIs', async () => {
    const result = await handleSecurityControlRequest({
      method: 'GET',
      pathname: '/api/security/overview',
      cookie: `${OWNER_ACCESS_COOKIE}=${encodeURIComponent(ACCESS)}; ${OWNER_REFRESH_COOKIE}=${encodeURIComponent(REFRESH)}`,
      cookieSecure: true,
    }, { sessionPorts: createAuthPorts(), rpcFactory: createRpc().rpcFactory });
    assert.equal(result.status, 401);
  });
});
