import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import type { CashierAuthGatewayPorts } from '../staff/cashierAuthService.js';
import { CASHIER_ACCESS_COOKIE, CASHIER_REFRESH_COOKIE } from '../staff/cashierCookies.js';
import { MANAGER_ACCESS_COOKIE, MANAGER_REFRESH_COOKIE } from '../staff/managerCookies.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from '../staff/ownerCookies.js';
import {
  CANONICAL_CASHIER_READ_RPCS,
  CASHIER_MONEY_RPC_DENYLIST,
  handleCashierControlRequest,
} from './cashierControlHttp.js';
import type { CashierRpcPort } from './cashierRpc.js';

const ACCESS = 'cashier-access-token';
const REFRESH = 'cashier-refresh-token';
const ACCESS2 = 'cashier-access-rotated';
const REFRESH2 = 'cashier-refresh-rotated';
const SERVICE_ROLE = 'service-role-secret-key';
const CASHIER_ID = '0393d651-e13a-4f04-ba7d-352f63bc62a5';
const FOREIGN_CASHIER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const NETWORK_ID = '11111111-1111-1111-1111-111111111111';
const AUTH_USER = 'de04491b-344d-4af1-81e8-bce3f53f21ac';

const CASHIER_CTX = {
  role: 'cashier',
  status: 'active',
  auth_user_id: AUTH_USER,
  display_name: 'agent01',
  network_id: NETWORK_ID,
  legacy_cashier_id: CASHIER_ID,
};

const OVERVIEW = {
  cashier: {
    cashier_id: CASHIER_ID,
    login: 'agent01',
    full_name: 'Азат Мередов',
    point_name: 'Точка №12',
    city: 'Ашхабад',
    network_id: NETWORK_ID,
  },
  operational: {
    account_id: 'cashier-op-1',
    currency: 'TMTM',
    available_balance: 3550,
    status: 'active',
    migration_state: 'staging',
    version: 1,
    legacy_float_diagnostic: 3550,
  },
  activation_pending: true,
};

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260831_022_cashier_operational_read_api.sql'),
  'utf8',
);

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return [path];
  });
}

function cashierCookie(access = ACCESS, refresh = REFRESH): string {
  return [
    `${CASHIER_ACCESS_COOKIE}=${encodeURIComponent(access)}`,
    `${CASHIER_REFRESH_COOKIE}=${encodeURIComponent(refresh)}`,
  ].join('; ');
}

function createAuthPorts(init?: {
  context?: unknown;
  accessFailOnce?: boolean;
}): CashierAuthGatewayPorts & { refreshes: string[] } {
  const refreshes: string[] = [];
  let accessAttempts = 0;
  return {
    refreshes,
    async signInWithPassword() {
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async refreshSession(refreshToken) {
      refreshes.push(refreshToken);
      return { accessToken: ACCESS2, refreshToken: REFRESH2 };
    },
    async currentStaffContext(accessToken) {
      accessAttempts += 1;
      if (init?.accessFailOnce && accessAttempts === 1 && accessToken === ACCESS) {
        throw staffError('JWT_INVALID', 401);
      }
      return init?.context ?? CASHIER_CTX;
    },
  };
}

function createRpc() {
  const calls: Array<{ token: string; name: string; args?: Record<string, unknown> }> = [];
  const rpcFactory = (accessToken: string): CashierRpcPort => ({
    async invoke(name, args) {
      calls.push({ token: accessToken, name, args });
      if (CASHIER_MONEY_RPC_DENYLIST.includes(name as typeof CASHIER_MONEY_RPC_DENYLIST[number])) {
        throw new Error(`money rpc invoked: ${name}`);
      }
      if (name === 'cashier_operational_overview') {
        if (args && ('p_cashier_id' in args || 'p_network_id' in args || 'cashierId' in args)) {
          throw new Error('browser authority leaked into RPC args');
        }
        return OVERVIEW;
      }
      if (name === 'cashier_list_operational_transfers') {
        if (args && ('p_cashier_id' in args || 'p_account_id' in args)) {
          throw new Error('browser authority leaked into transfer RPC');
        }
        return { rows: [], total: 0, limit: 100, offset: 0 };
      }
      return { ok: true, rpc: name };
    },
  });
  return { calls, rpcFactory };
}

async function get(
  pathname: string,
  opts?: { cookie?: string; session?: CashierAuthGatewayPorts },
) {
  const rpc = createRpc();
  const result = await handleCashierControlRequest(
    {
      method: 'GET',
      pathname,
      cookie: opts?.cookie ?? cashierCookie(),
      cookieSecure: true,
    },
    { sessionPorts: opts?.session ?? createAuthPorts(), rpcFactory: rpc.rpcFactory },
  );
  return { result, rpc };
}

describe('cashier same-origin control center', () => {
  it('1-2. cashier finance returns own canonical 3550 balance', async () => {
    const { result, rpc } = await get('/api/cashier/finance');
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'cashier_operational_overview');
    assert.equal(rpc.calls[0]?.token, ACCESS);
    const data = result.body.data as {
      operational: { availableBalance: number; migrationState: string };
      cashier: { cashierId: string; fullName: string };
    };
    assert.equal(data.operational.availableBalance, 3550);
    assert.equal(data.operational.migrationState, 'staging');
    assert.equal(data.cashier.cashierId, CASHIER_ID);
    assert.equal(data.cashier.fullName, 'Азат Мередов');
    assert.equal(JSON.stringify(result.body).includes(SERVICE_ROLE), false);
  });

  it('3-4. foreign cashierId in query is ignored; no browser identity args', async () => {
    const { result, rpc } = await get(
      `/api/cashier/finance?cashierId=${FOREIGN_CASHIER}&networkId=${NETWORK_ID}`,
    );
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'cashier_operational_overview');
    assert.equal(rpc.calls[0]?.args, undefined);
    const data = result.body.data as { cashier: { cashierId: string } };
    assert.equal(data.cashier.cashierId, CASHIER_ID);
  });

  it('5. transfer history only own account', async () => {
    const { result, rpc } = await get('/api/cashier/transfers');
    assert.equal(result.status, 200);
    assert.equal(rpc.calls[0]?.name, 'cashier_list_operational_transfers');
    const data = result.body.data as { rows: unknown[]; total: number };
    assert.equal(data.total, 0);
    assert.deepEqual(data.rows, []);
    assert.equal('p_cashier_id' in (rpc.calls[0]?.args ?? {}), false);
    assert.equal('p_account_id' in (rpc.calls[0]?.args ?? {}), false);
  });

  it('6. Owner cookie rejected', async () => {
    const { result, rpc } = await get('/api/cashier/finance', {
      cookie: `${OWNER_ACCESS_COOKIE}=owner-access; ${OWNER_REFRESH_COOKIE}=owner-refresh`,
    });
    assert.equal(result.status, 401);
    assert.equal(rpc.calls.length, 0);
  });

  it('7. Manager cookie rejected', async () => {
    const { result, rpc } = await get('/api/cashier/finance', {
      cookie: `${MANAGER_ACCESS_COOKIE}=manager-access; ${MANAGER_REFRESH_COOKIE}=manager-refresh`,
    });
    assert.equal(result.status, 401);
    assert.equal(rpc.calls.length, 0);
  });

  it('8. Player rejected', async () => {
    const { result, rpc } = await get('/api/cashier/finance', {
      session: createAuthPorts({
        context: { role: 'player', status: 'active', auth_user_id: 'player-uid' },
      }),
    });
    assert.equal(result.status, 403);
    assert.equal(rpc.calls.length, 0);
  });

  it('9. inactive Cashier rejected', async () => {
    const { result, rpc } = await get('/api/cashier/finance', {
      session: createAuthPorts({ context: { ...CASHIER_CTX, status: 'disabled' } }),
    });
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'STAFF_ACCOUNT_DISABLED');
    assert.equal(rpc.calls.length, 0);
  });

  it('10. missing cookie → 401', async () => {
    const rpc = createRpc();
    const result = await handleCashierControlRequest(
      { method: 'GET', pathname: '/api/cashier/finance', cookieSecure: true },
      { sessionPorts: createAuthPorts(), rpcFactory: rpc.rpcFactory },
    );
    assert.equal(result.status, 401);
    assert.equal(rpc.calls.length, 0);
  });

  it('11. session refresh rotates cookies', async () => {
    const session = createAuthPorts({ accessFailOnce: true });
    const { result, rpc } = await get('/api/cashier/finance', { session });
    assert.equal(result.status, 200);
    assert.equal(session.refreshes[0], REFRESH);
    assert.equal(rpc.calls[0]?.token, ACCESS2);
    const cookies = (result.cookies ?? []).join('\n');
    assert.equal(cookies.includes(ACCESS2), true);
    assert.equal(cookies.includes(REFRESH2), true);
  });

  it('12-13. user JWT used; no service_role business reads', () => {
    const rpcSrc = readFileSync(join(here, 'cashierRpc.ts'), 'utf8');
    assert.match(rpcSrc, /createUserJwtClient/);
    assert.equal(rpcSrc.includes('createServiceRoleClient'), false);
    assert.equal(rpcSrc.includes('service_role'), false);
    const httpSrc = readFileSync(join(here, 'cashierControlHttp.ts'), 'utf8');
    assert.match(httpSrc, /resolveCashierSession/);
    assert.equal(httpSrc.includes('createServiceRoleClient'), false);
  });

  it('14-16. no direct browser Supabase / legacy cashier RPC / deposit-payout disabled', () => {
    const files = [
      ...listFiles(join(root, 'src/cashier')),
      join(root, 'src/screens/MobcashAgentScreen.tsx'),
      join(root, 'src/routes.tsx'),
    ].filter((path) => (path.endsWith('.ts') || path.endsWith('.tsx')) && !path.endsWith('.test.ts'));
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes('supabase.co'), false, file);
      assert.equal(source.includes('signInWithPassword'), false, file);
      assert.equal(source.includes('createClient'), false, file);
      assert.equal(source.includes('cashier_login'), false, file);
      assert.equal(source.includes('cashier_deposit_to_player'), false, file);
      assert.equal(source.includes('cashier_payout_by_code'), false, file);
      assert.equal(source.includes('cashier_shift_history'), false, file);
      assert.equal(source.includes("from '../lib/cashier'"), false, file);
    }
    const screen = readFileSync(join(root, 'src/screens/MobcashAgentScreen.tsx'), 'utf8');
    assert.match(screen, /Financial activation pending/);
    assert.match(screen, /Финансовые операции активны/);
    assert.match(screen, /fetchCashierFinance/);
    assert.match(screen, /postCashierDeposit/);
    assert.match(screen, /\[0-9a-f\]\{16\}/);
    assert.equal(screen.includes('formatTmtm(0)'), false);
  });

  it('17-19. no money RPC, no operational transfer mutation, no migration_state changes', () => {
    const http = readFileSync(join(here, 'cashierControlHttp.ts'), 'utf8');
    assert.match(http, /cashier_operational_overview/);
    assert.match(http, /cashier_list_operational_transfers/);
    assert.equal(http.includes("rpc.invoke('cashier_deposit_to_player')"), false);
    assert.equal(http.includes("rpc.invoke('apply_operational_transfer')"), false);
    assert.equal(http.includes("rpc.invoke('manager_fund_cashier')"), false);
    assert.equal(/PERFORM[\s\S]*apply_operational_transfer/.test(migration), false);
    assert.equal(migration.includes('SET migration_state'), false);
    assert.equal(/UPDATE[\s\S]*migration_state\s*=/.test(migration), false);
    assert.equal(migration.includes('cashier_deposit_to_player'), false);
    assert.deepEqual([...CANONICAL_CASHIER_READ_RPCS], [
      'cashier_operational_overview',
      'cashier_list_operational_transfers',
    ]);
  });

  it('20. UI does not fake 0 balance when finance API unavailable', () => {
    const screen = readFileSync(join(root, 'src/screens/MobcashAgentScreen.tsx'), 'utf8');
    assert.match(screen, /недоступен/);
    assert.match(screen, /Баланс недоступен/);
    assert.equal(screen.includes('formatTmtm(0)'), false);
    const services = readFileSync(join(root, 'src/cashier/services.ts'), 'utf8');
    assert.match(services, /availableBalance/);
    assert.match(services, /numOrNull/);
  });

  it('GET /api/cashier/me returns safe staff only', async () => {
    const { result, rpc } = await get('/api/cashier/me');
    assert.equal(result.status, 200);
    assert.equal(rpc.calls.length, 0);
    const staff = result.body.staff as Record<string, unknown>;
    assert.equal(staff.role, 'cashier');
    assert.equal(staff.legacyCashierId, CASHIER_ID);
    assert.equal('accessToken' in result.body, false);
  });
});

describe('cashier operational read SQL contract (not executed)', () => {
  it('creates read-only cashier RPCs from auth.uid()', () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION private\.get_current_cashier_context\(\)/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.cashier_operational_overview\(\)/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.cashier_list_operational_transfers\(/);
    assert.match(migration, /v_uid := auth\.uid\(\)/);
    assert.match(migration, /a\.available_balance/);
    assert.match(migration, /legacy_float_diagnostic/);
    assert.equal(migration.includes('FOR UPDATE'), false);
    assert.equal(migration.includes('p_cashier_id'), false);
    assert.equal(migration.includes('p_network_id'), false);
  });

  it('scopes transfers to own operational account only', () => {
    assert.match(migration, /t\.from_account_id = v_account/);
    assert.match(migration, /t\.to_account_id = v_account/);
    assert.equal(migration.includes('metadata'), false);
  });

  it('grants authenticated EXECUTE and revokes anon/PUBLIC; no private table grants', () => {
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.cashier_operational_overview\(\) FROM PUBLIC/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.cashier_operational_overview\(\) FROM anon/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.cashier_operational_overview\(\) TO authenticated/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.cashier_list_operational_transfers\(INTEGER, INTEGER\) TO authenticated/);
    assert.equal(/GRANT[\s\S]*ON TABLE private\.operational_accounts[\s\S]*TO authenticated/.test(migration), false);
    assert.equal(/GRANT[\s\S]*ON TABLE private\.staff_accounts[\s\S]*TO authenticated/.test(migration), false);
    assert.equal(/GRANT[\s\S]*ON TABLE private\.operational_transfers[\s\S]*TO authenticated/.test(migration), false);
    assert.equal(/GRANT[\s\S]*ON TABLE private\.operational_ledger[\s\S]*TO authenticated/.test(migration), false);
  });
});
