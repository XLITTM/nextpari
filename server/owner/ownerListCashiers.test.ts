import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { handleOwnerControlRequest } from './ownerControlHttp.js';
import type { OwnerAuthGatewayPorts } from '../staff/ownerAuthService.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from '../staff/ownerCookies.js';

const ACCESS = 'owner-access-token';
const REFRESH = 'owner-refresh-token';
const CASHIER_ID = '0393d651-e13a-4f04-ba7d-352f63bc62a5';
const MANAGER_ID = 'ccc5f5ad-079e-4420-9080-e7ded4ff9496';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const sql062 = readFileSync(
  join(root, 'supabase/migrations/20260918160000_owner_list_cashiers_scope_062.sql'),
  'utf8',
);
const sql040 = readFileSync(
  join(root, 'supabase/migrations/20260913120000_staff_rpc_security_040.sql'),
  'utf8',
);
const sql020 = readFileSync(
  join(root, 'supabase/migrations/20260831_020_manager_operational_finance.sql'),
  'utf8',
);
const ownerHttp = readFileSync(join(root, 'server/owner/ownerControlHttp.ts'), 'utf8');
const ownerServices = readFileSync(join(root, 'src/owner/services.ts'), 'utf8');
const dashboardUi = readFileSync(join(root, 'src/owner/ManagerDashboardScreen.tsx'), 'utf8');

function extractFn(source: string, name: string): string {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${name}`);
  assert.ok(start >= 0, name);
  const next = source.indexOf('CREATE OR REPLACE FUNCTION', start + 10);
  return next >= 0 ? source.slice(start, next) : source.slice(start);
}

function cookieHeader(): string {
  return [
    `${OWNER_ACCESS_COOKIE}=${encodeURIComponent(ACCESS)}`,
    `${OWNER_REFRESH_COOKIE}=${encodeURIComponent(REFRESH)}`,
  ].join('; ');
}

describe('owner_list_cashiers owner-native scope 062 (not executed)', () => {
  it('is the single 062 migration after 061 and is read-only', () => {
    assert.equal(
      existsSync(join(root, 'supabase/migrations/20260918160000_owner_list_cashiers_scope_062.sql')),
      true,
    );
    assert.match(sql062, /NEXTPARI PHASE 062/);
    assert.match(sql062, /after 061/);
    assert.match(sql062, /DO NOT APPLY/);
    assert.equal(sql062.includes('DROP TABLE'), false);
    assert.equal(sql062.includes('DELETE FROM'), false);
    assert.equal(sql062.includes('INSERT INTO'), false);
    assert.equal(/UPDATE\s+/.test(sql062), false);
    assert.equal(sql062.includes('apply_operational_transfer'), false);
    assert.equal(sql062.includes('apply_wallet_entry'), false);
    assert.equal(sql062.includes('SET migration_state'), false);
    assert.equal(sql062.includes('float_balance ='), false);
    assert.equal(sql062.includes('available_balance ='), false);
  });

  it('owner_list_cashiers authenticates as Owner and does not pretend to be a manager', () => {
    const owner = extractFn(sql062, 'public.owner_list_cashiers(');
    assert.match(owner, /SECURITY DEFINER/);
    assert.match(owner, /SET search_path = ''/);
    assert.match(owner, /PERFORM private\.get_current_owner_context\(\)/);
    assert.match(owner, /FROM public\.cashiers AS c/);
    assert.match(owner, /c\.id,[\s\S]*c\.login,[\s\S]*c\.full_name/);
    assert.match(owner, /c\.city/);
    assert.match(owner, /c\.point_name/);
    assert.match(owner, /c\.float_balance/);
    assert.match(owner, /c\.commission_earned/);
    assert.match(owner, /c\.commission_rate/);
    assert.match(owner, /c\.is_active/);
    assert.match(owner, /c\.network_id/);
    assert.match(owner, /c\.created_at/);
    assert.match(owner, /AS manager_id/);
    assert.match(owner, /public\.manager_accounts/);
    assert.equal(owner.includes('public.manager_list_cashiers'), false);
    assert.equal(owner.includes('manager_list_cashiers('), false);
    assert.equal(owner.includes('private.get_current_manager_context'), false);
    assert.equal(owner.includes('private.assert_live_manager_self_binding'), false);
    assert.equal(owner.includes('v_legacy'), false);
  });

  it('manager_list_cashiers still requires a Manager JWT and keeps network isolation', () => {
    const manager = extractFn(sql040, 'public.manager_list_cashiers(');
    assert.match(manager, /private\.assert_live_manager_self_binding\(p_manager_id\)/);
    assert.match(manager, /mgr\.role = 'superadmin' OR c\.network_id = mgr\.network_id/);
    assert.equal(manager.includes('private.get_current_owner_context'), false);
    assert.equal(sql062.includes('CREATE OR REPLACE FUNCTION public.manager_list_cashiers'), false);
    assert.equal(sql062.includes('CREATE OR REPLACE FUNCTION private.assert_live_manager_self_binding'), false);
    assert.equal(sql062.includes('CREATE OR REPLACE FUNCTION private.get_current_manager_context'), false);

    const binding = extractFn(sql040, 'private.assert_live_manager_self_binding(');
    assert.match(binding, /private\.get_current_manager_context\(\)/);

    const ctx = extractFn(sql020, 'private.get_current_manager_context(');
    assert.match(ctx, /v_row\.role IS DISTINCT FROM 'manager'/);
    assert.match(ctx, /MANAGER_REQUIRED/);
  });

  it('grants Owner browser EXECUTE and denies PUBLIC/anon', () => {
    assert.match(sql062, /REVOKE ALL ON FUNCTION public\.owner_list_cashiers\(\) FROM PUBLIC/);
    assert.match(sql062, /REVOKE ALL ON FUNCTION public\.owner_list_cashiers\(\) FROM anon/);
    assert.match(sql062, /GRANT EXECUTE ON FUNCTION public\.owner_list_cashiers\(\) TO authenticated/);
  });

  it('owner cashiers BFF still uses owner_list_cashiers and parseCashier fields', async () => {
    assert.match(ownerHttp, /rpc\.invoke\('owner_list_cashiers'\)/);
    assert.equal(ownerHttp.includes("invoke('manager_list_cashiers'"), false);
    assert.match(ownerServices, /function parseCashier/);
    assert.match(ownerServices, /fetchOwnerCashiers/);
    assert.match(dashboardUi, /fetchOwnerCashiers/);
    assert.match(dashboardUi, /managerFilter/);

    const calls: Array<{ name: string }> = [];
    const result = await handleOwnerControlRequest(
      {
        method: 'GET',
        pathname: '/api/owner/cashiers',
        cookie: cookieHeader(),
        cookieSecure: true,
      },
      {
        sessionPorts: {
          async signInWithPassword() {
            return { accessToken: ACCESS, refreshToken: REFRESH };
          },
          async refreshSession() {
            return { accessToken: ACCESS, refreshToken: REFRESH };
          },
          async signOutCurrentSession() {},
          async currentStaffContext() {
            return {
              role: 'owner',
              status: 'active',
              auth_user_id: 'owner-uid',
              display_name: 'Owner',
              network_id: null,
            };
          },
        } satisfies OwnerAuthGatewayPorts,
        rpcFactory: () => ({
          async invoke(name) {
            calls.push({ name });
            return [
              {
                id: CASHIER_ID,
                login: 'agent01',
                full_name: 'Agent',
                city: 'Ashgabat',
                point_name: 'Point 1',
                float_balance: 100,
                commission_earned: 1,
                commission_rate: 1,
                is_active: true,
                network_id: '11111111-1111-1111-1111-111111111111',
                created_at: '2026-09-01T00:00:00.000Z',
                manager_id: MANAGER_ID,
              },
            ];
          },
        }),
      },
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(calls[0]?.name, 'owner_list_cashiers');
    assert.equal(Array.isArray(result.body.data), true);
    assert.equal((result.body.data as unknown[])[0] != null, true);
  });
});
