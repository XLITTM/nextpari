import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import {
  PLAYER_AUTH_CHANGE_PASSWORD_PATH,
  PLAYER_AUTH_LOGIN_PATH,
  handlePlayerAuthRequest,
} from './playerAuthHttp.js';
import type { PlayerAuthGatewayPorts } from './playerAuthService.js';
import { PLAYER_ACCESS_COOKIE, PLAYER_REFRESH_COOKIE } from './playerCookies.js';

const ACCESS = 'player-access-token';
const REFRESH = 'player-refresh-token';
const REAUTH_ACCESS = 'player-reauth-access';
const REAUTH_REFRESH = 'player-reauth-refresh';
const WALLET_UUID = '11111111-2222-3333-4444-555555555555';
const PLAYER_EMAIL = 'player@nextpari.test';
const INTERNAL_EMAIL = 'aabbccddeeff0011@auth.nextpari.invalid';
const CURRENT = 'password1';
const NEXT = 'password2';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

function playerCookieHeader(access?: string | null, refresh?: string | null): string {
  const parts: string[] = [];
  if (access) parts.push(`${PLAYER_ACCESS_COOKIE}=${encodeURIComponent(access)}`);
  if (refresh) parts.push(`${PLAYER_REFRESH_COOKIE}=${encodeURIComponent(refresh)}`);
  return parts.join('; ');
}

function createPorts(init?: {
  sessionEmail?: string;
  sessionId?: string;
  reauthId?: string;
  signInError?: boolean;
  updateError?: 'policy' | 'fail';
  missingUser?: boolean;
}): PlayerAuthGatewayPorts & {
  signIns: Array<{ email: string; password: string }>;
  passwordUpdates: Array<{ accessToken: string; refreshToken: string; newPassword: string }>;
  ensureTokens: string[];
  walletLoads: number;
  signOuts: number;
} {
  const signIns: Array<{ email: string; password: string }> = [];
  const passwordUpdates: Array<{ accessToken: string; refreshToken: string; newPassword: string }> = [];
  const ensureTokens: string[] = [];
  let walletLoads = 0;
  let signOuts = 0;
  const sessionId = init?.sessionId ?? 'auth-user-1';
  const reauthId = init?.reauthId ?? sessionId;
  const sessionEmail = init?.sessionEmail ?? PLAYER_EMAIL;
  return {
    signIns,
    passwordUpdates,
    ensureTokens,
    get walletLoads() { return walletLoads; },
    get signOuts() { return signOuts; },
    async signInWithPassword(email, password) {
      signIns.push({ email, password });
      if (init?.signInError) throw staffError('AUTH_FAILED', 401);
      return { accessToken: REAUTH_ACCESS, refreshToken: REAUTH_REFRESH };
    },
    async signUp() {
      throw new Error('signUp should not run');
    },
    async refreshSession() {
      throw staffError('JWT_INVALID', 401);
    },
    async getAuthUser(accessToken) {
      if (init?.missingUser) throw staffError('AUTH_REQUIRED', 401);
      if (accessToken === REAUTH_ACCESS) {
        return { id: reauthId, email: sessionEmail };
      }
      assert.equal(accessToken, ACCESS);
      return { id: sessionId, email: sessionEmail };
    },
    async ensurePlayerAccount(accessToken) {
      ensureTokens.push(accessToken);
      return { walletId: WALLET_UUID, publicId: '110790', legacyBalance: 0, migrationState: 'active' };
    },
    async loadOwnWallet() {
      walletLoads += 1;
      return { balance: 0, currency: 'TMTM', status: 'active', publicId: '110790' };
    },
    async savePlayerProfile() {
      throw new Error('savePlayerProfile should not run');
    },
    async updatePassword(accessToken, refreshToken, newPassword) {
      passwordUpdates.push({ accessToken, refreshToken, newPassword });
      if (init?.updateError === 'policy') throw staffError('PASSWORD_POLICY_INVALID', 400);
      if (init?.updateError === 'fail') throw staffError('PASSWORD_CHANGE_FAILED', 503);
    },
    async signOut() {
      signOuts += 1;
    },
  };
}

describe('player change password HTTP', () => {
  it('authenticated player can change password after current password is verified', async () => {
    const ports = createPorts();
    const result = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_CHANGE_PASSWORD_PATH,
        cookie: playerCookieHeader(ACCESS, REFRESH),
        cookieSecure: true,
        body: { currentPassword: CURRENT, newPassword: NEXT },
      },
      ports,
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.deepEqual(ports.signIns, [{ email: PLAYER_EMAIL, password: CURRENT }]);
    assert.deepEqual(ports.passwordUpdates, [{
      accessToken: REAUTH_ACCESS,
      refreshToken: REAUTH_REFRESH,
      newPassword: NEXT,
    }]);
    assert.equal(ports.signOuts, 1);
    assert.equal(ports.ensureTokens.length, 0);
    assert.equal(ports.walletLoads, 0);
    assert.equal(JSON.stringify(result.body).includes(CURRENT), false);
    assert.equal(JSON.stringify(result.body).includes(NEXT), false);
    assert.equal(JSON.stringify(result.body).includes(PLAYER_EMAIL), false);
    assert.equal('currentPassword' in result.body, false);
    assert.equal('newPassword' in result.body, false);
    assert.equal((result.cookies ?? []).every((row) => /Max-Age=0/.test(row)), true);
  });

  it('requires current password and rejects the wrong one before update', async () => {
    const missing = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_CHANGE_PASSWORD_PATH,
        cookie: playerCookieHeader(ACCESS, REFRESH),
        body: { newPassword: NEXT },
      },
      createPorts(),
    );
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error, 'CURRENT_PASSWORD_INVALID');

    const ports = createPorts({ signInError: true });
    const wrong = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_CHANGE_PASSWORD_PATH,
        cookie: playerCookieHeader(ACCESS, REFRESH),
        body: { currentPassword: 'wrongpass', newPassword: NEXT },
      },
      ports,
    );
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.error, 'CURRENT_PASSWORD_INVALID');
    assert.equal(ports.passwordUpdates.length, 0);
    assert.deepEqual(ports.signIns, [{ email: PLAYER_EMAIL, password: 'wrongpass' }]);
  });

  it('rejects new password equal to current and short new passwords', async () => {
    const same = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_CHANGE_PASSWORD_PATH,
        cookie: playerCookieHeader(ACCESS, REFRESH),
        body: { currentPassword: CURRENT, newPassword: CURRENT },
      },
      createPorts(),
    );
    assert.equal(same.status, 400);
    assert.equal(same.body.error, 'PASSWORD_SAME_AS_CURRENT');

    const ports = createPorts();
    const short = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_CHANGE_PASSWORD_PATH,
        cookie: playerCookieHeader(ACCESS, REFRESH),
        body: { currentPassword: CURRENT, newPassword: 'short' },
      },
      ports,
    );
    assert.equal(short.status, 400);
    assert.equal(short.body.error, 'PASSWORD_POLICY_INVALID');
    assert.equal(ports.signIns.length, 0);
    assert.equal(ports.passwordUpdates.length, 0);
  });

  it('ignores browser-supplied user id, email, phone, and player id', async () => {
    const ports = createPorts({ sessionEmail: INTERNAL_EMAIL });
    const result = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_CHANGE_PASSWORD_PATH,
        cookie: playerCookieHeader(ACCESS, REFRESH),
        body: {
          currentPassword: CURRENT,
          newPassword: NEXT,
          userId: 'injected-user',
          authUserId: 'injected-auth',
          email: 'attacker@example.com',
          phone: '+99365000000',
          playerId: '000000',
        },
      },
      ports,
    );
    assert.equal(result.status, 200);
    assert.deepEqual(ports.signIns, [{ email: INTERNAL_EMAIL, password: CURRENT }]);
    assert.equal(ports.signIns[0]?.email.includes('attacker'), false);
    assert.equal(ports.signIns[0]?.email.includes('000000'), false);
  });

  it('rejects when re-authenticated user does not match the session user', async () => {
    const ports = createPorts({ reauthId: 'other-user' });
    const result = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_CHANGE_PASSWORD_PATH,
        cookie: playerCookieHeader(ACCESS, REFRESH),
        body: { currentPassword: CURRENT, newPassword: NEXT },
      },
      ports,
    );
    assert.equal(result.status, 401);
    assert.equal(result.body.error, 'CURRENT_PASSWORD_INVALID');
    assert.equal(ports.passwordUpdates.length, 0);
  });

  it('requires a player session and does not invent identifiers', async () => {
    const result = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_CHANGE_PASSWORD_PATH,
        body: { currentPassword: CURRENT, newPassword: NEXT },
      },
      createPorts(),
    );
    assert.equal(result.status, 401);
    assert.equal(result.body.error, 'SESSION_REQUIRED');
  });
});

describe('player change password contract', () => {
  it('does not persist or log plaintext passwords and has no database migration', () => {
    const service = readFileSync(join(root, 'server/player/playerAuthService.ts'), 'utf8');
    const http = readFileSync(join(root, 'server/player/playerAuthHttp.ts'), 'utf8');
    const client = readFileSync(join(root, 'src/lib/playerAuth.ts'), 'utf8');
    const settings = readFileSync(join(root, 'src/screens/SettingsScreen.tsx'), 'utf8');
    const live = service.slice(service.indexOf('async updatePassword'), service.indexOf('async signOut'));
    assert.match(live, /updateUser\(\{ password: newPassword \}\)/);
    assert.equal(live.includes('auth.users'), false);
    assert.equal(live.includes('encrypted_password'), false);
    assert.equal(/log\.(error|info|warn)\([\s\S]{0,80}password/.test(service), false);
    assert.equal(client.includes('console.log'), false);
    assert.equal(settings.includes('console.log'), false);
    const handler = http.slice(http.indexOf('if (path === PLAYER_AUTH_CHANGE_PASSWORD_PATH'));
    const nextRoute = handler.indexOf('if (path === PLAYER_ME_PATH');
    const changeBlock = nextRoute >= 0 ? handler.slice(0, nextRoute) : handler;
    assert.match(changeBlock, /currentPassword: String\(body\.currentPassword/);
    assert.match(changeBlock, /newPassword: String\(body\.newPassword/);
    assert.equal(changeBlock.includes('body.userId'), false);
    assert.equal(changeBlock.includes('body.email'), false);
    assert.equal(changeBlock.includes('body.phone'), false);
    assert.equal(changeBlock.includes('body.playerId'), false);
    const migrations = readdirSync(join(root, 'supabase/migrations'));
    assert.equal(migrations.some((name) => name.includes('change_password') || name.includes('_044.sql')), false);
  });

  it('preserves existing login modes and does not touch staff or money routes', () => {
    const login = readFileSync(join(root, 'server/player/playerAuthService.ts'), 'utf8');
    assert.match(login, /export async function loginPlayerWithPassword/);
    assert.match(login, /mode === 'phone'/);
    assert.match(login, /mode === 'identifier'/);
    assert.match(login, /parseLoginPlayerId/);
    assert.match(login, /method === 'one_click'/);
    assert.match(login, /PLAYER_AUTH_LOGIN_PATH|signInWithPassword/);
    const owner = readFileSync(join(root, 'server/staff/ownerAuthHttp.ts'), 'utf8');
    const manager = readFileSync(join(root, 'server/staff/managerAuthHttp.ts'), 'utf8');
    const cashier = readFileSync(join(root, 'server/staff/cashierAuthHttp.ts'), 'utf8');
    assert.equal(owner.includes('change-password'), false);
    assert.equal(manager.includes('change-password'), false);
    assert.equal(cashier.includes('change-password'), false);
    const changeFn = login.slice(login.indexOf('export async function changePlayerPassword'), login.indexOf('export async function logoutPlayerSession'));
    assert.equal(changeFn.includes('ensurePlayerAccount'), false);
    assert.equal(changeFn.includes('loadOwnWallet'), false);
    assert.equal(changeFn.includes('apply_operational_transfer'), false);
    assert.equal(changeFn.includes('apply_wallet_entry'), false);
  });

  it('login path is still registered separately from change-password', async () => {
    const ports = createPorts();
    const result = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_LOGIN_PATH,
        body: { email: PLAYER_EMAIL, password: CURRENT },
      },
      {
        ...ports,
        async signInWithPassword(email, password) {
          ports.signIns.push({ email, password });
          return { accessToken: ACCESS, refreshToken: REFRESH };
        },
        async getAuthUser() {
          return { id: 'auth-user-1', email: PLAYER_EMAIL };
        },
      },
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.authenticated, true);
  });
});
