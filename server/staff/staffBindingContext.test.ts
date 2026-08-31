import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertActiveCashierContext } from './cashierContext.js';
import { assertActiveManagerContext } from './managerContext.js';
import { assertActiveOwnerContext } from './ownerContext.js';
import {
  CASHIER_AUTH_LOGIN_PATH,
  handleCashierAuthRequest,
} from './cashierAuthHttp.js';
import {
  MANAGER_AUTH_LOGIN_PATH,
  handleManagerAuthRequest,
} from './managerAuthHttp.js';
import {
  OWNER_AUTH_LOGIN_PATH,
  handleOwnerAuthRequest,
} from './ownerAuthHttp.js';
import type { OwnerAuthGatewayPorts } from './ownerAuthService.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260831_021_staff_binding_context.sql'),
  'utf8',
);

const CASHIER_AUTH_USER = 'de04491b-344d-4af1-81e8-bce3f53f21ac';
const CASHIER_ID = '0393d651-e13a-4f04-ba7d-352f63bc62a5';
const MANAGER_ID = 'ccc5f5ad-079e-4420-9080-e7ded4ff9496';
const NETWORK_ID = '11111111-1111-1111-1111-111111111111';

const BINDING_CASHIER = {
  auth_user_id: CASHIER_AUTH_USER,
  role: 'cashier',
  status: 'active',
  display_name: 'agent01',
  network_id: NETWORK_ID,
  legacy_manager_account_id: null,
  legacy_cashier_id: CASHIER_ID,
};

const BINDING_MANAGER = {
  auth_user_id: 'manager-uid',
  role: 'manager',
  status: 'active',
  display_name: 'Мерет Аннаев',
  network_id: NETWORK_ID,
  legacy_manager_account_id: MANAGER_ID,
  legacy_cashier_id: null,
};

const BINDING_OWNER = {
  auth_user_id: 'owner-uid',
  role: 'owner',
  status: 'active',
  display_name: 'Owner',
  network_id: null,
  legacy_manager_account_id: null,
  legacy_cashier_id: null,
};

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return [path];
  });
}

function authPorts(context: unknown): OwnerAuthGatewayPorts {
  return {
    async signInWithPassword() {
      return { accessToken: 'access', refreshToken: 'refresh' };
    },
    async refreshSession() {
      return { accessToken: 'access-2', refreshToken: 'refresh-2' };
    },
    async currentStaffContext() {
      return context;
    },
  };
}

describe('staff binding context SQL contract (not executed)', () => {
  it('1. new RPC exposes both legacy binding columns', () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.current_staff_binding_context\(\)/);
    assert.match(migration, /legacy_manager_account_id UUID/);
    assert.match(migration, /legacy_cashier_id UUID/);
    assert.match(migration, /FROM private\.get_current_staff_context\(\) AS c/);
    assert.match(migration, /c\.legacy_manager_account_id/);
    assert.match(migration, /c\.legacy_cashier_id/);
    assert.match(migration, /auth\.uid\(\)|private\.get_current_staff_context\(\)/);
    assert.equal(/CREATE OR REPLACE FUNCTION public\.current_staff_context\(/.test(migration), false);
    assert.equal(migration.includes('p_staff_id'), false);
    assert.equal(migration.includes('p_manager_id'), false);
    assert.equal(migration.includes('p_cashier_id'), false);
    assert.equal(migration.includes('p_auth_user_id'), false);
  });

  it('7-8. anon cannot execute; authenticated can', () => {
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION public\.current_staff_binding_context\(\) FROM PUBLIC/,
    );
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION public\.current_staff_binding_context\(\) FROM anon/,
    );
    assert.match(
      migration,
      /GRANT EXECUTE ON FUNCTION public\.current_staff_binding_context\(\) TO authenticated/,
    );
  });

  it('9. no direct private.staff_accounts browser access', () => {
    assert.equal(/GRANT[\s\S]*ON TABLE private\.staff_accounts[\s\S]*TO authenticated/.test(migration), false);
    assert.equal(/GRANT[\s\S]*ON TABLE private\.staff_accounts[\s\S]*TO anon/.test(migration), false);
    const browser = [
      ...listFiles(join(root, 'src/cashier')),
      ...listFiles(join(root, 'src/manager')),
      ...listFiles(join(root, 'src/owner')),
      join(root, 'src/screens/MobcashAgentScreen.tsx'),
    ].filter((path) => (path.endsWith('.ts') || path.endsWith('.tsx')) && !path.endsWith('.test.ts'));
    for (const file of browser) {
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes('private.staff_accounts'), false, file);
      assert.equal(source.includes("from('staff_accounts')"), false, file);
    }
  });

  it('10-12. no money RPCs, no operational transfer, no migration_state changes', () => {
    assert.equal(migration.includes('cashier_deposit_to_player'), false);
    assert.equal(migration.includes('cashier_payout_by_code'), false);
    assert.equal(migration.includes('apply_operational_transfer'), false);
    assert.equal(migration.includes('manager_fund_cashier'), false);
    assert.equal(migration.includes('SET migration_state'), false);
    assert.equal(/UPDATE[\s\S]*migration_state\s*=/.test(migration), false);
  });
});

describe('shared staff auth port uses binding context', () => {
  it('live Owner/Manager/Cashier auth port calls current_staff_binding_context', () => {
    const source = readFileSync(join(here, 'ownerAuthService.ts'), 'utf8');
    assert.match(source, /client\.rpc\('current_staff_binding_context'\)/);
    assert.equal(source.includes("client.rpc('current_staff_context')"), false);
    assert.match(source, /createUserJwtClient/);
    assert.match(source, /createAnonAuthClient/);
    assert.equal(source.includes('createServiceRoleClient'), false);
    assert.equal(source.includes('service_role'), false);
  });

  it('2. Cashier parser receives legacy_cashier_id', () => {
    const staff = assertActiveCashierContext(BINDING_CASHIER);
    assert.equal(staff.authUserId, CASHIER_AUTH_USER);
    assert.equal(staff.networkId, NETWORK_ID);
    assert.equal(staff.legacyCashierId, CASHIER_ID);
    assert.equal(staff.role, 'cashier');
    assert.equal(staff.status, 'active');
  });

  it('3. Manager parser receives legacy_manager_account_id', () => {
    const staff = assertActiveManagerContext(BINDING_MANAGER);
    assert.equal(staff.legacyManagerAccountId, MANAGER_ID);
    assert.equal(staff.networkId, NETWORK_ID);
    assert.equal(staff.role, 'manager');
  });

  it('4. Owner still authenticates with extra binding columns', () => {
    const staff = assertActiveOwnerContext(BINDING_OWNER);
    assert.equal(staff.role, 'owner');
    assert.equal(staff.status, 'active');
    assert.equal(staff.authUserId, 'owner-uid');
  });

  it('5. wrong role still 403', async () => {
    const ownerOnCashier = await handleCashierAuthRequest(
      {
        method: 'POST',
        pathname: CASHIER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: 'owner@example.com', password: 'secret' },
      },
      authPorts(BINDING_OWNER),
    );
    assert.equal(ownerOnCashier.status, 403);
    assert.equal(ownerOnCashier.body.error, 'CASHIER_REQUIRED');

    const cashierOnManager = await handleManagerAuthRequest(
      {
        method: 'POST',
        pathname: MANAGER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: 'agent01@gmail.com', password: 'secret' },
      },
      authPorts(BINDING_CASHIER),
    );
    assert.equal(cashierOnManager.status, 403);
    assert.equal(cashierOnManager.body.error, 'MANAGER_REQUIRED');

    const managerOnOwner = await handleOwnerAuthRequest(
      {
        method: 'POST',
        pathname: OWNER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: 'manager@example.com', password: 'secret' },
      },
      authPorts(BINDING_MANAGER),
    );
    assert.equal(managerOnOwner.status, 403);
    assert.equal(managerOnOwner.body.error, 'OWNER_REQUIRED');
  });

  it('6. no service_role in binding-context auth path', () => {
    const files = [
      'ownerAuthService.ts',
      'managerAuthService.ts',
      'cashierAuthService.ts',
      'ownerContext.ts',
      'managerContext.ts',
      'cashierContext.ts',
    ];
    for (const file of files) {
      const source = readFileSync(join(here, file), 'utf8');
      assert.equal(source.includes('createServiceRoleClient'), false, file);
      assert.equal(source.includes('SERVICE_ROLE'), false, file);
    }
  });

  it('Cashier login returns expected agent01 binding ids from context, not hardcoded production logic', async () => {
    const result = await handleCashierAuthRequest(
      {
        method: 'POST',
        pathname: CASHIER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: 'agent01@gmail.com', password: 'secret' },
      },
      authPorts(BINDING_CASHIER),
    );
    assert.equal(result.status, 200);
    const staff = result.body.staff as Record<string, unknown>;
    assert.equal(staff.legacyCashierId, CASHIER_ID);
    assert.equal(staff.networkId, NETWORK_ID);
    const cashierLogic = [
      readFileSync(join(here, 'cashierContext.ts'), 'utf8'),
      readFileSync(join(here, 'cashierAuthService.ts'), 'utf8'),
    ].join('\n');
    assert.equal(cashierLogic.includes(CASHIER_AUTH_USER), false);
    assert.equal(cashierLogic.includes(CASHIER_ID), false);
  });
});
