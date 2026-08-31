import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  OWNER_AUTH_LOGIN_PATH,
  OWNER_AUTH_LOGOUT_PATH,
  OWNER_AUTH_SESSION_PATH,
  OWNER_AUTH_STORAGE_KEY,
  clearOwnerAuthStorage,
  loginOwnerViaGateway,
  logoutOwnerViaGateway,
  restoreOwnerViaGateway,
} from './ownerAuth';

const here = dirname(fileURLToPath(import.meta.url));
const ownerRoot = join(here, '..');

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return [path];
  });
}

describe('owner browser same-origin auth', () => {
  it('login/session/logout call only same-origin APIs', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === OWNER_AUTH_LOGIN_PATH) {
        return new Response(JSON.stringify({
          ok: true,
          staff: {
            authUserId: 'owner-uid',
            role: 'owner',
            status: 'active',
            displayName: 'Owner',
            networkId: null,
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === OWNER_AUTH_SESSION_PATH) {
        return new Response(JSON.stringify({
          ok: true,
          staff: {
            authUserId: 'owner-uid',
            role: 'owner',
            status: 'active',
            displayName: 'Owner',
            networkId: null,
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const staff = await loginOwnerViaGateway(fetchFn, 'xlittm06@gmail.com', 'secret-password');
    assert.equal(staff.role, 'owner');
    assert.equal(calls[0]?.url, OWNER_AUTH_LOGIN_PATH);
    assert.equal(calls[0]?.init?.credentials, 'include');
    assert.equal(String(calls[0]?.init?.body ?? '').includes('secret-password'), true);

    const restored = await restoreOwnerViaGateway(fetchFn);
    assert.equal(restored?.role, 'owner');
    assert.equal(calls[1]?.url, OWNER_AUTH_SESSION_PATH);

    await logoutOwnerViaGateway(fetchFn);
    assert.equal(calls[2]?.url, OWNER_AUTH_LOGOUT_PATH);
  });

  it('unauthorized session restore is empty, not a browser Supabase session', async () => {
    const fetchFn: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: false, error: 'JWT_REQUIRED' }), { status: 401 });
    const restored = await restoreOwnerViaGateway(fetchFn);
    assert.equal(restored, null);
  });

  it('logout clears leftover browser owner storage keys', () => {
    const store: Record<string, string> = {
      [OWNER_AUTH_STORAGE_KEY]: 'stale',
      'nextpari-owner-session': '{}',
    };
    clearOwnerAuthStorage({
      removeItem(key) {
        delete store[key];
      },
    });
    assert.equal(store[OWNER_AUTH_STORAGE_KEY], undefined);
  });

  it('no PIN login remains on Owner portal', () => {
    const sources = listFiles(ownerRoot)
      .filter((path) => (path.endsWith('.ts') || path.endsWith('.tsx')) && !path.endsWith('.test.ts'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    assert.equal(sources.includes('ownerLogin('), false);
    assert.equal(sources.includes('PIN 0000'), false);
    assert.match(sources, /\/api\/owner\/auth\/login/);
  });

  it('auth modules do not call Supabase from the browser', () => {
    const authDir = join(ownerRoot, 'auth');
    for (const file of listFiles(authDir).filter((path) => !path.endsWith('.test.ts'))) {
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes('signInWithPassword'), false, file);
      assert.equal(source.includes('ownerSupabase'), false, file);
      assert.equal(source.includes('createClient'), false, file);
    }
  });
});

export const OWNER_CONTROL_API_ROUTES = [
  '/api/owner/dashboard',
  '/api/owner/cashiers',
  '/api/owner/risk-bets',
  '/api/owner/players',
  '/api/owner/withdrawals',
  '/api/owner/messages',
  '/api/owner/managers',
] as const;

describe('Owner control center browser services use same-origin APIs', () => {
  it('services.ts no longer calls Supabase RPCs from the browser', () => {
    const services = readFileSync(join(ownerRoot, 'services.ts'), 'utf8');
    assert.equal(services.includes('ownerSupabase'), false);
    assert.equal(services.includes('.rpc('), false);
    assert.match(services, /credentials: 'same-origin'/);
    for (const route of OWNER_CONTROL_API_ROUTES) {
      assert.equal(services.includes(route), true, route);
    }
  });
});
