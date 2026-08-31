import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { redactForLog, staffError } from './errors.js';
import {
  OWNER_STAFF_CASHIER_PATH,
  OWNER_STAFF_MANAGER_PATH,
  handleOwnerStaffRequest,
} from './httpHandler.js';
import {
  OWNER_AUTH_LOGIN_PATH,
  OWNER_AUTH_LOGOUT_PATH,
  OWNER_AUTH_SESSION_PATH,
  handleOwnerAuthRequest,
} from './ownerAuthHttp.js';
import type { OwnerAuthGatewayPorts } from './ownerAuthService.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from './ownerCookies.js';
import type { AuthAdminPort, OwnerStaffPort, StaffLog } from './types.js';

const MANAGER_ID = 'ccc5f5ad-079e-4420-9080-e7ded4ff9496';
const CASHIER_ID = '0393d651-e13a-4f04-ba7d-352f63bc62a5';
const AUTH_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PASSWORD = 'temporary-pass-ok';
const OWNER_EMAIL = 'xlittm06@gmail.com';
const OWNER_PASSWORD = 'secret-owner-pass';
const ACCESS = 'owner-access-token';
const REFRESH = 'owner-refresh-token';
const ACCESS2 = 'owner-access-rotated';
const REFRESH2 = 'owner-refresh-rotated';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

const OWNER_CTX = {
  role: 'owner',
  status: 'active',
  auth_user_id: 'owner-uid',
  display_name: 'Owner',
  network_id: null,
  legacy_manager_account_id: null,
  legacy_cashier_id: null,
};

function cookieHeader(access?: string | null, refresh?: string | null): string {
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
    hasAccess: setCookie.some((row) => row.startsWith(`${OWNER_ACCESS_COOKIE}=`)),
    hasRefresh: setCookie.some((row) => row.startsWith(`${OWNER_REFRESH_COOKIE}=`)),
  };
}

function createAuthPorts(init?: {
  signInError?: boolean;
  context?: unknown;
  contextByToken?: Record<string, unknown>;
  accessFailOnce?: boolean;
  refreshError?: boolean;
}): OwnerAuthGatewayPorts & {
  signIns: Array<{ email: string; password: string }>;
  refreshes: string[];
  contextTokens: string[];
} {
  const signIns: Array<{ email: string; password: string }> = [];
  const refreshes: string[] = [];
  const contextTokens: string[] = [];
  let accessAttempts = 0;
  const ports: OwnerAuthGatewayPorts & {
    signIns: Array<{ email: string; password: string }>;
    refreshes: string[];
    contextTokens: string[];
  } = {
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
      return OWNER_CTX;
    },
  };
  return ports;
}

function onboardPorts() {
  const tokens: string[] = [];
  const owner: OwnerStaffPort = {
    async currentStaffContext() {
      return OWNER_CTX;
    },
    async listStaffAuthBindings() {
      return { rows: [], total: 0 };
    },
    async bindManager() {
      return {
        ok: true,
        isDuplicate: false,
        authUserId: AUTH_USER_ID,
        role: 'manager',
        status: 'active',
        displayName: 'Manager',
        networkId: '11111111-1111-1111-1111-111111111111',
        legacyManagerAccountId: MANAGER_ID,
        legacyCashierId: null,
      };
    },
    async bindCashier() {
      return {
        ok: true,
        isDuplicate: false,
        authUserId: AUTH_USER_ID,
        role: 'cashier',
        status: 'active',
        displayName: 'Cashier',
        networkId: '11111111-1111-1111-1111-111111111111',
        legacyManagerAccountId: null,
        legacyCashierId: CASHIER_ID,
      };
    },
  };
  const admin: AuthAdminPort = {
    async createUser() {
      return { id: AUTH_USER_ID };
    },
    async deleteUser() {},
  };
  const log: StaffLog = { error() {} };
  return {
    tokens,
    log,
    portsFactory: (accessToken: string) => {
      tokens.push(accessToken);
      return { owner, admin };
    },
  };
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return [path];
  });
}

describe('owner same-origin auth gateway', () => {
  it('1. owner login success', async () => {
    const ports = createAuthPorts();
    const result = await handleOwnerAuthRequest(
      {
        method: 'POST',
        pathname: OWNER_AUTH_LOGIN_PATH,
        body: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
        cookieSecure: true,
      },
      ports,
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal((result.body.staff as { role: string }).role, 'owner');
    assert.equal(ports.signIns[0]?.email, OWNER_EMAIL);
    assert.equal(ports.contextTokens[0], ACCESS);
  });

  it('2. bad credentials → controlled 401', async () => {
    const result = await handleOwnerAuthRequest(
      {
        method: 'POST',
        pathname: OWNER_AUTH_LOGIN_PATH,
        body: { email: OWNER_EMAIL, password: 'wrong' },
        cookieSecure: true,
      },
      createAuthPorts({ signInError: true }),
    );
    assert.equal(result.status, 401);
    assert.equal(result.body.error, 'AUTH_FAILED');
    assert.equal(cookieAttrs(result.cookies ?? []).cleared, true);
  });

  it('3. player credentials → 403', async () => {
    const result = await handleOwnerAuthRequest(
      {
        method: 'POST',
        pathname: OWNER_AUTH_LOGIN_PATH,
        body: { email: 'player@example.com', password: OWNER_PASSWORD },
        cookieSecure: true,
      },
      createAuthPorts({ context: { role: 'player', status: 'active' } }),
    );
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'OWNER_REQUIRED');
  });

  it('4. manager credentials → 403', async () => {
    const result = await handleOwnerAuthRequest(
      {
        method: 'POST',
        pathname: OWNER_AUTH_LOGIN_PATH,
        body: { email: 'manager@example.com', password: OWNER_PASSWORD },
        cookieSecure: true,
      },
      createAuthPorts({
        context: { auth_user_id: 'mgr', role: 'manager', status: 'active' },
      }),
    );
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'OWNER_REQUIRED');
  });

  it('5. blocked owner → 403', async () => {
    const result = await handleOwnerAuthRequest(
      {
        method: 'POST',
        pathname: OWNER_AUTH_LOGIN_PATH,
        body: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
        cookieSecure: true,
      },
      createAuthPorts({
        context: { auth_user_id: 'owner-uid', role: 'owner', status: 'blocked' },
      }),
    );
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'STAFF_ACCOUNT_BLOCKED');
  });

  it('6. login sets HttpOnly cookies', async () => {
    const result = await handleOwnerAuthRequest(
      {
        method: 'POST',
        pathname: OWNER_AUTH_LOGIN_PATH,
        body: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
        cookieSecure: true,
      },
      createAuthPorts(),
    );
    const attrs = cookieAttrs(result.cookies ?? []);
    assert.equal(attrs.hasAccess, true);
    assert.equal(attrs.hasRefresh, true);
    assert.equal(attrs.httpOnly, true);
    assert.equal(attrs.sameSiteLax, true);
    assert.equal(attrs.path, true);
    assert.equal(attrs.secure, true);
  });

  it('7. tokens absent from JSON response', async () => {
    const result = await handleOwnerAuthRequest(
      {
        method: 'POST',
        pathname: OWNER_AUTH_LOGIN_PATH,
        body: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
        cookieSecure: true,
      },
      createAuthPorts(),
    );
    assert.equal(jsonHasSecrets(result.body, [ACCESS, REFRESH, OWNER_PASSWORD, 'access_token', 'refresh_token']), false);
  });

  it('8. session restores owner', async () => {
    const result = await handleOwnerAuthRequest(
      {
        method: 'GET',
        pathname: OWNER_AUTH_SESSION_PATH,
        cookie: cookieHeader(ACCESS, REFRESH),
        cookieSecure: true,
      },
      createAuthPorts(),
    );
    assert.equal(result.status, 200);
    assert.equal((result.body.staff as { role: string }).role, 'owner');
    assert.equal(result.cookies, undefined);
  });

  it('9. expired access → refresh + cookie rotation', async () => {
    const ports = createAuthPorts({ accessFailOnce: true });
    const result = await handleOwnerAuthRequest(
      {
        method: 'GET',
        pathname: OWNER_AUTH_SESSION_PATH,
        cookie: cookieHeader(ACCESS, REFRESH),
        cookieSecure: true,
      },
      ports,
    );
    assert.equal(result.status, 200);
    assert.equal(ports.refreshes[0], REFRESH);
    const joined = (result.cookies ?? []).join('\n');
    assert.equal(joined.includes(encodeURIComponent(ACCESS2)), true);
    assert.equal(joined.includes(encodeURIComponent(REFRESH2)), true);
    assert.equal(jsonHasSecrets(result.body, [ACCESS2, REFRESH2]), false);
  });

  it('10. bad refresh → cookies cleared + 401', async () => {
    const result = await handleOwnerAuthRequest(
      {
        method: 'GET',
        pathname: OWNER_AUTH_SESSION_PATH,
        cookie: cookieHeader(null, 'bad-refresh'),
        cookieSecure: true,
      },
      createAuthPorts({ refreshError: true }),
    );
    assert.equal(result.status, 401);
    assert.equal(cookieAttrs(result.cookies ?? []).cleared, true);
  });

  it('11. logout clears cookies', async () => {
    const result = await handleOwnerAuthRequest(
      {
        method: 'POST',
        pathname: OWNER_AUTH_LOGOUT_PATH,
        cookieSecure: true,
      },
      createAuthPorts(),
    );
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { ok: true });
    assert.equal(cookieAttrs(result.cookies ?? []).cleared, true);
    assert.equal(jsonHasSecrets(result.body, [ACCESS, REFRESH]), false);
  });

  it('12. manager onboarding works using Owner cookie', async () => {
    const onboard = onboardPorts();
    const session = createAuthPorts();
    const result = await handleOwnerStaffRequest(
      {
        method: 'POST',
        pathname: OWNER_STAFF_MANAGER_PATH,
        authorization: undefined,
        cookie: cookieHeader(ACCESS, REFRESH),
        cookieSecure: true,
        body: {
          managerId: MANAGER_ID,
          email: 'manager@example.com',
          temporaryPassword: PASSWORD,
        },
      },
      onboard.portsFactory,
      onboard.log,
      session,
    );
    assert.equal(result.status, 200);
    assert.equal(onboard.tokens[0], ACCESS);
    assert.equal(result.body.ok, true);
  });

  it('13. cashier onboarding works using Owner cookie', async () => {
    const onboard = onboardPorts();
    const result = await handleOwnerStaffRequest(
      {
        method: 'POST',
        pathname: OWNER_STAFF_CASHIER_PATH,
        authorization: undefined,
        cookie: cookieHeader(ACCESS, REFRESH),
        cookieSecure: true,
        body: {
          cashierId: CASHIER_ID,
          email: 'cashier@example.com',
          temporaryPassword: PASSWORD,
        },
      },
      onboard.portsFactory,
      onboard.log,
      createAuthPorts(),
    );
    assert.equal(result.status, 200);
    assert.equal(onboard.tokens[0], ACCESS);
  });

  it('14. no browser request to Supabase for Owner login', () => {
    const files = [
      join(root, 'src/owner/auth/OwnerAuthProvider.tsx'),
      join(root, 'src/owner/auth/ownerAuth.ts'),
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes('ownerSupabase'), false, file);
      assert.equal(source.includes('signInWithPassword'), false, file);
      assert.equal(source.includes('getSession'), false, file);
      assert.equal(source.includes('refreshSession'), false, file);
      assert.equal(source.includes('lsmfdhenmceiammyptzu.supabase.co'), false, file);
      assert.equal(source.includes('createClient'), false, file);
    }
    const provider = readFileSync(files[0], 'utf8');
    const client = readFileSync(files[1], 'utf8');
    assert.match(client, /\/api\/owner\/auth\/login/);
    assert.match(provider, /loginOwnerViaGateway/);
  });

  it('15. service role remains server-only', () => {
    const login = readFileSync(join(here, 'ownerAuthService.ts'), 'utf8');
    assert.match(login, /createAnonAuthClient/);
    assert.match(login, /createUserJwtClient/);
    assert.match(login, /current_staff_binding_context/);
    assert.equal(login.includes("rpc('current_staff_context')"), false);
    assert.equal(login.includes('createServiceRoleClient'), false);
    const src = listFiles(join(root, 'src/owner'))
      .filter((path) => path.endsWith('.ts') || path.endsWith('.tsx'))
      .filter((path) => !path.endsWith('.test.ts'));
    for (const file of src) {
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes('SERVICE_ROLE'), false, file);
      assert.equal(source.includes('service_role'), false, file);
    }
  });

  it('16. password/token absent from logs', () => {
    const redacted = redactForLog({
      password: OWNER_PASSWORD,
      temporaryPassword: PASSWORD,
      access_token: ACCESS,
      refresh_token: REFRESH,
      authorization: `Bearer ${ACCESS}`,
    }) as Record<string, unknown>;
    assert.equal(redacted.password, '[redacted]');
    assert.equal(redacted.temporaryPassword, '[redacted]');
    assert.equal(redacted.access_token, '[redacted]');
    assert.equal(redacted.refresh_token, '[redacted]');
    assert.equal(redacted.authorization, '[redacted]');
  });
});
