import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { handleOwnerControlRequest } from './ownerControlHttp.js';
import type { OwnerAuthGatewayPorts } from '../staff/ownerAuthService.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from '../staff/ownerCookies.js';
import { handleManagerControlRequest } from '../manager/managerControlHttp.js';
import type { ManagerAuthGatewayPorts } from '../staff/managerAuthService.js';
import { MANAGER_ACCESS_COOKIE, MANAGER_REFRESH_COOKIE } from '../staff/managerCookies.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const sql = readFileSync(
  join(root, 'supabase/migrations/20260914050000_fix_owner_financial_dashboard_053.sql'),
  'utf8',
);
const sql040 = readFileSync(
  join(root, 'supabase/migrations/20260913120000_staff_rpc_security_040.sql'),
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

describe('owner financial dashboard authorization 053 (not executed)', () => {
  it('OWNER DASHBOARD USES OWNER CONTEXT and does not call manager public RPC', () => {
    const owner = extractFn(sql, 'public.owner_dashboard_stats(');
    const ownerBody = owner.slice(0, owner.indexOf('$fn$;') + 5);
    assert.match(ownerBody, /private\.get_current_owner_context\(\)/);
    assert.match(ownerBody, /s\.legacy_manager_account_id/);
    assert.match(ownerBody, /OWNER_LEGACY_LINK_REQUIRED/);
    assert.match(ownerBody, /private\.dashboard_stats_for_manager_account\(v_legacy\)/);
    assert.equal(ownerBody.includes('public.manager_dashboard_stats'), false);
    assert.equal(ownerBody.includes('private.get_current_manager_context'), false);
    assert.equal(ownerBody.includes('private.assert_live_manager_self_binding'), false);
    assert.match(ownerHttp, /rpc\.invoke\('owner_dashboard_stats'\)/);
    assert.equal(ownerHttp.includes("invoke('manager_dashboard_stats'"), false);
  });

  it('OWNER FULL PLATFORM SUPERADMIN VIEW PRESERVED via private helper', () => {
    const helper = extractFn(sql, 'private.dashboard_stats_for_manager_account(');
    assert.match(helper, /mgr\.role = 'superadmin'/);
    assert.match(helper, /'role', mgr\.role/);
    assert.match(helper, /'network_name', mgr\.network_name/);
    assert.match(helper, /'turnover'/);
    assert.match(helper, /'ggr'/);
    assert.match(helper, /'deposits'/);
    assert.match(helper, /'payouts'/);
    assert.match(helper, /'float_total'/);
    assert.match(helper, /'series'/);
    assert.match(helper, /'verticals'/);
    assert.equal(helper.includes('private.get_current_manager_context'), false);
    assert.equal(helper.includes('private.get_current_owner_context'), false);
    assert.equal(helper.includes('private.assert_live_manager_self_binding'), false);
  });

  it('MANAGER SELF BINDING and NETWORK SCOPE PRESERVED', () => {
    const manager = extractFn(sql, 'public.manager_dashboard_stats(');
    assert.match(manager, /private\.assert_live_manager_self_binding\(p_manager_id\)/);
    assert.match(manager, /private\.dashboard_stats_for_manager_account\(p_manager_id\)/);
    assert.equal(manager.includes('private.get_current_owner_context'), false);
    const binding = extractFn(sql040, 'private.assert_live_manager_self_binding(');
    assert.match(binding, /private\.get_current_manager_context\(\)/);
    assert.match(binding, /NETWORK_SCOPE_VIOLATION/);
    assert.match(binding, /MANAGER_REQUIRED|legacy_manager_account_id IS DISTINCT FROM p_manager_id/);
  });

  it('PRIVATE DASHBOARD HELPER BROWSER EXECUTE DENIED', () => {
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION private\.dashboard_stats_for_manager_account\(uuid\) FROM PUBLIC, anon, authenticated, service_role/,
    );
    assert.equal(sql.includes('GRANT EXECUTE ON FUNCTION private.dashboard_stats_for_manager_account'), false);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.owner_dashboard_stats\(\) TO authenticated/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.manager_dashboard_stats\(uuid\) TO authenticated/);
  });

  it('DASHBOARD RESPONSE CONTRACT PRESERVED and UI route unchanged', () => {
    assert.match(ownerServices, /fetchOwnerDashboard/);
    assert.match(ownerServices, /\/api\/owner\/dashboard/);
    assert.match(dashboardUi, /function FinancePanel/);
    assert.match(dashboardUi, /fetchOwnerDashboard\(\)/);
    const helper = extractFn(sql, 'private.dashboard_stats_for_manager_account(');
    for (const field of ['role', 'network_name', 'turnover', 'ggr', 'deposits', 'payouts', 'float_total', 'series', 'verticals']) {
      assert.match(helper, new RegExp(`'${field}'`));
    }
  });

  it('WALLET LEDGER / TREASURY / BALANCE MUTATION: NO', () => {
    assert.equal(sql.includes('apply_wallet_entry'), false);
    assert.equal(sql.includes('owner_capital_in'), false);
    assert.equal(sql.includes('owner_fund_'), false);
    assert.equal(sql.includes('apply_operational_transfer'), false);
    assert.equal(sql.includes('INSERT INTO'), false);
    assert.equal(/UPDATE\s+/.test(sql), false);
    assert.equal(sql.includes('DELETE FROM'), false);
    assert.equal(sql.includes('sports_apply_settlement'), false);
    assert.equal(sql.includes('game_engine_action'), false);
  });
});

describe('owner dashboard HTTP stays on Owner session', () => {
  const ACCESS = 'owner-access-token';
  const REFRESH = 'owner-refresh-token';
  const OWNER_CTX = {
    role: 'owner',
    status: 'active',
    auth_user_id: 'owner-uid',
    display_name: 'Owner',
    network_id: null,
  };

  it('OWNER DASHBOARD WITH OWNER SESSION: PASS and MANAGER_REQUIRED ERROR: NO', async () => {
    const calls: string[] = [];
    const result = await handleOwnerControlRequest(
      {
        method: 'GET',
        pathname: '/api/owner/dashboard',
        cookie: `${OWNER_ACCESS_COOKIE}=${ACCESS}; ${OWNER_REFRESH_COOKIE}=${REFRESH}`,
        cookieSecure: true,
      },
      {
        sessionPorts: {
          async signInWithPassword() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
          async refreshSession() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
          async currentStaffContext() { return OWNER_CTX; },
        } satisfies OwnerAuthGatewayPorts,
        rpcFactory: () => ({
          async invoke(name) {
            calls.push(name);
            return {
              role: 'superadmin',
              network_name: 'Вся платформа',
              turnover: 1,
              ggr: 1,
              deposits: 1,
              payouts: 1,
              float_total: 1,
              series: [],
              verticals: {},
            };
          },
        }),
      },
    );
    assert.equal(result.status, 200);
    assert.equal(calls[0], 'owner_dashboard_stats');
    assert.equal(calls.includes('manager_dashboard_stats'), false);
    assert.equal(JSON.stringify(result.body).includes('MANAGER_REQUIRED'), false);
  });
});

describe('manager dashboard HTTP keeps self-binding', () => {
  const ACCESS = 'manager-access-token';
  const REFRESH = 'manager-refresh-token';
  const MANAGER_ID = 'ccc5f5ad-079e-4420-9080-e7ded4ff9496';
  const NETWORK_ID = '11111111-1111-1111-1111-111111111111';
  const MANAGER_CTX = {
    role: 'manager',
    status: 'active',
    auth_user_id: 'manager-uid',
    display_name: 'Manager',
    network_id: NETWORK_ID,
    legacy_manager_account_id: MANAGER_ID,
  };

  it('MANAGER DASHBOARD WITH OWN MANAGER SESSION: PASS', async () => {
    const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    const result = await handleManagerControlRequest(
      {
        method: 'GET',
        pathname: '/api/manager/dashboard',
        cookie: `${MANAGER_ACCESS_COOKIE}=${ACCESS}; ${MANAGER_REFRESH_COOKIE}=${REFRESH}`,
        cookieSecure: true,
      },
      {
        sessionPorts: {
          async signInWithPassword() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
          async refreshSession() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
          async currentStaffContext() { return MANAGER_CTX; },
        } satisfies ManagerAuthGatewayPorts,
        rpcFactory: () => ({
          async invoke(name, args) {
            calls.push({ name, args });
            return { turnover: 0, ggr: 0, deposits: 0, payouts: 0, float_total: 0, series: [], verticals: {} };
          },
        }),
      },
    );
    assert.equal(result.status, 200);
    assert.equal(calls[0]?.name, 'manager_dashboard_stats');
    assert.equal(calls[0]?.args?.p_manager_id, MANAGER_ID);
  });
});
