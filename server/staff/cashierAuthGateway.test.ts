import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { redactForLog, staffError } from './errors.js';
import {
  CASHIER_AUTH_LOGIN_PATH,
  CASHIER_AUTH_LOGOUT_PATH,
  CASHIER_AUTH_SESSION_PATH,
  handleCashierAuthRequest,
} from './cashierAuthHttp.js';
import type { CashierAuthGatewayPorts } from './cashierAuthService.js';
import { CASHIER_ACCESS_COOKIE, CASHIER_REFRESH_COOKIE } from './cashierCookies.js';
import { MANAGER_ACCESS_COOKIE, MANAGER_REFRESH_COOKIE } from './managerCookies.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from './ownerCookies.js';

const ACCESS = 'cashier-access-token';
const REFRESH = 'cashier-refresh-token';
const ACCESS2 = 'cashier-access-rotated';
const REFRESH2 = 'cashier-refresh-rotated';
const OWNER_ACCESS = 'owner-access-token';
const OWNER_REFRESH = 'owner-refresh-token';
const MANAGER_ACCESS = 'manager-access-token';
const MANAGER_REFRESH = 'manager-refresh-token';
const CASHIER_EMAIL = 'agent01@gmail.com';
const CASHIER_PASSWORD = 'secret-cashier-pass';
const CASHIER_ID = '0393d651-e13a-4f04-ba7d-352f63bc62a5';
const NETWORK_ID = '11111111-1111-1111-1111-111111111111';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

const CASHIER_CTX = {
  role: 'cashier',
  status: 'active',
  auth_user_id: 'de04491b-344d-4af1-81e8-bce3f53f21ac',
  display_name: 'agent01',
  network_id: NETWORK_ID,
  legacy_cashier_id: CASHIER_ID,
};

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return [path];
  });
}

function cashierCookieHeader(access?: string | null, refresh?: string | null): string {
  const parts: string[] = [];
  if (access) parts.push(`${CASHIER_ACCESS_COOKIE}=${encodeURIComponent(access)}`);
  if (refresh) parts.push(`${CASHIER_REFRESH_COOKIE}=${encodeURIComponent(refresh)}`);
  return parts.join('; ');
}

function ownerCookieHeader(access?: string | null, refresh?: string | null): string {
  const parts: string[] = [];
  if (access) parts.push(`${OWNER_ACCESS_COOKIE}=${encodeURIComponent(access)}`);
  if (refresh) parts.push(`${OWNER_REFRESH_COOKIE}=${encodeURIComponent(refresh)}`);
  return parts.join('; ');
}

function managerCookieHeader(access?: string | null, refresh?: string | null): string {
  const parts: string[] = [];
  if (access) parts.push(`${MANAGER_ACCESS_COOKIE}=${encodeURIComponent(access)}`);
  if (refresh) parts.push(`${MANAGER_REFRESH_COOKIE}=${encodeURIComponent(refresh)}`);
  return parts.join('; ');
}

function jsonHasSecrets(body: Record<string, unknown>, secrets: string[]): boolean {
  const dumped = JSON.stringify(body);
  return secrets.some((secret) => dumped.includes(secret));
}

function cookieAttrs(setCookie: string[]) {
  const joined = setCookie.join('\n');
  return {
    joined,
    httpOnly: setCookie.every((row) => /HttpOnly/i.test(row)),
    sameSiteLax: setCookie.every((row) => /SameSite=Lax/i.test(row)),
    path: setCookie.every((row) => /Path=\//.test(row)),
    secure: setCookie.every((row) => /(?:^|; )Secure(?:;|$)/i.test(row)),
    cleared: setCookie.every((row) => /Max-Age=0/.test(row)),
    hasAccess: setCookie.some((row) => row.startsWith(`${CASHIER_ACCESS_COOKIE}=`)),
    hasRefresh: setCookie.some((row) => row.startsWith(`${CASHIER_REFRESH_COOKIE}=`)),
    hasOwnerAccess: setCookie.some((row) => row.startsWith(`${OWNER_ACCESS_COOKIE}=`)),
    hasManagerAccess: setCookie.some((row) => row.startsWith(`${MANAGER_ACCESS_COOKIE}=`)),
    rotated: joined.includes(ACCESS2) && joined.includes(REFRESH2),
  };
}

function createAuthPorts(init?: {
  signInError?: boolean;
  context?: unknown;
  contextByToken?: Record<string, unknown>;
  accessFailOnce?: boolean;
  refreshError?: boolean;
}): CashierAuthGatewayPorts & {
  signIns: Array<{ email: string; password: string }>;
  refreshes: string[];
  contextTokens: string[];
} {
  const signIns: Array<{ email: string; password: string }> = [];
  const refreshes: string[] = [];
  const contextTokens: string[] = [];
  let accessAttempts = 0;
  return {
    signIns,
    refreshes,
    contextTokens,
    async signInWithPassword(email, password) {
      signIns.push({ email, password });
      if (init?.signInError) throw staffError('AUTH_FAILED', 401);
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async refreshSession(refreshToken) {
      refreshes.push(refreshToken);
      if (init?.refreshError) throw staffError('JWT_INVALID', 401);
      return { accessToken: ACCESS2, refreshToken: REFRESH2 };
    },
    async currentStaffContext(accessToken) {
      contextTokens.push(accessToken);
      accessAttempts += 1;
      if (init?.accessFailOnce && accessAttempts === 1 && accessToken === ACCESS) {
        throw staffError('JWT_INVALID', 401);
      }
      if (init?.contextByToken && accessToken in init.contextByToken) {
        return init.contextByToken[accessToken];
      }
      if (init?.context !== undefined) return init.context;
      return CASHIER_CTX;
    },
  };
}

describe('cashier same-origin auth gateway', () => {
  it('1. cashier email/password login succeeds', async () => {
    const ports = createAuthPorts();
    const result = await handleCashierAuthRequest(
      {
        method: 'POST',
        pathname: CASHIER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: CASHIER_EMAIL, password: CASHIER_PASSWORD },
      },
      ports,
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    const staff = result.body.staff as Record<string, unknown>;
    assert.equal(staff.role, 'cashier');
    assert.equal(staff.status, 'active');
    assert.equal(staff.networkId, NETWORK_ID);
    assert.equal(staff.legacyCashierId, CASHIER_ID);
    assert.deepEqual(ports.signIns, [{ email: CASHIER_EMAIL, password: CASHIER_PASSWORD }]);
    const cookies = cookieAttrs(result.cookies ?? []);
    assert.equal(cookies.httpOnly, true);
    assert.equal(cookies.hasAccess, true);
    assert.equal(cookies.hasRefresh, true);
    assert.equal(cookies.hasOwnerAccess, false);
    assert.equal(cookies.hasManagerAccess, false);
    assert.equal(jsonHasSecrets(result.body, [ACCESS, REFRESH, CASHIER_PASSWORD]), false);
  });

  it('2. Owner credentials → Cashier 403', async () => {
    const result = await handleCashierAuthRequest(
      {
        method: 'POST',
        pathname: CASHIER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: 'owner@example.com', password: 'secret' },
      },
      createAuthPorts({
        context: { role: 'owner', status: 'active', auth_user_id: 'owner-uid' },
      }),
    );
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'CASHIER_REQUIRED');
  });

  it('3. Manager credentials → Cashier 403', async () => {
    const result = await handleCashierAuthRequest(
      {
        method: 'POST',
        pathname: CASHIER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: 'xlittm51@gmail.com', password: 'secret' },
      },
      createAuthPorts({
        context: {
          role: 'manager',
          status: 'active',
          auth_user_id: 'manager-uid',
          legacy_manager_account_id: 'ccc5f5ad-079e-4420-9080-e7ded4ff9496',
        },
      }),
    );
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'CASHIER_REQUIRED');
  });

  it('4. Player credentials → Cashier 403', async () => {
    const result = await handleCashierAuthRequest(
      {
        method: 'POST',
        pathname: CASHIER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: 'player@example.com', password: 'secret' },
      },
      createAuthPorts({
        context: { role: 'player', status: 'active', auth_user_id: 'player-uid' },
      }),
    );
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'CASHIER_REQUIRED');
  });

  it('5. inactive/blocked cashier → 403', async () => {
    const disabled = await handleCashierAuthRequest(
      {
        method: 'POST',
        pathname: CASHIER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: CASHIER_EMAIL, password: CASHIER_PASSWORD },
      },
      createAuthPorts({
        context: { ...CASHIER_CTX, status: 'disabled' },
      }),
    );
    assert.equal(disabled.status, 403);
    assert.equal(disabled.body.error, 'STAFF_ACCOUNT_DISABLED');

    const blocked = await handleCashierAuthRequest(
      {
        method: 'POST',
        pathname: CASHIER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: CASHIER_EMAIL, password: CASHIER_PASSWORD },
      },
      createAuthPorts({
        context: { ...CASHIER_CTX, status: 'blocked' },
      }),
    );
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error, 'STAFF_ACCOUNT_BLOCKED');
  });

  it('6. cookies are HttpOnly', async () => {
    const result = await handleCashierAuthRequest(
      {
        method: 'POST',
        pathname: CASHIER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: CASHIER_EMAIL, password: CASHIER_PASSWORD },
      },
      createAuthPorts(),
    );
    const cookies = cookieAttrs(result.cookies ?? []);
    assert.equal(cookies.httpOnly, true);
    assert.equal(cookies.sameSiteLax, true);
    assert.equal(cookies.path, true);
    assert.equal(cookies.secure, true);
  });

  it('7. token absent from JSON', async () => {
    const result = await handleCashierAuthRequest(
      {
        method: 'POST',
        pathname: CASHIER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: CASHIER_EMAIL, password: CASHIER_PASSWORD },
      },
      createAuthPorts(),
    );
    assert.equal(jsonHasSecrets(result.body, [ACCESS, REFRESH, 'service_role']), false);
    assert.equal('accessToken' in result.body, false);
    assert.equal('refreshToken' in result.body, false);
    assert.equal('access_token' in result.body, false);
    assert.equal('refresh_token' in result.body, false);
  });

  it('8. session restore', async () => {
    const result = await handleCashierAuthRequest(
      {
        method: 'GET',
        pathname: CASHIER_AUTH_SESSION_PATH,
        cookie: cashierCookieHeader(ACCESS, REFRESH),
        cookieSecure: true,
      },
      createAuthPorts(),
    );
    assert.equal(result.status, 200);
    const staff = result.body.staff as Record<string, unknown>;
    assert.equal(staff.role, 'cashier');
    assert.equal(staff.legacyCashierId, CASHIER_ID);
    assert.equal(jsonHasSecrets(result.body, [ACCESS, REFRESH]), false);
  });

  it('9. expired access → refresh + rotate', async () => {
    const ports = createAuthPorts({ accessFailOnce: true });
    const result = await handleCashierAuthRequest(
      {
        method: 'GET',
        pathname: CASHIER_AUTH_SESSION_PATH,
        cookie: cashierCookieHeader(ACCESS, REFRESH),
        cookieSecure: true,
      },
      ports,
    );
    assert.equal(result.status, 200);
    assert.equal(ports.refreshes[0], REFRESH);
    const cookies = cookieAttrs(result.cookies ?? []);
    assert.equal(cookies.rotated, true);
    assert.equal(cookies.httpOnly, true);
    assert.equal(jsonHasSecrets(result.body, [ACCESS, REFRESH, ACCESS2, REFRESH2]), false);
  });

  it('10. logout clears Cashier cookies', async () => {
    const result = await handleCashierAuthRequest(
      {
        method: 'POST',
        pathname: CASHIER_AUTH_LOGOUT_PATH,
        cookie: cashierCookieHeader(ACCESS, REFRESH),
        cookieSecure: true,
      },
      createAuthPorts(),
    );
    assert.equal(result.status, 200);
    const cookies = cookieAttrs(result.cookies ?? []);
    assert.equal(cookies.cleared, true);
    assert.equal(cookies.hasAccess, true);
    assert.equal(cookies.hasRefresh, true);
    assert.equal(jsonHasSecrets(result.body, [ACCESS, REFRESH]), false);
  });

  it('11. Owner cookie cannot authenticate Cashier', async () => {
    const result = await handleCashierAuthRequest(
      {
        method: 'GET',
        pathname: CASHIER_AUTH_SESSION_PATH,
        cookie: ownerCookieHeader(OWNER_ACCESS, OWNER_REFRESH),
        cookieSecure: true,
      },
      createAuthPorts(),
    );
    assert.equal(result.status, 401);
    assert.equal(result.body.error, 'JWT_REQUIRED');
  });

  it('12. Manager cookie cannot authenticate Cashier', async () => {
    const result = await handleCashierAuthRequest(
      {
        method: 'GET',
        pathname: CASHIER_AUTH_SESSION_PATH,
        cookie: managerCookieHeader(MANAGER_ACCESS, MANAGER_REFRESH),
        cookieSecure: true,
      },
      createAuthPorts(),
    );
    assert.equal(result.status, 401);
    assert.equal(result.body.error, 'JWT_REQUIRED');
  });

  it('13. no PIN hint in production Cashier UI', () => {
    const files = [
      ...listFiles(join(root, 'src/cashier')),
      join(root, 'src/screens/MobcashAgentScreen.tsx'),
      join(root, 'src/pages/portals/PortalLogin.tsx'),
      join(root, 'src/routes.tsx'),
    ].filter((path) => !path.endsWith('.test.ts'));
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes('1234'), false, file);
      assert.equal(source.includes('cashier_login'), false, file);
      assert.equal(source.includes('PIN-код точки'), false, file);
      assert.equal(source.includes('agent01 /'), false, file);
    }
  });

  it('14. no Cashier JWT in localStorage/sessionStorage', () => {
    const files = [
      ...listFiles(join(root, 'src/cashier')),
      join(root, 'src/screens/MobcashAgentScreen.tsx'),
    ].filter((path) => !path.endsWith('.test.ts'));
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes('localStorage.setItem'), false, file);
      assert.equal(source.includes('sessionStorage.setItem'), false, file);
      assert.equal(source.includes('persistSession: true'), false, file);
      assert.equal(source.includes('access_token'), false, file);
    }
  });

  it('15. no service_role in browser', () => {
    const files = [
      ...listFiles(join(root, 'src/cashier')),
      join(root, 'src/screens/MobcashAgentScreen.tsx'),
    ].filter((path) => (path.endsWith('.ts') || path.endsWith('.tsx')) && !path.endsWith('.test.ts'));
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes('SERVICE_ROLE'), false, file);
      assert.equal(source.includes('service_role'), false, file);
      assert.equal(source.includes('createClient'), false, file);
      assert.equal(source.includes('signInWithPassword'), false, file);
    }
    const login = readFileSync(join(here, 'cashierAuthService.ts'), 'utf8');
    assert.match(login, /liveOwnerAuthPorts/);
    assert.equal(login.includes('createServiceRoleClient'), false);
  });

  it('16. no money RPC called during auth', () => {
    const sources = [
      readFileSync(join(here, 'cashierAuthService.ts'), 'utf8'),
      readFileSync(join(here, 'cashierAuthHttp.ts'), 'utf8'),
      readFileSync(join(here, 'cashierContext.ts'), 'utf8'),
      readFileSync(join(here, 'cashierCookies.ts'), 'utf8'),
    ].join('\n');
    for (const rpc of [
      'cashier_deposit_to_player',
      'cashier_payout_by_code',
      'cashier_login',
      'cashier_get_session',
      'manager_fund_cashier',
      'manager_collect_cashier',
      'apply_operational_transfer',
    ]) {
      assert.equal(sources.includes(rpc), false, rpc);
    }
    const redacted = redactForLog({
      password: CASHIER_PASSWORD,
      access_token: ACCESS,
      refresh_token: REFRESH,
    }) as Record<string, unknown>;
    assert.equal(redacted.password, '[redacted]');
    assert.equal(redacted.access_token, '[redacted]');
  });

  it('17. no operational transfer called', () => {
    const dumped = [
      readFileSync(join(here, 'cashierAuthService.ts'), 'utf8'),
      readFileSync(join(here, 'cashierAuthHttp.ts'), 'utf8'),
      readFileSync(join(root, 'src/screens/MobcashAgentScreen.tsx'), 'utf8'),
    ].join('\n');
    assert.equal(dumped.includes('apply_operational_transfer'), false);
    assert.equal(dumped.includes('manager_fund_cashier'), false);
    assert.equal(dumped.includes('TREASURY_TO_MANAGER'), false);
  });

  it('18. staging remains unchanged', () => {
    const sources = [
      readFileSync(join(here, 'cashierAuthService.ts'), 'utf8'),
      readFileSync(join(here, 'cashierAuthHttp.ts'), 'utf8'),
      readFileSync(join(here, 'cashierContext.ts'), 'utf8'),
    ].join('\n');
    assert.equal(sources.includes('migration_state'), false);
    assert.equal(sources.includes('OPERATIONAL_ACCOUNT_ACTIVE'), false);
  });
});
