import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  OWNER_AUTH_STORAGE_KEY,
  authenticateOwnerWithPassword,
  assertActiveOwnerContext,
  clearOwnerAuthStorage,
  ownerPortalUsesPlayerStorage,
  restoreOwnerStaffSession,
  signOutOwner,
  type OwnerAuthPorts,
} from './ownerAuth';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '../..');
const ownerRoot = join(here, '..');

const OWNER_CTX = {
  auth_user_id: 'owner-auth-id',
  role: 'owner',
  status: 'active',
  display_name: 'Owner',
  network_id: null,
};

function createPorts(init?: {
  session?: { access_token: string } | null;
  signInError?: string;
  context?: unknown;
  contextError?: Error;
}) {
  let session = init?.session ?? null;
  const state = {
    signedOut: false,
    signInCalls: [] as Array<{ email: string; password: string }>,
    contextCalls: 0,
  };
  const ports: OwnerAuthPorts = {
    async signInWithPassword(input) {
      state.signInCalls.push(input);
      if (init?.signInError) return { session: null, error: { message: init.signInError } };
      session = { access_token: 'owner-jwt-token' };
      return { session, error: null };
    },
    async signOut() {
      session = null;
      state.signedOut = true;
    },
    async getSession() {
      return session;
    },
    async currentStaffContext() {
      state.contextCalls += 1;
      if (init?.contextError) throw init.contextError;
      return init?.context ?? OWNER_CTX;
    },
  };
  return { ports, state };
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return [path];
  });
}

describe('owner canonical auth', () => {
  it('1. owner email/password sign-in yields isolated JWT + active owner context', async () => {
    const { ports, state } = createPorts();
    const result = await authenticateOwnerWithPassword(
      ports,
      'xlittm06@gmail.com',
      'secret-password',
    );
    assert.equal(result.staff.role, 'owner');
    assert.equal(result.staff.status, 'active');
    assert.equal(result.accessToken, 'owner-jwt-token');
    assert.equal(state.signInCalls[0]?.email, 'xlittm06@gmail.com');
    assert.equal(state.signInCalls[0]?.password, 'secret-password');
    assert.equal(state.contextCalls, 1);
  });

  it('2. valid auth but non-owner is rejected and signed out', async () => {
    const { ports, state } = createPorts({
      context: { auth_user_id: 'mgr', role: 'manager', status: 'active' },
    });
    await assert.rejects(
      () => authenticateOwnerWithPassword(ports, 'manager@example.com', 'secret-password'),
      /OWNER_REQUIRED/,
    );
    assert.equal(state.signedOut, true);
  });

  it('3. inactive owner is rejected and signed out', async () => {
    const { ports, state } = createPorts({
      context: { auth_user_id: 'owner-auth-id', role: 'owner', status: 'disabled' },
    });
    await assert.rejects(
      () => authenticateOwnerWithPassword(ports, 'xlittm06@gmail.com', 'secret-password'),
      /STAFF_ACCOUNT_DISABLED/,
    );
    assert.equal(state.signedOut, true);
  });

  it('4. owner session reload restores session and rechecks current_staff_context', async () => {
    const { ports, state } = createPorts({ session: { access_token: 'restored-owner-jwt' } });
    const restored = await restoreOwnerStaffSession(ports);
    assert.equal(restored?.accessToken, 'restored-owner-jwt');
    assert.equal(restored?.staff.role, 'owner');
    assert.equal(state.contextCalls, 1);
  });

  it('5. logout removes owner session', async () => {
    const store: Record<string, string> = {
      [OWNER_AUTH_STORAGE_KEY]: 'owner-session-blob',
      'nextpari-owner-session': '{"role":"superadmin"}',
    };
    const { ports, state } = createPorts({ session: { access_token: 'owner-jwt-token' } });
    await signOutOwner(ports);
    clearOwnerAuthStorage({
      removeItem(key) {
        delete store[key];
      },
    });
    assert.equal(state.signedOut, true);
    assert.equal(store[OWNER_AUTH_STORAGE_KEY], undefined);
    const after = await restoreOwnerStaffSession(ports);
    assert.equal(after, null);
  });

  it('6. no PIN login remains on Owner portal', () => {
    const sources = listFiles(ownerRoot)
      .filter((path) => (path.endsWith('.ts') || path.endsWith('.tsx')) && !path.endsWith('.test.ts'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    const routed = readFileSync(join(srcRoot, 'screens/ManagerDashboardScreen.tsx'), 'utf8');
    const routes = readFileSync(join(srcRoot, 'routes.tsx'), 'utf8');
    assert.equal(sources.includes('ownerLogin('), false);
    assert.equal(sources.includes('loadOwnerSession('), false);
    assert.equal(routed.includes('ownerLogin'), false);
    assert.match(routes, /OwnerAuthProvider/);
    assert.match(sources, /signInWithPassword/);
  });

  it('7. no PIN 0000 appears in owner portal', () => {
    const files = [
      ...listFiles(ownerRoot),
      join(srcRoot, 'screens/ManagerDashboardScreen.tsx'),
      join(srcRoot, 'routes.tsx'),
    ];
    for (const file of files) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
      if (file.endsWith('.test.ts')) continue;
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes('PIN 0000'), false, file);
      assert.equal(source.includes('PIN <span'), false, file);
      assert.equal(/pin:\s*['"]0000['"]/.test(source), false, file);
    }
  });

  it('8. player auth storage does not authenticate Owner portal', async () => {
    assert.equal(OWNER_AUTH_STORAGE_KEY, 'nextpari-owner-auth-v1');
    assert.equal(ownerPortalUsesPlayerStorage(OWNER_AUTH_STORAGE_KEY, 'nextpari-auth'), false);
    assert.equal(
      ownerPortalUsesPlayerStorage(OWNER_AUTH_STORAGE_KEY, 'sb-project-auth-token'),
      false,
    );
    const { ports, state } = createPorts({ session: null });
    const restored = await restoreOwnerStaffSession(ports);
    assert.equal(restored, null);
    assert.equal(state.contextCalls, 0);
  });

  it('9. owner protected RPC uses Owner JWT client', () => {
    const services = readFileSync(join(ownerRoot, 'services.ts'), 'utf8');
    assert.match(services, /from '\.\/auth\/ownerSupabase'/);
    assert.match(services, /ownerSupabase\.rpc\('current_staff_context'\)/);
    assert.match(services, /ownerSupabase\.rpc\('owner_dashboard_stats'\)/);
    assert.equal(services.includes("from '../lib/supabase'"), false);
    assert.equal(services.includes('createServiceRoleClient'), false);
    const rpcCalls = [...services.matchAll(/(\w+)\.rpc\(/g)].map((match) => match[1]);
    assert.ok(rpcCalls.length > 0);
    assert.equal(rpcCalls.every((name) => name === 'ownerSupabase'), true, rpcCalls.join(','));
  });

  it('10. no service_role in browser owner modules', () => {
    const files = listFiles(ownerRoot).filter((path) =>
      (path.endsWith('.ts') || path.endsWith('.tsx')) && !path.endsWith('.test.ts'),
    );
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes('SERVICE_ROLE'), false, file);
      assert.equal(source.includes('service_role'), false, file);
    }
  });

  it('blocked owner is rejected', () => {
    assert.throws(
      () => assertActiveOwnerContext({ auth_user_id: 'x', role: 'owner', status: 'blocked' }),
      /STAFF_ACCOUNT_BLOCKED/,
    );
  });
});
