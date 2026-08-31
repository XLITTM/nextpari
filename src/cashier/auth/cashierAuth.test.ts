import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CASHIER_AUTH_LOGIN_PATH,
  CASHIER_AUTH_LOGOUT_PATH,
  CASHIER_AUTH_SESSION_PATH,
  CASHIER_AUTH_STORAGE_KEY,
  clearCashierAuthStorage,
  loginCashierViaGateway,
  logoutCashierViaGateway,
  restoreCashierViaGateway,
} from './cashierAuth';

const here = dirname(fileURLToPath(import.meta.url));
const cashierRoot = join(here, '..');
const repoRoot = join(here, '../../..');

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return [path];
  });
}

const STAFF = {
  role: 'cashier' as const,
  status: 'active' as const,
  displayName: 'agent01',
  networkId: '11111111-1111-1111-1111-111111111111',
  legacyCashierId: '0393d651-e13a-4f04-ba7d-352f63bc62a5',
};

describe('cashier browser same-origin auth', () => {
  it('login/session/logout call only same-origin APIs', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === CASHIER_AUTH_LOGIN_PATH || url === CASHIER_AUTH_SESSION_PATH) {
        return new Response(JSON.stringify({ ok: true, staff: STAFF }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const staff = await loginCashierViaGateway(fetchFn, 'agent01@gmail.com', 'secret-password');
    assert.equal(staff.role, 'cashier');
    assert.equal(staff.legacyCashierId, STAFF.legacyCashierId);
    assert.equal(calls[0]?.url, CASHIER_AUTH_LOGIN_PATH);
    assert.equal(calls[0]?.init?.credentials, 'include');
    assert.equal(String(calls[0]?.init?.body ?? '').includes('secret-password'), true);

    const restored = await restoreCashierViaGateway(fetchFn);
    assert.equal(restored?.role, 'cashier');
    assert.equal(calls[1]?.url, CASHIER_AUTH_SESSION_PATH);

    await logoutCashierViaGateway(fetchFn);
    assert.equal(calls[2]?.url, CASHIER_AUTH_LOGOUT_PATH);
  });

  it('unauthorized session restore is empty, not a browser Supabase session', async () => {
    const fetchFn: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: false, error: 'JWT_REQUIRED' }), { status: 401 });
    const restored = await restoreCashierViaGateway(fetchFn);
    assert.equal(restored, null);
  });

  it('logout clears leftover browser cashier storage keys', () => {
    const store: Record<string, string> = {
      [CASHIER_AUTH_STORAGE_KEY]: 'stale',
      'mobcash-cashier-session': '{}',
    };
    clearCashierAuthStorage({
      removeItem(key) {
        delete store[key];
      },
    });
    assert.equal(store[CASHIER_AUTH_STORAGE_KEY], undefined);
    assert.equal(store['mobcash-cashier-session'], undefined);
  });

  it('auth modules do not call Supabase from the browser', () => {
    for (const file of listFiles(join(cashierRoot, 'auth')).filter((path) => !path.endsWith('.test.ts'))) {
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes('signInWithPassword'), false, file);
      assert.equal(source.includes('createClient'), false, file);
      assert.equal(source.includes('supabase.co'), false, file);
      assert.equal(source.includes('.rpc('), false, file);
    }
    const screen = readFileSync(join(repoRoot, 'src/screens/MobcashAgentScreen.tsx'), 'utf8');
    assert.match(screen, /useCashierAuth|loginCashierViaGateway/);
    assert.equal(screen.includes('cashierLogin'), false);
    assert.equal(screen.includes('1234'), false);
    assert.equal(screen.includes('Financial activation pending'), true);
    assert.equal(screen.includes("from '../lib/cashier'"), false);
    assert.equal(screen.includes('supabase'), false);
  });
});
