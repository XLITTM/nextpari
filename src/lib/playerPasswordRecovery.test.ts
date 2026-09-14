import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  PLAYER_PASSWORD_POLICY_MESSAGE,
  PLAYER_PASSWORD_RECOVERY_DONE_MESSAGE,
  PLAYER_PASSWORD_RECOVERY_START_MESSAGE,
  mapPlayerPasswordRecoveryError,
  resetPlayerPasswordWithTicket,
  startPlayerPasswordRecovery,
  validatePlayerPassword,
  validatePlayerPasswordReset,
  verifyPlayerPasswordRecovery,
} from './playerAuth';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('player password recovery client', () => {
  it('reuses the canonical password policy and requires confirmation', () => {
    assert.equal(validatePlayerPassword('short'), 'password too short');
    assert.equal(validatePlayerPassword('password1'), null);
    const mismatch = validatePlayerPasswordReset({
      newPassword: 'password2',
      confirmPassword: 'password3',
    });
    assert.equal(mismatch.ok, false);
    if (!mismatch.ok) {
      assert.equal(mismatch.code, 'PASSWORD_CONFIRMATION_MISMATCH');
      assert.equal(mismatch.message, 'Пароли не совпадают');
    }
    const policy = validatePlayerPasswordReset({
      newPassword: 'short',
      confirmPassword: 'short',
    });
    assert.equal(policy.ok, false);
    if (!policy.ok) {
      assert.equal(policy.code, 'PASSWORD_POLICY_INVALID');
      assert.equal(policy.message, PLAYER_PASSWORD_POLICY_MESSAGE);
    }
  });

  it('posts only identifier on start and never echoes secrets', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: String(init?.body ?? '') });
      return new Response(JSON.stringify({
        ok: true,
        message: PLAYER_PASSWORD_RECOVERY_START_MESSAGE,
        challengeId: 'challenge-1',
        resendAfterSeconds: 60,
        email: 'leaked@nextpari.test',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    const result = await startPlayerPasswordRecovery(' 110790 ');
    assert.equal(result.ok, true);
    assert.equal(result.message, PLAYER_PASSWORD_RECOVERY_START_MESSAGE);
    assert.equal(result.challengeId, 'challenge-1');
    assert.equal(calls[0]?.url, '/api/player/password-recovery/start');
    assert.equal(JSON.parse(calls[0]?.body ?? '{}').identifier, '110790');
    assert.equal('email' in result, false);
  });

  it('returns a reset ticket from verify and then resets without auto-login', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/verify')) {
        return new Response(JSON.stringify({ ok: true, resetTicket: 'ticket-1', authUserId: 'nope' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      assert.equal(url, '/api/player/password-recovery/reset');
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      assert.equal(body.resetTicket, 'ticket-1');
      assert.equal(body.newPassword, 'password2');
      assert.equal(body.confirmPassword, 'password2');
      return new Response(JSON.stringify({
        ok: true,
        message: PLAYER_PASSWORD_RECOVERY_DONE_MESSAGE,
        accessToken: 'nope',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    const verified = await verifyPlayerPasswordRecovery({ challengeId: 'challenge-1', code: '123456' });
    assert.equal(verified.resetTicket, 'ticket-1');
    const reset = await resetPlayerPasswordWithTicket({
      resetTicket: verified.resetTicket,
      newPassword: 'password2',
      confirmPassword: 'password2',
    });
    assert.equal(reset.message, PLAYER_PASSWORD_RECOVERY_DONE_MESSAGE);
    assert.equal(mapPlayerPasswordRecoveryError('RECOVERY_CODE_INVALID'), 'Неверный или истёкший код.');
  });
});
