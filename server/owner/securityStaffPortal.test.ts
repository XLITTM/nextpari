import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import type { OwnerAuthGatewayPorts } from '../staff/ownerAuthService.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from '../staff/ownerCookies.js';
import { handleOwnerControlRequest } from './ownerControlHttp.js';
import type { OwnerRpcPort } from './ownerRpc.js';
import { provisionOwnerSecurityStaff } from '../staff/staffHierarchyService.js';

const ACCESS = 'owner-access-token';
const REFRESH = 'owner-refresh-token';
const AUTH_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PASSWORD = 'temporary-pass-12';

const OWNER_CTX = {
  role: 'owner',
  status: 'active',
  auth_user_id: 'owner-uid',
  display_name: 'Owner',
  network_id: null,
};

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const sql = readFileSync(join(root, 'supabase/migrations/20260914033000_security_staff_portal_051.sql'), 'utf8');
const sql050 = readFileSync(join(root, 'supabase/migrations/20260914023000_security_sports_investigation_050.sql'), 'utf8');

function extractFn(source: string, name: string): string {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${name}`);
  assert.ok(start >= 0, name);
  const next = source.indexOf('CREATE OR REPLACE FUNCTION', start + 10);
  return next >= 0 ? source.slice(start, next) : source.slice(start);
}

function publicFunctions(source: string): Array<{ name: string; body: string }> {
  const re = /CREATE OR REPLACE FUNCTION (public\.[a-z0-9_]+)\(/gi;
  const matches = [...source.matchAll(re)];
  return matches.map((match, index) => ({
    name: match[1],
    body: source.slice(match.index, index + 1 < matches.length ? matches[index + 1].index : source.length),
  }));
}

function cookieHeader(): string {
  return `${OWNER_ACCESS_COOKIE}=${encodeURIComponent(ACCESS)}; ${OWNER_REFRESH_COOKIE}=${encodeURIComponent(REFRESH)}`;
}

function createAuthPorts(): OwnerAuthGatewayPorts {
  return {
    async signInWithPassword() {
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async refreshSession() {
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async currentStaffContext() {
      return OWNER_CTX;
    },
  };
}

function createRpc() {
  const calls: Array<{ token: string; name: string; args?: Record<string, unknown> }> = [];
  const rpcFactory = (accessToken: string): OwnerRpcPort => ({
    async invoke(name, args) {
      calls.push({ token: accessToken, name, args });
      if (name === 'owner_list_security_staff') {
        return {
          ok: true,
          rows: [{
            auth_user_id: AUTH_ID,
            login: 'security01',
            display_name: 'Security One',
            status: 'active',
          }],
        };
      }
      return { ok: true, rpc: name, args: args ?? null, auth_user_id: AUTH_ID, login: 'security01', display_name: 'Security One', status: 'active' };
    },
  });
  return { calls, rpcFactory };
}

describe('security staff portal SQL contract 051 (not executed)', () => {
  it('SECURITY ROLE: dedicated security, not manager or cashier', () => {
    assert.match(sql, /role = 'security'/);
    assert.match(sql, /IN \('owner', 'manager', 'cashier', 'security'\)/);
    assert.match(sql, /private\.get_current_security_context\(\)/);
    assert.match(extractFn(sql, 'private.get_current_security_context()'), /RAISE EXCEPTION 'AUTH_REQUIRED'/);
    assert.match(extractFn(sql, 'private.get_current_security_context()'), /RAISE EXCEPTION 'STAFF_ACCOUNT_NOT_FOUND'/);
    assert.match(extractFn(sql, 'private.get_current_security_context()'), /RAISE EXCEPTION 'SECURITY_REQUIRED'/);
    assert.match(extractFn(sql, 'private.get_current_security_context()'), /RAISE EXCEPTION 'STAFF_ACCOUNT_BLOCKED'/);
    assert.match(extractFn(sql, 'private.get_current_security_context()'), /RAISE EXCEPTION 'STAFF_ACCOUNT_DISABLED'/);
    assert.match(sql, /\[a-z0-9\._-\]\{3,32\}/);
    assert.match(sql, /staff_accounts_security_login_uidx/);
  });

  it('public security wrappers that call get_current_security_context are VOLATILE', () => {
    const ctx = extractFn(sql, 'private.get_current_security_context()');
    assert.match(ctx, /LANGUAGE plpgsql\s+VOLATILE/, 'GET_CURRENT_SECURITY_CONTEXT: VOLATILE');
    assert.match(ctx, /UPDATE private\.staff_accounts/);

    const restriction = extractFn(sql, 'public.security_player_security_restriction(');
    assert.match(restriction, /PERFORM private\.get_current_security_context\(\)/);
    assert.match(restriction, /LANGUAGE plpgsql\s+VOLATILE/, 'SECURITY_PLAYER_SECURITY_RESTRICTION: VOLATILE');
    assert.equal(/LANGUAGE plpgsql\s+STABLE/.test(restriction), false);

    for (const [label, source] of [['051', sql], ['050', sql050]] as const) {
      for (const fn of publicFunctions(source)) {
        if (!fn.body.includes('private.get_current_security_context()')) continue;
        assert.match(
          fn.body,
          /LANGUAGE plpgsql\s+VOLATILE/,
          `${label} ${fn.name} must be VOLATILE`,
        );
        assert.equal(
          /LANGUAGE plpgsql\s+STABLE/.test(fn.body),
          false,
          `NO STABLE PUBLIC SECURITY WRAPPER CALLS GET_CURRENT_SECURITY_CONTEXT: PASS (${fn.name})`,
        );
      }
    }

    for (const name of [
      'public.security_player_sports_bets(',
      'public.security_player_sports_bet(p_player_id TEXT, p_bet_id UUID)',
      'public.security_player_sports_summary(',
    ]) {
      const sports = extractFn(sql050, name);
      assert.match(sports, /PERFORM private\.get_current_security_context\(\)/);
      assert.match(sports, /LANGUAGE plpgsql\s+VOLATILE/, 'SECURITY SPORTS WRAPPERS FROM 050: VOLATILE/PASS');
    }
  });

  it('PLAINTEXT PASSWORD STORED: NO and INTERNAL AUTH EMAIL stays private', () => {
    assert.equal(sql.includes('password_hash'), false);
    assert.equal(/plaintext_password/i.test(sql), false);
    const provision = extractFn(sql, 'public.owner_provision_security_staff(');
    assert.equal(/\bpassword\b/i.test(provision), false);
    assert.match(provision, /AUTH_EMAIL_INVALID/);
    assert.match(provision, /nextpari/);
    assert.equal(provision.includes("'auth_email'"), false);
    const list = extractFn(sql, 'public.owner_list_security_staff()');
    assert.equal(list.includes('auth_email'), false);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.security_lookup_login_email\(TEXT\) TO service_role/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.security_lookup_login_email\(TEXT\) FROM PUBLIC, anon, authenticated/);
  });

  it('STAFF AUDIT: YES and AUDIT APPEND-ONLY: YES', () => {
    assert.match(sql, /SECURITY_FLAG_REVIEWED/);
    assert.match(sql, /SECURITY_FLAG_RESOLVED/);
    assert.match(sql, /SECURITY_FLAG_DISMISSED/);
    assert.match(sql, /SECURITY_RESTRICTION_APPLIED/);
    assert.match(sql, /SECURITY_RESTRICTION_REMOVED/);
    assert.match(sql, /private\.append_staff_audit/);
    assert.match(sql, /SECURITY_STAFF_ACTIONS_APPEND_ONLY/);
    assert.match(sql, /CREATE TRIGGER security_staff_actions_no_update/);
    assert.equal(sql.includes('UPDATE private.security_staff_actions'), false);
    assert.equal(sql.includes('DELETE FROM private.security_staff_actions'), false);
  });

  it('STAFF AUDIT ACTOR ROLE CHECK EXISTS and is fail-closed', () => {
    const dropMatch = sql.match(
      /ALTER TABLE private\.staff_audit_log\s+DROP CONSTRAINT IF EXISTS staff_audit_log_actor_role_check;/,
    );
    const addMatch = sql.match(
      /ALTER TABLE private\.staff_audit_log\s+ADD CONSTRAINT staff_audit_log_actor_role_check\s+CHECK \(\s*actor_role IS NULL\s+OR actor_role IN \(\s*'owner',\s*'manager',\s*'cashier',\s*'security',\s*'system'\s*\)\s*\)/,
    );
    assert.ok(dropMatch, 'STAFF AUDIT ACTOR ROLE CHECK EXISTS: YES');
    assert.ok(addMatch, 'SECURITY AUDIT INSERT COMPATIBLE: YES');
    assert.ok(
      (dropMatch.index ?? -1) < (addMatch.index ?? -1),
      'constraint is replaced, not dropped without recreation',
    );
    assert.match(addMatch[0], /'owner'/, 'OWNER PRESERVED: YES');
    assert.match(addMatch[0], /'manager'/, 'MANAGER PRESERVED: YES');
    assert.match(addMatch[0], /'cashier'/, 'CASHIER PRESERVED: YES');
    assert.match(addMatch[0], /'security'/, 'SECURITY ROLE ADDED TO AUDIT CHECK: YES');
    assert.match(addMatch[0], /'system'/, 'SYSTEM PRESERVED: YES');
    assert.match(addMatch[0], /actor_role IS NULL/, 'NULL if previously allowed');
    assert.equal(/'player'/.test(addMatch[0]), false, 'INVALID ROLE REJECTED: YES');
    assert.equal(/'unknown'/.test(addMatch[0]), false, 'arbitrary/unknown role DENIED');
    assert.match(sql, /PERFORM private\.append_staff_audit\(/);
    assert.equal(/CREATE OR REPLACE FUNCTION private\.append_staff_audit/.test(sql), false);
    assert.equal(sql.includes('DO $audit$'), false);
    assert.equal(/WHEN others THEN\s+NULL/i.test(sql), false, 'WHEN OTHERS SWALLOWING AUDIT CONSTRAINT ERRORS: NO');
  });

  it('Security restriction uses 049 engine and never hard-blocks', () => {
    const setFn = extractFn(sql, 'public.security_set_player_security_restriction(');
    assert.match(setFn, /private\.set_player_security_restriction/);
    assert.equal(setFn.includes('owner_set_player_blocked'), false);
    assert.match(sql, /IN \('owner', 'security'\)/);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION public.security_player_sports_bets'), false);
    assert.equal(sql.includes('owner_set_player_blocked'), false);
  });
});

describe('owner creates and manages Security staff', () => {
  it('OWNER CREATES SECURITY USER: PASS with custom login and temp password', async () => {
    const createdEmails: string[] = [];
    const rpc = createRpc();
    const result = await handleOwnerControlRequest(
      {
        method: 'POST',
        pathname: '/api/owner/security-staff',
        cookie: cookieHeader(),
        cookieSecure: true,
        body: {
          login: 'Security01',
          displayName: 'Security One',
          temporaryPassword: PASSWORD,
        },
      },
      {
        sessionPorts: createAuthPorts(),
        rpcFactory: rpc.rpcFactory,
        adminFactory: () => ({
          async createUser(email) {
            createdEmails.push(email);
            return { id: AUTH_ID };
          },
          async deleteUser() {},
        }),
      },
    );
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'owner_provision_security_staff');
    assert.equal(rpc.calls[0]?.args?.p_login, 'Security01');
    assert.match(createdEmails[0] ?? '', /@auth\.nextpari\.invalid$/);
    assert.equal(JSON.stringify(result.body).includes(PASSWORD), false);
    assert.equal(JSON.stringify(result.body).includes('@auth.nextpari.invalid'), false);
    assert.equal(JSON.stringify(result.body).includes(createdEmails[0] ?? 'no-email'), false);
  });

  it('compensates Auth user when Security staff binding fails', async () => {
    const deleted: string[] = [];
    await assert.rejects(
      () => provisionOwnerSecurityStaff(
        {
          body: { login: 'security01', displayName: 'Sec', temporaryPassword: PASSWORD },
          admin: {
            async createUser(email) {
              assert.match(email, /@auth\.nextpari\.invalid$/);
              return { id: 'auth-sec-fail' };
            },
            async deleteUser(id) {
              deleted.push(id);
            },
          },
          invoke: async () => {
            throw staffError('LOGIN_TAKEN', 409);
          },
          log: { error() {} },
        },
      ),
      /LOGIN_TAKEN/,
    );
    assert.deepEqual(deleted, ['auth-sec-fail']);
  });

  it('OWNER SECURITY TEAM VIEW / DISABLE / ENABLE / RESET PASSWORD: PASS', async () => {
    const list = await handleOwnerControlRequest(
      {
        method: 'GET',
        pathname: '/api/owner/security-staff',
        cookie: cookieHeader(),
        cookieSecure: true,
      },
      { sessionPorts: createAuthPorts(), rpcFactory: createRpc().rpcFactory },
    );
    assert.equal(list.status, 200);
    assert.equal(JSON.stringify(list.body).includes('@auth.nextpari.invalid'), false);

    const activity = await handleOwnerControlRequest(
      {
        method: 'GET',
        pathname: '/api/owner/security-staff/activity',
        cookie: cookieHeader(),
        cookieSecure: true,
      },
      { sessionPorts: createAuthPorts(), rpcFactory: createRpc().rpcFactory },
    );
    assert.equal(activity.status, 200);

    const disable = await handleOwnerControlRequest(
      {
        method: 'POST',
        pathname: `/api/owner/security-staff/${AUTH_ID}/status`,
        cookie: cookieHeader(),
        cookieSecure: true,
        body: { status: 'disabled' },
      },
      { sessionPorts: createAuthPorts(), rpcFactory: createRpc().rpcFactory },
    );
    assert.equal(disable.status, 200);

    const enable = await handleOwnerControlRequest(
      {
        method: 'POST',
        pathname: `/api/owner/security-staff/${AUTH_ID}/status`,
        cookie: cookieHeader(),
        cookieSecure: true,
        body: { status: 'active' },
      },
      { sessionPorts: createAuthPorts(), rpcFactory: createRpc().rpcFactory },
    );
    assert.equal(enable.status, 200);

    const resetCalls: string[] = [];
    const reset = await handleOwnerControlRequest(
      {
        method: 'POST',
        pathname: `/api/owner/security-staff/${AUTH_ID}/reset-password`,
        cookie: cookieHeader(),
        cookieSecure: true,
        body: { temporaryPassword: 'new-temporary-12' },
      },
      {
        sessionPorts: createAuthPorts(),
        rpcFactory: createRpc().rpcFactory,
        adminFactory: () => ({
          async createUser() {
            return { id: AUTH_ID };
          },
          async deleteUser() {},
          async updateUserPassword(id, password) {
            resetCalls.push(`${id}:${password}`);
          },
        }),
      },
    );
    assert.equal(reset.status, 200);
    assert.deepEqual(resetCalls, [`${AUTH_ID}:new-temporary-12`]);
    assert.equal(JSON.stringify(reset.body).includes('new-temporary-12'), false);
  });

  it('Manager/Cashier/Security/Player cannot manage Security employees via Owner API without Owner session', async () => {
    const result = await handleOwnerControlRequest(
      {
        method: 'POST',
        pathname: '/api/owner/security-staff',
        cookie: '',
        cookieSecure: true,
        body: { login: 'security01', displayName: 'X', temporaryPassword: PASSWORD },
      },
      {
        sessionPorts: {
          async signInWithPassword() {
            throw staffError('AUTH_FAILED', 401);
          },
          async refreshSession() {
            throw staffError('JWT_INVALID', 401);
          },
          async currentStaffContext() {
            throw staffError('JWT_REQUIRED', 401);
          },
        },
      },
    );
    assert.equal(result.status, 401);
  });

  it('Owner Security Team UI exists and does not show password or auth email', () => {
    const panel = readFileSync(join(root, 'src/owner/OwnerSecurityTeamPanel.tsx'), 'utf8');
    const dashboard = readFileSync(join(root, 'src/owner/ManagerDashboardScreen.tsx'), 'utf8');
    const services = readFileSync(join(root, 'src/owner/services.ts'), 'utf8');
    assert.match(dashboard, /Служба безопасности/);
    assert.match(dashboard, /OwnerSecurityTeamPanel/);
    assert.match(panel, /24 часа/);
    assert.match(panel, /7 дней/);
    assert.match(panel, /30 дней/);
    assert.match(panel, /Лента действий/);
    assert.match(services, /\/api\/owner\/security-staff/);
    assert.equal(panel.includes('@auth.nextpari.invalid'), false);
    assert.equal(services.includes('auth_email'), false);
  });
});
