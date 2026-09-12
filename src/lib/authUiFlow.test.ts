import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { authBackView, authShowsBack, oneClickCopyAllText, planOneClickContinue, ONE_CLICK_LOGIN_NOTICE, type AuthView } from './authUiFlow';

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
    assert.match(screen, /handleOneClickContinue/);
    assert.match(screen, /planOneClickContinue/);
    assert.match(screen, /await onAuthSuccess\(\)/);
    assert.equal(screen.includes("setIssuedSecret(''); void onAuthSuccess()"), false);
    assert.match(screen, /Восстановление пароля скоро будет доступно/);
    assert.equal(screen.includes('publicId'), false);
    assert.equal(screen.includes('Math.random'), false);
    const hero = readFileSync(join(here, '../components/auth/AuthHero.tsx'), 'utf8');
    assert.match(hero, /\/images\/auth\/nextpari-auth-sports-bg\.png/);
    assert.match(hero, /\/logo\.png/);
    assert.match(hero, /alt="NextPari"/);
    assert.match(hero, /Ставки на спорт онлайн/);
    assert.equal(/<h1[\s\S]*?>[\s\S]*NextPari[\s\S]*<\/h1>/.test(hero), false);
    assert.match(screen, /view === 'login'[\s\S]*100svh/);
    assert.match(screen, /overflow-y-auto/);
    assert.equal(screen.includes('overflow-y-hidden'), false);
    assert.equal(screen.includes('min-h-[100vh]'), false);
    assert.equal(screen.includes('min-h-screen'), false);
  });

  it('formats one-click copy text', () => {
    assert.equal(
      oneClickCopyAllText('110790', 'ABC123'),
      'ID игрока: 110790\nПароль: ABC123',
    );
  });

  it('sends authenticated one-click players into the app', () => {
    assert.deepEqual(
      planOneClickContinue({ authenticated: true, playerId: '110790' }),
      { kind: 'enter-app' },
    );
  });

  it('sends unauthenticated one-click players back to ID login without a password', () => {
    const plan = planOneClickContinue({ authenticated: false, playerId: '110790' });
    assert.deepEqual(plan, {
      kind: 'login-with-id',
      playerId: '110790',
      notice: ONE_CLICK_LOGIN_NOTICE,
    });
    const screen = readFileSync(join(here, '../screens/AuthScreen.tsx'), 'utf8');
    assert.match(screen, /setLoginMode\('identifier'\)/);
    assert.match(screen, /setLoginIdentifier\(plan\.playerId\)/);
    assert.match(screen, /setLoginPassword\(''\)/);
    assert.match(screen, /setIssuedSecret\(''\)/);
    assert.equal(screen.includes('setLoginPassword(issuedSecret)'), false);
    assert.equal(screen.includes('setLoginPassword(result.generatedPassword)'), false);
    assert.match(screen, /if \(plan\.kind === 'enter-app'\)[\s\S]*await onAuthSuccess\(\)/);
    assert.match(screen, /kind === 'enter-app'[\s\S]*return;[\s\S]*setLoginMode\('identifier'\)/);
  });
});
