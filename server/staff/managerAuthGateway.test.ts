import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { redactForLog, staffError } from './errors.js';
import {
  MANAGER_AUTH_LOGIN_PATH,
  MANAGER_AUTH_LOGOUT_PATH,
  MANAGER_AUTH_SESSION_PATH,
  handleManagerAuthRequest,
} from './managerAuthHttp.js';
import type { ManagerAuthGatewayPorts } from './managerAuthService.js';
import { MANAGER_ACCESS_COOKIE, MANAGER_REFRESH_COOKIE } from './managerCookies.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from './ownerCookies.js';

const ACCESS = 'manager-access-token';
const REFRESH = 'manager-refresh-token';
const ACCESS2 = 'manager-access-rotated';
const REFRESH2 = 'manager-refresh-rotated';
const OWNER_ACCESS = 'owner-access-token';
const OWNER_REFRESH = 'owner-refresh-token';
const MANAGER_EMAIL = 'xlittm51@gmail.com';
const MANAGER_PASSWORD = 'secret-manager-pass';
const MANAGER_ID = 'ccc5f5ad-079e-4420-9080-e7ded4ff9496';
const NETWORK_ID = '11111111-1111-1111-1111-111111111111';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

const MANAGER_CTX = {
  role: 'manager',
  status: 'active',
  auth_user_id: 'manager-uid',
  display_name: 'Manager 01',
  network_id: NETWORK_ID,
  legacy_manager_account_id: MANAGER_ID,
};

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return [path];
  });
}

function managerCookieHeader(access?: string | null, refresh?: string | null): string {
  const parts: string[] = [];
  if (access) parts.push(`${MANAGER_ACCESS_COOKIE}=${encodeURIComponent(access)}`);
  if (refresh) parts.push(`${MANAGER_REFRESH_COOKIE}=${encodeURIComponent(refresh)}`);
  return parts.join('; ');
}

function ownerCookieHeader(access?: string | null, refresh?: string | null): string {
  const parts: string[] = [];
  if (access) parts.push(`${OWNER_ACCESS_COOKIE}=${encodeURIComponent(access)}`);
  if (refresh) parts.push(`${OWNER_REFRESH_COOKIE}=${encodeURIComponent(refresh)}`);
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
    hasAccess: setCookie.some((row) => row.startsWith(`${MANAGER_ACCESS_COOKIE}=`)),
    hasRefresh: setCookie.some((row) => row.startsWith(`${MANAGER_REFRESH_COOKIE}=`)),
    hasOwnerAccess: setCookie.some((row) => row.startsWith(`${OWNER_ACCESS_COOKIE}=`)),
    rotated: joined.includes(ACCESS2) && joined.includes(REFRESH2),
  };
}

function createAuthPorts(init?: {
  signInError?: boolean;
  context?: unknown;
  contextByToken?: Record<string, unknown>;
  accessFailOnce?: boolean;
  refreshError?: boolean;
}): ManagerAuthGatewayPorts & {
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
      return MANAGER_CTX;
    },
  };
}

describe('manager same-origin auth gateway', () => {
  it('1. manager email/password login succeeds', async () => {
    const ports = createAuthPorts();
    const result = await handleManagerAuthRequest(
      {
        method: 'POST',
        pathname: MANAGER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: MANAGER_EMAIL, password: MANAGER_PASSWORD },
      },
      ports,
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    const staff = result.body.staff as Record<string, unknown>;
    assert.equal(staff.role, 'manager');
    assert.equal(staff.status, 'active');
    assert.equal(staff.networkId, NETWORK_ID);
    assert.equal(staff.legacyManagerAccountId, MANAGER_ID);
    assert.deepEqual(ports.signIns, [{ email: MANAGER_EMAIL, password: MANAGER_PASSWORD }]);
    const cookies = cookieAttrs(result.cookies ?? []);
    assert.equal(cookies.httpOnly, true);
    assert.equal(cookies.hasAccess, true);
    assert.equal(cookies.hasRefresh, true);
    assert.equal(cookies.hasOwnerAccess, false);
    assert.equal(jsonHasSecrets(result.body, [ACCESS, REFRESH, MANAGER_PASSWORD]), false);
  });

  it('2. owner credentials → Manager portal 403', async () => {
    const result = await handleManagerAuthRequest(
      {
        method: 'POST',
        pathname: MANAGER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: 'owner@example.com', password: 'secret' },
      },
      createAuthPorts({
        context: { role: 'owner', status: 'active', auth_user_id: 'owner-uid' },
      }),
    );
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'MANAGER_REQUIRED');
  });

  it('3. player credentials → 403', async () => {
    const result = await handleManagerAuthRequest(
      {
        method: 'POST',
        pathname: MANAGER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: 'player@example.com', password: 'secret' },
      },
      createAuthPorts({
        context: { role: 'player', status: 'active', auth_user_id: 'player-uid' },
      }),
    );
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'MANAGER_REQUIRED');
  });

  it('4. cashier credentials → 403', async () => {
    const result = await handleManagerAuthRequest(
      {
        method: 'POST',
        pathname: MANAGER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: 'cashier@example.com', password: 'secret' },
      },
      createAuthPorts({
        context: {
          role: 'cashier',
          status: 'active',
          auth_user_id: 'cashier-uid',
          legacy_cashier_id: 'cashier-1',
        },
      }),
    );
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'MANAGER_REQUIRED');
  });

  it('5. inactive manager → 403', async () => {
    const disabled = await handleManagerAuthRequest(
      {
        method: 'POST',
        pathname: MANAGER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: MANAGER_EMAIL, password: MANAGER_PASSWORD },
      },
      createAuthPorts({
        context: { role: 'manager', status: 'disabled', auth_user_id: 'manager-uid' },
      }),
    );
    assert.equal(disabled.status, 403);
    assert.equal(disabled.body.error, 'STAFF_ACCOUNT_DISABLED');

    const blocked = await handleManagerAuthRequest(
      {
        method: 'POST',
        pathname: MANAGER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: MANAGER_EMAIL, password: MANAGER_PASSWORD },
      },
      createAuthPorts({
        context: { role: 'manager', status: 'blocked', auth_user_id: 'manager-uid' },
      }),
    );
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error, 'STAFF_ACCOUNT_BLOCKED');
  });

  it('6. cookies are HttpOnly', async () => {
    const result = await handleManagerAuthRequest(
      {
        method: 'POST',
        pathname: MANAGER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: MANAGER_EMAIL, password: MANAGER_PASSWORD },
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
    const result = await handleManagerAuthRequest(
      {
        method: 'POST',
        pathname: MANAGER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: MANAGER_EMAIL, password: MANAGER_PASSWORD },
      },
      createAuthPorts(),
    );
    assert.equal(jsonHasSecrets(result.body, [ACCESS, REFRESH, 'service_role']), false);
    assert.equal('accessToken' in result.body, false);
    assert.equal('refreshToken' in result.body, false);
  });

  it('8. session restore', async () => {
    const result = await handleManagerAuthRequest(
      {
        method: 'GET',
        pathname: MANAGER_AUTH_SESSION_PATH,
        cookie: managerCookieHeader(ACCESS, REFRESH),
        cookieSecure: true,
      },
      createAuthPorts(),
    );
    assert.equal(result.status, 200);
    const staff = result.body.staff as Record<string, unknown>;
    assert.equal(staff.role, 'manager');
    assert.equal(staff.legacyManagerAccountId, MANAGER_ID);
    assert.equal(jsonHasSecrets(result.body, [ACCESS, REFRESH]), false);
  });

  it('9. expired access → refresh + rotate', async () => {
    const ports = createAuthPorts({ accessFailOnce: true });
    const result = await handleManagerAuthRequest(
      {
        method: 'GET',
        pathname: MANAGER_AUTH_SESSION_PATH,
        cookie: managerCookieHeader(ACCESS, REFRESH),
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

  it('10. logout clears Manager cookies', async () => {
    const result = await handleManagerAuthRequest(
      {
        method: 'POST',
        pathname: MANAGER_AUTH_LOGOUT_PATH,
        cookie: managerCookieHeader(ACCESS, REFRESH),
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

  it('11. Owner cookie cannot authenticate Manager', async () => {
    const result = await handleManagerAuthRequest(
      {
        method: 'GET',
        pathname: MANAGER_AUTH_SESSION_PATH,
        cookie: ownerCookieHeader(OWNER_ACCESS, OWNER_REFRESH),
        cookieSecure: true,
      },
      createAuthPorts(),
    );
    assert.equal(result.status, 401);
    assert.equal(result.body.error, 'JWT_REQUIRED');
  });

  it('12. no PIN 1111 in Manager production UI', () => {
    const files = [
      ...listFiles(join(root, 'src/manager')),
      join(root, 'src/pages/manager/ManagerOfficeLayout.tsx'),
      join(root, 'src/pages/portals/PortalLogin.tsx'),
    ].filter((path) => !path.endsWith('.test.ts'));
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes('1111'), false, file);
      assert.equal(source.includes('manager01'), false, file);
      assert.equal(source.includes('PIN / Пароль'), false, file);
      assert.equal(source.includes('networkManagerLogin'), false, file);
    }
  });

  it('13. no Manager JWT in localStorage', () => {
    const files = [
      ...listFiles(join(root, 'src/manager')),
      join(root, 'src/pages/manager/ManagerOfficeLayout.tsx'),
    ].filter((path) => !path.endsWith('.test.ts'));
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes('localStorage.setItem'), false, file);
      assert.equal(source.includes('persistSession: true'), false, file);
      assert.equal(source.includes('access_token'), false, file);
    }
  });

  it('14. no service_role in browser', () => {
    const files = [
      ...listFiles(join(root, 'src/manager')),
      join(root, 'src/pages/manager/ManagerOfficeLayout.tsx'),
    ].filter((path) => (path.endsWith('.ts') || path.endsWith('.tsx')) && !path.endsWith('.test.ts'));
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes('SERVICE_ROLE'), false, file);
      assert.equal(source.includes('service_role'), false, file);
      assert.equal(source.includes('createClient'), false, file);
      assert.equal(source.includes('signInWithPassword'), false, file);
    }
    const login = readFileSync(join(here, 'managerAuthService.ts'), 'utf8');
    assert.match(login, /liveOwnerAuthPorts/);
    assert.equal(login.includes('createServiceRoleClient'), false);
    const shared = readFileSync(join(here, 'ownerAuthService.ts'), 'utf8');
    assert.match(shared, /current_staff_binding_context/);
  });

  it('15. no money RPC called', () => {
    const sources = [
      readFileSync(join(here, 'managerAuthService.ts'), 'utf8'),
      readFileSync(join(here, 'managerAuthHttp.ts'), 'utf8'),
      readFileSync(join(here, 'managerContext.ts'), 'utf8'),
      readFileSync(join(here, 'managerCookies.ts'), 'utf8'),
    ].join('\n');
    for (const rpc of [
      'manager_topup_cashier',
      'manager_collect_cashier',
      'manager_adjust_player_balance',
      'manager_create_cashier',
      'manager_dashboard_stats',
      'owner_transfer',
    ]) {
      assert.equal(sources.includes(rpc), false, rpc);
    }
    const redacted = redactForLog({
      password: MANAGER_PASSWORD,
      access_token: ACCESS,
      refresh_token: REFRESH,
    }) as Record<string, unknown>;
    assert.equal(redacted.password, '[redacted]');
    assert.equal(redacted.access_token, '[redacted]');
  });
});
