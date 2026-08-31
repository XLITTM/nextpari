import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import type { ManagerAuthGatewayPorts } from '../staff/managerAuthService.js';
import { MANAGER_ACCESS_COOKIE, MANAGER_REFRESH_COOKIE } from '../staff/managerCookies.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from '../staff/ownerCookies.js';
import { handleManagerControlRequest, MONEY_RPC_DENYLIST } from './managerControlHttp.js';
import type { ManagerRpcPort } from './managerRpc.js';

const ACCESS = 'manager-access-token';
const REFRESH = 'manager-refresh-token';
const ACCESS2 = 'manager-access-rotated';
const REFRESH2 = 'manager-refresh-rotated';
const SERVICE_ROLE = 'service-role-secret-key';
const MANAGER_ID = 'ccc5f5ad-079e-4420-9080-e7ded4ff9496';
const NETWORK_ID = '11111111-1111-1111-1111-111111111111';
const CASHIER_ID = '0393d651-e13a-4f04-ba7d-352f63bc62a5';
const FOREIGN_CASHIER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const FOREIGN_PLAYER = 'foreign-player-99';

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

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return [path];
  });
}

function cookieHeader(access?: string | null, refresh?: string | null): string {
  const parts: string[] = [];
  if (access) parts.push(`${MANAGER_ACCESS_COOKIE}=${encodeURIComponent(access)}`);
  if (refresh) parts.push(`${MANAGER_REFRESH_COOKIE}=${encodeURIComponent(refresh)}`);
  return parts.join('; ');
}

function ownerCookieHeader(): string {
  return [
    `${OWNER_ACCESS_COOKIE}=${encodeURIComponent('owner-access-token')}`,
    `${OWNER_REFRESH_COOKIE}=${encodeURIComponent('owner-refresh-token')}`,
  ].join('; ');
}

function jsonHasSecrets(body: Record<string, unknown>, secrets: string[]): boolean {
  return secrets.some((secret) => JSON.stringify(body).includes(secret));
}

function cookieAttrs(setCookie: string[]) {
  const joined = setCookie.join('\n');
  return {
    httpOnly: setCookie.every((row) => /HttpOnly/i.test(row)),
    rotated: joined.includes(ACCESS2) && joined.includes(REFRESH2),
  };
}

function createAuthPorts(init?: {
  context?: unknown;
  accessFailOnce?: boolean;
}): ManagerAuthGatewayPorts & { contextTokens: string[]; refreshes: string[] } {
  const contextTokens: string[] = [];
  const refreshes: string[] = [];
  let accessAttempts = 0;
  return {
    contextTokens,
    refreshes,
    async signInWithPassword() {
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async refreshSession(refreshToken) {
      refreshes.push(refreshToken);
      return { accessToken: ACCESS2, refreshToken: REFRESH2 };
    },
    async currentStaffContext(accessToken) {
      contextTokens.push(accessToken);
      accessAttempts += 1;
      if (init?.accessFailOnce && accessAttempts === 1 && accessToken === ACCESS) {
        throw staffError('JWT_INVALID', 401);
      }
      if (init?.context !== undefined) return init.context;
      return MANAGER_CTX;
    },
  };
}

function createRpc() {
  const calls: Array<{ token: string; name: string; args?: Record<string, unknown> }> = [];
  const rpcFactory = (accessToken: string): ManagerRpcPort => ({
    async invoke(name, args) {
      calls.push({ token: accessToken, name, args });
      if (MONEY_RPC_DENYLIST.includes(name as typeof MONEY_RPC_DENYLIST[number])) {
        throw new Error(`money rpc invoked: ${name}`);
      }
      if (name === 'manager_list_risk_bets') {
        throw new Error('unscoped risk rpc invoked');
      }
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

function secrets(): string[] {
  return [ACCESS, REFRESH, ACCESS2, REFRESH2, SERVICE_ROLE, 'eyJ'];
}

async function managerGet(
  pathname: string,
  opts?: {
    search?: string;
    cookie?: string;
    session?: ManagerAuthGatewayPorts;
    rpc?: ReturnType<typeof createRpc>;
  },
) {
  const rpc = opts?.rpc ?? createRpc();
  const session = opts?.session ?? createAuthPorts();
  const result = await handleManagerControlRequest(
    {
      method: 'GET',
      pathname,
      search: opts?.search,
      cookie: opts?.cookie ?? cookieHeader(ACCESS, REFRESH),
      cookieSecure: true,
    },
    { sessionPorts: session, rpcFactory: rpc.rpcFactory },
  );
  return { result, rpc, session };
}

async function managerPost(
  pathname: string,
  body: unknown,
  opts?: {
    cookie?: string;
    session?: ManagerAuthGatewayPorts;
    rpc?: ReturnType<typeof createRpc>;
  },
) {
  const rpc = opts?.rpc ?? createRpc();
  const session = opts?.session ?? createAuthPorts();
  const result = await handleManagerControlRequest(
    {
      method: 'POST',
      pathname,
      cookie: opts?.cookie ?? cookieHeader(ACCESS, REFRESH),
      cookieSecure: true,
      body,
    },
    { sessionPorts: session, rpcFactory: rpc.rpcFactory },
  );
  return { result, rpc, session };
}

describe('manager control center same-origin BFF', () => {
  it('1. dashboard with valid Manager cookie', async () => {
    const { result, rpc } = await managerGet('/api/manager/dashboard');
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.token, ACCESS);
    assert.equal(rpc.calls[0]?.name, 'manager_dashboard_stats');
    assert.equal(rpc.calls[0]?.args?.p_manager_id, MANAGER_ID);
    assert.equal(jsonHasSecrets(result.body, secrets()), false);
  });

  it('2. cashiers list own network only', async () => {
    const { result, rpc } = await managerGet('/api/manager/cashiers');
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'manager_list_cashiers');
    assert.equal(rpc.calls[0]?.args?.p_manager_id, MANAGER_ID);
    const rows = result.body.data as Array<{ id: string }>;
    assert.equal(rows.some((row) => row.id === FOREIGN_CASHIER), false);
  });

  it('3. cashier ledger own network only', async () => {
    const { result, rpc } = await managerGet(
      `/api/manager/cashiers/${CASHIER_ID}/ledger`,
      { search: '?from=2026-08-01T00:00:00.000Z' },
    );
    assert.equal(result.status, 200);
    assert.equal(rpc.calls.some((call) => call.name === 'manager_list_cashiers'), true);
    const ledger = rpc.calls.find((call) => call.name === 'manager_cashier_ledger');
    assert.equal(ledger?.args?.p_manager_id, MANAGER_ID);
    assert.equal(ledger?.args?.p_cashier_id, CASHIER_ID);
  });

  it('4. foreign-network cashier rejected', async () => {
    const { result, rpc } = await managerGet(`/api/manager/cashiers/${FOREIGN_CASHIER}/ledger`);
    assert.equal(result.status, 404);
    assert.equal(result.body.error, 'CASHIER_NOT_FOUND');
    assert.equal(rpc.calls.some((call) => call.name === 'manager_cashier_ledger'), false);
    assert.equal(rpc.calls.some((call) => call.name === 'manager_set_cashier_frozen'), false);
  });

  it('5. risk bets unavailable without calling unscoped RPC', async () => {
    const { result, rpc } = await managerGet('/api/manager/risk-bets');
    assert.equal(result.status, 200);
    const data = result.body.data as {
      rows: unknown[];
      total: number;
      available: boolean;
      reason: string;
    };
    assert.deepEqual(data.rows, []);
    assert.equal(data.total, 0);
    assert.equal(data.available, false);
    assert.equal(data.reason, 'NETWORK_SCOPE_PENDING');
    assert.equal(rpc.calls.length, 0);
    assert.equal(rpc.calls.some((call) => call.name === 'manager_list_risk_bets'), false);
  });

  it('5b. risk-bets missing session → 401', async () => {
    const rpc = createRpc();
    const result = await handleManagerControlRequest(
      { method: 'GET', pathname: '/api/manager/risk-bets', cookieSecure: true },
      { sessionPorts: createAuthPorts(), rpcFactory: rpc.rpcFactory },
    );
    assert.equal(result.status, 401);
    assert.equal(rpc.calls.length, 0);
  });

  it('5c. risk-bets owner/player/cashier rejected', async () => {
    const owner = await managerGet('/api/manager/risk-bets', { cookie: ownerCookieHeader() });
    assert.equal(owner.result.status, 401);
    assert.equal(owner.rpc.calls.length, 0);

    const player = await managerGet('/api/manager/risk-bets', {
      session: createAuthPorts({
        context: { role: 'player', status: 'active', auth_user_id: 'player-uid' },
      }),
    });
    assert.equal(player.result.status, 403);
    assert.equal(player.rpc.calls.length, 0);

    const cashier = await managerGet('/api/manager/risk-bets', {
      session: createAuthPorts({
        context: { role: 'cashier', status: 'active', auth_user_id: 'cashier-uid' },
      }),
    });
    assert.equal(cashier.result.status, 403);
    assert.equal(cashier.rpc.calls.length, 0);
  });

  it('5d. manager_list_risk_bets is never called', () => {
    const http = readFileSync(join(here, 'managerControlHttp.ts'), 'utf8');
    const rpc = readFileSync(join(here, 'managerRpc.ts'), 'utf8');
    const services = readFileSync(join(root, 'src/manager/services.ts'), 'utf8');
    assert.equal(http.includes('manager_list_risk_bets'), false);
    assert.equal(http.includes("invoke('manager_list_risk_bets'"), false);
    assert.equal(rpc.includes('manager_list_risk_bets'), false);
    assert.equal(services.includes('manager_list_risk_bets'), false);
  });

  it('6. players scoped correctly', async () => {
    const { result, rpc } = await managerGet('/api/manager/players?search=x');
    assert.equal(result.status, 200);
    const data = result.body.data as { rows: unknown[]; available: boolean };
    assert.deepEqual(data.rows, []);
    assert.equal(data.available, false);
    assert.equal(rpc.calls.length, 0);
  });

  it('7. foreign-network player inaccessible', async () => {
    const { result, rpc } = await managerGet(`/api/manager/players/${FOREIGN_PLAYER}`);
    assert.equal(result.status, 404);
    assert.equal(result.body.error, 'PLAYER_NOT_FOUND');
    assert.equal(rpc.calls.length, 0);
  });

  it('8. missing Manager cookie → 401', async () => {
    const rpc = createRpc();
    const result = await handleManagerControlRequest(
      { method: 'GET', pathname: '/api/manager/dashboard', cookieSecure: true },
      { sessionPorts: createAuthPorts(), rpcFactory: rpc.rpcFactory },
    );
    assert.equal(result.status, 401);
    assert.equal(rpc.calls.length, 0);
  });

  it('9. Owner cookie → 401/403', async () => {
    const { result, rpc } = await managerGet('/api/manager/dashboard', {
      cookie: ownerCookieHeader(),
    });
    assert.equal(result.status, 401);
    assert.equal(rpc.calls.length, 0);
  });

  it('10. Player/Cashier session → rejected', async () => {
    const player = await managerGet('/api/manager/cashiers', {
      session: createAuthPorts({
        context: { role: 'player', status: 'active', auth_user_id: 'player-uid' },
      }),
    });
    assert.equal(player.result.status, 403);

    const cashier = await managerGet('/api/manager/cashiers', {
      session: createAuthPorts({
        context: { role: 'cashier', status: 'active', auth_user_id: 'cashier-uid' },
      }),
    });
    assert.equal(cashier.result.status, 403);
  });

  it('11. refreshed Manager session rotates cookies', async () => {
    const session = createAuthPorts({ accessFailOnce: true });
    const { result, rpc } = await managerGet('/api/manager/dashboard', { session });
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.token, ACCESS2);
    assert.equal(cookieAttrs(result.cookies ?? []).rotated, true);
  });

  it('12. Manager JWT used for DB authority', async () => {
    const { rpc } = await managerGet('/api/manager/dashboard');
    assert.equal(rpc.calls[0]?.token, ACCESS);
    assert.notEqual(rpc.calls[0]?.token, SERVICE_ROLE);
  });

  it('13. service_role NOT used for Manager business reads', () => {
    const sources = [
      readFileSync(join(here, 'managerRpc.ts'), 'utf8'),
      readFileSync(join(here, 'managerControlHttp.ts'), 'utf8'),
      readFileSync(join(here, 'vercelHandler.ts'), 'utf8'),
    ].join('\n');
    assert.match(sources, /createUserJwtClient|createManagerJwtRpc/);
    assert.equal(sources.includes('createServiceRoleClient'), false);
    assert.equal(sources.includes('SUPABASE_SERVICE_ROLE_KEY'), false);
  });

  it('14. no tokens/secrets returned', async () => {
    const { result } = await managerPost(`/api/manager/cashiers/${CASHIER_ID}/freeze`, { frozen: true });
    assert.equal(result.status, 200);
    assert.equal(jsonHasSecrets(result.body, secrets()), false);
  });

  it('15. no direct browser Supabase calls remain', () => {
    const files = [
      ...listFiles(join(root, 'src/manager')),
      ...listFiles(join(root, 'src/pages/manager')),
    ].filter((path) => (path.endsWith('.ts') || path.endsWith('.tsx')) && !path.endsWith('.test.ts'));
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes('supabase.rpc'), false, file);
      assert.equal(source.includes('supabase.from'), false, file);
      assert.equal(source.includes('supabase.auth'), false, file);
      assert.equal(source.includes('createClient'), false, file);
      assert.equal(source.includes('supabase.co'), false, file);
    }
  });

  it('16. no legacy money RPC is called', async () => {
    const { rpc } = await managerGet('/api/manager/dashboard');
    for (const name of MONEY_RPC_DENYLIST) {
      assert.equal(rpc.calls.some((call) => call.name === name), false, name);
    }
    const http = readFileSync(join(here, 'managerControlHttp.ts'), 'utf8');
    for (const name of MONEY_RPC_DENYLIST) {
      assert.equal(http.includes(`'${name}'`) && http.includes('invoke'), http.includes(name), name);
      assert.equal(http.includes(`invoke('${name}'`), false, name);
    }
  });

  it('17. manager_create_cashier disabled', async () => {
    const { result, rpc } = await managerPost('/api/manager/cashiers', {
      login: 'agent99',
      floatBalance: 1000,
    });
    assert.equal(result.status, 405);
    assert.equal(rpc.calls.some((call) => call.name === 'manager_create_cashier'), false);
  });

  it('18. topup/collect/adjust/settle disabled', async () => {
    const topup = await managerPost(`/api/manager/cashiers/${CASHIER_ID}/topup`, { amount: 100 });
    assert.equal(topup.result.status, 404);
    const collect = await managerPost(`/api/manager/cashiers/${CASHIER_ID}/collect`, { amount: 100 });
    assert.equal(collect.result.status, 404);
    const settle = await managerPost('/api/manager/risk-bets', { betId: 'x' });
    assert.equal(settle.result.status, 405);
    assert.equal(topup.rpc.calls.some((call) => MONEY_RPC_DENYLIST.includes(call.name as typeof MONEY_RPC_DENYLIST[number])), false);
  });

  it('19. no demo financial fallback shown as real', () => {
    const files = [
      join(root, 'src/pages/manager/ManagerFinancePage.tsx'),
      join(root, 'src/pages/manager/ManagerOfficeLayout.tsx'),
      join(root, 'src/pages/manager/ManagerAgentsPage.tsx'),
      join(root, 'src/pages/manager/ManagerRisksPage.tsx'),
      join(root, 'src/manager/services.ts'),
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes('1250'), false, file);
      assert.equal(source.includes('3400'), false, file);
      assert.equal(source.includes('42000'), false, file);
      assert.equal(source.includes('kpiFromTotals(1840'), false, file);
      assert.equal(source.includes('fetchDashboardKpis'), false, file);
      assert.equal(source.includes('createBackofficeCashier'), false, file);
    }
    const risks = readFileSync(join(root, 'src/pages/manager/ManagerRisksPage.tsx'), 'utf8');
    assert.match(risks, /Risk data temporarily unavailable while network scoping is being migrated/);
    assert.equal(risks.includes('asRows'), false);
    assert.equal(risks.includes('parseRiskBet'), false);
  });

  it('20. no cross-network access by URL tampering', async () => {
    const freeze = await managerPost(`/api/manager/cashiers/${FOREIGN_CASHIER}/freeze`, { frozen: true });
    assert.equal(freeze.result.status, 404);
    assert.equal(freeze.rpc.calls.some((call) => call.name === 'manager_set_cashier_frozen'), false);
    const tamper = await managerGet('/api/manager/dashboard?managerId=other');
    assert.equal(tamper.rpc.calls[0]?.args?.p_manager_id, MANAGER_ID);
  });
});
