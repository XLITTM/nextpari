import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { authBackView, authShowsBack, oneClickCopyAllText, type AuthView } from './authUiFlow';

const here = dirname(fileURLToPath(import.meta.url));

describe('auth UI navigation', () => {
  it('maps back targets without inventing extra routes', () => {
    const cases: Array<[AuthView, AuthView, boolean]> = [
      ['login', 'login', false],
      ['register-menu', 'login', true],
      ['register-email', 'register-menu', true],
      ['register-phone', 'register-menu', true],
      ['register-one-click', 'register-menu', true],
      ['register-one-click-result', 'register-menu', true],
      ['forgot-password', 'login', true],
    ];
    for (const [view, back, shows] of cases) {
      assert.equal(authBackView(view), back, view);
      assert.equal(authShowsBack(view), shows, view);
    }
  });

  it('keeps the approved auth screens without fake APIs', () => {
    const screen = readFileSync(join(here, '../screens/AuthScreen.tsx'), 'utf8');
    assert.equal(screen.includes('/api/player/auth/recover'), false);
    assert.equal(screen.includes('/api/player/auth/reset'), false);
    assert.equal(screen.includes('/api/player/auth/one-click'), false);
    assert.equal(screen.includes('/api/player/auth/login-phone'), false);
    assert.equal(screen.includes('Скоро'), false);
    assert.equal(screen.includes('register-email-phone'), false);
    assert.equal(screen.includes('register-phone-email'), false);
    assert.match(screen, /signInPlayer/);
    assert.match(screen, /signUpPlayer/);
    assert.match(screen, /signUpPlayerByPhone/);
    assert.match(screen, /signUpPlayerOneClick/);
    assert.match(screen, /Я подтверждаю, что мне есть 18 лет/);
    assert.match(screen, /Email или ID игрока/);
    assert.match(screen, /Телефон/);
    assert.match(screen, /Создать аккаунт/);
    assert.match(screen, /Скопировать всё/);
    assert.match(screen, /await onAuthSuccess\(\)/);
    assert.match(screen, /Восстановление пароля скоро будет доступно/);
    assert.equal(screen.includes('publicId'), false);
    assert.equal(screen.includes('Math.random'), false);
    const hero = readFileSync(join(here, '../components/auth/AuthHero.tsx'), 'utf8');
    assert.match(hero, /\/images\/auth\/nextpari-auth-sports-bg\.png/);
    assert.match(hero, /\/logo\.png/);
  });

  it('formats one-click copy text', () => {
    assert.equal(
      oneClickCopyAllText('110790', 'ABC123'),
      'ID игрока: 110790\nПароль: ABC123',
    );
  });
});
