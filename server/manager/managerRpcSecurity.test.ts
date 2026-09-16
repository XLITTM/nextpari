import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { ManagerAuthGatewayPorts } from '../staff/managerAuthService.js';
import { MANAGER_ACCESS_COOKIE, MANAGER_REFRESH_COOKIE } from '../staff/managerCookies.js';
import {
  CANONICAL_CASHIER_MONEY_RPCS,
  CANONICAL_CASHIER_READ_RPCS,
  CASHIER_MONEY_RPC_DENYLIST,
} from '../cashier/cashierControlHttp.js';
import { handleManagerControlRequest } from './managerControlHttp.js';
import type { ManagerRpcPort } from './managerRpc.js';

const ACCESS = 'manager-access-token';
const REFRESH = 'manager-refresh-token';
const MANAGER_ID = 'ccc5f5ad-079e-4420-9080-e7ded4ff9496';
const OTHER_MANAGER = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const NETWORK_ID = '11111111-1111-1111-1111-111111111111';
const CASHIER_ID = '0393d651-e13a-4f04-ba7d-352f63bc62a5';

const LIVE_MANAGER_RPCS = [
  'manager_dashboard_stats',
  'manager_list_cashiers',
  'manager_cashier_ledger',
  'manager_set_cashier_frozen',
] as const;

const LEGACY_UNUSED_RPCS = [
  'cashier_login',
  'cashier_get_session',
  'cashier_shift_history',
  'manager_login',
  'manager_list_risk_bets',
  'manager_set_player_blocked',
] as const;

const LEGACY_BROWSER_MODULES = [
  'src/lib/cashier.ts',
  'src/lib/settlement.ts',
  'src/lib/players.ts',
  'src/lib/backoffice.ts',
  'src/stores/hierarchyStore.ts',
  'src/stores/authStore.ts',
  'src/routes/PortalApp.tsx',
  'src/pages/agent/AgentPosTerminal.tsx',
  'src/components/backoffice/PlayersTab.tsx',
  'scripts/run-sports-worker.ts',
] as const;

const MANAGER_CTX = {
  role: 'manager',
  status: 'active',
  auth_user_id: 'manager-uid',
  display_name: 'Мерет Аннаев',
  network_id: NETWORK_ID,
  legacy_manager_account_id: MANAGER_ID,
};

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const migrationPath = join(root, 'supabase/migrations/20260913120000_staff_rpc_security_040.sql');
const migration = readFileSync(migrationPath, 'utf8');

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return [path];
  });
}

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
      if (name === 'manager_list_cashiers') {
        return [{ id: CASHIER_ID, network_id: NETWORK_ID, login: 'agent01' }];
      }
      if (name === 'manager_cashier_ledger') return [];
      if (name === 'manager_dashboard_stats') {
        return { turnover: 0, ggr: 0, deposits: 0, payouts: 0, float_total: 0, series: [], verticals: {} };
      }
      return { ok: true, rpc: name, args: args ?? null };
    },
  });
  return { calls, rpcFactory };
}

function functionSource(name: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION ${name}`);
  assert.ok(start >= 0, name);
  const next = migration.indexOf('CREATE OR REPLACE FUNCTION', start + 1);
  const revoke = migration.indexOf('\nREVOKE ALL ON FUNCTION', start);
  const end = Math.min(
    next === -1 ? migration.length : next,
    revoke === -1 ? migration.length : revoke,
  );
  return migration.slice(start, end);
}

function grantExecuteToAnon(sql: string, signature: string): boolean {
  return new RegExp(
    `GRANT EXECUTE ON FUNCTION ${signature.replace(/[()]/g, '\\$&')}[^;]*\\bTO\\b[^;]*\\banon\\b`,
    'i',
  ).test(sql);
}

function grantTableMutation(sql: string, table: string): boolean {
  return new RegExp(
    `GRANT\\s+(ALL|INSERT|UPDATE|DELETE|TRUNCATE)[\\s\\S]{0,120}ON TABLE ${table.replace('.', '\\.')}[\\s\\S]{0,80}TO\\s+(anon|authenticated|PUBLIC)`,
    'i',
  ).test(sql);
}

describe('staff RPC security hardening SQL contract (not executed)', () => {
  it('is the single 040 migration after 039 and is not a data mutation', () => {
    assert.equal(existsSync(migrationPath), true);
    assert.match(migration, /STAFF RPC \+ LEGACY PUBLIC BET TABLE HARDENING/);
    assert.equal(migration.includes('DROP TABLE'), false);
    assert.equal(migration.includes('DELETE FROM'), false);
    assert.equal(/UPDATE\s+public\.(wallets|bets|bet_items)/.test(migration), false);
    assert.equal(/REVOKE[\s\S]{0,80}private\.sports_/.test(migration), false);
    assert.equal(/GRANT[\s\S]{0,80}private\.sports_/.test(migration), false);
    assert.equal(/DROP[\s\S]{0,80}private\.sports_/.test(migration), false);
    assert.equal(migration.includes('SET migration_state'), false);
  });

  it('live manager RPCs bind via current manager context and reject foreign p_manager_id', () => {
    const helper = functionSource('private.assert_live_manager_self_binding');
    assert.match(helper, /SECURITY DEFINER/);
    assert.match(helper, /SET search_path = ''/);
    assert.match(helper, /private\.get_current_manager_context\(\)/);
    assert.match(helper, /legacy_manager_account_id IS DISTINCT FROM p_manager_id/);
    assert.match(helper, /NETWORK_SCOPE_VIOLATION/);
    assert.match(helper, /STAFF_ACCOUNT_DISABLED/);
    assert.equal(helper.includes('p_auth_user_id'), false);

    for (const name of [
      'public.manager_dashboard_stats',
      'public.manager_list_cashiers',
      'public.manager_cashier_ledger',
      'public.manager_set_cashier_frozen',
    ]) {
      const src = functionSource(name);
      assert.match(src, /SECURITY DEFINER/);
      assert.match(src, /SET search_path = ''/);
      assert.match(src, /private\.assert_live_manager_self_binding\(p_manager_id\)/);
    }
  });

  it('revokes anon EXECUTE from live manager RPCs and does not grant PUBLIC or anon', () => {
    const live = [
      'public.manager_dashboard_stats(uuid)',
      'public.manager_list_cashiers(uuid)',
      'public.manager_cashier_ledger(uuid, uuid, timestamptz)',
      'public.manager_set_cashier_frozen(uuid, uuid, boolean)',
    ];
    for (const signature of live) {
      assert.match(
        migration,
        new RegExp(`REVOKE ALL ON FUNCTION ${signature.replace(/[()]/g, '\\$&')} FROM anon`),
      );
      assert.match(
        migration,
        new RegExp(`REVOKE ALL ON FUNCTION ${signature.replace(/[()]/g, '\\$&')} FROM PUBLIC`),
      );
      assert.match(
        migration,
        new RegExp(`GRANT EXECUTE ON FUNCTION ${signature.replace(/[()]/g, '\\$&')} TO authenticated`),
      );
      assert.equal(grantExecuteToAnon(migration, signature), false, signature);
      assert.equal(
        new RegExp(`GRANT EXECUTE ON FUNCTION ${signature.replace(/[()]/g, '\\$&')}[^;]*\\bTO\\b[^;]*\\bPUBLIC\\b`, 'i')
          .test(migration),
        false,
        signature,
      );
    }
  });

  it('revokes PUBLIC/anon/authenticated EXECUTE from unused legacy staff RPCs and does not re-grant them', () => {
    const legacy = [
      'public.cashier_login(text, text)',
      'public.cashier_get_session(uuid)',
      'public.cashier_shift_history(uuid, text, text)',
      'public.manager_login(text, text)',
      'public.manager_list_risk_bets(uuid)',
      'public.manager_set_player_blocked(uuid, text, boolean)',
    ];
    for (const signature of legacy) {
      assert.match(
        migration,
        new RegExp(`REVOKE ALL ON FUNCTION ${signature.replace(/[()]/g, '\\$&')} FROM PUBLIC`),
      );
      assert.match(
        migration,
        new RegExp(`REVOKE ALL ON FUNCTION ${signature.replace(/[()]/g, '\\$&')} FROM anon, authenticated`),
      );
      assert.equal(grantExecuteToAnon(migration, signature), false, signature);
      assert.equal(
        new RegExp(`GRANT EXECUTE ON FUNCTION ${signature.replace(/[()]/g, '\\$&')}`, 'i').test(migration),
        false,
        signature,
      );
    }
    assert.equal(/DROP FUNCTION[\s\S]*cashier_login/.test(migration), false);
    assert.equal(/DROP FUNCTION[\s\S]*manager_login/.test(migration), false);
  });

  it('drops legacy bets/bet_items policies and revokes direct anon/authenticated table grants', () => {
    for (const policy of [
      'Allow public insert bets',
      'Allow public read bets',
      'Allow public update bets',
      'anon_update_bets',
      'anon_select_bets',
      'anon_insert_bets',
    ]) {
      assert.match(
        migration,
        new RegExp(`DROP POLICY IF EXISTS "${policy}" ON public\\.bets`),
      );
    }
    for (const policy of [
      'Allow public insert bet_items',
      'Allow public read bet_items',
      'Allow public update bet_items',
      'anon_insert_bet_items',
      'anon_select_bet_items',
      'anon_update_bet_items',
    ]) {
      assert.match(
        migration,
        new RegExp(`DROP POLICY IF EXISTS "${policy}" ON public\\.bet_items`),
      );
    }
    assert.match(migration, /REVOKE ALL ON TABLE public\.bets FROM PUBLIC/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.bets FROM anon, authenticated/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.bet_items FROM PUBLIC/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.bet_items FROM anon, authenticated/);
    assert.equal(grantTableMutation(migration, 'public.bets'), false);
    assert.equal(grantTableMutation(migration, 'public.bet_items'), false);
  });

  it('does not revoke authenticated execute from canonical staff/player RPCs', () => {
    for (const name of [
      'current_staff_context',
      'current_staff_binding_context',
      'owner_list_managers',
      'manager_operational_overview',
      'manager_fund_cashier',
      'cashier_operational_overview',
      'cashier_deposit_player',
    ]) {
      assert.equal(migration.includes(name), false, name);
    }
  });
});

describe('live manager HTTP gateway authority', () => {
  it('still calls the four live manager RPCs with the bound legacy manager id', async () => {
    const rpc = createRpc();
    const dashboard = await handleManagerControlRequest(
      { method: 'GET', pathname: '/api/manager/dashboard', cookie: cookieHeader(), cookieSecure: true },
      { sessionPorts: createAuthPorts(), rpcFactory: rpc.rpcFactory },
    );
    assert.equal(dashboard.status, 200);
    assert.equal(rpc.calls[0]?.name, 'manager_dashboard_stats');
    assert.equal(rpc.calls[0]?.args?.p_manager_id, MANAGER_ID);
    assert.equal(rpc.calls[0]?.token, ACCESS);

    const cashiers = await handleManagerControlRequest(
      { method: 'GET', pathname: '/api/manager/cashiers', cookie: cookieHeader(), cookieSecure: true },
      { sessionPorts: createAuthPorts(), rpcFactory: rpc.rpcFactory },
    );
    assert.equal(cashiers.status, 200);
    assert.equal(rpc.calls.some((call) => call.name === 'manager_list_cashiers'), true);

    const ledger = await handleManagerControlRequest(
      { method: 'GET', pathname: `/api/manager/cashiers/${CASHIER_ID}/ledger`, cookie: cookieHeader(), cookieSecure: true },
      { sessionPorts: createAuthPorts(), rpcFactory: rpc.rpcFactory },
    );
    assert.equal(ledger.status, 200);
    const ledgerCall = rpc.calls.find((call) => call.name === 'manager_cashier_ledger');
    assert.equal(ledgerCall?.args?.p_manager_id, MANAGER_ID);

    const freeze = await handleManagerControlRequest(
      {
        method: 'POST',
        pathname: `/api/manager/cashiers/${CASHIER_ID}/freeze`,
        cookie: cookieHeader(),
        cookieSecure: true,
        body: { frozen: true },
      },
      { sessionPorts: createAuthPorts(), rpcFactory: rpc.rpcFactory },
    );
    assert.equal(freeze.status, 200);
    const freezeCall = rpc.calls.find((call) => call.name === 'manager_set_cashier_frozen');
    assert.equal(freezeCall?.args?.p_manager_id, MANAGER_ID);
  });

  it('ignores browser-supplied manager identity on query and body', async () => {
    const rpc = createRpc();
    const tamperQuery = await handleManagerControlRequest(
      {
        method: 'GET',
        pathname: '/api/manager/dashboard',
        search: `?p_manager_id=${OTHER_MANAGER}&managerId=${OTHER_MANAGER}`,
        cookie: cookieHeader(),
        cookieSecure: true,
      },
      { sessionPorts: createAuthPorts(), rpcFactory: rpc.rpcFactory },
    );
    assert.equal(tamperQuery.status, 200);
    assert.equal(rpc.calls[0]?.args?.p_manager_id, MANAGER_ID);
    assert.notEqual(rpc.calls[0]?.args?.p_manager_id, OTHER_MANAGER);

    const tamperBody = await handleManagerControlRequest(
      {
        method: 'POST',
        pathname: `/api/manager/cashiers/${CASHIER_ID}/freeze`,
        cookie: cookieHeader(),
        cookieSecure: true,
        body: { frozen: true, p_manager_id: OTHER_MANAGER, managerId: OTHER_MANAGER },
      },
      { sessionPorts: createAuthPorts(), rpcFactory: rpc.rpcFactory },
    );
    assert.equal(tamperBody.status, 200);
    const freezeCall = rpc.calls.find((call) => call.name === 'manager_set_cashier_frozen');
    assert.equal(freezeCall?.args?.p_manager_id, MANAGER_ID);
    assert.equal(freezeCall?.args?.p_frozen, true);

    const http = readFileSync(join(here, 'managerControlHttp.ts'), 'utf8');
    assert.match(http, /managerAccountId\(staff\)/);
    assert.equal(http.includes("query.get('p_manager_id')"), false);
    assert.equal(http.includes('rec.p_manager_id'), false);
    assert.equal(http.includes('rec.managerId'), false);
  });

  it('requires a manager JWT/session before any live manager RPC', async () => {
    const rpc = createRpc();
    const missing = await handleManagerControlRequest(
      { method: 'GET', pathname: '/api/manager/dashboard', cookieSecure: true },
      { sessionPorts: createAuthPorts(), rpcFactory: rpc.rpcFactory },
    );
    assert.equal(missing.status, 401);
    assert.equal(rpc.calls.length, 0);

    const cashier = await handleManagerControlRequest(
      { method: 'GET', pathname: '/api/manager/dashboard', cookie: cookieHeader(), cookieSecure: true },
      {
        sessionPorts: createAuthPorts({
          context: { role: 'cashier', status: 'active', auth_user_id: 'cashier-uid' },
        }),
        rpcFactory: rpc.rpcFactory,
      },
    );
    assert.equal(cashier.status, 403);
    assert.equal(rpc.calls.length, 0);
  });
});

describe('cashier canonical gateway and removed browser money modules', () => {
  it('keeps the canonical cashier RPC allow-list unchanged', () => {
    const http = readFileSync(join(root, 'server/cashier/cashierControlHttp.ts'), 'utf8');
    assert.deepEqual([...CANONICAL_CASHIER_READ_RPCS], [
      'cashier_operational_overview',
      'cashier_list_operational_transfers',
    ]);
    assert.deepEqual([...CANONICAL_CASHIER_MONEY_RPCS], [
      'cashier_deposit_player',
      'cashier_deposit_player_currency',
      'cashier_lookup_player_payout',
      'cashier_confirm_player_payout',
      'cashier_reverse_player_deposit',
    ]);
    for (const name of CANONICAL_CASHIER_READ_RPCS) {
      assert.equal(http.includes(`'${name}'`), true, name);
    }
    for (const name of CANONICAL_CASHIER_MONEY_RPCS) {
      assert.equal(http.includes(`'${name}'`), true, name);
    }
    for (const name of ['cashier_login', 'cashier_get_session', 'cashier_shift_history'] as const) {
      assert.equal(CASHIER_MONEY_RPC_DENYLIST.includes(name), true, name);
      assert.equal(http.includes(`invoke('${name}'`), false, name);
    }
    assert.equal(http.includes("invoke('cashier_deposit_to_player'"), false);
  });

  it('does not restore deleted legacy browser money modules', () => {
    for (const rel of LEGACY_BROWSER_MODULES) {
      assert.equal(existsSync(join(root, rel)), false, rel);
    }
    const liveDirs = [
      join(root, 'src/manager'),
      join(root, 'src/cashier'),
      join(root, 'src/owner'),
      join(root, 'src/pages/manager'),
      join(root, 'src/screens'),
    ];
    const files = liveDirs.flatMap(listFiles).filter((path) => (
      (path.endsWith('.ts') || path.endsWith('.tsx')) && !path.endsWith('.test.ts')
    ));
    files.push(join(root, 'src/routes.tsx'));
    for (const file of files) {
      if (!existsSync(file)) continue;
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes("from '../lib/cashier'"), false, file);
      assert.equal(source.includes("from './lib/cashier'"), false, file);
      assert.equal(source.includes("from '../lib/settlement'"), false, file);
      assert.equal(source.includes("from '../lib/players'"), false, file);
      assert.equal(source.includes("from '../lib/backoffice'"), false, file);
      assert.equal(source.includes("from './lib/backoffice'"), false, file);
    }
    const managerHttp = readFileSync(join(here, 'managerControlHttp.ts'), 'utf8');
    for (const name of LIVE_MANAGER_RPCS) {
      assert.equal(managerHttp.includes(`invoke('${name}'`), true, name);
    }
    for (const name of LEGACY_UNUSED_RPCS) {
      assert.equal(managerHttp.includes(name), false, name);
    }
  });
});
