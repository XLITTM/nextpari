import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PLAYER_PASSWORD_CHANGED_NOTICE,
  PLAYER_PASSWORD_POLICY_MESSAGE,
  changePlayerPassword,
  mapChangePasswordError,
  validatePlayerPassword,
  validatePlayerPasswordChange,
} from './playerAuth';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..');

function read(rel: string) {
  return readFileSync(join(srcRoot, rel), 'utf8');
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('player change password client', () => {
  it('enforces confirmation, current password, policy, and inequality locally', () => {
    assert.equal(validatePlayerPassword('short'), 'password too short');
    assert.equal(validatePlayerPassword('password1'), null);
    assert.equal(validatePlayerPasswordChange({
      currentPassword: '',
      newPassword: 'password2',
      confirmPassword: 'password2',
    }).ok, false);
    const mismatch = validatePlayerPasswordChange({
      currentPassword: 'password1',
      newPassword: 'password2',
      confirmPassword: 'password3',
    });
    assert.equal(mismatch.ok, false);
    if (!mismatch.ok) {
      assert.equal(mismatch.code, 'PASSWORD_CONFIRMATION_MISMATCH');
      assert.equal(mismatch.message, 'Пароли не совпадают');
    }
    const same = validatePlayerPasswordChange({
      currentPassword: 'password1',
      newPassword: 'password1',
      confirmPassword: 'password1',
    });
    assert.equal(same.ok, false);
    if (!same.ok) assert.equal(same.code, 'PASSWORD_SAME_AS_CURRENT');
    const policy = validatePlayerPasswordChange({
      currentPassword: 'password1',
      newPassword: 'short',
      confirmPassword: 'short',
    });
    assert.equal(policy.ok, false);
    if (!policy.ok) {
      assert.equal(policy.code, 'PASSWORD_POLICY_INVALID');
      assert.equal(policy.message, PLAYER_PASSWORD_POLICY_MESSAGE);
    }
  });

  it('posts only current and new password and never echoes secrets', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: String(init?.body ?? '') });
      return new Response(JSON.stringify({ ok: true, currentPassword: 'nope', newPassword: 'nope' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const result = await changePlayerPassword({
      currentPassword: 'password1',
      newPassword: 'password2',
      confirmPassword: 'password2',
    });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, '/api/player/auth/change-password');
    const sent = JSON.parse(calls[0]?.body ?? '{}') as Record<string, unknown>;
    assert.deepEqual(Object.keys(sent).sort(), ['currentPassword', 'newPassword']);
    assert.equal(sent.userId, undefined);
    assert.equal(sent.email, undefined);
    assert.equal(sent.phone, undefined);
    assert.equal(sent.playerId, undefined);
    assert.equal(sent.confirmPassword, undefined);
  });

  it('does not fetch when confirmation fails', async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response('{}');
    }) as typeof fetch;
    await assert.rejects(
      () => changePlayerPassword({
        currentPassword: 'password1',
        newPassword: 'password2',
        confirmPassword: 'password3',
      }),
      /Пароли не совпадают/,
    );
    assert.equal(called, false);
  });

  it('maps current password failure without exposing internals', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      ok: false,
      error: 'CURRENT_PASSWORD_INVALID',
      message: 'AuthApiError: Invalid login credentials',
    }), { status: 401 })) as typeof fetch;
    await assert.rejects(
      () => changePlayerPassword({
        currentPassword: 'password1',
        newPassword: 'password2',
        confirmPassword: 'password2',
      }),
      (err: unknown) => err instanceof Error && err.message === 'Текущий пароль указан неверно',
    );
    assert.equal(mapChangePasswordError('PASSWORD_POLICY_INVALID'), PLAYER_PASSWORD_POLICY_MESSAGE);
    assert.equal(mapChangePasswordError('WEIRD_INTERNAL'), 'Не удалось изменить пароль. Попробуйте ещё раз.');
  });
});

describe('player change password UI', () => {
  it('adds the security option and password fields with show/hide and double-submit lock', () => {
    const settings = read('screens/SettingsScreen.tsx');
    assert.match(settings, /Безопасность/);
    assert.match(settings, /Сменить пароль/);
    assert.match(settings, /Текущий пароль/);
    assert.match(settings, /Новый пароль/);
    assert.match(settings, /Повторите новый пароль/);
    assert.match(settings, /Отмена/);
    assert.match(settings, /if \(submitting\) return/);
    assert.match(settings, /disabled=\{submitting\}/);
    assert.match(settings, /Показать пароль/);
    assert.match(settings, /Скрыть пароль/);
    assert.match(settings, /changePlayerPassword/);
    assert.match(settings, /onPasswordChanged/);
    assert.equal(settings.includes('userId'), false);
    assert.equal(settings.includes('authUserId'), false);
    assert.equal(settings.includes('playerId'), false);
    assert.match(settings, /overflow-x-hidden/);
  });

  it('logs the player out and shows the login notice after success', () => {
    const app = read('App.tsx');
    const auth = read('screens/AuthScreen.tsx');
    assert.match(app, /handlePasswordChanged/);
    assert.match(app, /PLAYER_PASSWORD_CHANGED_NOTICE/);
    assert.match(app, /signOutPlayer/);
    assert.match(app, /notice=\{authNotice\}/);
    assert.equal(PLAYER_PASSWORD_CHANGED_NOTICE, 'Пароль успешно изменён. Войдите с новым паролем.');
    assert.match(auth, /notice: initialNotice/);
    assert.match(auth, /text-emerald-800/);
  });

  it('leaves email, phone, player ID, and one-click login unchanged', () => {
    const auth = read('screens/AuthScreen.tsx');
    assert.match(auth, /signInPlayer/);
    assert.match(auth, /mode: 'identifier'/);
    assert.match(auth, /mode: 'phone'/);
    assert.match(auth, /Email или ID игрока/);
    assert.match(auth, /signUpPlayerByPhone/);
    assert.match(auth, /signUpPlayerOneClick/);
    assert.match(auth, /Забыли пароль\?/);
    assert.match(auth, /startPlayerPasswordRecovery/);
    assert.equal(auth.includes('Восстановление пароля скоро будет доступно'), false);
    assert.equal(auth.includes('/api/player/auth/change-password'), false);
    const owner = read('owner/auth/OwnerAuthProvider.tsx');
    const manager = read('manager/auth/ManagerAuthProvider.tsx');
    const cashier = read('cashier/auth/CashierAuthProvider.tsx');
    assert.equal(owner.includes('change-password'), false);
    assert.equal(manager.includes('change-password'), false);
    assert.equal(cashier.includes('change-password'), false);
  });

  it('does not add financial or recovery APIs', () => {
    const settings = read('screens/SettingsScreen.tsx');
    assert.equal(settings.includes('owner_debit_player'), false);
    assert.equal(settings.includes('apply_wallet_entry'), false);
    assert.equal(settings.includes('/api/player/auth/recover'), false);
    assert.equal(settings.includes('otp'), false);
    assert.equal(settings.includes('SMS'), false);
  });
});
