import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import {
  PLAYER_AUTH_LOGIN_PATH,
  PLAYER_AUTH_LOGOUT_PATH,
  PLAYER_AUTH_REGISTER_PATH,
  PLAYER_ME_PATH,
  PLAYER_WALLET_PATH,
  handlePlayerAuthRequest,
} from './playerAuthHttp.js';
import type { PlayerAuthGatewayPorts } from './playerAuthService.js';
import { PLAYER_ACCESS_COOKIE, PLAYER_REFRESH_COOKIE } from './playerCookies.js';

const ACCESS = 'player-access-token';
const REFRESH = 'player-refresh-token';
const ACCESS2 = 'player-access-rotated';
const REFRESH2 = 'player-refresh-rotated';
const WALLET_UUID = '11111111-2222-3333-4444-555555555555';
const PLAYER_EMAIL = 'player@nextpari.test';
const PLAYER_PASSWORD = 'password1';
const PLAYER_PHONE = '+99365123456';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return [path];
  });
}

function playerCookieHeader(access?: string | null, refresh?: string | null): string {
  const parts: string[] = [];
  if (access) parts.push(`${PLAYER_ACCESS_COOKIE}=${encodeURIComponent(access)}`);
  if (refresh) parts.push(`${PLAYER_REFRESH_COOKIE}=${encodeURIComponent(refresh)}`);
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
    sameSiteLax: setCookie.every((row) => /SameSite=Lax/i.test(row)),
    path: setCookie.every((row) => /Path=\//.test(row)),
    secure: setCookie.every((row) => /(?:^|; )Secure(?:;|$)/i.test(row)),
    cleared: setCookie.every((row) => /Max-Age=0/.test(row)),
    hasAccess: setCookie.some((row) => row.startsWith(`${PLAYER_ACCESS_COOKIE}=`)),
    hasRefresh: setCookie.some((row) => row.startsWith(`${PLAYER_REFRESH_COOKIE}=`)),
  };
}

function createPlayerPorts(init?: {
  signInError?: boolean;
  signUpError?: 'confirm' | 'auth' | 'staff';
  refreshError?: boolean;
  userMissing?: boolean;
  walletBalance?: number;
}): PlayerAuthGatewayPorts & {
  signIns: Array<{ email: string; password: string }>;
  signUps: Array<{ email: string; password: string; phone: string }>;
  ensureTokens: string[];
  walletLoads: Array<{ token: string; walletId: string }>;
  signOuts: number;
} {
  const signIns: Array<{ email: string; password: string }> = [];
  const signUps: Array<{ email: string; password: string; phone: string }> = [];
  const ensureTokens: string[] = [];
  const walletLoads: Array<{ token: string; walletId: string }> = [];
  let signOuts = 0;
  return {
    signIns,
    signUps,
    ensureTokens,
    walletLoads,
    get signOuts() { return signOuts; },
    async signInWithPassword(email, password) {
      signIns.push({ email, password });
      if (init?.signInError) throw staffError('AUTH_FAILED', 401);
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async signUp(email, password, phone) {
      signUps.push({ email, password, phone });
      if (init?.signUpError === 'confirm') throw staffError('EMAIL_CONFIRMATION_REQUIRED', 409);
      if (init?.signUpError === 'auth') throw staffError('AUTH_FAILED', 401);
      if (init?.signUpError === 'staff') throw staffError('STAFF_ACCOUNT_CANNOT_PROVISION_PLAYER', 403);
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async refreshSession(refreshToken) {
      if (init?.refreshError) throw staffError('JWT_INVALID', 401);
      assert.equal(refreshToken, REFRESH);
      return { accessToken: ACCESS2, refreshToken: REFRESH2 };
    },
    async getAuthUser(accessToken) {
      if (init?.userMissing) throw staffError('AUTH_REQUIRED', 401);
      assert.ok(accessToken === ACCESS || accessToken === ACCESS2);
      return { id: 'auth-user-1', email: PLAYER_EMAIL };
    },
    async ensurePlayerAccount(accessToken) {
      ensureTokens.push(accessToken);
      if (init?.signUpError === 'staff') {
        throw staffError('STAFF_ACCOUNT_CANNOT_PROVISION_PLAYER', 403);
      }
      return {
        walletId: WALLET_UUID,
        publicId: '110790',
        legacyBalance: init?.walletBalance ?? 0,
        migrationState: 'active',
      };
    },
    async loadOwnWallet(accessToken, walletId) {
      walletLoads.push({ token: accessToken, walletId });
      assert.equal(walletId, WALLET_UUID);
      return {
        balance: init?.walletBalance ?? 0,
        currency: 'TMTM',
        status: 'active',
        publicId: '110790',
      };
    },
    async signOut() {
      signOuts += 1;
    },
  };
}

describe('player same-origin auth gateway', () => {
  it('rejects fake a/a before any auth port call', async () => {
    const ports = createPlayerPorts();
    const result = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: 'a', password: 'a' },
      },
      ports,
    );
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'INVALID_EMAIL');
    assert.deepEqual(ports.signIns, []);
  });

  it('login provisions via user JWT and never returns tokens or wallet UUID', async () => {
    const ports = createPlayerPorts();
    const result = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: PLAYER_EMAIL, password: PLAYER_PASSWORD },
      },
      ports,
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.authenticated, true);
    const player = result.body.player as Record<string, unknown>;
    const wallet = result.body.wallet as Record<string, unknown>;
    assert.equal(player.publicId, '110790');
    assert.equal(player.email, PLAYER_EMAIL);
    assert.equal(wallet.balance, 0);
    assert.equal(wallet.currency, 'TMTM');
    assert.equal(wallet.status, 'active');
    assert.equal(wallet.migrationState, 'active');
    assert.deepEqual(ports.signIns, [{ email: PLAYER_EMAIL, password: PLAYER_PASSWORD }]);
    assert.deepEqual(ports.ensureTokens, [ACCESS]);
    assert.deepEqual(ports.walletLoads, [{ token: ACCESS, walletId: WALLET_UUID }]);
    const cookies = cookieAttrs(result.cookies ?? []);
    assert.equal(cookies.httpOnly, true);
    assert.equal(cookies.sameSiteLax, true);
    assert.equal(cookies.path, true);
    assert.equal(cookies.secure, true);
    assert.equal(cookies.hasAccess, true);
    assert.equal(cookies.hasRefresh, true);
    assert.equal(jsonHasSecrets(result.body, [ACCESS, REFRESH, WALLET_UUID, PLAYER_PASSWORD]), false);
    assert.equal('walletId' in wallet, false);
    assert.equal('wallet_id' in result.body, false);
    assert.equal('accessToken' in result.body, false);
    assert.equal('refreshToken' in result.body, false);
  });

  it('register provisions via user JWT with balance 0', async () => {
    const ports = createPlayerPorts({ walletBalance: 0 });
    const result = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_REGISTER_PATH,
        cookieSecure: true,
        body: { email: PLAYER_EMAIL, password: PLAYER_PASSWORD, phone: PLAYER_PHONE },
      },
      ports,
    );
    assert.equal(result.status, 200);
    assert.deepEqual(ports.signUps, [{
      email: PLAYER_EMAIL,
      password: PLAYER_PASSWORD,
      phone: PLAYER_PHONE,
    }]);
    assert.deepEqual(ports.ensureTokens, [ACCESS]);
    const wallet = result.body.wallet as Record<string, unknown>;
    assert.equal(wallet.balance, 0);
    assert.equal(jsonHasSecrets(result.body, [WALLET_UUID, ACCESS, REFRESH]), false);
  });

  it('returns EMAIL_CONFIRMATION_REQUIRED without cookies when signup has no session', async () => {
    const result = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_REGISTER_PATH,
        cookieSecure: true,
        body: { email: PLAYER_EMAIL, password: PLAYER_PASSWORD, phone: PLAYER_PHONE },
      },
      createPlayerPorts({ signUpError: 'confirm' }),
    );
    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'EMAIL_CONFIRMATION_REQUIRED');
    const cookies = cookieAttrs(result.cookies ?? []);
    assert.equal(cookies.cleared, true);
  });

  it('staff cannot bootstrap player', async () => {
    const ports = createPlayerPorts();
    const originalEnsure = ports.ensurePlayerAccount;
    ports.ensurePlayerAccount = async (token) => {
      ports.ensureTokens.push(token);
      throw staffError('STAFF_ACCOUNT_CANNOT_PROVISION_PLAYER', 403);
    };
    void originalEnsure;
    const result = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: PLAYER_EMAIL, password: PLAYER_PASSWORD },
      },
      ports,
    );
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'STAFF_ACCOUNT_CANNOT_PROVISION_PLAYER');
    const cookies = cookieAttrs(result.cookies ?? []);
    assert.equal(cookies.cleared, true);
  });

  it('GET /api/player/me requires a real session', async () => {
    const missing = await handlePlayerAuthRequest(
      { method: 'GET', pathname: PLAYER_ME_PATH, cookieSecure: true },
      createPlayerPorts(),
    );
    assert.equal(missing.status, 401);
    assert.equal(missing.body.authenticated, false);

    const ok = await handlePlayerAuthRequest(
      {
        method: 'GET',
        pathname: PLAYER_ME_PATH,
        cookie: playerCookieHeader(ACCESS, REFRESH),
        cookieSecure: true,
      },
      createPlayerPorts(),
    );
    assert.equal(ok.status, 200);
    assert.equal(ok.body.authenticated, true);
    assert.equal(jsonHasSecrets(ok.body as Record<string, unknown>, [ACCESS, REFRESH, WALLET_UUID]), false);
  });

  it('GET /api/player/wallet uses the same session snapshot', async () => {
    const result = await handlePlayerAuthRequest(
      {
        method: 'GET',
        pathname: PLAYER_WALLET_PATH,
        cookie: playerCookieHeader(ACCESS, REFRESH),
        cookieSecure: true,
      },
      createPlayerPorts(),
    );
    assert.equal(result.status, 200);
    assert.equal((result.body.wallet as { balance: number }).balance, 0);
  });

  it('logout clears HttpOnly cookies', async () => {
    const ports = createPlayerPorts();
    const result = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_LOGOUT_PATH,
        cookie: playerCookieHeader(ACCESS, REFRESH),
        cookieSecure: true,
      },
      ports,
    );
    assert.equal(result.status, 200);
    assert.equal(ports.signOuts, 1);
    const cookies = cookieAttrs(result.cookies ?? []);
    assert.equal(cookies.httpOnly, true);
    assert.equal(cookies.cleared, true);
    assert.equal(cookies.hasAccess, true);
    assert.equal(cookies.hasRefresh, true);
  });

  it('player BFF never uses service_role as business authority', () => {
    const files = listFiles(join(root, 'server/player'))
      .filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    assert.equal(files.includes('createServiceRoleClient'), false);
    assert.equal(files.includes('service_role'), false);
    assert.equal(files.includes('SERVICE_ROLE'), false);
    assert.match(files, /createAnonAuthClient/);
    assert.match(files, /createUserJwtClient/);
  });

  it('browser player auth/wallet sources never talk to *.supabase.co', () => {
    const files = [
      'src/App.tsx',
      'src/screens/AuthScreen.tsx',
      'src/WalletContext.tsx',
      'src/lib/playerAuth.ts',
      'src/lib/playerWallet.ts',
      'src/hooks/useAuth.ts',
    ];
    for (const rel of files) {
      const source = readFileSync(join(root, rel), 'utf8');
      assert.equal(source.includes('supabase.co'), false, rel);
      assert.equal(source.includes('supabase.auth'), false, rel);
      assert.equal(source.includes("rpc('ensure_player_account')"), false, rel);
      assert.equal(source.includes("from('wallets')"), false, rel);
    }
    const plugin = readFileSync(join(root, 'plugins/owner-staff-onboarding.ts'), 'utf8');
    assert.match(plugin, /attachPlayerAuthHttp/);
  });
});
