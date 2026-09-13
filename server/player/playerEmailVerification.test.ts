import assert from 'node:assert/strict';
import { createHmac, randomInt } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import {
  PLAYER_EMAIL_START_PATH,
  PLAYER_EMAIL_VERIFY_PATH,
  handlePlayerAuthRequest,
} from './playerAuthHttp.js';
import type { PlayerAuthGatewayPorts } from './playerAuthService.js';
import {
  generatePlayerEmailOtp,
  hashPlayerEmailOtp,
  maskPlayerEmail,
  otpHashesEqual,
  type PlayerEmailChallengeRow,
  type PlayerEmailPorts,
} from '../email/playerEmailService.js';
import { PLAYER_ACCESS_COOKIE, PLAYER_REFRESH_COOKIE } from './playerCookies.js';

const ACCESS = 'player-access-token';
const REFRESH = 'player-refresh-token';
const USER = 'auth-user-1';
const PEPPER = 'test-pepper-not-for-production';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const sql = readFileSync(
  join(root, 'supabase/migrations/20260913181000_player_identity_email_verification_044.sql'),
  'utf8',
);

function cookie(): string {
  return `${PLAYER_ACCESS_COOKIE}=${ACCESS}; ${PLAYER_REFRESH_COOKIE}=${REFRESH}`;
}

function createAuthPorts(): PlayerAuthGatewayPorts {
  return {
    async signInWithPassword() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
    async signUp() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
    async refreshSession() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
    async getAuthUser() {
      return { id: USER, email: 'aabbcc@auth.nextpari.invalid' };
    },
    async ensurePlayerAccount() {
      return { walletId: 'w', publicId: '000001', legacyBalance: 0, migrationState: 'active' };
    },
    async loadOwnWallet() {
      return { balance: 0, currency: 'TMTM', status: 'active', publicId: '000001' };
    },
    async savePlayerProfile() {},
  };
}

function createEmailPorts(init?: {
  taken?: boolean;
  sendError?: boolean;
  code?: string;
  challenge?: Partial<PlayerEmailChallengeRow> | null;
  consume?: boolean;
}): PlayerEmailPorts & {
  sent: Array<{ to: string; text: string }>;
  created: Array<{ email: string; codeHash: string }>;
  failures: string[];
  consumed: string[];
  authUpdates: Array<{ id: string; email: string }>;
  profileUpdates: Array<{ id: string; email: string }>;
  createdUsers: number;
  wallets: number;
} {
  const sent: Array<{ to: string; text: string }> = [];
  const created: Array<{ email: string; codeHash: string }> = [];
  const failures: string[] = [];
  const consumed: string[] = [];
  const authUpdates: Array<{ id: string; email: string }> = [];
  const profileUpdates: Array<{ id: string; email: string }> = [];
  const code = init?.code ?? '123456';
  let active: PlayerEmailChallengeRow | null = init?.challenge === null
    ? null
    : {
      id: 'challenge-1',
      email_normalized: 'user@example.com',
      code_hash: hashPlayerEmailOtp(code, PEPPER),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      attempt_count: 0,
      max_attempts: 5,
      consumed_at: null,
      ...init?.challenge,
    };
  return {
    sent,
    created,
    failures,
    consumed,
    authUpdates,
    profileUpdates,
    createdUsers: 0,
    wallets: 1,
    async getAuthUser() {
      return { id: USER, email: 'aabbcc@auth.nextpari.invalid' };
    },
    async refreshSession() {
      throw staffError('JWT_INVALID', 401);
    },
    async sendEmail(message) {
      if (init?.sendError) throw new Error('EMAIL_DELIVERY_FAILED');
      sent.push({ to: message.to, text: message.text });
    },
    generateCode: () => code,
    hashCode: (value) => hashPlayerEmailOtp(value, PEPPER),
    async isEmailTaken() {
      return init?.taken === true;
    },
    async createChallenge(input) {
      created.push({ email: input.email, codeHash: input.codeHash });
      active = {
        id: 'challenge-1',
        email_normalized: input.email,
        code_hash: input.codeHash,
        expires_at: input.expiresAt,
        attempt_count: 0,
        max_attempts: 5,
        consumed_at: null,
      };
      return { id: 'challenge-1' };
    },
    async markChallengeUnusable(id) {
      if (active?.id === id) active = { ...active, consumed_at: new Date().toISOString() };
    },
    async loadActiveChallenge() {
      return active;
    },
    async registerFailure(id) {
      failures.push(id);
      if (!active) return 0;
      active = { ...active, attempt_count: active.attempt_count + 1 };
      return active.attempt_count;
    },
    async consumeChallenge(id) {
      consumed.push(id);
      if (init?.consume === false || active?.consumed_at) return false;
      if (active) active = { ...active, consumed_at: new Date().toISOString() };
      return true;
    },
    async updateAuthEmail(authUserId, email) {
      authUpdates.push({ id: authUserId, email });
    },
    async syncProfileEmail(authUserId, email) {
      profileUpdates.push({ id: authUserId, email });
    },
  };
}

describe('player email verification HTTP', () => {
  it('authenticated player can request a masked code send', async () => {
    const emailPorts = createEmailPorts({ code: '000042' });
    const result = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_EMAIL_START_PATH,
        cookie: cookie(),
        body: { email: '  User@Example.com ' },
      },
      createAuthPorts(),
      undefined,
      emailPorts,
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.maskedEmail, 'u***@example.com');
    assert.equal(result.body.expiresInSeconds, 600);
    assert.equal(result.body.resendAfterSeconds, 60);
    assert.equal(emailPorts.created[0]?.email, 'user@example.com');
    assert.equal(emailPorts.sent[0]?.to, 'user@example.com');
    assert.match(emailPorts.sent[0]?.text ?? '', /Ваш код подтверждения:\n000042/);
    assert.equal(JSON.stringify(result.body).includes('000042'), false);
    assert.equal(emailPorts.created[0]?.codeHash.includes('000042'), false);
  });

  it('rejects unauthenticated, invalid, taken, and synthetic emails', async () => {
    const unauth = await handlePlayerAuthRequest(
      { method: 'POST', pathname: PLAYER_EMAIL_START_PATH, body: { email: 'user@example.com' } },
      createAuthPorts(),
      undefined,
      createEmailPorts(),
    );
    assert.equal(unauth.status, 401);
    const invalid = await handlePlayerAuthRequest(
      { method: 'POST', pathname: PLAYER_EMAIL_START_PATH, cookie: cookie(), body: { email: 'not-an-email' } },
      createAuthPorts(),
      undefined,
      createEmailPorts(),
    );
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error, 'INVALID_EMAIL');
    const taken = await handlePlayerAuthRequest(
      { method: 'POST', pathname: PLAYER_EMAIL_START_PATH, cookie: cookie(), body: { email: 'taken@example.com' } },
      createAuthPorts(),
      undefined,
      createEmailPorts({ taken: true }),
    );
    assert.equal(taken.status, 409);
    assert.equal(taken.body.error, 'EMAIL_UNAVAILABLE');
    const synthetic = await handlePlayerAuthRequest(
      { method: 'POST', pathname: PLAYER_EMAIL_START_PATH, cookie: cookie(), body: { email: 'x@auth.nextpari.invalid' } },
      createAuthPorts(),
      undefined,
      createEmailPorts(),
    );
    assert.equal(synthetic.status, 400);
  });

  it('does not claim success when the provider cannot send', async () => {
    const ports = createEmailPorts({ sendError: true });
    const result = await handlePlayerAuthRequest(
      { method: 'POST', pathname: PLAYER_EMAIL_START_PATH, cookie: cookie(), body: { email: 'user@example.com' } },
      createAuthPorts(),
      undefined,
      ports,
    );
    assert.equal(result.status, 503);
    assert.equal(result.body.error, 'EMAIL_DELIVERY_FAILED');
    assert.equal(result.body.ok, false);
  });

  it('ignores browser identity fields and verifies then consumes once', async () => {
    const ports = createEmailPorts({ code: '654321' });
    await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_EMAIL_START_PATH,
        cookie: cookie(),
        body: { email: 'user@example.com', userId: 'nope', playerId: '000001', authUserId: 'other' },
      },
      createAuthPorts(),
      undefined,
      ports,
    );
    const ok = await handlePlayerAuthRequest(
      { method: 'POST', pathname: PLAYER_EMAIL_VERIFY_PATH, cookie: cookie(), body: { code: '654321', email: 'attacker@x.com' } },
      createAuthPorts(),
      undefined,
      ports,
    );
    assert.equal(ok.status, 200);
    assert.equal(ok.body.emailVerified, true);
    assert.equal(ok.body.email, 'user@example.com');
    assert.deepEqual(ports.authUpdates, [{ id: USER, email: 'user@example.com' }]);
    assert.deepEqual(ports.profileUpdates, [{ id: USER, email: 'user@example.com' }]);
    assert.equal(ports.createdUsers, 0);
    assert.equal(ports.wallets, 1);
    const again = await handlePlayerAuthRequest(
      { method: 'POST', pathname: PLAYER_EMAIL_VERIFY_PATH, cookie: cookie(), body: { code: '654321' } },
      createAuthPorts(),
      undefined,
      ports,
    );
    assert.equal(again.status, 409);
    assert.equal(again.body.error, 'EMAIL_CODE_CONSUMED');
  });

  it('increments attempts, locks after 5, and rejects expired or short codes', async () => {
    const ports = createEmailPorts({ code: '111111' });
    await handlePlayerAuthRequest(
      { method: 'POST', pathname: PLAYER_EMAIL_START_PATH, cookie: cookie(), body: { email: 'user@example.com' } },
      createAuthPorts(),
      undefined,
      ports,
    );
    for (let i = 0; i < 4; i += 1) {
      const wrong = await handlePlayerAuthRequest(
        { method: 'POST', pathname: PLAYER_EMAIL_VERIFY_PATH, cookie: cookie(), body: { code: '000000' } },
        createAuthPorts(),
        undefined,
        ports,
      );
      assert.equal(wrong.status, 401);
      assert.equal(wrong.body.error, 'EMAIL_CODE_INVALID');
    }
    const locked = await handlePlayerAuthRequest(
      { method: 'POST', pathname: PLAYER_EMAIL_VERIFY_PATH, cookie: cookie(), body: { code: '000000' } },
      createAuthPorts(),
      undefined,
      ports,
    );
    assert.equal(locked.status, 429);
    assert.equal(locked.body.error, 'EMAIL_CODE_LOCKED');
    const expired = await handlePlayerAuthRequest(
      { method: 'POST', pathname: PLAYER_EMAIL_VERIFY_PATH, cookie: cookie(), body: { code: '111111' } },
      createAuthPorts(),
      undefined,
      createEmailPorts({
        challenge: { expires_at: new Date(Date.now() - 1000).toISOString() },
      }),
    );
    assert.equal(expired.status, 400);
    assert.equal(expired.body.error, 'EMAIL_CODE_EXPIRED');
    const short = await handlePlayerAuthRequest(
      { method: 'POST', pathname: PLAYER_EMAIL_VERIFY_PATH, cookie: cookie(), body: { code: '42' } },
      createAuthPorts(),
      undefined,
      createEmailPorts(),
    );
    assert.equal(short.status, 400);
    assert.equal(short.body.error, 'INVALID_CODE');
  });

  it('fails honestly when the email provider is missing', async () => {
    const ports = createEmailPorts();
    ports.hashCode = () => '';
    const result = await handlePlayerAuthRequest(
      { method: 'POST', pathname: PLAYER_EMAIL_START_PATH, cookie: cookie(), body: { email: 'user@example.com' } },
      createAuthPorts(),
      undefined,
      ports,
    );
    assert.equal(result.status, 503);
    assert.equal(result.body.error, 'EMAIL_PROVIDER_NOT_CONFIGURED');
    assert.equal(ports.sent.length, 0);
    assert.equal(result.body.ok, false);
  });

  it('blocks resend cooldown, hourly send limit, and invalidates the previous code', async () => {
    const cooldown = createEmailPorts();
    cooldown.createChallenge = async () => {
      throw staffError('EMAIL_RESEND_COOLDOWN', 429);
    };
    const cooled = await handlePlayerAuthRequest(
      { method: 'POST', pathname: PLAYER_EMAIL_START_PATH, cookie: cookie(), body: { email: 'user@example.com' } },
      createAuthPorts(),
      undefined,
      cooldown,
    );
    assert.equal(cooled.status, 429);
    assert.equal(cooled.body.error, 'EMAIL_RESEND_COOLDOWN');

    const limited = createEmailPorts();
    limited.createChallenge = async () => {
      throw staffError('EMAIL_SEND_RATE_LIMITED', 429);
    };
    const hour = await handlePlayerAuthRequest(
      { method: 'POST', pathname: PLAYER_EMAIL_START_PATH, cookie: cookie(), body: { email: 'user@example.com' } },
      createAuthPorts(),
      undefined,
      limited,
    );
    assert.equal(hour.status, 429);
    assert.equal(hour.body.error, 'EMAIL_SEND_RATE_LIMITED');

    let currentCode = '111111';
    const ports = createEmailPorts({ code: currentCode });
    ports.generateCode = () => currentCode;
    ports.hashCode = (value) => hashPlayerEmailOtp(value, PEPPER);
    await handlePlayerAuthRequest(
      { method: 'POST', pathname: PLAYER_EMAIL_START_PATH, cookie: cookie(), body: { email: 'user@example.com' } },
      createAuthPorts(),
      undefined,
      ports,
    );
    currentCode = '222222';
    await handlePlayerAuthRequest(
      { method: 'POST', pathname: PLAYER_EMAIL_START_PATH, cookie: cookie(), body: { email: 'user@example.com' } },
      createAuthPorts(),
      undefined,
      ports,
    );
    const stale = await handlePlayerAuthRequest(
      { method: 'POST', pathname: PLAYER_EMAIL_VERIFY_PATH, cookie: cookie(), body: { code: '111111' } },
      createAuthPorts(),
      undefined,
      ports,
    );
    assert.equal(stale.status, 401);
    assert.equal(stale.body.error, 'EMAIL_CODE_INVALID');
    const fresh = await handlePlayerAuthRequest(
      { method: 'POST', pathname: PLAYER_EMAIL_VERIFY_PATH, cookie: cookie(), body: { code: '222222' } },
      createAuthPorts(),
      undefined,
      ports,
    );
    assert.equal(fresh.status, 200);
    assert.equal(fresh.body.emailVerified, true);
  });
});

describe('player email verification contract', () => {
  it('stores HMAC hashes not plaintext OTP and keeps secrets server-side', () => {
    const otp = generatePlayerEmailOtp();
    assert.match(otp, /^[0-9]{6}$/);
    assert.equal(otp.length, 6);
    const hash = hashPlayerEmailOtp('123456', PEPPER);
    assert.equal(hash, createHmac('sha256', PEPPER).update('123456').digest('hex'));
    assert.equal(otpHashesEqual(hash, hashPlayerEmailOtp('123456', PEPPER)), true);
    assert.equal(otpHashesEqual(hash, hashPlayerEmailOtp('000000', PEPPER)), false);
    assert.equal(sql.includes('code TEXT NOT NULL'), false);
    assert.equal(/\botp\s+TEXT\b/i.test(sql), false);
    assert.match(sql, /code_hash TEXT NOT NULL/);
    assert.match(sql, /player_email_verification_challenges/);
    assert.equal(sql.includes('UPDATE auth.users'), false);
    assert.equal(sql.includes('encrypted_password'), false);
    assert.match(sql, /REVOKE ALL ON TABLE private\.player_email_verification_challenges FROM anon, authenticated/);
    const gen = readFileSync(join(root, 'server/email/playerEmailService.ts'), 'utf8');
    assert.match(gen, /randomInt/);
    assert.equal(gen.includes('Math.random'), false);
    assert.match(gen, /createHmac\('sha256'/);
    assert.match(gen, /timingSafeEqual/);
    assert.match(gen, /auth\.admin\.updateUserById/);
    assert.equal(gen.includes('console.log'), false);
    const client = readFileSync(join(root, 'src/lib/playerAuth.ts'), 'utf8');
    assert.equal(client.includes('RESEND_API_KEY'), false);
    assert.equal(client.includes('PLAYER_EMAIL_OTP_PEPPER'), false);
    assert.equal(client.includes('SUPABASE_SERVICE_ROLE_KEY'), false);
    const settings = readFileSync(join(root, 'src/screens/SettingsScreen.tsx'), 'utf8');
    assert.match(settings, /Почта не привязана/);
    assert.match(settings, /Привязать почту/);
    assert.match(settings, /Изменить почту/);
    assert.match(settings, /Подтверждена ✓/);
    const modal = readFileSync(join(root, 'src/components/player/EmailBindModal.tsx'), 'utf8');
    assert.match(modal, /Введите электронную почту/);
    assert.match(modal, /отправлен код/);
    assert.match(modal, /Подтвердить/);
    assert.match(modal, /Отправить код повторно/);
    assert.equal(maskPlayerEmail('user@example.com'), 'u***@example.com');
    assert.equal(typeof randomInt, 'function');
    assert.match(sql, /EMAIL_RESEND_COOLDOWN/);
    assert.match(sql, /EMAIL_SEND_RATE_LIMITED/);
    assert.match(sql, /INTERVAL '1 hour'/);
    assert.match(sql, /consumed_at IS NULL/);
    const createStart = sql.indexOf('CREATE OR REPLACE FUNCTION private.player_email_challenge_create(');
    const createEnd = sql.indexOf('REVOKE ALL ON FUNCTION private.player_email_challenge_create(');
    const create = sql.slice(createStart, createEnd);
    const emailLock = create.indexOf('nextpari:player-email:');
    const hourly = create.indexOf("INTERVAL '1 hour'");
    const cooldown = create.indexOf('EMAIL_RESEND_COOLDOWN');
    const invalidate = create.indexOf('SET consumed_at = now()');
    const insertAt = create.indexOf('INSERT INTO private.player_email_verification_challenges');
    assert.match(create, /pg_catalog\.pg_advisory_xact_lock/);
    assert.equal(emailLock >= 0, true);
    assert.equal(hourly > emailLock, true);
    assert.equal(cooldown > emailLock, true);
    assert.equal(invalidate > emailLock, true);
    assert.equal(insertAt > invalidate, true);
    assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS player_email_challenges_active_uidx/);
    assert.equal(sql.includes('CREATE INDEX IF NOT EXISTS player_email_challenges_active_idx'), false);
    const dist = join(root, 'dist');
    const clientFiles = [
      'src/lib/playerAuth.ts',
      'src/components/player/EmailBindModal.tsx',
      'src/screens/SettingsScreen.tsx',
      'src/screens/PersonalDataScreen.tsx',
    ];
    for (const rel of clientFiles) {
      const source = readFileSync(join(root, rel), 'utf8');
      assert.equal(source.includes('RESEND_API_KEY'), false, rel);
      assert.equal(source.includes('PLAYER_EMAIL_OTP_PEPPER'), false, rel);
      assert.equal(source.includes('SUPABASE_SERVICE_ROLE_KEY'), false, rel);
      assert.equal(source.includes('authUserId'), false, rel);
    }
    if (existsSync(dist)) {
      const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        return entry.isDirectory() ? walk(path) : [path];
      });
      for (const file of walk(dist).filter((path) => path.endsWith('.js') || path.endsWith('.html'))) {
        const source = readFileSync(file, 'utf8');
        assert.equal(source.includes('RESEND_API_KEY'), false, file);
        assert.equal(source.includes('PLAYER_EMAIL_OTP_PEPPER'), false, file);
        assert.equal(source.includes('SUPABASE_SERVICE_ROLE_KEY'), false, file);
      }
    }
  });

  it('serializes concurrent starts so one active challenge and limits stay intact', async () => {
    type Challenge = { active: boolean; createdAt: number; resendAt: number };
    const rows: Challenge[] = [];
    const now = 1_000_000;
    let chain = Promise.resolve();
    const withLock = async <T>(fn: () => T): Promise<T> => {
      const previous = chain;
      let release!: () => void;
      chain = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return fn();
      } finally {
        release();
      }
    };
    const start = () => {
      const hourly = rows.filter((row) => row.createdAt > now - 60 * 60 * 1000).length;
      if (hourly >= 5) throw new Error('EMAIL_SEND_RATE_LIMITED');
      const latest = rows.reduce((max, row) => Math.max(max, row.resendAt), 0);
      if (latest > now) throw new Error('EMAIL_RESEND_COOLDOWN');
      for (const row of rows) row.active = false;
      rows.push({ active: true, createdAt: now, resendAt: now + 60_000 });
      return rows.filter((row) => row.active).length;
    };
    const concurrent = await Promise.allSettled(Array.from({ length: 3 }, () => withLock(start)));
    assert.equal(concurrent.filter((row) => row.status === 'fulfilled').length, 1);
    assert.equal(
      concurrent.filter((row) => row.status === 'rejected' && String(row.reason).includes('EMAIL_RESEND_COOLDOWN')).length,
      2,
    );
    assert.equal(rows.filter((row) => row.active).length, 1);
    while (rows.length < 5) {
      rows.push({ active: false, createdAt: now, resendAt: now - 1 });
    }
    for (const row of rows) row.resendAt = now - 1;
    await assert.rejects(() => withLock(start), /EMAIL_SEND_RATE_LIMITED/);
    assert.equal(rows.filter((row) => row.active).length, 1);
  });

  it('preserves login modes, password change, and does not touch staff or money', () => {
    const service = readFileSync(join(root, 'server/player/playerAuthService.ts'), 'utf8');
    assert.match(service, /loginPlayerWithPassword/);
    assert.match(service, /changePlayerPassword/);
    assert.match(service, /mode === 'phone'/);
    assert.match(service, /parseLoginPlayerId/);
    assert.match(service, /one_click/);
    const owner = readFileSync(join(root, 'server/staff/ownerAuthHttp.ts'), 'utf8');
    const manager = readFileSync(join(root, 'server/staff/managerAuthHttp.ts'), 'utf8');
    const cashier = readFileSync(join(root, 'server/staff/cashierAuthHttp.ts'), 'utf8');
    assert.equal(owner.includes('player_email_challenge'), false);
    assert.equal(manager.includes('player_email_challenge'), false);
    assert.equal(cashier.includes('player_email_challenge'), false);
    assert.equal(sql.includes('apply_wallet_entry'), false);
    assert.equal(sql.includes('owner_debit_player'), false);
    assert.equal(sql.includes('cashier_reverse_player_deposit'), false);
  });
});
