import assert from 'node:assert/strict';
import { createHmac, randomInt, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import {
  PLAYER_PASSWORD_RECOVERY_RESET_PATH,
  PLAYER_PASSWORD_RECOVERY_START_PATH,
  PLAYER_PASSWORD_RECOVERY_VERIFY_PATH,
  handlePlayerAuthRequest,
} from './playerAuthHttp.js';
import type { PlayerAuthGatewayPorts } from './playerAuthService.js';
import {
  generatePlayerPasswordRecoveryOtp,
  generatePlayerPasswordResetTicket,
  hashPlayerPasswordRecoverySecret,
  recoveryDigestsEqual,
  PLAYER_PASSWORD_RECOVERY_DONE_MESSAGE,
  PLAYER_PASSWORD_RECOVERY_INVALID_CODE_MESSAGE,
  PLAYER_PASSWORD_RECOVERY_START_MESSAGE,
  type PlayerPasswordRecoveryPorts,
  type PlayerPasswordRecoveryPrepareResult,
} from '../email/playerPasswordRecoveryService.js';
import { PLAYER_PASSWORD_POLICY_MESSAGE } from './playerValidators.js';
import { PLAYER_ACCESS_COOKIE, PLAYER_REFRESH_COOKIE } from './playerCookies.js';
import type { PlayerSecurityObserver } from './playerSecurityService.js';

const USER = '11111111-2222-3333-4444-555555555555';
const PEPPER = 'test-pepper-not-for-production';
const CODE = '123456';
const TICKET = 'opaque-reset-ticket-value';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const sql = readFileSync(
  join(root, 'supabase/migrations/20260914060000_player_password_recovery_054.sql'),
  'utf8',
);

function createAuthPorts(): PlayerAuthGatewayPorts {
  return {
    async signInWithPassword() { return { accessToken: 'a', refreshToken: 'r' }; },
    async signUp() { throw new Error('signUp should not run'); },
    async refreshSession() { throw staffError('JWT_INVALID', 401); },
    async getAuthUser() { return { id: USER, email: 'player@nextpari.test' }; },
    async ensurePlayerAccount() {
      return { walletId: 'w', publicId: '110790', legacyBalance: 0, migrationState: 'active' };
    },
    async loadOwnWallet() {
      return { balance: 42, currency: 'TMTM', status: 'active', publicId: '110790' };
    },
    async savePlayerProfile() { throw new Error('savePlayerProfile should not run'); },
  };
}

function createRecoveryPorts(init?: {
  eligible?: boolean;
  sendError?: boolean;
  verifyOk?: boolean;
  consumeOk?: boolean;
  updateError?: 'policy' | 'fail';
  playerUserId?: string;
}): PlayerPasswordRecoveryPorts & {
  sent: Array<{ to: string; text: string }>;
  prepared: string[];
  verified: string[];
  consumed: string[];
  passwordUpdates: Array<{ userId: string; password: string }>;
  revoked: string[];
  createdUsers: number;
  wallets: number;
} {
  const sent: Array<{ to: string; text: string }> = [];
  const prepared: string[] = [];
  const verified: string[] = [];
  const consumed: string[] = [];
  const passwordUpdates: Array<{ userId: string; password: string }> = [];
  const revoked: string[] = [];
  const playerUserId = init?.playerUserId ?? USER;
  let active: PlayerPasswordRecoveryPrepareResult = {
    eligible: init?.eligible !== false,
    challengeId: 'challenge-1',
    playerUserId,
    email: 'player@nextpari.test',
  };
  let attempts = 0;
  let ticketConsumed = false;
  return {
    sent,
    prepared,
    verified,
    consumed,
    passwordUpdates,
    revoked,
    createdUsers: 0,
    wallets: 1,
    generateCode: () => CODE,
    generateTicket: () => TICKET,
    generateChallengeId: () => '00000000-0000-4000-8000-000000000099',
    hashSecret: (kind, value) => hashPlayerPasswordRecoverySecret(kind, value, PEPPER),
    async sendEmail(message) {
      if (init?.sendError) throw new Error('EMAIL_DELIVERY_FAILED');
      sent.push({ to: message.to, text: message.text });
    },
    async prepareChallenge(input) {
      prepared.push(input.identifier);
      if (init?.eligible === false) return { eligible: false };
      active = {
        eligible: true,
        challengeId: 'challenge-1',
        playerUserId,
        email: 'player@nextpari.test',
      };
      return active;
    },
    async markChallengeUnusable() {},
    async verifyChallenge(input) {
      verified.push(input.challengeId);
      if (init?.verifyOk === false) return { ok: false };
      if (input.challengeId !== 'challenge-1') return { ok: false };
      const expected = hashPlayerPasswordRecoverySecret('code', CODE, PEPPER);
      if (input.codeDigest !== expected) {
        attempts += 1;
        return { ok: false };
      }
      if (attempts >= 5) return { ok: false };
      return { ok: true, playerUserId };
    },
    async consumeTicket(digest) {
      consumed.push(digest);
      if (init?.consumeOk === false) return { ok: false };
      if (ticketConsumed) return { ok: false };
      ticketConsumed = true;
      return { ok: true, playerUserId };
    },
    async updateAuthPassword(userId, password) {
      if (init?.updateError === 'policy') throw staffError('PASSWORD_POLICY_INVALID', 400);
      if (init?.updateError === 'fail') throw staffError('PASSWORD_RESET_FAILED', 503);
      passwordUpdates.push({ userId, password });
    },
    async revokeAllSessions(userId) {
      revoked.push(userId);
    },
  };
}

async function start(identifier: string, recovery = createRecoveryPorts()) {
  const result = await handlePlayerAuthRequest(
    { method: 'POST', pathname: PLAYER_PASSWORD_RECOVERY_START_PATH, body: { identifier } },
    createAuthPorts(),
    undefined,
    undefined,
    undefined,
    recovery,
  );
  return { result, recovery };
}

function shapeOf(body: Record<string, unknown>) {
  return {
    ok: body.ok,
    message: body.message,
    keys: Object.keys(body).sort(),
    hasChallengeId: typeof body.challengeId === 'string' && String(body.challengeId).length > 0,
    resendAfterSeconds: body.resendAfterSeconds,
  };
}

describe('player password recovery HTTP', () => {
  it('verified email recovery returns a generic start then a one-time ticket', async () => {
    const { result, recovery } = await start('  Player@Nextpari.test ');
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.message, PLAYER_PASSWORD_RECOVERY_START_MESSAGE);
    assert.equal(result.body.challengeId, 'challenge-1');
    assert.equal(recovery.sent[0]?.to, 'player@nextpari.test');
    assert.match(recovery.sent[0]?.text ?? '', /NextPari password recovery/);
    assert.match(recovery.sent[0]?.text ?? '', /123456/);
    assert.match(recovery.sent[0]?.text ?? '', /10 минут/);
    assert.equal(JSON.stringify(result.body).includes(CODE), false);
    assert.equal(JSON.stringify(result.body).includes('player@nextpari.test'), false);
    assert.equal(JSON.stringify(result.body).includes(USER), false);

    const verified = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_PASSWORD_RECOVERY_VERIFY_PATH,
        body: { challengeId: 'challenge-1', code: CODE, authUserId: 'spoof', email: 'spoof@x.test' },
      },
      createAuthPorts(),
      undefined,
      undefined,
      undefined,
      recovery,
    );
    assert.equal(verified.status, 200);
    assert.equal(verified.body.resetTicket, TICKET);
    assert.equal(JSON.stringify(verified.body).includes(USER), false);
    assert.equal(JSON.stringify(verified.body).includes('player@nextpari.test'), false);

    const reset = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_PASSWORD_RECOVERY_RESET_PATH,
        cookieSecure: true,
        body: { resetTicket: TICKET, newPassword: 'password2', confirmPassword: 'password2' },
      },
      createAuthPorts(),
      undefined,
      undefined,
      undefined,
      recovery,
    );
    assert.equal(reset.status, 200);
    assert.equal(reset.body.message, PLAYER_PASSWORD_RECOVERY_DONE_MESSAGE);
    assert.deepEqual(recovery.passwordUpdates, [{ userId: USER, password: 'password2' }]);
    assert.deepEqual(recovery.revoked, [USER]);
    assert.equal(recovery.createdUsers, 0);
    assert.equal(
      (reset.cookies ?? []).some((row) => row.startsWith(`${PLAYER_ACCESS_COOKIE}=`) && /Max-Age=0/.test(row)),
      true,
    );
    assert.equal(
      (reset.cookies ?? []).some((row) => row.startsWith(`${PLAYER_REFRESH_COOKIE}=`) && /Max-Age=0/.test(row)),
      true,
    );

    const reuse = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_PASSWORD_RECOVERY_RESET_PATH,
        body: { resetTicket: TICKET, newPassword: 'password3', confirmPassword: 'password3' },
      },
      createAuthPorts(),
      undefined,
      undefined,
      undefined,
      recovery,
    );
    assert.equal(reuse.status, 400);
    assert.equal(reuse.body.error, 'RESET_TICKET_INVALID');
    assert.equal(recovery.passwordUpdates.length, 1);
  });

  it('player id with verified email uses the same generic start shape', async () => {
    const emailStart = await start('player@nextpari.test');
    const idStart = await start('110790', emailStart.recovery);
    assert.deepEqual(shapeOf(emailStart.result.body), shapeOf(idStart.result.body));
    assert.equal(idStart.result.status, 200);
    assert.equal(idStart.recovery.prepared.includes('110790'), true);
  });

  it('does not leak enumeration for unknown, unverified, one-click, or rate-limited identifiers', async () => {
    const cases = [
      'unknown@nextpari.test',
      '999999',
      'unverified@nextpari.test',
      'aabbccddeeff0011@auth.nextpari.invalid',
    ];
    const shapes = [];
    for (const identifier of cases) {
      const { result } = await start(identifier, createRecoveryPorts({ eligible: false }));
      assert.equal(result.status, 200);
      assert.equal(result.body.ok, true);
      assert.equal(result.body.message, PLAYER_PASSWORD_RECOVERY_START_MESSAGE);
      assert.equal(result.body.challengeId, '00000000-0000-4000-8000-000000000099');
      assert.equal(JSON.stringify(result.body).includes(identifier), false);
      shapes.push(shapeOf(result.body));
    }
    const eligible = await start('player@nextpari.test');
    assert.equal(eligible.result.status, 200);
    for (const shape of shapes) {
      assert.deepEqual(shape.keys, shapeOf(eligible.result.body).keys);
      assert.equal(shape.message, eligible.result.body.message);
      assert.equal(shape.ok, true);
      assert.equal(shape.resendAfterSeconds, 60);
    }
    assert.equal(eligible.recovery.sent.length, 1);
  });

  it('email provider failure stays generic and does not reveal eligibility', async () => {
    const { result, recovery } = await start('player@nextpari.test', createRecoveryPorts({ sendError: true }));
    assert.equal(result.status, 200);
    assert.equal(result.body.message, PLAYER_PASSWORD_RECOVERY_START_MESSAGE);
    assert.equal(result.body.challengeId, '00000000-0000-4000-8000-000000000099');
    assert.equal(JSON.stringify(result.body).includes('EMAIL_DELIVERY_FAILED'), false);
    assert.equal(recovery.sent.length, 0);
  });

  it('unknown and fake challenges return the same invalid code response', async () => {
    const recovery = createRecoveryPorts();
    const fake = await handlePlayerAuthRequest(
      { method: 'POST', pathname: PLAYER_PASSWORD_RECOVERY_VERIFY_PATH, body: { challengeId: 'missing', code: CODE } },
      createAuthPorts(),
      undefined,
      undefined,
      undefined,
      recovery,
    );
    const wrong = await handlePlayerAuthRequest(
      { method: 'POST', pathname: PLAYER_PASSWORD_RECOVERY_VERIFY_PATH, body: { challengeId: 'challenge-1', code: '000000' } },
      createAuthPorts(),
      undefined,
      undefined,
      undefined,
      recovery,
    );
    assert.equal(fake.status, 400);
    assert.equal(wrong.status, 400);
    assert.equal(fake.body.error, wrong.body.error);
    assert.equal(fake.body.message, PLAYER_PASSWORD_RECOVERY_INVALID_CODE_MESSAGE);
    assert.equal(JSON.stringify(fake.body).includes(USER), false);
  });

  it('reuses the player password policy and requires confirmation', async () => {
    const recovery = createRecoveryPorts();
    const mismatch = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_PASSWORD_RECOVERY_RESET_PATH,
        body: { resetTicket: TICKET, newPassword: 'password2', confirmPassword: 'password3' },
      },
      createAuthPorts(),
      undefined,
      undefined,
      undefined,
      recovery,
    );
    assert.equal(mismatch.status, 400);
    assert.equal(mismatch.body.error, 'PASSWORD_CONFIRMATION_MISMATCH');
    assert.equal(recovery.consumed.length, 0);

    const short = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_PASSWORD_RECOVERY_RESET_PATH,
        body: { resetTicket: TICKET, newPassword: 'short', confirmPassword: 'short' },
      },
      createAuthPorts(),
      undefined,
      undefined,
      undefined,
      recovery,
    );
    assert.equal(short.status, 400);
    assert.equal(short.body.error, 'PASSWORD_POLICY_INVALID');
    assert.equal(recovery.passwordUpdates.length, 0);
  });

  it('does not auto-login, create a second user, or touch wallets', async () => {
    const recovery = createRecoveryPorts();
    await start('player@nextpari.test', recovery);
    await handlePlayerAuthRequest(
      { method: 'POST', pathname: PLAYER_PASSWORD_RECOVERY_VERIFY_PATH, body: { challengeId: 'challenge-1', code: CODE } },
      createAuthPorts(),
      undefined,
      undefined,
      undefined,
      recovery,
    );
    const reset = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_PASSWORD_RECOVERY_RESET_PATH,
        body: { resetTicket: TICKET, newPassword: 'password2', confirmPassword: 'password2' },
      },
      createAuthPorts(),
      undefined,
      undefined,
      undefined,
      recovery,
    );
    assert.equal(reset.body.authenticated, undefined);
    assert.equal('accessToken' in reset.body, false);
    assert.equal(recovery.createdUsers, 0);
    assert.equal(recovery.wallets, 1);
    assert.equal(recovery.passwordUpdates[0]?.userId, USER);
  });

  it('keeps password reset successful when security telemetry throws', async () => {
    const recovery = createRecoveryPorts();
    const throwing: PlayerSecurityObserver = {
      identifierHash: null,
      deviceHash: null,
      networkHash: null,
      userAgentHash: null,
      device: { token: 't', setCookie: 'x=1', created: false },
      async checkLoginRateLimit() { return true; },
      async record() { throw new Error('telemetry down'); },
    };
    const { resetPlayerPasswordWithTicket } = await import('../email/playerPasswordRecoveryService.js');
    const result = await resetPlayerPasswordWithTicket(
      recovery,
      { resetTicket: TICKET, newPassword: 'password2', confirmPassword: 'password2' },
      true,
      throwing,
    );
    assert.equal(result.status, 200);
    assert.equal(recovery.passwordUpdates.length, 1);
    assert.equal(recovery.revoked.length, 1);
  });
});

describe('player password recovery contract', () => {
  it('stores HMAC digests with domain separation and never plaintext secrets', () => {
    const otp = generatePlayerPasswordRecoveryOtp();
    assert.match(otp, /^[0-9]{6}$/);
    const ticket = generatePlayerPasswordResetTicket();
    assert.equal(ticket.length >= 32, true);
    const codeHash = hashPlayerPasswordRecoverySecret('code', '123456', PEPPER);
    const ticketHash = hashPlayerPasswordRecoverySecret('ticket', 'abc', PEPPER);
    assert.equal(codeHash, createHmac('sha256', PEPPER).update('password-recovery-code:123456').digest('hex'));
    assert.equal(ticketHash, createHmac('sha256', PEPPER).update('password-recovery-ticket:abc').digest('hex'));
    assert.notEqual(codeHash, createHmac('sha256', PEPPER).update('123456').digest('hex'));
    assert.equal(recoveryDigestsEqual(codeHash, hashPlayerPasswordRecoverySecret('code', '123456', PEPPER)), true);
    assert.equal(sql.includes('plaintext'), false);
    assert.equal(/\botp\s+TEXT\b/i.test(sql), false);
    assert.equal(sql.includes('code TEXT NOT NULL'), false);
    assert.equal(sql.includes('ticket TEXT NOT NULL'), false);
    assert.equal(sql.includes('password TEXT'), false);
    assert.match(sql, /code_digest TEXT NOT NULL/);
    assert.match(sql, /ticket_digest TEXT NOT NULL UNIQUE/);
    assert.match(sql, /REVOKE ALL ON TABLE private\.player_password_recovery_challenges FROM PUBLIC/);
    assert.match(sql, /REVOKE ALL ON TABLE private\.player_password_recovery_challenges FROM anon, authenticated, service_role/);
    assert.match(sql, /REVOKE ALL ON TABLE private\.player_password_reset_tickets FROM anon, authenticated, service_role/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.player_password_recovery_prepare\(TEXT, TEXT, TIMESTAMPTZ\) FROM anon, authenticated/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.player_password_recovery_prepare\(TEXT, TEXT, TIMESTAMPTZ\) TO service_role/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.player_password_recovery_verify\(UUID, TEXT, TEXT, TIMESTAMPTZ\) TO service_role/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.player_password_recovery_consume_ticket\(TEXT\) TO service_role/);
    assert.equal(sql.includes('GRANT EXECUTE ON FUNCTION public.player_password_recovery_prepare(TEXT, TEXT, TIMESTAMPTZ) TO authenticated'), false);
    assert.equal(sql.includes('GRANT EXECUTE ON FUNCTION public.player_password_recovery_prepare(TEXT, TEXT, TIMESTAMPTZ) TO anon'), false);
  });

  it('enforces cooldown, hourly cap, max attempts, and concurrent-safe locks', () => {
    const prepareStart = sql.indexOf('CREATE OR REPLACE FUNCTION private.player_password_recovery_prepare(');
    const prepareEnd = sql.indexOf('CREATE OR REPLACE FUNCTION public.player_password_recovery_prepare(');
    const prepare = sql.slice(prepareStart, prepareEnd);
    assert.match(prepare, /pg_catalog\.pg_advisory_xact_lock/);
    assert.match(prepare, /nextpari:player-password-recovery:/);
    assert.match(prepare, /INTERVAL '1 hour'/);
    assert.match(prepare, /v_sends >= 5/);
    assert.match(prepare, /INTERVAL '60 seconds'/);
    assert.match(prepare, /SET consumed_at = pg_catalog\.now\(\)/);
    const insertAt = prepare.indexOf('INSERT INTO private.player_password_recovery_challenges');
    const invalidate = prepare.indexOf('SET consumed_at = pg_catalog.now()');
    assert.equal(insertAt > invalidate, true);
    assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS player_password_recovery_challenges_active_uidx/);
    assert.match(sql, /attempt_count >= 0 AND max_attempts = 5/);
    const verifyStart = sql.indexOf('CREATE OR REPLACE FUNCTION private.player_password_recovery_verify(');
    const verifyEnd = sql.indexOf('CREATE OR REPLACE FUNCTION public.player_password_recovery_verify(');
    const verify = sql.slice(verifyStart, verifyEnd);
    assert.match(verify, /FOR UPDATE/);
    assert.match(verify, /attempt_count >= v_row\.max_attempts/);
    assert.match(verify, /SET attempt_count = attempt_count \+ 1/);
    const consumeStart = sql.indexOf('CREATE OR REPLACE FUNCTION private.player_password_recovery_consume_ticket(');
    const consumeEnd = sql.indexOf('CREATE OR REPLACE FUNCTION public.player_password_recovery_consume_ticket(');
    const consume = sql.slice(consumeStart, consumeEnd);
    assert.match(consume, /pg_catalog\.pg_advisory_xact_lock/);
    assert.match(consume, /SET consumed_at = pg_catalog\.now\(\)/);
    assert.match(consume, /consumed_at IS NULL/);
    assert.match(consume, /expires_at > pg_catalog\.now\(\)/);
  });

  it('resolves only canonical verified email and keeps money/security state untouched', () => {
    assert.match(sql, /email_confirmed_at IS NOT NULL/);
    assert.match(sql, /@auth\.nextpari\.invalid/);
    assert.match(sql, /private\.staff_accounts/);
    assert.equal(sql.includes('FROM public.personal_data'), false);
    assert.equal(sql.includes('resetPasswordForEmail'), false);
    assert.equal(sql.includes('apply_wallet_entry'), false);
    assert.equal(sql.includes('INSERT INTO private.wallet_ledger'), false);
    assert.equal(sql.includes('UPDATE public.wallets'), false);
    assert.equal(sql.includes('UPDATE private.wallet_accounts'), false);
    assert.equal(sql.includes('owner_set_player_blocked'), false);
    assert.equal(sql.includes('player_security_restrictions'), false);
    assert.equal(sql.includes('CREATE USER'), false);
    assert.match(sql, /PASSWORD_RECOVERY_REQUESTED/);
    assert.match(sql, /PASSWORD_RECOVERY_VERIFIED/);
    assert.match(sql, /PASSWORD_RECOVERY_COMPLETED/);
    const service = readFileSync(join(root, 'server/email/playerPasswordRecoveryService.ts'), 'utf8');
    assert.match(service, /randomInt/);
    assert.match(service, /randomBytes/);
    assert.equal(service.includes('Math.random'), false);
    assert.match(service, /password-recovery-code:/);
    assert.match(service, /password-recovery-ticket:/);
    assert.match(service, /auth\.admin\.updateUserById/);
    assert.match(service, /\/auth\/v1\/admin\/users\/\$\{userId\}\/logout/);
    assert.equal(service.includes('resetPasswordForEmail'), false);
    assert.equal(service.includes('console.log'), false);
    assert.equal(service.includes('generateLink'), false);
    assert.match(service, /PLAYER_EMAIL_OTP_PEPPER|otpPepper/);
    assert.equal(typeof randomInt, 'function');
    assert.equal(typeof randomBytes, 'function');
  });

  it('keeps recovery off native supabase reset links and out of browser secrets', () => {
    const client = readFileSync(join(root, 'src/lib/playerAuth.ts'), 'utf8');
    const screen = readFileSync(join(root, 'src/screens/AuthScreen.tsx'), 'utf8');
    assert.match(client, /\/api\/player\/password-recovery\/start/);
    assert.match(client, /\/api\/player\/password-recovery\/verify/);
    assert.match(client, /\/api\/player\/password-recovery\/reset/);
    assert.equal(client.includes('resetPasswordForEmail'), false);
    assert.equal(client.includes('RESEND_API_KEY'), false);
    assert.equal(client.includes('PLAYER_EMAIL_OTP_PEPPER'), false);
    assert.equal(client.includes('SUPABASE_SERVICE_ROLE_KEY'), false);
    assert.match(screen, /Забыли пароль\?/);
    assert.match(screen, /Восстановление пароля/);
    assert.match(screen, /ID игрока или подтверждённая почта/);
    assert.match(screen, /Получить код/);
    assert.match(screen, /Подтвердить код/);
    assert.match(screen, /Новый пароль/);
    assert.match(screen, /Повторите новый пароль/);
    assert.match(screen, /Изменить пароль/);
    assert.equal(screen.includes('Восстановление пароля скоро будет доступно'), false);
    assert.equal(screen.includes('resetPasswordForEmail'), false);
    const files = readdirSync(join(root, 'supabase/migrations')).filter((name) => name.includes('_054.sql'));
    assert.deepEqual(files, ['20260914060000_player_password_recovery_054.sql']);
    assert.equal(PLAYER_PASSWORD_POLICY_MESSAGE, 'Пароль должен содержать не менее 8 символов');
  });
});
