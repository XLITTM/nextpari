import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import type { OwnerAuthGatewayPorts } from '../staff/ownerAuthService.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from '../staff/ownerCookies.js';
import { handleOwnerControlRequest, handleVercelOwnerControl } from './ownerControlHttp.js';
import type { OwnerRpcPort } from './ownerRpc.js';

const ACCESS = 'owner-access-token';
const REFRESH = 'owner-refresh-token';
const ACCESS2 = 'owner-access-rotated';
const REFRESH2 = 'owner-refresh-rotated';
const SERVICE_ROLE = 'service-role-secret-key';
const CASHIER_ID = '0393d651-e13a-4f04-ba7d-352f63bc62a5';
const PLAYER_ID = 'player-public-01';

const OWNER_CTX = {
  role: 'owner',
  status: 'active',
  auth_user_id: 'owner-uid',
  display_name: 'Owner',
  network_id: null,
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
  if (access) parts.push(`${OWNER_ACCESS_COOKIE}=${encodeURIComponent(access)}`);
  if (refresh) parts.push(`${OWNER_REFRESH_COOKIE}=${encodeURIComponent(refresh)}`);
  return parts.join('; ');
}

function jsonHasSecrets(body: Record<string, unknown>, secrets: string[]): boolean {
  const dumped = JSON.stringify(body);
  return secrets.some((secret) => dumped.includes(secret));
}

function cookieAttrs(setCookie: string[]) {
  const joined = setCookie.join('\n');
  return {
    joined,
    httpOnly: setCookie.every((row) => /HttpOnly/i.test(row)),
    hasAccess: setCookie.some((row) => row.startsWith(`${OWNER_ACCESS_COOKIE}=`)),
    hasRefresh: setCookie.some((row) => row.startsWith(`${OWNER_REFRESH_COOKIE}=`)),
    rotated: joined.includes(ACCESS2) && joined.includes(REFRESH2),
  };
}

function createAuthPorts(init?: {
  context?: unknown;
  accessFailOnce?: boolean;
}): OwnerAuthGatewayPorts & { contextTokens: string[]; refreshes: string[] } {
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
      return OWNER_CTX;
    },
  };
}

function createRpc() {
  const calls: Array<{ token: string; name: string; args?: Record<string, unknown> }> = [];
  const rpcFactory = (accessToken: string): OwnerRpcPort => ({
    async invoke(name, args) {
      calls.push({ token: accessToken, name, args });
      return { ok: true, rpc: name, args: args ?? null };
    },
  });
  return { calls, rpcFactory };
}

function secrets(): string[] {
  return [ACCESS, REFRESH, ACCESS2, REFRESH2, SERVICE_ROLE, 'eyJ'];
}

async function ownerGet(
  pathname: string,
  opts?: {
    search?: string;
    cookie?: string;
    session?: OwnerAuthGatewayPorts;
    rpc?: ReturnType<typeof createRpc>;
  },
) {
  const rpc = opts?.rpc ?? createRpc();
  const session = opts?.session ?? createAuthPorts();
  const result = await handleOwnerControlRequest(
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

async function ownerPost(
  pathname: string,
  body: unknown,
  opts?: {
    cookie?: string;
    session?: OwnerAuthGatewayPorts;
    rpc?: ReturnType<typeof createRpc>;
    adminFactory?: () => import('../staff/types.js').AuthAdminPort;
  },
) {
  const rpc = opts?.rpc ?? createRpc();
  const session = opts?.session ?? createAuthPorts();
  const result = await handleOwnerControlRequest(
    {
      method: 'POST',
      pathname,
      cookie: opts?.cookie ?? cookieHeader(ACCESS, REFRESH),
      cookieSecure: true,
      body,
    },
    { sessionPorts: session, rpcFactory: rpc.rpcFactory, adminFactory: opts?.adminFactory },
  );
  return { result, rpc, session };
}

describe('owner control center same-origin BFF', () => {
  it('1. dashboard via Owner cookie', async () => {
    const { result, rpc } = await ownerGet('/api/owner/dashboard');
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(rpc.calls[0]?.token, ACCESS);
    assert.equal(rpc.calls[0]?.name, 'owner_dashboard_stats');
    assert.equal(jsonHasSecrets(result.body, secrets()), false);
  });

  it('2. cashiers via Owner cookie', async () => {
    const { result, rpc } = await ownerGet('/api/owner/cashiers');
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'owner_list_cashiers');
    assert.equal(rpc.calls[0]?.token, ACCESS);
  });

  it('3. cashier ledger', async () => {
    const { result, rpc } = await ownerGet(
      `/api/owner/cashiers/${CASHIER_ID}/ledger`,
      { search: '?from=2026-08-01T00:00:00.000Z' },
    );
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'owner_cashier_ledger');
    assert.deepEqual(rpc.calls[0]?.args, {
      p_cashier_id: CASHIER_ID,
      p_from: '2026-08-01T00:00:00.000Z',
    });
  });

  it('4. risk bets', async () => {
    const { result, rpc } = await ownerGet('/api/owner/risk-bets');
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'owner_list_risk_bets');
  });

  it('5. players list', async () => {
    const { result, rpc } = await ownerGet('/api/owner/players', {
      search: '?search=aziz&limit=20&offset=10',
    });
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'owner_list_players');
    assert.deepEqual(rpc.calls[0]?.args, {
      p_search: 'aziz',
      p_limit: 20,
      p_offset: 10,
    });
  });

  it('6. player dossier', async () => {
    const { result, rpc } = await ownerGet(`/api/owner/players/${PLAYER_ID}`);
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'owner_player_dossier');
    assert.deepEqual(rpc.calls[0]?.args, { p_player_id: PLAYER_ID });
  });

  it('7. withdrawals', async () => {
    const { result, rpc } = await ownerGet('/api/owner/withdrawals', {
      search: '?status=pending&limit=50&offset=0',
    });
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'owner_list_withdrawals');
    assert.deepEqual(rpc.calls[0]?.args, {
      p_status: 'pending',
      p_limit: 50,
      p_offset: 0,
    });
  });

  it('8. player block POST', async () => {
    const { result, rpc } = await ownerPost(`/api/owner/players/${PLAYER_ID}/block`, {
      blocked: true,
      reason: 'risk',
    });
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'owner_set_player_blocked');
    assert.deepEqual(rpc.calls[0]?.args, {
      p_player_id: PLAYER_ID,
      p_blocked: true,
      p_reason: 'risk',
    });
  });

  it('9. cashier freeze POST', async () => {
    const { result, rpc } = await ownerPost(`/api/owner/cashiers/${CASHIER_ID}/freeze`, {
      frozen: true,
      reason: 'audit',
    });
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'owner_set_cashier_frozen');
    assert.deepEqual(rpc.calls[0]?.args, {
      p_cashier_id: CASHIER_ID,
      p_frozen: true,
      p_reason: 'audit',
    });
  });

  it('10. send message POST', async () => {
    const { result, rpc } = await ownerPost('/api/owner/messages', {
      targetType: 'all',
      title: 'Hello',
      body: 'Platform notice',
    });
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'owner_send_message');
    assert.deepEqual(rpc.calls[0]?.args, {
      p_target_type: 'all',
      p_target_player_id: null,
      p_title: 'Hello',
      p_body: 'Platform notice',
    });
  });

  it('11. missing session → 401', async () => {
    const rpc = createRpc();
    const result = await handleOwnerControlRequest(
      {
        method: 'GET',
        pathname: '/api/owner/dashboard',
        cookieSecure: true,
      },
      { sessionPorts: createAuthPorts(), rpcFactory: rpc.rpcFactory },
    );
    assert.equal(result.status, 401);
    assert.equal(result.body.error, 'JWT_REQUIRED');
    assert.equal(rpc.calls.length, 0);
    assert.equal(jsonHasSecrets(result.body, secrets()), false);
  });

  it('12. player/non-owner → 403', async () => {
    const rpc = createRpc();
    const player = await handleOwnerControlRequest(
      {
        method: 'GET',
        pathname: '/api/owner/dashboard',
        cookie: cookieHeader(ACCESS, REFRESH),
        cookieSecure: true,
      },
      {
        sessionPorts: createAuthPorts({
          context: { role: 'player', status: 'active', auth_user_id: 'player-uid' },
        }),
        rpcFactory: rpc.rpcFactory,
      },
    );
    assert.equal(player.status, 403);
    assert.equal(player.body.error, 'OWNER_REQUIRED');

    const manager = await handleOwnerControlRequest(
      {
        method: 'GET',
        pathname: '/api/owner/cashiers',
        cookie: cookieHeader(ACCESS, REFRESH),
        cookieSecure: true,
      },
      {
        sessionPorts: createAuthPorts({
          context: { role: 'manager', status: 'active', auth_user_id: 'mgr-uid' },
        }),
        rpcFactory: rpc.rpcFactory,
      },
    );
    assert.equal(manager.status, 403);
    assert.equal(rpc.calls.length, 0);
  });

  it('13. refreshed session rotates cookies', async () => {
    const session = createAuthPorts({ accessFailOnce: true });
    const { result, rpc } = await ownerGet('/api/owner/dashboard', { session });
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.token, ACCESS2);
    assert.equal(session.refreshes[0], REFRESH);
    const cookies = cookieAttrs(result.cookies ?? []);
    assert.equal(cookies.rotated, true);
    assert.equal(cookies.httpOnly, true);
    assert.equal(jsonHasSecrets(result.body, [ACCESS, REFRESH, ACCESS2, REFRESH2, SERVICE_ROLE]), false);
  });

  it('14. server RPC uses Owner JWT, not service_role', () => {
    const rpcSrc = readFileSync(join(here, 'ownerRpc.ts'), 'utf8');
    const httpSrc = readFileSync(join(here, 'ownerControlHttp.ts'), 'utf8');
    const vercelSrc = readFileSync(join(here, 'vercelHandler.ts'), 'utf8');
    const sources = `${rpcSrc}\n${httpSrc}\n${vercelSrc}`;
    assert.match(rpcSrc, /createUserJwtClient/);
    assert.match(rpcSrc, /client\.rpc\(name/);
    assert.equal(sources.includes('createServiceRoleClient'), false);
    assert.equal(sources.includes('SUPABASE_SERVICE_ROLE_KEY'), false);
    assert.equal(sources.includes('service_role'), false);
    assert.match(httpSrc, /resolveOwnerSession/);
    assert.match(httpSrc, /resolved\.accessToken/);
  });

  it('15. no tokens/secrets in response', async () => {
    const { result } = await ownerPost('/api/owner/messages', {
      targetType: 'player',
      targetPlayerId: PLAYER_ID,
      body: 'Private note',
    });
    assert.equal(result.status, 200);
    assert.equal(jsonHasSecrets(result.body, secrets()), false);
    assert.equal(JSON.stringify(result.body).includes(SERVICE_ROLE), false);
    assert.equal('accessToken' in result.body, false);
    assert.equal('refreshToken' in result.body, false);
  });

  it('16. src/owner production code performs no direct Supabase RPC', () => {
    const files = listFiles(join(root, 'src/owner'))
      .filter((path) => path.endsWith('.ts') || path.endsWith('.tsx'))
      .filter((path) => !path.endsWith('.test.ts'));
    assert.equal(files.some((path) => path.endsWith('ownerSupabase.ts')), false);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes('ownerSupabase'), false, file);
      assert.equal(source.includes('.rpc('), false, file);
      assert.equal(source.includes('supabase.from('), false, file);
      assert.equal(source.includes('supabase.auth'), false, file);
      assert.equal(source.includes('createClient'), false, file);
      assert.equal(source.includes('supabase.co'), false, file);
      assert.equal(source.includes('SERVICE_ROLE'), false, file);
    }
    const services = readFileSync(join(root, 'src/owner/services.ts'), 'utf8');
    assert.match(services, /credentials: 'same-origin'/);
    assert.match(services, /\/api\/owner\/dashboard/);
    assert.match(services, /\/api\/owner\/cashiers/);
    assert.match(services, /\/api\/owner\/risk-bets/);
    assert.match(services, /\/api\/owner\/players/);
    assert.match(services, /\/api\/owner\/withdrawals/);
    assert.match(services, /\/api\/owner\/messages/);
    assert.equal(services.includes('ownerSupabase.rpc'), false);
  });

  it('mutating routes reject GET', async () => {
    const rpc = createRpc();
    const block = await handleOwnerControlRequest(
      {
        method: 'GET',
        pathname: `/api/owner/players/${PLAYER_ID}/block`,
        cookie: cookieHeader(ACCESS, REFRESH),
        cookieSecure: true,
      },
      { sessionPorts: createAuthPorts(), rpcFactory: rpc.rpcFactory },
    );
    assert.equal(block.status, 405);
    assert.equal(rpc.calls.length, 0);

    const freeze = await handleOwnerControlRequest(
      {
        method: 'GET',
        pathname: `/api/owner/cashiers/${CASHIER_ID}/freeze`,
        cookie: cookieHeader(ACCESS, REFRESH),
        cookieSecure: true,
      },
      { sessionPorts: createAuthPorts(), rpcFactory: rpc.rpcFactory },
    );
    assert.equal(freeze.status, 405);
  });

  it('Vercel dashboard adapter forwards Owner cookie', async () => {
    const rpc = createRpc();
    const headers: Record<string, string | string[]> = {};
    let statusCode = 0;
    let body: Record<string, unknown> = {};
    await handleVercelOwnerControl(
      {
        method: 'GET',
        url: '/api/owner/dashboard',
        headers: { cookie: cookieHeader(ACCESS, REFRESH) },
      },
      {
        status(code) {
          statusCode = code;
          return this;
        },
        setHeader(name, value) {
          headers[name.toLowerCase()] = value;
        },
        json(payload) {
          body = payload as Record<string, unknown>;
        },
      },
      '/api/owner/dashboard',
      { sessionPorts: createAuthPorts(), rpcFactory: rpc.rpcFactory },
    );
    assert.equal(statusCode, 200);
    assert.equal(body.ok, true);
    assert.equal(rpc.calls[0]?.name, 'owner_dashboard_stats');
    assert.equal(rpc.calls[0]?.token, ACCESS);
  });

  it('lists and opens managers under Owner JWT without impersonation', async () => {
    const { result, rpc } = await ownerGet('/api/owner/managers');
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'owner_list_managers');
    const detail = await ownerGet('/api/owner/managers/ccc5f5ad-079e-4420-9080-e7ded4ff9496');
    assert.equal(detail.result.status, 200);
    assert.equal(detail.rpc.calls[0]?.name, 'owner_manager_detail');
    assert.equal(detail.rpc.calls[0]?.args?.p_manager_id, 'ccc5f5ad-079e-4420-9080-e7ded4ff9496');
    const dashboard = readFileSync(join(root, 'src/owner/ManagerDashboardScreen.tsx'), 'utf8');
    const panel = readFileSync(join(root, 'src/owner/OwnerManagersPanel.tsx'), 'utf8');
    assert.equal(dashboard.includes('MigrationPending'), false);
    assert.match(dashboard, /OwnerManagersPanel/);
    assert.match(panel, /Открыть/);
    assert.equal(panel.includes('/api/manager/auth'), false);
    assert.equal(panel.includes('signInWithPassword'), false);
    assert.equal(panel.includes('startingBalance'), false);
    assert.equal(panel.includes('pin_hash'), false);
    assert.equal(panel.includes('p_pin'), false);
  });

  it('creates manager via Auth Admin identity then Owner JWT provision; compensates on DB failure', async () => {
    const deleted: string[] = [];
    const created = await ownerPost('/api/owner/managers', {
      login: 'manager02',
      fullName: 'Новый менеджер',
      networkName: 'Сеть 2',
      email: 'manager02@example.com',
      temporaryPassword: 'temporary-pass-12',
    }, {
      adminFactory: () => ({
        async createUser() {
          return { id: 'auth-manager-2' };
        },
        async deleteUser(id) {
          deleted.push(id);
        },
      }),
    });
    assert.equal(created.result.status, 200);
    assert.equal(created.rpc.calls[0]?.name, 'owner_provision_manager');
    assert.equal(created.rpc.calls[0]?.args?.p_auth_user_id, 'auth-manager-2');
    assert.equal(created.rpc.calls[0]?.args?.p_float, undefined);
    assert.equal(JSON.stringify(created.result.body).includes('temporary-pass-12'), false);

    const failRpc = createRpc();
    failRpc.rpcFactory = (accessToken: string): OwnerRpcPort => ({
      async invoke(name, args) {
        failRpc.calls.push({ token: accessToken, name, args });
        throw staffError('LOGIN_TAKEN', 409);
      },
    });
    const deletedFail: string[] = [];
    const failed = await handleOwnerControlRequest(
      {
        method: 'POST',
        pathname: '/api/owner/managers',
        cookie: cookieHeader(ACCESS, REFRESH),
        cookieSecure: true,
        body: {
          login: 'manager02',
          fullName: 'Новый менеджер',
          networkName: 'Сеть 2',
          email: 'manager02@example.com',
          temporaryPassword: 'temporary-pass-12',
        },
      },
      {
        sessionPorts: createAuthPorts(),
        rpcFactory: failRpc.rpcFactory,
        adminFactory: () => ({
          async createUser() {
            return { id: 'auth-manager-fail' };
          },
          async deleteUser(id) {
            deletedFail.push(id);
          },
        }),
      },
    );
    assert.equal(failed.status, 409);
    assert.deepEqual(deletedFail, ['auth-manager-fail']);
    assert.equal(JSON.stringify(failed.body).includes('temporary-pass-12'), false);
  });
});

describe('owner treasury and direct funding controls', () => {
  const MANAGER_ID = 'ccc5f5ad-079e-4420-9080-e7ded4ff9496';
  const FORBIDDEN_BODY = {
    actorUserId: 'owner-uid',
    fromAccountId: 'from-acc',
    treasuryId: 'treasury-acc',
    networkId: '11111111-1111-1111-1111-111111111111',
    walletId: 'wallet-uuid',
    operationalAccountId: 'ops-acc',
  };

  it('GET /api/owner/treasury maps to owner_treasury_overview', async () => {
    const { result, rpc } = await ownerGet('/api/owner/treasury');
    assert.equal(result.status, 200);
    assert.equal(rpc.calls.length, 1);
    assert.equal(rpc.calls[0]?.name, 'owner_treasury_overview');
    assert.equal(rpc.calls[0]?.token, ACCESS);
    assert.equal(rpc.calls[0]?.args, undefined);
  });

  it('strips wallet UUID and from-account ids from treasury overview', async () => {
    const rpc = createRpc();
    rpc.rpcFactory = (accessToken) => ({
      async invoke(name, args) {
        rpc.calls.push({ token: accessToken, name, args });
        return {
          treasury: {
            id: 'treasury-hidden',
            currency: 'TMTM',
            available_balance: 0,
            status: 'active',
            migration_state: 'active',
          },
          managers: { count: 1, total_balance: 0 },
          cashiers: { count: 1, total_balance: 3550 },
          recent_transfers: [{
            id: 'tr-1',
            transfer_no: 'OP-1',
            transfer_type: 'TREASURY_TO_PLAYER',
            amount: 10,
            player_wallet_id: 'wallet-uuid-secret',
            wallet_id: 'wallet-uuid-secret',
            from_account_id: 'from-acc-secret',
            to_account_id: 'to-acc',
            network_id: 'net-secret',
            actor_role: 'owner',
            created_at: '2026-09-01T00:00:00.000Z',
          }],
        };
      },
    });
    const { result } = await ownerGet('/api/owner/treasury', { rpc });
    assert.equal(result.status, 200);
    const dumped = JSON.stringify(result.body);
    assert.equal(dumped.includes('wallet-uuid-secret'), false);
    assert.equal(dumped.includes('from-acc-secret'), false);
    assert.equal(dumped.includes('treasury-hidden'), false);
    assert.match(dumped, /OP-1/);
    assert.match(dumped, /TREASURY_TO_PLAYER/);
  });

  it('POST /api/owner/treasury maps only to owner_capital_in', async () => {
    const { result, rpc } = await ownerPost('/api/owner/treasury', {
      amount: 100,
      idempotencyKey: 'cap-1',
      note: 'seed capital',
    });
    assert.equal(result.status, 200);
    assert.equal(rpc.calls.length, 1);
    assert.equal(rpc.calls[0]?.name, 'owner_capital_in');
    assert.deepEqual(rpc.calls[0]?.args, {
      p_amount: 100,
      p_idempotency_key: 'cap-1',
      p_note: 'seed capital',
    });
    assert.equal(rpc.calls.some((call) => call.name.startsWith('owner_fund_')), false);
  });

  it('manager funding maps only owner_fund_manager', async () => {
    const { result, rpc } = await ownerPost('/api/owner/fund', {
      targetType: 'manager',
      targetId: MANAGER_ID,
      amount: 50,
      idempotencyKey: 'mgr-1',
      note: 'float',
    });
    assert.equal(result.status, 200);
    assert.equal(rpc.calls.length, 1);
    assert.equal(rpc.calls[0]?.name, 'owner_fund_manager');
    assert.deepEqual(rpc.calls[0]?.args, {
      p_manager_id: MANAGER_ID,
      p_amount: 50,
      p_idempotency_key: 'mgr-1',
      p_note: 'float',
    });
    assert.equal(rpc.calls.some((call) => call.name === 'owner_fund_cashier'), false);
    assert.equal(rpc.calls.some((call) => call.name === 'owner_fund_player'), false);
    assert.equal(rpc.calls.some((call) => call.name === 'owner_capital_in'), false);
  });

  it('cashier direct funding maps owner_fund_cashier', async () => {
    const { result, rpc } = await ownerPost('/api/owner/fund', {
      targetType: 'cashier',
      targetId: CASHIER_ID,
      amount: 25,
      idempotencyKey: 'csh-1',
    });
    assert.equal(result.status, 200);
    assert.equal(rpc.calls.length, 1);
    assert.equal(rpc.calls[0]?.name, 'owner_fund_cashier');
    assert.equal(rpc.calls[0]?.args?.p_cashier_id, CASHIER_ID);
    assert.equal(rpc.calls[0]?.args?.p_amount, 25);
    assert.equal(rpc.calls[0]?.args?.p_idempotency_key, 'csh-1');
    assert.equal(Object.keys(rpc.calls[0]?.args ?? {}).includes('p_manager_id'), false);
    assert.equal(Object.keys(rpc.calls[0]?.args ?? {}).includes('p_from_account_id'), false);
  });

  it('player direct funding maps owner_fund_player with public_id', async () => {
    const rpc = createRpc();
    rpc.rpcFactory = (accessToken) => ({
      async invoke(name, args) {
        rpc.calls.push({ token: accessToken, name, args });
        return {
          ok: true,
          transfer_id: 'tr-player',
          amount: 15,
          player_public_id: '110790',
          wallet_id: 'wallet-uuid-secret',
        };
      },
    });
    const { result } = await ownerPost('/api/owner/fund', {
      targetType: 'player',
      targetId: '110790',
      amount: 15,
      idempotencyKey: 'pl-1',
    }, { rpc });
    assert.equal(result.status, 200);
    assert.equal(rpc.calls.length, 1);
    assert.equal(rpc.calls[0]?.name, 'owner_fund_player');
    assert.deepEqual(rpc.calls[0]?.args, {
      p_player_id: '110790',
      p_amount: 15,
      p_idempotency_key: 'pl-1',
      p_note: null,
    });
    const dumped = JSON.stringify(result.body);
    assert.equal(dumped.includes('wallet-uuid-secret'), false);
    assert.match(dumped, /110790/);
  });

  it('browser cannot select treasury/from account/network/wallet', async () => {
    const capital = await ownerPost('/api/owner/treasury', {
      amount: 10,
      idempotencyKey: 'cap-forbidden',
      note: 'note',
      ...FORBIDDEN_BODY,
    });
    assert.equal(capital.result.status, 400);
    assert.equal(capital.result.body.error, 'FIELD_FORBIDDEN');
    assert.equal(capital.rpc.calls.length, 0);

    const fund = await ownerPost('/api/owner/fund', {
      targetType: 'manager',
      targetId: MANAGER_ID,
      amount: 10,
      idempotencyKey: 'fund-forbidden',
      ...FORBIDDEN_BODY,
    });
    assert.equal(fund.result.status, 400);
    assert.equal(fund.result.body.error, 'FIELD_FORBIDDEN');
    assert.equal(fund.rpc.calls.length, 0);

    const walletPlayer = await ownerPost('/api/owner/fund', {
      targetType: 'player',
      targetId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      amount: 10,
      idempotencyKey: 'wallet-as-player',
    });
    assert.equal(walletPlayer.result.status, 400);
    assert.equal(walletPlayer.result.body.error, 'PLAYER_WALLET_ID_FORBIDDEN');
    assert.equal(walletPlayer.rpc.calls.length, 0);
  });

  it('duplicate unchanged retry reuses idempotency key; changed amount gets a new key', () => {
    const { ownerCapitalFingerprint, ownerFundFingerprint } = {
      ownerCapitalFingerprint: (amount: number, note: string) => `capital|${amount}|${note}`,
      ownerFundFingerprint: (
        targetType: 'manager' | 'cashier' | 'player',
        targetId: string,
        amount: number,
        note: string,
      ) => `fund|${targetType}|${targetId}|${amount}|${note}`,
    };
    const retainIdempotencyKey = (
      slot: { key: string; fingerprint: string } | null,
      fingerprint: string,
    ) => {
      if (slot && slot.fingerprint === fingerprint) return slot;
      return { key: crypto.randomUUID(), fingerprint };
    };
    const capitalFp = ownerCapitalFingerprint(100, 'seed');
    const first = retainIdempotencyKey(null, capitalFp);
    const retry = retainIdempotencyKey(first, capitalFp);
    assert.equal(retry.key, first.key);
    const changed = retainIdempotencyKey(first, ownerCapitalFingerprint(200, 'seed'));
    assert.notEqual(changed.key, first.key);

    const fundFp = ownerFundFingerprint('cashier', CASHIER_ID, 25, '');
    const fundFirst = retainIdempotencyKey(null, fundFp);
    const fundRetry = retainIdempotencyKey(fundFirst, fundFp);
    assert.equal(fundRetry.key, fundFirst.key);
    const fundChanged = retainIdempotencyKey(
      fundFirst,
      ownerFundFingerprint('cashier', CASHIER_ID, 40, ''),
    );
    assert.notEqual(fundChanged.key, fundFirst.key);

    const gate = readFileSync(join(root, 'src/shared/staff/financeGate.ts'), 'utf8');
    const keys = readFileSync(join(root, 'src/owner/ownerMoney.ts'), 'utf8');
    const ui = readFileSync(join(root, 'src/owner/OwnerMoneyControls.tsx'), 'utf8');
    assert.match(gate, /if \(slot && slot.fingerprint === fingerprint\) return slot/);
    assert.match(keys, /capital\|\$\{amount\}\|\$\{note\}/);
    assert.match(ui, /retainIdempotencyKey\(idempotency, fingerprint\)/);
    assert.match(ui, /ownerFundFingerprint/);
  });

  it('no service_role business authority and no legacy money RPC', () => {
    const http = readFileSync(join(here, 'ownerControlHttp.ts'), 'utf8');
    const rpcSrc = readFileSync(join(here, 'ownerRpc.ts'), 'utf8');
    const services = readFileSync(join(root, 'src/owner/services.ts'), 'utf8');
    const money = readFileSync(join(root, 'src/owner/OwnerMoneyControls.tsx'), 'utf8');
    const dashboard = readFileSync(join(root, 'src/owner/ManagerDashboardScreen.tsx'), 'utf8');
    const managers = readFileSync(join(root, 'src/owner/OwnerManagersPanel.tsx'), 'utf8');
    const players = readFileSync(join(root, 'src/owner/PlayersPanel.tsx'), 'utf8');
    const sources = `${http}\n${rpcSrc}\n${services}\n${money}\n${dashboard}\n${managers}\n${players}`;
    assert.equal(http.includes('createServiceRoleClient'), false);
    assert.equal(rpcSrc.includes('createServiceRoleClient'), false);
    assert.equal(http.includes('service_role'), false);
    assert.match(rpcSrc, /createUserJwtClient/);
    for (const banned of [
      'manager_adjust_player_balance',
      'cashier_deposit_to_player',
      'manager_create_cashier',
    ]) {
      assert.equal(sources.includes(banned), false, banned);
    }
    assert.equal(http.includes('.from(\'wallets\')'), false);
    assert.equal(http.includes('float_balance'), false);
    assert.equal(services.includes("from('wallets')"), false);
    assert.equal(money.includes('fromAccountId'), false);
    assert.equal(money.includes('treasuryId'), false);
    assert.equal(money.includes('walletId'), false);
    assert.match(services, /targetType: input.targetType/);
    assert.match(services, /targetId: input.targetId/);
    assert.equal(services.includes('walletId: input'), false);
  });

  it('active treasury enables UI; staging/blocked treasury disables UI', () => {
    const money = readFileSync(join(root, 'src/owner/OwnerMoneyControls.tsx'), 'utf8');
    const dashboard = readFileSync(join(root, 'src/owner/ManagerDashboardScreen.tsx'), 'utf8');
    const managers = readFileSync(join(root, 'src/owner/OwnerManagersPanel.tsx'), 'utf8');
    const players = readFileSync(join(root, 'src/owner/PlayersPanel.tsx'), 'utf8');
    assert.match(money, /ownerTreasuryIsActive/);
    assert.match(money, /isOperationalAccountActive/);
    assert.match(money, /disabled=\{!treasuryActive\}/);
    assert.match(money, /Казна не активна/);
    assert.match(money, /Доступно в казне/);
    assert.match(dashboard, /OwnerTreasuryPanel/);
    assert.match(dashboard, /Пополнить напрямую/);
    assert.match(managers, /Пополнить напрямую/);
    assert.match(managers, /isOperationalAccountActive/);
    assert.match(players, /Пополнить баланс/);
    assert.equal(players.includes('Корректировка баланса'), false);
    assert.match(players, /publicId: row.publicId/);
    assert.equal(players.includes('walletId'), false);
    assert.match(players, /onFund\(publicId\)/);
    assert.match(money, /retainIdempotencyKey/);
    assert.match(money, /disabled=\{!enabled\}/);
  });
});
