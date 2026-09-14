import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  SECURITY_AUTH_LOGIN_PATH,
  SECURITY_AUTH_LOGOUT_PATH,
  SECURITY_AUTH_ME_PATH,
  SECURITY_AUTH_STORAGE_KEY,
  clearSecurityAuthStorage,
  loginSecurityViaGateway,
  logoutSecurityViaGateway,
  restoreSecurityViaGateway,
} from './securityAuth';

const here = dirname(fileURLToPath(import.meta.url));
const securityRoot = join(here, '..');

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return [path];
  });
}

const STAFF = {
  authUserId: 'sec-uid-1',
  role: 'security' as const,
  status: 'active' as const,
  displayName: 'Security One',
  login: 'security01',
};

describe('security browser same-origin auth', () => {
  it('login/me/logout call only same-origin Security APIs', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === SECURITY_AUTH_LOGIN_PATH || url === SECURITY_AUTH_ME_PATH) {
        return new Response(JSON.stringify({ ok: true, staff: STAFF }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const staff = await loginSecurityViaGateway(fetchFn, 'security01', 'secret-password');
    assert.equal(staff.role, 'security');
    assert.equal(calls[0]?.url, SECURITY_AUTH_LOGIN_PATH);
    assert.equal(calls[0]?.init?.credentials, 'include');
    assert.equal(String(calls[0]?.init?.body ?? '').includes('"login":"security01"'), true);
    assert.equal(String(calls[0]?.init?.body ?? '').includes('email'), false);

    const restored = await restoreSecurityViaGateway(fetchFn);
    assert.equal(restored?.role, 'security');
    assert.equal(calls[1]?.url, SECURITY_AUTH_ME_PATH);

    await logoutSecurityViaGateway(fetchFn);
    assert.equal(calls[2]?.url, SECURITY_AUTH_LOGOUT_PATH);
  });

  it('unauthorized restore is empty, not a browser Supabase session', async () => {
    const fetchFn: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: false, error: 'JWT_REQUIRED' }), { status: 401 });
    const restored = await restoreSecurityViaGateway(fetchFn);
    assert.equal(restored, null);
  });

  it('logout clears leftover browser security storage keys', () => {
    const store: Record<string, string> = {
      [SECURITY_AUTH_STORAGE_KEY]: 'stale',
    };
    clearSecurityAuthStorage({
      removeItem(key) {
        delete store[key];
      },
    });
    assert.equal(store[SECURITY_AUTH_STORAGE_KEY], undefined);
  });

  it('SECURITY PORTAL uses dedicated login fields and same-origin APIs only', () => {
    const sources = listFiles(securityRoot)
      .filter((path) => (path.endsWith('.ts') || path.endsWith('.tsx')) && !path.endsWith('.test.ts'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    assert.match(sources, /Логин/);
    assert.match(sources, /Пароль/);
    assert.match(sources, /\/api\/security\/auth\/login/);
    assert.match(sources, /\/api\/security\/overview/);
    assert.match(sources, /\/api\/security\/flags/);
    assert.match(sources, /fetchSecuritySportsBets/);
    assert.equal(sources.includes('/api/owner/'), false);
    assert.equal(sources.includes('/api/manager/'), false);
    assert.equal(sources.includes('/api/cashier/'), false);
    assert.equal(sources.includes('owner_set_player_blocked'), false);
    assert.equal(sources.includes('signInWithPassword'), false);
    assert.equal(sources.includes('createClient'), false);
    assert.equal(sources.includes('@auth.nextpari.invalid'), false);
  });
});
