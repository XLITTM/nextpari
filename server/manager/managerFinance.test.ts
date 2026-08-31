import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import type { ManagerAuthGatewayPorts } from '../staff/managerAuthService.js';
import { MANAGER_ACCESS_COOKIE, MANAGER_REFRESH_COOKIE } from '../staff/managerCookies.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from '../staff/ownerCookies.js';
import {
  CANONICAL_MANAGER_FINANCE_RPCS,
  handleManagerControlRequest,
  MONEY_RPC_DENYLIST,
} from './managerControlHttp.js';
import type { ManagerRpcPort } from './managerRpc.js';

const ACCESS = 'manager-access-token';
const REFRESH = 'manager-refresh-token';
const SERVICE_ROLE = 'service-role-secret-key';
const CASHIER_ID = '0393d651-e13a-4f04-ba7d-352f63bc62a5';
const FOREIGN_CASHIER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const NETWORK_ID = '11111111-1111-1111-1111-111111111111';
const MANAGER_ID = 'ccc5f5ad-079e-4420-9080-e7ded4ff9496';

const MANAGER_CTX = {
  role: 'manager',
  status: 'active',
  auth_user_id: 'manager-uid',
  display_name: 'Мерет Аннаев',
  network_id: NETWORK_ID,
  legacy_manager_account_id: MANAGER_ID,
};

const OVERVIEW = {
  manager: {
    id: 'mgr-op-1',
    currency: 'TMTM',
    available_balance: 0,
    status: 'active',
    migration_state: 'staging',
    version: 0,
  },
  cashiers: [],
  activation_pending: true,
};

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260831_020_manager_operational_finance.sql'),
  'utf8',
);

function cookieHeader(): string {
  return [
    `${MANAGER_ACCESS_COOKIE}=${encodeURIComponent(ACCESS)}`,
    `${MANAGER_REFRESH_COOKIE}=${encodeURIComponent(REFRESH)}`,
  ].join('; ');
}

function createAuthPorts(init?: { context?: unknown }): ManagerAuthGatewayPorts {
  return {
    async signInWithPassword() {
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async refreshSession() {
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async currentStaffContext() {
      return init?.context ?? MANAGER_CTX;
    },
  };
}

function createRpc() {
  const calls: Array<{ token: string; name: string; args?: Record<string, unknown> }> = [];
  const rpcFactory = (accessToken: string): ManagerRpcPort => ({
    async invoke(name, args) {
      calls.push({ token: accessToken, name, args });
      if (MONEY_RPC_DENYLIST.includes(name as typeof MONEY_RPC_DENYLIST[number])) {
        throw new Error(`legacy money rpc invoked: ${name}`);
      }
      if (name === 'apply_operational_transfer') {
        throw new Error('engine must not be called from Node');
      }
      if (name === 'manager_fund_cashier' || name === 'manager_collect_cashier') {
        if (args && ('p_manager_id' in args || 'p_from_account_id' in args || 'p_to_account_id' in args || 'p_actor_user_id' in args)) {
          throw new Error('browser authority leaked into RPC args');
        }
        throw staffError('OPERATIONAL_ACCOUNT_NOT_ACTIVE', 409);
      }
      if (name === 'manager_operational_overview') return OVERVIEW;
      if (name === 'manager_list_operational_transfers') {
        return { rows: [], total: 0, limit: 100, offset: 0 };
      }
      return { ok: true, rpc: name };
    },
  });
  return { calls, rpcFactory };
}

async function get(pathname: string, opts?: { cookie?: string; session?: ManagerAuthGatewayPorts }) {
  const rpc = createRpc();
  const result = await handleManagerControlRequest(
    {
      method: 'GET',
      pathname,
      cookie: opts?.cookie ?? cookieHeader(),
      cookieSecure: true,
    },
    { sessionPorts: opts?.session ?? createAuthPorts(), rpcFactory: rpc.rpcFactory },
  );
  return { result, rpc };
}

async function post(pathname: string, body: unknown, opts?: { cookie?: string; session?: ManagerAuthGatewayPorts }) {
  const rpc = createRpc();
  const result = await handleManagerControlRequest(
    {
      method: 'POST',
      pathname,
      cookie: opts?.cookie ?? cookieHeader(),
      cookieSecure: true,
      body,
    },
    { sessionPorts: opts?.session ?? createAuthPorts(), rpcFactory: rpc.rpcFactory },
  );
  return { result, rpc };
}

describe('manager canonical operational finance BFF', () => {
  it('A. overview works with valid Manager cookie', async () => {
    const { result, rpc } = await get('/api/manager/finance');
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'manager_operational_overview');
    assert.equal(rpc.calls[0]?.token, ACCESS);
    const data = result.body.data as { manager: { migration_state: string; available_balance: number } };
    assert.equal(data.manager.migration_state, 'staging');
    assert.equal(data.manager.available_balance, 0);
    assert.equal(JSON.stringify(result.body).includes(SERVICE_ROLE), false);
  });

  it('A. fund attempt fails OPERATIONAL_ACCOUNT_NOT_ACTIVE', async () => {
    const { result, rpc } = await post(`/api/manager/cashiers/${CASHIER_ID}/fund`, {
      amount: 10,
      idempotencyKey: 'fund-1',
    });
    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'OPERATIONAL_ACCOUNT_NOT_ACTIVE');
    assert.equal(rpc.calls[0]?.name, 'manager_fund_cashier');
    assert.equal(rpc.calls[0]?.args?.p_cashier_id, CASHIER_ID);
    assert.equal('p_manager_id' in (rpc.calls[0]?.args ?? {}), false);
    assert.equal('p_from_account_id' in (rpc.calls[0]?.args ?? {}), false);
    assert.equal(rpc.calls.some((call) => call.name === 'apply_operational_transfer'), false);
  });

  it('A. collect attempt fails OPERATIONAL_ACCOUNT_NOT_ACTIVE', async () => {
    const { result, rpc } = await post(`/api/manager/cashiers/${CASHIER_ID}/collect`, {
      amount: 10,
      idempotency_key: 'collect-1',
    });
    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'OPERATIONAL_ACCOUNT_NOT_ACTIVE');
    assert.equal(rpc.calls[0]?.name, 'manager_collect_cashier');
    assert.equal('p_manager_id' in (rpc.calls[0]?.args ?? {}), false);
  });

  it('A. missing session → 401 and no RPC', async () => {
    const rpc = createRpc();
    const result = await handleManagerControlRequest(
      { method: 'GET', pathname: '/api/manager/finance', cookieSecure: true },
      { sessionPorts: createAuthPorts(), rpcFactory: rpc.rpcFactory },
    );
    assert.equal(result.status, 401);
    assert.equal(rpc.calls.length, 0);
  });

  it('A. owner/player/cashier rejected', async () => {
    const owner = await get('/api/manager/finance', {
      cookie: `${OWNER_ACCESS_COOKIE}=owner-access; ${OWNER_REFRESH_COOKIE}=owner-refresh`,
    });
    assert.equal(owner.result.status, 401);

    const player = await get('/api/manager/finance', {
      session: createAuthPorts({ context: { role: 'player', status: 'active', auth_user_id: 'p' } }),
    });
    assert.equal(player.result.status, 403);

    const cashier = await post(`/api/manager/cashiers/${CASHIER_ID}/fund`, {
      amount: 1,
      idempotencyKey: 'x',
    }, {
      session: createAuthPorts({ context: { role: 'cashier', status: 'active', auth_user_id: 'c' } }),
    });
    assert.equal(cashier.result.status, 403);
  });

  it('A. foreign cashier still goes to scoped RPC without extra ids', async () => {
    const { rpc } = await post(`/api/manager/cashiers/${FOREIGN_CASHIER}/fund`, {
      amount: 5,
      idempotencyKey: 'foreign',
    });
    assert.equal(rpc.calls[0]?.args?.p_cashier_id, FOREIGN_CASHIER);
    assert.equal('p_network_id' in (rpc.calls[0]?.args ?? {}), false);
    assert.equal('p_actor_role' in (rpc.calls[0]?.args ?? {}), false);
  });

  it('service_role is not used and engine is not called from Node', () => {
    const sources = [
      readFileSync(join(here, 'managerRpc.ts'), 'utf8'),
      readFileSync(join(here, 'managerControlHttp.ts'), 'utf8'),
      readFileSync(join(here, 'vercelHandler.ts'), 'utf8'),
    ].join('\n');
    assert.equal(sources.includes('createServiceRoleClient'), false);
    assert.equal(sources.includes('apply_operational_transfer'), false);
    assert.equal(sources.includes('SUPABASE_SERVICE_ROLE_KEY'), false);
    for (const name of CANONICAL_MANAGER_FINANCE_RPCS) {
      assert.match(sources, new RegExp(name));
    }
  });

  it('legacy money RPCs are not called', async () => {
    const { rpc } = await get('/api/manager/finance');
    for (const name of MONEY_RPC_DENYLIST) {
      assert.equal(rpc.calls.some((call) => call.name === name), false, name);
    }
    const http = readFileSync(join(here, 'managerControlHttp.ts'), 'utf8');
    assert.equal(http.includes("invoke('manager_topup_cashier'"), false);
    assert.equal(http.includes("invoke('manager_create_cashier'"), false);
    assert.equal(http.includes("invoke('manager_adjust_player_balance'"), false);
    assert.equal(http.includes("invoke('manager_settle_bet'"), false);
  });

  it('frontend keeps fund/collect disabled while staging', () => {
    const agents = readFileSync(join(root, 'src/pages/manager/ManagerAgentsPage.tsx'), 'utf8');
    const finance = readFileSync(join(root, 'src/pages/manager/ManagerFinancePage.tsx'), 'utf8');
    const services = readFileSync(join(root, 'src/manager/services.ts'), 'utf8');
    assert.match(agents, /Financial activation pending/);
    assert.match(finance, /Financial activation pending/);
    assert.match(agents, /disabled/);
    assert.match(finance, /disabled/);
    assert.equal(agents.includes('/fund'), false);
    assert.equal(agents.includes('/collect'), false);
    assert.equal(finance.includes('/fund'), false);
    assert.equal(finance.includes('/collect'), false);
    assert.match(services, /\/api\/manager\/finance/);
    assert.equal(services.includes('manager_topup_cashier'), false);
    assert.equal(services.includes('supabase.rpc'), false);
  });
});

describe('manager operational finance SQL contract (not executed)', () => {
  function functionSource(name: string): string {
    const marker = `CREATE OR REPLACE FUNCTION ${name}`;
    const start = migration.indexOf(marker);
    assert.ok(start >= 0, name);
    const next = migration.indexOf('CREATE OR REPLACE FUNCTION', start + marker.length);
    return migration.slice(start, next < 0 ? migration.length : next);
  }

  it('creates the public Manager wrappers and does not change migration_state', () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.manager_operational_overview\(\)/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.manager_fund_cashier\(/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.manager_collect_cashier\(\s*p_cashier_id UUID/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.manager_list_operational_transfers\(/);
    assert.match(migration, /private\.get_current_manager_context\(\)/);
    assert.equal(migration.includes('SET migration_state'), false);
    assert.equal(/UPDATE[\s\S]*migration_state\s*=/.test(migration), false);
  });

  it('calls the live engine with Manager→Cashier and Cashier→Manager', () => {
    assert.match(migration, /private\.apply_operational_transfer\(/);
    assert.match(migration, /'MANAGER_TO_CASHIER'/);
    assert.match(migration, /'CASHIER_TO_MANAGER'/);
    assert.match(migration, /v_ctx\.auth_user_id/);
    assert.match(migration, /'manager'/);
    assert.equal(/PERFORM public\.manager_topup_cashier/.test(migration), false);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.manager_topup_cashier\(UUID, UUID, NUMERIC\) FROM authenticated/);
    assert.equal(migration.includes('p_manager_id'), false);
  });

  it('audits new transfers only and keeps legacy 3-arg collect revoked', () => {
    assert.match(migration, /MANAGER_FUNDED_CASHIER/);
    assert.match(migration, /MANAGER_COLLECTED_CASHIER/);
    assert.match(migration, /IF v_result\.is_duplicate IS NOT TRUE THEN/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.manager_fund_cashier\(UUID, NUMERIC, TEXT, TEXT\) TO authenticated/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.manager_collect_cashier\(UUID, UUID, NUMERIC\) FROM authenticated/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.manager_topup_cashier\(UUID, UUID, NUMERIC\) TO service_role/);
    assert.match(migration, /SET search_path = ''/);
  });

  it('scopes cashiers to manager network without leaking foreign existence', () => {
    assert.match(migration, /CASHIER_NOT_FOUND/);
    assert.match(migration, /c\.network_id IS NOT DISTINCT FROM p_network_id/);
    assert.match(migration, /a\.network_id IS NOT DISTINCT FROM p_network_id/);
  });

  it('1-3. get_current_manager_context is VOLATILE and locks staff_accounts before validation', () => {
    const src = functionSource('private.get_current_manager_context');
    assert.match(src, /LANGUAGE plpgsql\s+VOLATILE/);
    assert.match(src, /v_uid := auth\.uid\(\)/);
    assert.match(src, /AUTH_REQUIRED/);
    assert.match(src, /FROM private\.staff_accounts AS s[\s\S]*FOR UPDATE/);
    const lockAt = src.indexOf('FOR UPDATE');
    assert.ok(lockAt >= 0);
    assert.ok(src.indexOf("'MANAGER_REQUIRED'") > lockAt);
    assert.ok(src.indexOf("'STAFF_ACCOUNT_NOT_ACTIVE'") > lockAt);
    assert.ok(src.indexOf("'LEGACY_MANAGER_ID_REQUIRED'") > lockAt);
    assert.ok(src.indexOf("'NETWORK_ID_REQUIRED'") > lockAt);
    assert.ok(src.indexOf('RETURN QUERY') > lockAt);
    assert.equal(src.includes('get_current_staff_context'), false);
  });

  it('2-3. manager_resolve_own_cashier is a lock-free preflight', () => {
    const src = functionSource('private.manager_resolve_own_cashier');
    assert.match(src, /LANGUAGE plpgsql\s+VOLATILE/);
    assert.equal(src.includes('FOR UPDATE'), false);
    assert.match(src, /FROM public\.cashiers AS c/);
    assert.match(src, /CASHIER_NOT_FOUND/);
    assert.match(src, /CASHIER_NOT_ACTIVE/);
    assert.match(src, /v_cashier\.is_active/);
    assert.match(src, /c\.network_id IS NOT DISTINCT FROM p_network_id/);
    assert.match(src, /private\.operational_accounts/);
  });

  it('4-5. post-engine revalidation helper is VOLATILE and locks cashiers', () => {
    const src = functionSource('private.manager_revalidate_own_cashier');
    assert.match(src, /LANGUAGE plpgsql\s+VOLATILE/);
    assert.match(src, /FROM public\.cashiers AS c[\s\S]*FOR UPDATE/);
    assert.match(src, /network_id IS NOT DISTINCT FROM p_network_id\s+FOR UPDATE/);
    const lockAt = src.indexOf('FOR UPDATE');
    assert.ok(src.indexOf("'CASHIER_NOT_FOUND'") > lockAt);
    assert.ok(src.indexOf("'CASHIER_NOT_ACTIVE'") > lockAt);
    assert.equal(src.includes('operational_accounts'), false);
  });

  it('6-8. fund/collect call engine before post-revalidation, audit after', () => {
    const fund = functionSource('public.manager_fund_cashier');
    const collect = functionSource('public.manager_collect_cashier');
    const engineAt = (src: string) => src.indexOf('private.apply_operational_transfer(');
    const revalAt = (src: string) => src.indexOf('private.manager_revalidate_own_cashier(');
    const auditAt = (src: string) => src.indexOf('private.append_staff_audit(');
    assert.ok(engineAt(fund) >= 0 && revalAt(fund) > engineAt(fund) && auditAt(fund) > revalAt(fund));
    assert.ok(engineAt(collect) >= 0 && revalAt(collect) > engineAt(collect) && auditAt(collect) > revalAt(collect));
  });

  it('7. operational_accounts are not pre-locked by wrapper/helpers', () => {
    const cashier = functionSource('private.manager_resolve_own_cashier');
    const revalidate = functionSource('private.manager_revalidate_own_cashier');
    const managerAcct = functionSource('private.manager_resolve_own_manager_account');
    const overview = functionSource('public.manager_operational_overview');
    const list = functionSource('public.manager_list_operational_transfers');
    const opSlice = cashier.slice(cashier.indexOf('private.operational_accounts'));
    assert.equal(opSlice.includes('FOR UPDATE'), false);
    assert.equal(managerAcct.includes('FOR UPDATE'), false);
    assert.equal(overview.includes('FOR UPDATE'), false);
    assert.equal(list.includes('FOR UPDATE'), false);
    assert.equal(revalidate.includes('operational_accounts'), false);
    assert.equal(/FROM private\.operational_accounts[\s\S]{0,500}FOR UPDATE/.test(migration), false);
  });

  it('8. apply_operational_transfer remains unchanged', () => {
    assert.equal(migration.includes('CREATE OR REPLACE FUNCTION private.apply_operational_transfer'), false);
    assert.match(migration, /FROM private\.apply_operational_transfer\(/);
  });

  it('9. legacy money RPC grants remain revoked', () => {
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.manager_collect_cashier\(UUID, UUID, NUMERIC\) FROM authenticated/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.manager_topup_cashier\(UUID, UUID, NUMERIC\) FROM authenticated/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.manager_collect_cashier\(UUID, UUID, NUMERIC\) TO service_role/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.manager_topup_cashier\(UUID, UUID, NUMERIC\) TO service_role/);
  });

  it('10. no migration_state writes were added', () => {
    assert.equal(migration.includes('SET migration_state'), false);
    assert.equal(/UPDATE\s+private\.operational_accounts[\s\S]{0,200}migration_state/.test(migration), false);
  });
});
