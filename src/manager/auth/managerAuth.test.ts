import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  MANAGER_AUTH_LOGIN_PATH,
  MANAGER_AUTH_LOGOUT_PATH,
  MANAGER_AUTH_SESSION_PATH,
  MANAGER_AUTH_STORAGE_KEY,
  clearManagerAuthStorage,
  loginManagerViaGateway,
  logoutManagerViaGateway,
  managerOfficeSession,
  restoreManagerViaGateway,
} from './managerAuth';

const here = dirname(fileURLToPath(import.meta.url));
const managerRoot = join(here, '..');
const repoRoot = join(here, '../../..');

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return [path];
  });
}

describe('manager browser same-origin auth', () => {
  it('login/session/logout call only same-origin APIs', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === MANAGER_AUTH_LOGIN_PATH || url === MANAGER_AUTH_SESSION_PATH) {
        return new Response(JSON.stringify({
          ok: true,
          staff: {
            authUserId: 'manager-uid',
            role: 'manager',
            status: 'active',
            displayName: 'Manager 01',
            networkId: '11111111-1111-1111-1111-111111111111',
            legacyManagerAccountId: 'ccc5f5ad-079e-4420-9080-e7ded4ff9496',
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const staff = await loginManagerViaGateway(fetchFn, 'xlittm51@gmail.com', 'secret-password');
    assert.equal(staff.role, 'manager');
    assert.equal(calls[0]?.url, MANAGER_AUTH_LOGIN_PATH);
    assert.equal(calls[0]?.init?.credentials, 'include');
    assert.equal(String(calls[0]?.init?.body ?? '').includes('secret-password'), true);

    const restored = await restoreManagerViaGateway(fetchFn);
    assert.equal(restored?.role, 'manager');
    assert.equal(calls[1]?.url, MANAGER_AUTH_SESSION_PATH);

    await logoutManagerViaGateway(fetchFn);
    assert.equal(calls[2]?.url, MANAGER_AUTH_LOGOUT_PATH);

    const session = managerOfficeSession(staff);
    assert.equal(session.role, 'manager');
    assert.equal(session.id, 'ccc5f5ad-079e-4420-9080-e7ded4ff9496');
    assert.equal(session.networkId, '11111111-1111-1111-1111-111111111111');
  });

  it('unauthorized session restore is empty, not a browser Supabase session', async () => {
    const fetchFn: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: false, error: 'JWT_REQUIRED' }), { status: 401 });
    const restored = await restoreManagerViaGateway(fetchFn);
    assert.equal(restored, null);
  });

  it('logout clears leftover browser manager storage keys', () => {
    const store: Record<string, string> = {
      [MANAGER_AUTH_STORAGE_KEY]: 'stale',
      'nextpari-manager-session': '{}',
    };
    clearManagerAuthStorage({
      removeItem(key) {
        delete store[key];
      },
    });
    assert.equal(store[MANAGER_AUTH_STORAGE_KEY], undefined);
    assert.equal(store['nextpari-manager-session'], undefined);
  });

  it('auth modules do not call Supabase from the browser', () => {
    for (const file of listFiles(join(managerRoot, 'auth')).filter((path) => !path.endsWith('.test.ts'))) {
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes('signInWithPassword'), false, file);
      assert.equal(source.includes('createClient'), false, file);
      assert.equal(source.includes('supabase.co'), false, file);
      assert.equal(source.includes('.rpc('), false, file);
    }
    const layout = readFileSync(join(repoRoot, 'src/pages/manager/ManagerOfficeLayout.tsx'), 'utf8');
    assert.match(layout, /\/api\/manager\/auth\/login|loginManagerViaGateway|useManagerAuth/);
    assert.equal(layout.includes('networkManagerLogin'), false);
    assert.equal(layout.includes('1111'), false);
  });
});
