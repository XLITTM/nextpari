import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { redactForLog, StaffOnboardingError } from './errors.js';
import { loadStaffOnboardingEnv } from './env.js';
import { handleOwnerStaffRequest } from './httpHandler.js';
import { onboardStaff } from './staffOnboardingService.js';
import type { AuthAdminPort, OwnerStaffPort, StaffBindingRow, StaffBindResult, StaffLog } from './types.js';

const MANAGER_ID = 'ccc5f5ad-079e-4420-9080-e7ded4ff9496';
const CASHIER_ID = '0393d651-e13a-4f04-ba7d-352f63bc62a5';
const AUTH_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PASSWORD = 'temporary-pass-ok';

const here = dirname(fileURLToPath(import.meta.url));

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function ownerContext(role = 'owner', status = 'active'): Record<string, unknown> {
  return { role, status, auth_user_id: 'owner-uid', display_name: 'Owner' };
}

function bindResult(role: 'manager' | 'cashier'): StaffBindResult {
  return {
    ok: true,
    isDuplicate: false,
    authUserId: AUTH_USER_ID,
    role,
    status: 'active',
    displayName: role === 'manager' ? 'Manager' : 'Cashier',
    networkId: '11111111-1111-1111-1111-111111111111',
    legacyManagerAccountId: role === 'manager' ? MANAGER_ID : null,
    legacyCashierId: role === 'cashier' ? CASHIER_ID : null,
  };
}

function existingRow(role: 'manager' | 'cashier'): StaffBindingRow {
  const bound = bindResult(role);
  return {
    authUserId: bound.authUserId,
    role: bound.role,
    status: bound.status,
    displayName: bound.displayName,
    networkId: bound.networkId,
    legacyManagerAccountId: bound.legacyManagerAccountId,
    legacyCashierId: bound.legacyCashierId,
  };
}

function createMocks(options?: {
  staffRole?: string;
  staffStatus?: string;
  bindings?: StaffBindingRow[];
  createUser?: AuthAdminPort['createUser'];
  bindManager?: OwnerStaffPort['bindManager'];
  bindCashier?: OwnerStaffPort['bindCashier'];
  deleteUser?: AuthAdminPort['deleteUser'];
}) {
  const calls: string[] = [];
  const owner: OwnerStaffPort = {
    async currentStaffContext() {
      calls.push('current_staff_context');
      const role = options?.staffRole ?? 'owner';
      const status = options?.staffStatus ?? 'active';
      if (role === 'player') {
        throw new StaffOnboardingError('STAFF_ACCOUNT_NOT_FOUND', 403);
      }
      return ownerContext(role, status);
    },
    async listStaffAuthBindings(role) {
      calls.push('owner_list_staff_auth_bindings');
      const rows = (options?.bindings ?? []).filter((row) => row.role === role);
      return { rows, total: rows.length };
    },
    async bindManager(authUserId, managerId) {
      calls.push('owner_bind_manager_auth');
      if (options?.bindManager) return options.bindManager(authUserId, managerId);
      return bindResult('manager');
    },
    async bindCashier(authUserId, cashierId) {
      calls.push('owner_bind_cashier_auth');
      if (options?.bindCashier) return options.bindCashier(authUserId, cashierId);
      return bindResult('cashier');
    },
  };
  const admin: AuthAdminPort = {
    async createUser(email, password) {
      calls.push('createUser');
      if (password === PASSWORD && email.includes('@')) {
        /* ok */
      }
      if (options?.createUser) return options.createUser(email, password);
      return { id: AUTH_USER_ID };
    },
    async deleteUser(id) {
      calls.push(`deleteUser:${id}`);
      if (options?.deleteUser) return options.deleteUser(id);
    },
  };
  const logs: Array<{ event: string; fields: Record<string, unknown> }> = [];
  const log: StaffLog = {
    error(event, fields) {
      logs.push({ event, fields });
    },
  };
  return { owner, admin, calls, logs, log };
}

function moneyRpcsCalled(calls: string[]): string[] {
  const money = [
    'owner_capital_in',
    'owner_fund_manager',
    'owner_fund_cashier',
    'owner_fund_player',
    'manager_topup_cashier',
    'apply_operational_transfer',
    'apply_wallet_entry',
  ];
  return calls.filter((name) => money.includes(name));
}

describe('owner staff onboarding HTTP auth', () => {
  it('missing JWT → 401', async () => {
    const mocks = createMocks();
    const result = await handleOwnerStaffRequest(
      {
        method: 'POST',
        pathname: '/api/owner/staff/manager',
        authorization: undefined,
        body: {
          managerId: MANAGER_ID,
          email: 'manager@example.com',
          temporaryPassword: PASSWORD,
        },
      },
      () => ({ owner: mocks.owner, admin: mocks.admin }),
      mocks.log,
    );
    assert.equal(result.status, 401);
    assert.equal(result.body.error, 'JWT_REQUIRED');
    assert.equal(mocks.calls.includes('createUser'), false);
  });

  it('manager JWT → 403', async () => {
    const mocks = createMocks({ staffRole: 'manager' });
    const result = await handleOwnerStaffRequest(
      {
        method: 'POST',
        pathname: '/api/owner/staff/cashier',
        authorization: 'Bearer manager-token',
        body: {
          cashierId: CASHIER_ID,
          email: 'cashier@example.com',
          temporaryPassword: PASSWORD,
        },
      },
      () => ({ owner: mocks.owner, admin: mocks.admin }),
      mocks.log,
    );
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'OWNER_REQUIRED');
    assert.equal(mocks.calls.includes('createUser'), false);
  });

  it('player JWT → 403', async () => {
    const mocks = createMocks({ staffRole: 'player' });
    const result = await handleOwnerStaffRequest(
      {
        method: 'POST',
        pathname: '/api/owner/staff/manager',
        authorization: 'Bearer player-token',
        body: {
          managerId: MANAGER_ID,
          email: 'manager@example.com',
          temporaryPassword: PASSWORD,
        },
      },
      () => ({ owner: mocks.owner, admin: mocks.admin }),
      mocks.log,
    );
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'STAFF_ACCOUNT_NOT_FOUND');
    assert.equal(mocks.calls.includes('createUser'), false);
  });
});

describe('owner staff create + bind', () => {
  it('owner creates manager Auth → bind RPC called', async () => {
    const mocks = createMocks();
    const result = await handleOwnerStaffRequest(
      {
        method: 'POST',
        pathname: '/api/owner/staff/manager',
        authorization: 'Bearer owner-token',
        body: {
          managerId: MANAGER_ID,
          email: '  Manager01@Example.com ',
          temporaryPassword: PASSWORD,
        },
      },
      () => ({ owner: mocks.owner, admin: mocks.admin }),
      mocks.log,
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.authUserId, AUTH_USER_ID);
    assert.equal(result.body.role, 'manager');
    assert.equal(result.body.legacyManagerAccountId, MANAGER_ID);
    assert.equal(mocks.calls.includes('createUser'), true);
    assert.equal(mocks.calls.includes('owner_bind_manager_auth'), true);
    assert.equal(mocks.calls.includes('owner_bind_cashier_auth'), false);
    assert.deepEqual(moneyRpcsCalled(mocks.calls), []);
  });

  it('owner creates cashier Auth → bind RPC called', async () => {
    const mocks = createMocks();
    const result = await handleOwnerStaffRequest(
      {
        method: 'POST',
        pathname: '/api/owner/staff/cashier',
        authorization: 'Bearer owner-token',
        body: {
          cashierId: CASHIER_ID,
          email: 'cashier@example.com',
          temporaryPassword: PASSWORD,
        },
      },
      () => ({ owner: mocks.owner, admin: mocks.admin }),
      mocks.log,
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.role, 'cashier');
    assert.equal(result.body.legacyCashierId, CASHIER_ID);
    assert.equal(mocks.calls.includes('createUser'), true);
    assert.equal(mocks.calls.includes('owner_bind_cashier_auth'), true);
    assert.equal(mocks.calls.includes('owner_bind_manager_auth'), false);
    assert.deepEqual(moneyRpcsCalled(mocks.calls), []);
  });

  it('createUser fails → no binding attempted', async () => {
    const mocks = createMocks({
      createUser: async () => {
        throw new StaffOnboardingError('AUTH_USER_CREATE_FAILED', 502);
      },
    });
    const result = await handleOwnerStaffRequest(
      {
        method: 'POST',
        pathname: '/api/owner/staff/manager',
        authorization: 'Bearer owner-token',
        body: {
          managerId: MANAGER_ID,
          email: 'manager@example.com',
          temporaryPassword: PASSWORD,
        },
      },
      () => ({ owner: mocks.owner, admin: mocks.admin }),
      mocks.log,
    );
    assert.equal(result.status, 502);
    assert.equal(mocks.calls.includes('createUser'), true);
    assert.equal(mocks.calls.includes('owner_bind_manager_auth'), false);
    assert.equal(mocks.calls.some((c) => c.startsWith('deleteUser:')), false);
  });

  it('createUser succeeds, binding fails → deleteUser compensation', async () => {
    const mocks = createMocks({
      bindManager: async () => {
        throw new StaffOnboardingError('LEGACY_MANAGER_NOT_ACTIVE', 400);
      },
    });
    const result = await handleOwnerStaffRequest(
      {
        method: 'POST',
        pathname: '/api/owner/staff/manager',
        authorization: 'Bearer owner-token',
        body: {
          managerId: MANAGER_ID,
          email: 'manager@example.com',
          temporaryPassword: PASSWORD,
        },
      },
      () => ({ owner: mocks.owner, admin: mocks.admin }),
      mocks.log,
    );
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'LEGACY_MANAGER_NOT_ACTIVE');
    assert.equal(mocks.calls.includes('createUser'), true);
    assert.equal(mocks.calls.includes('owner_bind_manager_auth'), true);
    assert.equal(mocks.calls.includes(`deleteUser:${AUTH_USER_ID}`), true);
  });

  it('password never appears in logs/response', async () => {
    const mocks = createMocks();
    const result = await handleOwnerStaffRequest(
      {
        method: 'POST',
        pathname: '/api/owner/staff/manager',
        authorization: 'Bearer owner-token',
        body: {
          managerId: MANAGER_ID,
          email: 'manager@example.com',
          temporaryPassword: PASSWORD,
        },
      },
      () => ({ owner: mocks.owner, admin: mocks.admin }),
      mocks.log,
    );
    const dumped = JSON.stringify({ body: result.body, logs: mocks.logs });
    assert.equal(dumped.includes(PASSWORD), false);
    assert.equal(dumped.toLowerCase().includes('temporary-pass'), false);
    const redacted = redactForLog({
      temporaryPassword: PASSWORD,
      password: PASSWORD,
      serviceRoleKey: 'secret-service-role',
      authUserId: AUTH_USER_ID,
    }) as Record<string, unknown>;
    assert.equal(redacted.temporaryPassword, '[redacted]');
    assert.equal(redacted.password, '[redacted]');
    assert.equal(redacted.serviceRoleKey, '[redacted]');
    assert.equal(redacted.authUserId, AUTH_USER_ID);
  });

  it('already-bound staff → no createUser', async () => {
    const mocks = createMocks({
      bindings: [existingRow('manager')],
    });
    const result = await handleOwnerStaffRequest(
      {
        method: 'POST',
        pathname: '/api/owner/staff/manager',
        authorization: 'Bearer owner-token',
        body: {
          managerId: MANAGER_ID,
          email: 'manager@example.com',
          temporaryPassword: PASSWORD,
        },
      },
      () => ({ owner: mocks.owner, admin: mocks.admin }),
      mocks.log,
    );
    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'STAFF_ALREADY_ONBOARDED');
    assert.equal(result.body.authUserId, AUTH_USER_ID);
    assert.equal(mocks.calls.includes('createUser'), false);
    assert.equal(mocks.calls.includes('owner_bind_manager_auth'), false);
  });
});

describe('secrets and freeze', () => {
  it('service-role key never shipped to client / Vite public env', () => {
    const snapshot = {
      vite: process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
      url: process.env.SUPABASE_URL,
      anon: process.env.SUPABASE_ANON_KEY,
      service: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY = 'leaked-key';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-only';
    try {
      assert.throws(() => loadStaffOnboardingEnv(), /VITE_SUPABASE_SERVICE_ROLE_KEY_FORBIDDEN/);
    } finally {
      restoreEnv('VITE_SUPABASE_SERVICE_ROLE_KEY', snapshot.vite);
      restoreEnv('SUPABASE_URL', snapshot.url);
      restoreEnv('SUPABASE_ANON_KEY', snapshot.anon);
      restoreEnv('SUPABASE_SERVICE_ROLE_KEY', snapshot.service);
    }

    const staffDir = here;
    const sources = [
      readFileSync(join(staffDir, 'staffAuthAdmin.ts'), 'utf8'),
      readFileSync(join(staffDir, 'httpHandler.ts'), 'utf8'),
      readFileSync(join(staffDir, 'staffOnboardingService.ts'), 'utf8'),
      readFileSync(join(staffDir, '../../plugins/owner-staff-onboarding.ts'), 'utf8'),
      readFileSync(join(staffDir, '../../vite.config.ts'), 'utf8'),
    ].join('\n');
    assert.equal(sources.includes('VITE_SUPABASE_SERVICE_ROLE_KEY='), false);
    assert.equal(sources.includes('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE'), false);
    assert.match(readFileSync(join(staffDir, 'env.ts'), 'utf8'), /VITE_SUPABASE_SERVICE_ROLE_KEY_FORBIDDEN/);
  });

  it('no money RPC called', async () => {
    const mocks = createMocks();
    await onboardStaff(
      {
        role: 'manager',
        accessToken: 'owner-token',
        email: 'manager@example.com',
        temporaryPassword: PASSWORD,
        managerId: MANAGER_ID,
      },
      { owner: mocks.owner, admin: mocks.admin },
      mocks.log,
    );
    assert.deepEqual(moneyRpcsCalled(mocks.calls), []);
    assert.equal(mocks.calls.includes('owner_bind_manager_auth'), true);
  });
});
