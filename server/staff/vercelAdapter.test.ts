import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  OWNER_STAFF_CASHIER_PATH,
  OWNER_STAFF_MANAGER_PATH,
} from './httpHandler.js';
import type { AuthAdminPort, OwnerStaffPort, StaffLog } from './types.js';
import { handleVercelOwnerStaff } from './vercelHandler.js';

const MANAGER_ID = 'ccc5f5ad-079e-4420-9080-e7ded4ff9496';
const CASHIER_ID = '0393d651-e13a-4f04-ba7d-352f63bc62a5';
const AUTH_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PASSWORD = 'temporary-pass-ok';
const OWNER_TOKEN = 'owner-jwt-token';

const here = dirname(fileURLToPath(import.meta.url));

function createRes() {
  const headers: Record<string, string> = {};
  let statusCode = 0;
  let body: Record<string, unknown> = {};
  return {
    headers,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    setHeader(name: string, value: string | string[]) {
      headers[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
    },
    json(payload: unknown) {
      body = payload as Record<string, unknown>;
    },
  };
}

function createPorts() {
  const tokens: string[] = [];
  const calls: string[] = [];
  const logs: Array<{ event: string; fields: Record<string, unknown> }> = [];
  const owner: OwnerStaffPort = {
    async currentStaffContext() {
      calls.push('current_staff_context');
      return { role: 'owner', status: 'active', auth_user_id: 'owner-uid' };
    },
    async listStaffAuthBindings() {
      calls.push('owner_list_staff_auth_bindings');
      return { rows: [], total: 0 };
    },
    async bindManager() {
      calls.push('owner_bind_manager_auth');
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
      calls.push('owner_bind_cashier_auth');
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
      calls.push('createUser');
      return { id: AUTH_USER_ID };
    },
    async deleteUser() {
      calls.push('deleteUser');
    },
  };
  const log: StaffLog = {
    error(event, fields) {
      logs.push({ event, fields });
    },
  };
  return {
    tokens,
    calls,
    logs,
    log,
    portsFactory: (accessToken: string) => {
      tokens.push(accessToken);
      return { owner, admin };
    },
  };
}

describe('vercel serverless adapter', () => {
  it('manager POST reaches canonical handler', async () => {
    const ports = createPorts();
    const res = createRes();
    await handleVercelOwnerStaff(
      {
        method: 'POST',
        headers: { authorization: `Bearer ${OWNER_TOKEN}` },
        body: {
          managerId: MANAGER_ID,
          email: 'manager@example.com',
          temporaryPassword: PASSWORD,
        },
      },
      res,
      OWNER_STAFF_MANAGER_PATH,
      ports.portsFactory,
      ports.log,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.role, 'manager');
    assert.equal(ports.calls.includes('createUser'), true);
    assert.equal(ports.calls.includes('owner_bind_manager_auth'), true);
  });

  it('cashier POST reaches canonical handler', async () => {
    const ports = createPorts();
    const res = createRes();
    await handleVercelOwnerStaff(
      {
        method: 'POST',
        headers: { authorization: `Bearer ${OWNER_TOKEN}` },
        body: {
          cashierId: CASHIER_ID,
          email: 'cashier@example.com',
          temporaryPassword: PASSWORD,
        },
      },
      res,
      OWNER_STAFF_CASHIER_PATH,
      ports.portsFactory,
      ports.log,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.role, 'cashier');
    assert.equal(ports.calls.includes('createUser'), true);
    assert.equal(ports.calls.includes('owner_bind_cashier_auth'), true);
  });

  it('GET → 405', async () => {
    const ports = createPorts();
    const res = createRes();
    await handleVercelOwnerStaff(
      {
        method: 'GET',
        headers: { authorization: `Bearer ${OWNER_TOKEN}` },
        body: {},
      },
      res,
      OWNER_STAFF_MANAGER_PATH,
      ports.portsFactory,
      ports.log,
    );
    assert.equal(res.statusCode, 405);
    assert.equal(res.body.error, 'METHOD_NOT_ALLOWED');
    assert.equal(res.headers.allow, 'POST');
    assert.equal(ports.calls.includes('createUser'), false);
  });

  it('malformed JSON controlled 4xx', async () => {
    const ports = createPorts();
    const res = createRes();
    await handleVercelOwnerStaff(
      {
        method: 'POST',
        headers: { authorization: `Bearer ${OWNER_TOKEN}` },
        body: '{not-json',
      },
      res,
      OWNER_STAFF_MANAGER_PATH,
      ports.portsFactory,
      ports.log,
    );
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'BODY_INVALID');
    assert.equal(ports.calls.includes('createUser'), false);
  });

  it('Authorization forwarded correctly', async () => {
    const ports = createPorts();
    const res = createRes();
    await handleVercelOwnerStaff(
      {
        method: 'POST',
        headers: { authorization: `Bearer ${OWNER_TOKEN}` },
        body: {
          managerId: MANAGER_ID,
          email: 'manager@example.com',
          temporaryPassword: PASSWORD,
        },
      },
      res,
      OWNER_STAFF_MANAGER_PATH,
      ports.portsFactory,
      ports.log,
    );
    assert.deepEqual(ports.tokens, [OWNER_TOKEN]);
    assert.equal(res.statusCode, 200);
  });

  it('temporaryPassword absent from response/log', async () => {
    const ports = createPorts();
    const res = createRes();
    await handleVercelOwnerStaff(
      {
        method: 'POST',
        headers: { authorization: `Bearer ${OWNER_TOKEN}` },
        body: {
          managerId: MANAGER_ID,
          email: 'manager@example.com',
          temporaryPassword: PASSWORD,
        },
      },
      res,
      OWNER_STAFF_MANAGER_PATH,
      ports.portsFactory,
      ports.log,
    );
    const dumped = JSON.stringify({ body: res.body, logs: ports.logs, headers: res.headers });
    assert.equal(dumped.includes(PASSWORD), false);
  });

  it('serverless adapter never exposes service-role key', () => {
    const sources = [
      readFileSync(join(here, 'vercelHandler.ts'), 'utf8'),
      readFileSync(join(here, '../../api/owner/staff/manager.ts'), 'utf8'),
      readFileSync(join(here, '../../api/owner/staff/cashier.ts'), 'utf8'),
    ].join('\n');
    assert.equal(sources.includes('VITE_SUPABASE_SERVICE_ROLE_KEY'), false);
    assert.equal(sources.includes('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE'), false);
    assert.equal(sources.includes('SUPABASE_SERVICE_ROLE_KEY='), false);
    assert.match(sources, /handleVercelOwnerStaff/);
    assert.match(sources, /handleOwnerStaffRequest/);
  });
});
