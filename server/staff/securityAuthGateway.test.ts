import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from './errors.js';
import {
  SECURITY_AUTH_LOGIN_PATH,
  SECURITY_AUTH_LOGOUT_PATH,
  SECURITY_AUTH_ME_PATH,
  handleSecurityAuthRequest,
} from './securityAuthHttp.js';
import type { SecurityAuthGatewayPorts } from './securityAuthService.js';
import { SECURITY_ACCESS_COOKIE, SECURITY_REFRESH_COOKIE } from './securityCookies.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from './ownerCookies.js';
import { MANAGER_ACCESS_COOKIE } from './managerCookies.js';
import { CASHIER_ACCESS_COOKIE } from './cashierCookies.js';

const ACCESS = 'security-access-token';
const REFRESH = 'security-refresh-token';
const ACCESS2 = 'security-access-rotated';
const REFRESH2 = 'security-refresh-rotated';
const LOGIN = 'security01';
const PASSWORD = 'temporary-pass-12';
const HIDDEN_EMAIL = 'aabbccddeeff00112233445566778899@auth.nextpari.invalid';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

const SECURITY_CTX = {
  role: 'security',
  status: 'active',
  auth_user_id: 'sec-uid-1',
  display_name: 'Security One',
  login: LOGIN,
};

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return [path];
  });
}

function securityCookie(access?: string | null, refresh?: string | null): string {
  const parts: string[] = [];
  if (access) parts.push(`${SECURITY_ACCESS_COOKIE}=${encodeURIComponent(access)}`);
  if (refresh) parts.push(`${SECURITY_REFRESH_COOKIE}=${encodeURIComponent(refresh)}`);
  return parts.join('; ');
}

function jsonHasSecrets(body: Record<string, unknown>, secrets: string[]): boolean {
  const dumped = JSON.stringify(body);
  return secrets.some((secret) => dumped.includes(secret));
}

function createAuthPorts(init?: {
  lookupError?: string;
  signInError?: boolean;
  context?: unknown;
}): SecurityAuthGatewayPorts & {
  lookups: string[];
  signIns: Array<{ email: string; password: string }>;
} {
  const lookups: string[] = [];
  const signIns: Array<{ email: string; password: string }> = [];
  return {
    lookups,
    signIns,
    async lookupLoginEmail(login) {
      lookups.push(login);
      if (init?.lookupError) throw staffError(init.lookupError, init.lookupError === 'LOGIN_INVALID' ? 400 : 403);
      return HIDDEN_EMAIL;
    },
    async signInWithPassword(email, password) {
      signIns.push({ email, password });
      if (init?.signInError) throw staffError('AUTH_FAILED', 401);
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async refreshSession() {
      return { accessToken: ACCESS2, refreshToken: REFRESH2 };
    },
    async currentStaffContext() {
      if (init?.context !== undefined) return init.context;
      return SECURITY_CTX;
    },
  };
}

describe('security same-origin auth gateway', () => {
  it('SECURITY LOGIN: PASS with custom login and temp password', async () => {
    const ports = createAuthPorts();
    const result = await handleSecurityAuthRequest(
      {
        method: 'POST',
        pathname: SECURITY_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { login: 'Security01', password: PASSWORD },
      },
      ports,
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal((result.body.staff as { role?: string })?.role, 'security');
    assert.equal(ports.lookups[0], 'security01');
    assert.equal(ports.signIns[0]?.email, HIDDEN_EMAIL);
    assert.equal(ports.signIns[0]?.password, PASSWORD);
    assert.equal(jsonHasSecrets(result.body, [HIDDEN_EMAIL, PASSWORD, ACCESS, REFRESH]), false);
    const cookies = result.cookies ?? [];
    assert.equal(cookies.some((row) => row.startsWith(`${SECURITY_ACCESS_COOKIE}=`)), true);
    assert.equal(cookies.every((row) => /HttpOnly/i.test(row)), true);
    assert.equal(cookies.some((row) => row.startsWith(`${OWNER_ACCESS_COOKIE}=`)), false);
    assert.equal(cookies.some((row) => row.startsWith(`${MANAGER_ACCESS_COOKIE}=`)), false);
    assert.equal(cookies.some((row) => row.startsWith(`${CASHIER_ACCESS_COOKIE}=`)), false);
  });

  it('SECURITY /ME: PASS', async () => {
    const result = await handleSecurityAuthRequest(
      {
        method: 'GET',
        pathname: SECURITY_AUTH_ME_PATH,
        cookie: securityCookie(ACCESS, REFRESH),
        cookieSecure: true,
      },
      createAuthPorts(),
    );
    assert.equal(result.status, 200);
    assert.equal((result.body.staff as { role?: string })?.role, 'security');
    assert.equal(jsonHasSecrets(result.body, [HIDDEN_EMAIL]), false);
  });

  it('SECURITY LOGOUT: PASS', async () => {
    const result = await handleSecurityAuthRequest(
      {
        method: 'POST',
        pathname: SECURITY_AUTH_LOGOUT_PATH,
        cookieSecure: true,
      },
      createAuthPorts(),
    );
    assert.equal(result.status, 200);
    assert.equal((result.cookies ?? []).every((row) => /Max-Age=0/.test(row)), true);
  });

  it('DISABLED SECURITY LOGIN: DENIED', async () => {
    const result = await handleSecurityAuthRequest(
      {
        method: 'POST',
        pathname: SECURITY_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { login: LOGIN, password: PASSWORD },
      },
      createAuthPorts({ lookupError: 'STAFF_ACCOUNT_DISABLED' }),
    );
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'STAFF_ACCOUNT_DISABLED');
  });

  it('BLOCKED SECURITY LOGIN: DENIED', async () => {
    const result = await handleSecurityAuthRequest(
      {
        method: 'POST',
        pathname: SECURITY_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { login: LOGIN, password: PASSWORD },
      },
      createAuthPorts({ lookupError: 'STAFF_ACCOUNT_BLOCKED' }),
    );
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'STAFF_ACCOUNT_BLOCKED');
  });

  it('Owner cookies cannot restore a Security session', async () => {
    const result = await handleSecurityAuthRequest(
      {
        method: 'GET',
        pathname: SECURITY_AUTH_ME_PATH,
        cookie: `${OWNER_ACCESS_COOKIE}=${encodeURIComponent(ACCESS)}; ${OWNER_REFRESH_COOKIE}=${encodeURIComponent(REFRESH)}`,
        cookieSecure: true,
      },
      createAuthPorts(),
    );
    assert.equal(result.status, 401);
  });

  it('INTERNAL AUTH EMAIL EXPOSED: NO in security auth sources and logs', () => {
    const files = [
      readFileSync(join(root, 'server/staff/securityAuthHttp.ts'), 'utf8'),
      readFileSync(join(root, 'server/staff/securityAuthService.ts'), 'utf8'),
      readFileSync(join(root, 'src/security/auth/securityAuth.ts'), 'utf8'),
      readFileSync(join(root, 'src/security/auth/SecurityAuthProvider.tsx'), 'utf8'),
      readFileSync(join(root, 'src/security/SecurityDashboard.tsx'), 'utf8'),
    ].join('\n');
    assert.equal(files.includes('auth_email'), true);
    assert.match(readFileSync(join(root, 'server/staff/securityAuthService.ts'), 'utf8'), /security_lookup_login_email/);
    assert.equal(readFileSync(join(root, 'src/security/auth/securityAuth.ts'), 'utf8').includes('auth_email'), false);
    assert.equal(readFileSync(join(root, 'src/security/SecurityDashboard.tsx'), 'utf8').includes('@auth.nextpari.invalid'), false);
    const ui = listFiles(join(root, 'src/security'))
      .filter((path) => (path.endsWith('.ts') || path.endsWith('.tsx')) && !path.endsWith('.test.ts'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    assert.equal(ui.includes('createClient'), false);
    assert.equal(ui.includes('signInWithPassword'), false);
  });
});
