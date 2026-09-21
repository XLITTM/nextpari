import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { handleCashierAuthRequest, CASHIER_AUTH_LOGOUT_PATH } from './cashierAuthHttp.js';
import { CASHIER_ACCESS_COOKIE, CASHIER_REFRESH_COOKIE } from './cashierCookies.js';
import { assertActiveCashierContext } from './cashierContext.js';
import { handleManagerAuthRequest, MANAGER_AUTH_LOGOUT_PATH } from './managerAuthHttp.js';
import { MANAGER_ACCESS_COOKIE, MANAGER_REFRESH_COOKIE } from './managerCookies.js';
import { assertActiveManagerContext } from './managerContext.js';
import { handleOwnerAuthRequest, OWNER_AUTH_LOGOUT_PATH } from './ownerAuthHttp.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from './ownerCookies.js';
import { assertActiveOwnerContext } from './ownerContext.js';
import { logoutOwnerSession } from './ownerAuthService.js';
import type { OwnerAuthGatewayPorts } from './ownerAuthService.js';
import { handleSecurityAuthRequest, SECURITY_AUTH_LOGOUT_PATH } from './securityAuthHttp.js';
import { SECURITY_ACCESS_COOKIE, SECURITY_REFRESH_COOKIE } from './securityCookies.js';
import { assertActiveSecurityContext } from './securityContext.js';
import type { SecurityAuthGatewayPorts } from './securityAuthService.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260922001000_staff_session_revocation_071.sql'),
  'utf8',
);
const ownerAuthSource = readFileSync(join(here, 'ownerAuthService.ts'), 'utf8');
const managerAuthSource = readFileSync(join(here, 'managerAuthService.ts'), 'utf8');
const cashierAuthSource = readFileSync(join(here, 'cashierAuthService.ts'), 'utf8');
const securityAuthSource = readFileSync(join(here, 'securityAuthService.ts'), 'utf8');

const ACCESS = 'staff-access-token-value';
const REFRESH = 'staff-refresh-token-value';
const OTHER_ACCESS = 'other-device-access-token';
const OTHER_REFRESH = 'other-device-refresh-token';

function fnBody(name: string): string {
  const marker = `FUNCTION private.${name}(`;
  const start = migration.indexOf(marker);
  assert.ok(start >= 0, name);
  const end = migration.indexOf('$fn$;', start);
  assert.ok(end > start, name);
  return migration.slice(start, end);
}

function cookie(name: string, value: string): string {
  return `${name}=${encodeURIComponent(value)}`;
}

function cleared(rows: string[] | undefined, accessName: string, refreshName: string): boolean {
  const joined = (rows ?? []).join('\n');
  return joined.includes(`${accessName}=;`)
    && joined.includes(`${refreshName}=;`)
    && joined.includes('Max-Age=0');
}

function jsonHas(body: Record<string, unknown>, secrets: string[]): boolean {
  const dumped = JSON.stringify(body);
  return secrets.some((secret) => secret.length > 0 && dumped.includes(secret));
}

function ownerPorts(signOut: OwnerAuthGatewayPorts['signOutCurrentSession']): OwnerAuthGatewayPorts {
  return {
    async signInWithPassword() {
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async refreshSession() {
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async currentStaffContext() {
      return { role: 'owner', status: 'active', auth_user_id: 'owner' };
    },
    signOutCurrentSession: signOut,
  };
}

function securityPorts(
  signOut: SecurityAuthGatewayPorts['signOutCurrentSession'],
): SecurityAuthGatewayPorts {
  return {
    async lookupLoginEmail() {
      return 'hidden@example.com';
    },
    async signInWithPassword() {
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async refreshSession() {
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async currentStaffContext() {
      return { role: 'security', status: 'active', auth_user_id: 'security' };
    },
    signOutCurrentSession: signOut,
  };
}

describe('staff session revocation', () => {
  const gate = fnBody('staff_require_live_auth_session');
  const staff = fnBody('get_current_staff_context');
  const owner = fnBody('get_current_owner_context');
  const manager = fnBody('get_current_manager_context');
  const cashier = fnBody('get_current_cashier_context');
  const cashierLocked = fnBody('get_current_cashier_context_locked');
  const security = fnBody('get_current_security_context');

  it('A. staff gate requires auth.uid', () => {
    assert.match(gate, /v_uid := auth\.uid\(\)/);
    assert.match(gate, /IF v_uid IS NULL THEN\s+RAISE EXCEPTION 'AUTH_REQUIRED'/);
  });

  it('B. missing session_id raises SESSION_EXPIRED', () => {
    assert.match(gate, /auth\.jwt\(\) ->> 'session_id'/);
    assert.match(gate, /IF v_raw IS NULL THEN\s+RAISE EXCEPTION 'SESSION_EXPIRED'/);
  });

  it('C. malformed session_id raises SESSION_EXPIRED', () => {
    assert.match(gate, /invalid_text_representation/);
    assert.match(gate, /v_raw::UUID/);
    assert.match(gate, /WHEN invalid_text_representation THEN\s+RAISE EXCEPTION 'SESSION_EXPIRED'/);
  });

  it('D. nonexistent session raises SESSION_EXPIRED', () => {
    assert.match(gate, /FROM auth\.sessions AS s/);
    assert.match(gate, /s\.id = v_session/);
    assert.match(gate, /RAISE EXCEPTION 'SESSION_EXPIRED'/);
  });

  it('E. a session belonging to another user raises SESSION_EXPIRED', () => {
    assert.match(gate, /s\.user_id = v_uid/);
  });

  it('F. a matching live session returns the uid', () => {
    assert.match(gate, /RETURN v_uid/);
    assert.doesNotMatch(gate, /GRANT /);
  });

  it('G. the private gate is not executable by PUBLIC, anon, or authenticated', () => {
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION private\.staff_require_live_auth_session\(\) FROM PUBLIC/,
    );
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION private\.staff_require_live_auth_session\(\) FROM anon, authenticated/,
    );
    assert.doesNotMatch(
      migration,
      /GRANT EXECUTE ON FUNCTION private\.staff_require_live_auth_session/,
    );
    assert.doesNotMatch(migration, /FUNCTION public\.staff_require_live_auth_session/);
  });

  it('H. get_current_staff_context uses the live gate and keeps role, status, network, and binding checks', () => {
    assert.match(staff, /v_uid := private\.staff_require_live_auth_session\(\)/);
    assert.doesNotMatch(staff, /v_uid := auth\.uid\(\)/);
    for (const code of [
      'STAFF_ACCOUNT_NOT_FOUND',
      'STAFF_ACCOUNT_BLOCKED',
      'STAFF_ACCOUNT_DISABLED',
      'STAFF_ACCOUNT_NOT_ACTIVE',
    ]) {
      assert.match(staff, new RegExp(code));
    }
    assert.match(staff, /network_id/);
    assert.match(staff, /legacy_manager_account_id/);
    assert.match(staff, /legacy_cashier_id/);
    assert.match(staff, /v_row\.role/);
  });

  it('I. get_current_security_context uses the live gate and keeps security checks', () => {
    assert.match(security, /v_uid := private\.staff_require_live_auth_session\(\)/);
    assert.doesNotMatch(security, /v_uid := auth\.uid\(\)/);
    assert.match(security, /SECURITY_REQUIRED/);
    assert.match(security, /STAFF_ACCOUNT_BLOCKED/);
    assert.match(security, /STAFF_ACCOUNT_DISABLED/);
    assert.match(security, /last_seen_at/);
    assert.match(security, /RETURN NEXT/);
  });

  it('J. owner logout calls server signOut for owner cookies', async () => {
    const calls: Array<{ access: string; refresh: string | null }> = [];
    const result = await handleOwnerAuthRequest(
      {
        method: 'POST',
        pathname: OWNER_AUTH_LOGOUT_PATH,
        cookie: `${cookie(OWNER_ACCESS_COOKIE, ACCESS)}; ${cookie(OWNER_REFRESH_COOKIE, REFRESH)}; ${cookie(MANAGER_ACCESS_COOKIE, OTHER_ACCESS)}`,
        cookieSecure: true,
      },
      ownerPorts(async (access, refresh) => {
        calls.push({ access, refresh });
      }),
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.deepEqual(calls, [{ access: ACCESS, refresh: REFRESH }]);
    assert.equal(cleared(result.cookies, OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE), true);
  });

  it('K. manager logout calls server signOut for manager cookies', async () => {
    const calls: Array<{ access: string; refresh: string | null }> = [];
    const result = await handleManagerAuthRequest(
      {
        method: 'POST',
        pathname: MANAGER_AUTH_LOGOUT_PATH,
        cookie: `${cookie(MANAGER_ACCESS_COOKIE, ACCESS)}; ${cookie(MANAGER_REFRESH_COOKIE, REFRESH)}; ${cookie(OWNER_ACCESS_COOKIE, OTHER_ACCESS)}`,
        cookieSecure: true,
      },
      ownerPorts(async (access, refresh) => {
        calls.push({ access, refresh });
      }),
    );
    assert.equal(result.status, 200);
    assert.deepEqual(calls, [{ access: ACCESS, refresh: REFRESH }]);
    assert.equal(cleared(result.cookies, MANAGER_ACCESS_COOKIE, MANAGER_REFRESH_COOKIE), true);
  });

  it('L. cashier logout calls server signOut for cashier cookies', async () => {
    const calls: Array<{ access: string; refresh: string | null }> = [];
    const result = await handleCashierAuthRequest(
      {
        method: 'POST',
        pathname: CASHIER_AUTH_LOGOUT_PATH,
        cookie: `${cookie(CASHIER_ACCESS_COOKIE, ACCESS)}; ${cookie(CASHIER_REFRESH_COOKIE, REFRESH)}`,
        cookieSecure: true,
      },
      ownerPorts(async (access, refresh) => {
        calls.push({ access, refresh });
      }),
    );
    assert.equal(result.status, 200);
    assert.deepEqual(calls, [{ access: ACCESS, refresh: REFRESH }]);
    assert.equal(cleared(result.cookies, CASHIER_ACCESS_COOKIE, CASHIER_REFRESH_COOKIE), true);
  });

  it('M. security logout calls server signOut for security cookies', async () => {
    const calls: Array<{ access: string; refresh: string | null }> = [];
    const result = await handleSecurityAuthRequest(
      {
        method: 'POST',
        pathname: SECURITY_AUTH_LOGOUT_PATH,
        cookie: `${cookie(SECURITY_ACCESS_COOKIE, ACCESS)}; ${cookie(SECURITY_REFRESH_COOKIE, REFRESH)}; ${cookie(OWNER_ACCESS_COOKIE, OTHER_ACCESS)}`,
        cookieSecure: true,
      },
      securityPorts(async (access, refresh) => {
        calls.push({ access, refresh });
      }),
    );
    assert.equal(result.status, 200);
    assert.deepEqual(calls, [{ access: ACCESS, refresh: REFRESH }]);
    assert.equal(cleared(result.cookies, SECURITY_ACCESS_COOKIE, SECURITY_REFRESH_COOKIE), true);
  });

  it('N. every logout path uses local current-session scope', () => {
    const calls = ownerAuthSource.match(/\.signOut\(\{[^}]*\}\)/g) ?? [];
    assert.ok(calls.length >= 3);
    assert.ok(calls.every((call) => call.includes("scope: 'local'")));
    assert.match(securityAuthSource, /signOutCurrentSupabaseSession/);
    assert.match(managerAuthSource, /completeStaffLogout/);
    assert.match(cashierAuthSource, /completeStaffLogout/);
    assert.match(managerAuthSource, /return liveOwnerAuthPorts\(\)/);
    assert.match(cashierAuthSource, /return liveOwnerAuthPorts\(\)/);
  });

  it('O. staff logout does not use default or global signOut', () => {
    for (const source of [ownerAuthSource, managerAuthSource, cashierAuthSource, securityAuthSource]) {
      assert.equal(source.includes("scope: 'global'"), false);
      assert.equal(source.includes('.signOut()'), false);
    }
  });

  it('P. logout with no auth cookies is idempotent', async () => {
    let called = false;
    const result = await logoutOwnerSession(
      ownerPorts(async () => {
        called = true;
      }),
      undefined,
      true,
    );
    assert.equal(called, false);
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(cleared(result.cookies, OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE), true);
  });

  it('Q. an already revoked session logout is idempotent', async () => {
    const result = await logoutOwnerSession(
      ownerPorts(async () => {
        throw new Error('Auth session missing');
      }),
      cookie(OWNER_REFRESH_COOKIE, REFRESH),
      true,
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(cleared(result.cookies, OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE), true);
  });

  it('R. a revocation service failure returns 503 and still clears cookies', async () => {
    const result = await logoutOwnerSession(
      ownerPorts(async () => {
        throw new Error(`fetch failed ${ACCESS}`);
      }),
      `${cookie(OWNER_ACCESS_COOKIE, ACCESS)}; ${cookie(OWNER_REFRESH_COOKIE, REFRESH)}`,
      true,
    );
    assert.equal(result.status, 503);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.error, 'STAFF_SESSION_REVOCATION_FAILED');
    assert.equal(cleared(result.cookies, OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE), true);
    assert.equal(jsonHas(result.body, [ACCESS, REFRESH]), false);
  });

  it('S. a stolen refresh token cannot restore the revoked session', async () => {
    const revoked = new Set<string>();
    const ports = ownerPorts(async (_access, refresh) => {
      if (refresh) revoked.add(refresh);
    });
    ports.refreshSession = async (refreshToken) => {
      if (revoked.has(refreshToken)) {
        throw new Error('Invalid Refresh Token');
      }
      return { accessToken: 'restored-access', refreshToken: 'restored-refresh' };
    };
    const logout = await logoutOwnerSession(
      ports,
      `${cookie(OWNER_ACCESS_COOKIE, ACCESS)}; ${cookie(OWNER_REFRESH_COOKIE, REFRESH)}`,
      true,
    );
    assert.equal(logout.status, 200);
    assert.equal(revoked.has(REFRESH), true);
    assert.equal(revoked.has(OTHER_REFRESH), false);
    await assert.rejects(() => ports.refreshSession(REFRESH), /Invalid Refresh Token/);
  });

  it('T. a revoked access JWT fails the SQL contract before role work', () => {
    for (const body of [staff, owner, manager, cashier, cashierLocked, security]) {
      const gateAt = body.indexOf('staff_require_live_auth_session()');
      const roleAt = body.search(/STAFF_ACCOUNT_NOT_FOUND|MANAGER_REQUIRED|CASHIER_REQUIRED|SECURITY_REQUIRED|OWNER_REQUIRED/);
      assert.ok(gateAt >= 0 && gateAt < roleAt);
    }
    assert.match(gate, /FROM auth\.sessions AS s/);
    assert.match(gate, /RAISE EXCEPTION 'SESSION_EXPIRED'/);
  });

  it('U. an owner downgraded to manager is denied', () => {
    assert.throws(
      () => assertActiveOwnerContext({
        role: 'manager',
        status: 'active',
        auth_user_id: 'staff-1',
      }),
      /OWNER_REQUIRED/,
    );
    assert.match(owner, /v_row\.role IS DISTINCT FROM 'owner'/);
    assert.match(owner, /OWNER_REQUIRED/);
    assert.throws(
      () => assertActiveManagerContext({ role: 'cashier', status: 'active', auth_user_id: 'staff-1' }),
      /MANAGER_REQUIRED/,
    );
    assert.match(manager, /MANAGER_REQUIRED/);
    assert.throws(
      () => assertActiveCashierContext({ role: 'manager', status: 'active', auth_user_id: 'staff-1' }),
      /CASHIER_REQUIRED/,
    );
    assert.match(cashier, /CASHIER_REQUIRED/);
    assert.throws(
      () => assertActiveSecurityContext({ role: 'owner', status: 'active', auth_user_id: 'staff-1' }),
      /SECURITY_REQUIRED/,
    );
    assert.match(security, /SECURITY_REQUIRED/);
  });

  it('V. disabled staff is still denied', () => {
    assert.throws(
      () => assertActiveOwnerContext({ role: 'owner', status: 'disabled', auth_user_id: 'staff-1' }),
      /STAFF_ACCOUNT_DISABLED/,
    );
    assert.match(staff, /STAFF_ACCOUNT_DISABLED/);
    assert.match(security, /STAFF_ACCOUNT_DISABLED/);
  });

  it('W. blocked staff is still denied', () => {
    assert.throws(
      () => assertActiveOwnerContext({ role: 'owner', status: 'blocked', auth_user_id: 'staff-1' }),
      /STAFF_ACCOUNT_BLOCKED/,
    );
    assert.match(staff, /STAFF_ACCOUNT_BLOCKED/);
    assert.match(manager, /STAFF_ACCOUNT_BLOCKED/);
    assert.match(security, /STAFF_ACCOUNT_BLOCKED/);
  });

  it('X. logout JSON does not contain access or refresh tokens', async () => {
    const logs: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      logs.push(args.map((item) => String(item)).join(' '));
    };
    try {
      const result = await handleOwnerAuthRequest(
        {
          method: 'POST',
          pathname: OWNER_AUTH_LOGOUT_PATH,
          cookie: `${cookie(OWNER_ACCESS_COOKIE, ACCESS)}; ${cookie(OWNER_REFRESH_COOKIE, REFRESH)}`,
          cookieSecure: true,
        },
        ownerPorts(async () => {
          throw new Error('Auth session missing');
        }),
      );
      assert.equal(jsonHas(result.body, [ACCESS, REFRESH]), false);
      assert.equal(logs.some((line) => line.includes(ACCESS) || line.includes(REFRESH)), false);
    } finally {
      console.error = original;
    }
  });

  it('does not claim MFA or distributed throttling', () => {
    assert.equal(migration.toLowerCase().includes('aal2'), false);
    assert.equal(migration.toLowerCase().includes('rate limit'), false);
  });
});
