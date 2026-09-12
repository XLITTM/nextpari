import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import {
  PLAYER_AUTH_LOGIN_PATH,
  PLAYER_AUTH_LOGOUT_PATH,
  PLAYER_AUTH_REGISTER_PATH,
  PLAYER_ME_PATH,
  handlePlayerAuthRequest,
} from './playerAuthHttp.js';
import type { PlayerAuthGatewayPorts } from './playerAuthService.js';
import { generateOneClickPassword } from '../auth/oneClickPassword.js';
import { PLAYER_ACCESS_COOKIE, PLAYER_REFRESH_COOKIE } from './playerCookies.js';

const ACCESS = 'player-access-token';
const REFRESH = 'player-refresh-token';
const WALLET_UUID = '11111111-2222-3333-4444-555555555555';
const PLAYER_EMAIL = 'player@nextpari.test';
const PLAYER_PASSWORD = 'password1';
const PLAYER_PHONE = '+99365123456';
const INTERNAL_EMAIL = 'aabbccddeeff0011@auth.nextpari.invalid';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

function playerCookieHeader(access?: string | null, refresh?: string | null): string {
  const parts: string[] = [];
  if (access) parts.push(`${PLAYER_ACCESS_COOKIE}=${encodeURIComponent(access)}`);
  if (refresh) parts.push(`${PLAYER_REFRESH_COOKIE}=${encodeURIComponent(refresh)}`);
  return parts.join('; ');
}

function createPorts(init?: {
  userEmail?: string;
  signInError?: boolean;
  resolve?: 'found' | 'missing' | 'ambiguous';
  claimError?: boolean;
  ensureError?: boolean;
  loadWalletError?: boolean;
}): PlayerAuthGatewayPorts & {
  signIns: Array<{ email: string; password: string }>;
  createdUsers: Array<{ password: string; phone?: string }>;
  claimedPhones: string[];
  generated: string[];
  deletedUsers: string[];
  resolveCalls: Array<{ kind: string; value: string }>;
} {
  const signIns: Array<{ email: string; password: string }> = [];
  const createdUsers: Array<{ password: string; phone?: string }> = [];
  const claimedPhones: string[] = [];
  const generated: string[] = [];
  const deletedUsers: string[] = [];
  const resolveCalls: Array<{ kind: string; value: string }> = [];
  const userEmail = init?.userEmail ?? PLAYER_EMAIL;
  return {
    signIns,
    createdUsers,
    claimedPhones,
    generated,
    deletedUsers,
    resolveCalls,
    async signInWithPassword(email, password) {
      signIns.push({ email, password });
      if (init?.signInError) throw staffError('AUTH_FAILED', 401);
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async signUp(email, password) {
      signIns.push({ email, password });
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async resolveLoginEmail(kind, value) {
      resolveCalls.push({ kind, value });
      if (init?.resolve === 'ambiguous') return { ok: false, reason: 'ambiguous' };
      if (init?.resolve === 'missing') return { ok: false, reason: 'missing' };
      return { ok: true, email: PLAYER_EMAIL };
    },
    async createManagedPasswordUser(input) {
      createdUsers.push({ password: input.password, phone: input.phone });
      return { id: 'auth-user-1', email: INTERNAL_EMAIL };
    },
    async claimLoginPhone(_id, phone) {
      if (init?.claimError) throw staffError('REGISTRATION_FAILED', 409);
      claimedPhones.push(phone);
    },
    async deleteManagedAuthUser(id) {
      deletedUsers.push(id);
    },
    generateOneClickPassword() {
      const value = `clk_${generated.length}_${generateOneClickPassword()}`;
      generated.push(value);
      return value;
    },
    async refreshSession() {
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async getAuthUser() {
      return {
        id: 'auth-user-1',
        email: userEmail,
        phone: init?.userEmail ? '' : PLAYER_PHONE,
        emailConfirmed: true,
        phoneConfirmed: false,
        metadata: { phone: init?.userEmail ? '' : PLAYER_PHONE },
      };
    },
    async ensurePlayerAccount() {
      if (init?.ensureError) throw staffError('WALLET_UNAVAILABLE', 503);
      return {
        walletId: WALLET_UUID,
        publicId: '110790',
        legacyBalance: 0,
        migrationState: 'active',
      };
    },
    async loadOwnWallet() {
      if (init?.loadWalletError) throw staffError('WALLET_UNAVAILABLE', 503);
      return { balance: 0, currency: 'TMTM', status: 'active', publicId: '110790' };
    },
    async savePlayerProfile() {},
    async signOut() {},
  };
}

describe('multi-identifier player auth', () => {
  it('email login still succeeds with the legacy body', async () => {
    const ports = createPorts();
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
    assert.deepEqual(ports.signIns, [{ email: PLAYER_EMAIL, password: PLAYER_PASSWORD }]);
    assert.equal((result.body.player as { publicId: string }).publicId, '110790');
  });

  it('player ID login resolves then uses password auth', async () => {
    const ports = createPorts();
    const result = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { mode: 'identifier', identifier: '110790', password: PLAYER_PASSWORD },
      },
      ports,
    );
    assert.equal(result.status, 200);
    assert.deepEqual(ports.signIns, [{ email: PLAYER_EMAIL, password: PLAYER_PASSWORD }]);
    assert.equal(JSON.stringify(result.body).includes(PLAYER_PASSWORD), false);
  });

  it('public ID login accepts exactly six digits and trims whitespace', async () => {
    const padded = createPorts();
    const ok = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { mode: 'identifier', identifier: ' 110790 ', password: PLAYER_PASSWORD },
      },
      padded,
    );
    assert.equal(ok.status, 200);
    assert.deepEqual(padded.resolveCalls, [{ kind: 'public_id', value: '110790' }]);
  });

  it('malformed player IDs fail as AUTH_FAILED without lookup', async () => {
    const samples = ['abc123456', '123-456', '12345', '1234567'];
    for (const identifier of samples) {
      const ports = createPorts();
      const result = await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookieSecure: true,
          body: { mode: 'identifier', identifier, password: PLAYER_PASSWORD },
        },
        ports,
      );
      assert.equal(result.status, 401, identifier);
      assert.equal(result.body.error, 'AUTH_FAILED', identifier);
      assert.deepEqual(ports.resolveCalls, [], identifier);
    }
  });

  it('unknown ID and wrong password both return AUTH_FAILED', async () => {
    const missing = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { mode: 'identifier', identifier: '999999', password: PLAYER_PASSWORD },
      },
      createPorts({ resolve: 'missing' }),
    );
    const wrong = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { mode: 'identifier', identifier: '110790', password: PLAYER_PASSWORD },
      },
      createPorts({ signInError: true }),
    );
    assert.equal(missing.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal(missing.body.error, 'AUTH_FAILED');
    assert.equal(wrong.body.error, 'AUTH_FAILED');
  });

  it('phone login normalizes formatting and authenticates', async () => {
    const ports = createPorts();
    const result = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { mode: 'phone', phone: '+993 65 123-456', password: PLAYER_PASSWORD },
      },
      ports,
    );
    assert.equal(result.status, 200);
    assert.equal(ports.signIns[0]?.email, PLAYER_EMAIL);
  });

  it('unknown and ambiguous phones fail closed as AUTH_FAILED', async () => {
    const unknown = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { mode: 'phone', phone: PLAYER_PHONE, password: PLAYER_PASSWORD },
      },
      createPorts({ resolve: 'missing' }),
    );
    const ambiguous = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { mode: 'phone', phone: PLAYER_PHONE, password: PLAYER_PASSWORD },
      },
      createPorts({ resolve: 'ambiguous' }),
    );
    assert.equal(unknown.body.error, 'AUTH_FAILED');
    assert.equal(ambiguous.body.error, 'AUTH_FAILED');
  });

  it('email registration requires ageConfirmed and does not require phone', async () => {
    const denied = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_REGISTER_PATH,
        cookieSecure: true,
        body: { method: 'email', email: PLAYER_EMAIL, password: PLAYER_PASSWORD },
      },
      createPorts(),
    );
    assert.equal(denied.status, 400);
    assert.equal(denied.body.error, 'AGE_REQUIRED');

    const ports = createPorts();
    const ok = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_REGISTER_PATH,
        cookieSecure: true,
        body: { method: 'email', email: PLAYER_EMAIL, password: PLAYER_PASSWORD, ageConfirmed: true },
      },
      ports,
    );
    assert.equal(ok.status, 200);
  });

  it('phone registration creates a managed user without marking the phone verified', async () => {
    const ports = createPorts({ resolve: 'missing', userEmail: INTERNAL_EMAIL });
    const result = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_REGISTER_PATH,
        cookieSecure: true,
        body: { method: 'phone', phone: PLAYER_PHONE, password: PLAYER_PASSWORD, ageConfirmed: true },
      },
      ports,
    );
    assert.equal(result.status, 200);
    assert.equal(ports.createdUsers[0]?.password, PLAYER_PASSWORD);
    assert.equal(ports.claimedPhones[0], PLAYER_PHONE);
    const profile = result.body.profile as { phoneVerified: boolean; email: string };
    assert.equal(profile.phoneVerified, false);
    assert.equal(profile.email, '');
    assert.equal(JSON.stringify(result.body).includes(INTERNAL_EMAIL), false);
  });

  it('one-click requires 18+, returns a show-once password, then ID login works', async () => {
    const ports = createPorts({ resolve: 'missing', userEmail: INTERNAL_EMAIL });
    const denied = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_REGISTER_PATH,
        cookieSecure: true,
        body: { method: 'one_click' },
      },
      ports,
    );
    assert.equal(denied.body.error, 'AGE_REQUIRED');

    const created = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_REGISTER_PATH,
        cookieSecure: true,
        body: { method: 'one_click', ageConfirmed: true },
      },
      ports,
    );
    assert.equal(created.status, 200);
    const oneClick = created.body.oneClick as { playerId: string; password: string };
    assert.equal(oneClick.playerId, '110790');
    assert.ok(oneClick.password.length >= 16);
    assert.equal(created.body.profile && (created.body.profile as { email: string }).email, '');
    assert.equal(JSON.stringify(created.body).includes('generatedPassword'), false);
    assert.equal(JSON.stringify(created.body.player).includes(oneClick.password), false);

    const me = await handlePlayerAuthRequest(
      {
        method: 'GET',
        pathname: PLAYER_ME_PATH,
        cookie: playerCookieHeader(ACCESS, REFRESH),
        cookieSecure: true,
      },
      ports,
    );
    assert.equal(me.status, 200);
    assert.equal('oneClick' in me.body, false);
    assert.equal(JSON.stringify(me.body).includes(oneClick.password), false);

    const login = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { mode: 'identifier', identifier: oneClick.playerId, password: oneClick.password },
      },
      createPorts({ userEmail: INTERNAL_EMAIL }),
    );
    assert.equal(login.status, 200);
    assert.equal((login.body.player as { publicId: string }).publicId, '110790');
    assert.equal((login.body.player as { email: string }).email, '');
  });

  it('consecutive generated passwords differ and do not use Math.random', async () => {
    const first = generateOneClickPassword();
    const second = generateOneClickPassword();
    assert.notEqual(first, second);
    assert.ok(first.length >= 16);
    const source = readFileSync(join(root, 'server/auth/oneClickPassword.ts'), 'utf8');
    assert.equal(source.includes('Math.random'), false);
    assert.match(source, /randomBytes/);
  });

  it('phone register then phone login uses the same player', async () => {
    const ports = createPorts({ resolve: 'missing', userEmail: INTERNAL_EMAIL });
    const registered = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_REGISTER_PATH,
        cookieSecure: true,
        body: { method: 'phone', phone: PLAYER_PHONE, password: PLAYER_PASSWORD, ageConfirmed: true },
      },
      ports,
    );
    assert.equal(registered.status, 200);
    await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_LOGOUT_PATH,
        cookie: playerCookieHeader(ACCESS, REFRESH),
        cookieSecure: true,
      },
      ports,
    );
    const loginPorts = createPorts({ userEmail: INTERNAL_EMAIL });
    const login = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { mode: 'phone', phone: PLAYER_PHONE, password: PLAYER_PASSWORD },
      },
      loginPorts,
    );
    assert.equal(login.status, 200);
    assert.equal((login.body.player as { publicId: string }).publicId, '110790');
  });

  it('login alias migration stays private and is not applied by source', () => {
    const sql = readFileSync(join(root, 'supabase/migrations/20260912193119_player_login_aliases_039.sql'), 'utf8');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS private\.player_login_phones/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.resolve_player_login_email\(TEXT, TEXT\) FROM PUBLIC/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.resolve_player_login_email\(TEXT, TEXT\) FROM anon, authenticated/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.resolve_player_login_email\(TEXT, TEXT\) TO service_role/);
    assert.match(sql, /SET search_path = ''/);
    assert.equal(sql.includes('supabase db push'), false);
    const validators = readFileSync(join(root, 'server/player/playerValidators.ts'), 'utf8');
    assert.match(validators, /parseLoginPlayerId/);
    assert.equal(/parseLoginPlayerId[\s\S]*replace\(\/\\D/.test(validators), false);
  });

  it('publicId resolver inspects wallet and profile sources together', () => {
    const sql = migrationSql();
    const publicId = sqlFunctionBody(sql, 'private.resolve_player_login_email');
    const branch = sliceUntil(publicId, "v_kind = 'public_id'", "v_kind = 'phone'");
    assert.match(branch, /UNION/);
    assert.match(branch, /w\.public_id/);
    assert.match(branch, /p\.public_id/);
    assert.match(branch, /AUTH_AMBIGUOUS/);
    assert.match(branch, /AUTH_FAILED/);
    assert.equal(branch.includes('LIMIT 1'), false);
    assert.match(branch, /\^\[0-9\]\{6\}\$/);
    assert.match(branch, /btrim/);
    assert.equal(branch.includes('[0-9]{6,15}'), false);
    const unionAt = branch.indexOf('UNION');
    const zeroAt = branch.indexOf('IF v_hits = 0 THEN');
    const ambiguousAt = branch.indexOf('AUTH_AMBIGUOUS');
    const selectOwnerAt = branch.lastIndexOf('SELECT x.id');
    assert.ok(unionAt >= 0 && zeroAt > unionAt);
    assert.ok(ambiguousAt > unionAt);
    assert.ok(selectOwnerAt > ambiguousAt);
  });

  it('phone claim rejects every legacy source owned by another user and allows the same user', () => {
    const claim = sqlFunctionBody(migrationSql(), 'private.claim_player_login_phone');
    assert.match(claim, /private\.player_login_phones/);
    assert.match(claim, /u\.phone/);
    assert.match(claim, /raw_user_meta_data ->> 'phone'/);
    assert.match(claim, /p\.phone/);
    assert.match(claim, /PHONE_TAKEN/);
    assert.match(claim, /v_existing IS DISTINCT FROM p_auth_user_id/);
    assert.match(claim, /v_hits > 1/);
    const lockAt = claim.indexOf('pg_catalog.pg_advisory_xact_lock');
    const hashAt = claim.indexOf('pg_catalog.hashtextextended');
    const ownersAt = claim.indexOf('SELECT COUNT(DISTINCT x.id)');
    const writeAt = Math.min(
      ...['INSERT INTO private.player_login_phones', 'UPDATE private.player_login_phones']
        .map((needle) => claim.indexOf(needle))
        .filter((index) => index >= 0),
    );
    assert.ok(lockAt >= 0 && hashAt > lockAt);
    assert.ok(ownersAt > lockAt);
    assert.ok(writeAt > ownersAt);
  });

  it('migration revokes browser roles from aliases, wrappers, and the private table', () => {
    const sql = migrationSql();
    assert.match(sql, /REVOKE ALL ON TABLE private\.player_login_phones FROM PUBLIC/);
    assert.match(sql, /REVOKE ALL ON TABLE private\.player_login_phones FROM anon, authenticated/);
    assert.equal(/GRANT\b[\s\S]*ON TABLE private\.player_login_phones/i.test(sql), false);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.claim_player_login_phone\(UUID, TEXT\) FROM PUBLIC/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.claim_player_login_phone\(UUID, TEXT\) FROM anon, authenticated/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.claim_player_login_phone\(UUID, TEXT\) TO service_role/);
    assert.equal(sql.includes('GRANT EXECUTE ON FUNCTION public.resolve_player_login_email(TEXT, TEXT) TO anon'), false);
    assert.equal(sql.includes('GRANT EXECUTE ON FUNCTION public.resolve_player_login_email(TEXT, TEXT) TO authenticated'), false);
    assert.equal(sql.includes('GRANT EXECUTE ON FUNCTION public.claim_player_login_phone(UUID, TEXT) TO anon'), false);
    assert.equal(sql.includes('GRANT EXECUTE ON FUNCTION public.claim_player_login_phone(UUID, TEXT) TO authenticated'), false);
  });

  it('cleans up a newly created phone user if claim or provisioning fails', async () => {
    const claimFail = createPorts({ resolve: 'missing', userEmail: INTERNAL_EMAIL, claimError: true });
    const claimed = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_REGISTER_PATH,
        cookieSecure: true,
        body: { method: 'phone', phone: PLAYER_PHONE, password: PLAYER_PASSWORD, ageConfirmed: true },
      },
      claimFail,
    );
    assert.equal(claimed.status, 409);
    assert.deepEqual(claimFail.deletedUsers, ['auth-user-1']);
    assert.equal(claimFail.deletedUsers.includes('legacy-user'), false);

    const provisionFail = createPorts({ resolve: 'missing', userEmail: INTERNAL_EMAIL, ensureError: true });
    const provisioned = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_REGISTER_PATH,
        cookieSecure: true,
        body: { method: 'one_click', ageConfirmed: true },
      },
      provisionFail,
    );
    assert.equal(provisioned.status, 503);
    assert.deepEqual(provisionFail.deletedUsers, ['auth-user-1']);
    assert.equal(JSON.stringify(provisioned.body).includes(provisionFail.generated[0] ?? 'clk_'), false);
  });

  it('does not delete a provisioned account if a later snapshot step fails', async () => {
    const phonePorts = createPorts({
      resolve: 'missing',
      userEmail: INTERNAL_EMAIL,
      loadWalletError: true,
    });
    const phone = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_REGISTER_PATH,
        cookieSecure: true,
        body: { method: 'phone', phone: PLAYER_PHONE, password: PLAYER_PASSWORD, ageConfirmed: true },
      },
      phonePorts,
    );
    assert.equal(phone.status, 503);
    assert.equal(phone.body.error, 'WALLET_UNAVAILABLE');
    assert.deepEqual(phonePorts.deletedUsers, []);
    assert.equal(phonePorts.createdUsers.length, 1);

    const oneClickPorts = createPorts({
      resolve: 'missing',
      userEmail: INTERNAL_EMAIL,
      loadWalletError: true,
    });
    const oneClick = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_REGISTER_PATH,
        cookieSecure: true,
        body: { method: 'one_click', ageConfirmed: true },
      },
      oneClickPorts,
    );
    assert.equal(oneClick.status, 200);
    assert.deepEqual(oneClickPorts.deletedUsers, []);
    const credentials = oneClick.body.oneClick as { playerId: string; password: string };
    assert.equal(credentials.playerId, '110790');
    assert.equal(credentials.password, oneClickPorts.generated[0]);
    assert.equal(oneClick.body.authenticated, false);
    assert.equal((oneClick.body.player as { email: string }).email, '');
    assert.equal(JSON.stringify(oneClick.body).includes(INTERNAL_EMAIL), false);
  });

  it('never deletes an auth user that this request did not create', async () => {
    const ports = createPorts({ resolve: 'found', userEmail: INTERNAL_EMAIL });
    const result = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_REGISTER_PATH,
        cookieSecure: true,
        body: { method: 'phone', phone: PLAYER_PHONE, password: PLAYER_PASSWORD, ageConfirmed: true },
      },
      ports,
    );
    assert.equal(result.status, 409);
    assert.deepEqual(ports.createdUsers, []);
    assert.deepEqual(ports.deletedUsers, []);
  });
});

function migrationSql(): string {
  return readFileSync(join(root, 'supabase/migrations/20260912193119_player_login_aliases_039.sql'), 'utf8');
}

function sqlFunctionBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}`);
  assert.ok(start >= 0, name);
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION', start + 1);
  return next >= 0 ? sql.slice(start, next) : sql.slice(start);
}

function sliceUntil(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + 1);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}
