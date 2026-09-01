import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  clearDemoPlayerState,
  fetchPlayerMe,
  fetchPlayerProfile,
  isPlayerProfileComplete,
  mapPlayerAuthError,
  playerDisplayName,
  savePlayerProfile,
  signInPlayer,
  signOutPlayer,
  signUpPlayer,
  validatePlayerEmail,
  validatePlayerPassword,
  validatePlayerPhone,
  walletViewFromSnapshot,
  EMPTY_PLAYER_PROFILE,
} from './playerAuth';
import { formatPlayerMoney } from '../WalletContext';
import { bootstrapGuestSession, isAuthenticatedSession } from '../hooks/useAuth';
import {
  CANONICAL_GAMES_WAGER_ENABLED,
  CANONICAL_SPORTS_BET_ENABLED,
  blockedGamesWager,
  blockedSportsBet,
} from './playerMoneyGate';
import { persistLocalBalance, readPlayerBalance, syncPlayerWallet } from './playerProfile';
import { ensureOwnPlayerWallet } from './playerWallet';
import { persistWalletBalance } from '../games/blackjack/wallet';
import { placeBet } from './bets';
import { useUserStore } from '../stores/userStore';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..');

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return [path];
  });
}

function read(rel: string) {
  return readFileSync(join(srcRoot, rel), 'utf8');
}

const playerMoneyFiles = [
  'lib/playerAuth.ts',
  'lib/playerWallet.ts',
  'lib/playerProfile.ts',
  'lib/playerMoneyGate.ts',
  'lib/playerGames.ts',
  'WalletContext.tsx',
  'stores/userStore.ts',
  'hooks/useAuth.ts',
  'lib/bets.ts',
  'games/blackjack/wallet.ts',
  'screens/AuthScreen.tsx',
  'App.tsx',
];

const sameOriginPlayerFiles = [
  'App.tsx',
  'screens/AuthScreen.tsx',
  'screens/MenuScreen.tsx',
  'screens/PersonalDataScreen.tsx',
  'WalletContext.tsx',
  'ProfileContext.tsx',
  'lib/playerAuth.ts',
  'lib/playerWallet.ts',
  'hooks/useAuth.ts',
  'lib/playerGames.ts',
];

const PLAYER_ME = {
  ok: true,
  authenticated: true,
  player: { publicId: '110790', email: 'player@nextpari.test' },
  wallet: { balance: 0, currency: 'TMTM', status: 'active', migrationState: 'active' },
};

function mockFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> | Response) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => handler(input, init)) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('player auth validation', () => {
  it('rejects empty and invalid email', () => {
    assert.equal(validatePlayerEmail(''), 'invalid email');
    assert.equal(validatePlayerEmail('   '), 'invalid email');
    assert.equal(validatePlayerEmail('a'), 'invalid email');
    assert.equal(validatePlayerEmail('a@a'), 'invalid email');
    assert.equal(validatePlayerEmail('player@nextpari.test'), null);
  });

  it('rejects password shorter than 8', () => {
    assert.equal(validatePlayerPassword('a'), 'password too short');
    assert.equal(validatePlayerPassword('1234567'), 'password too short');
    assert.equal(validatePlayerPassword('12345678'), null);
  });

  it('rejects unreasonable phone', () => {
    assert.equal(validatePlayerPhone('12'), 'invalid phone');
    assert.equal(validatePlayerPhone('+99365123456'), null);
  });

  it('maps safe auth errors', () => {
    assert.equal(mapPlayerAuthError({ message: 'Invalid login credentials' }), 'invalid credentials');
    assert.equal(mapPlayerAuthError({ message: 'Email not confirmed' }), 'email confirmation required');
    assert.equal(mapPlayerAuthError({ code: 'EMAIL_CONFIRMATION_REQUIRED' }), 'email confirmation required');
    assert.equal(mapPlayerAuthError({ message: 'Password should be at least 8 characters' }), 'password too short');
    assert.equal(mapPlayerAuthError({ message: 'Unable to validate email address' }), 'invalid email');
  });
});

describe('player auth uses same-origin BFF', () => {
  it('fake a/a does not login and does not fetch', async () => {
    let called = false;
    const restore = mockFetch(async () => {
      called = true;
      return jsonResponse(200, PLAYER_ME);
    });
    try {
      await assert.rejects(() => signInPlayer('a', 'a'), /invalid email/);
      assert.equal(called, false);
    } finally {
      restore();
    }
  });

  it('valid signIn posts /api/player/auth/login with credentials', async () => {
    const calls: Array<{ url: string; method: string; credentials?: RequestCredentials; body?: unknown }> = [];
    const restore = mockFetch(async (input, init) => {
      calls.push({
        url: String(input),
        method: String(init?.method ?? 'GET'),
        credentials: init?.credentials,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return jsonResponse(200, PLAYER_ME);
    });
    try {
      const session = await signInPlayer('player@nextpari.test', 'password1');
      assert.equal(session.user.email, 'player@nextpari.test');
      assert.deepEqual(calls, [{
        url: '/api/player/auth/login',
        method: 'POST',
        credentials: 'same-origin',
        body: { email: 'player@nextpari.test', password: 'password1' },
      }]);
    } finally {
      restore();
    }
  });

  it('does not treat a failed login as a session', async () => {
    const restore = mockFetch(async () => jsonResponse(401, { ok: false, error: 'AUTH_FAILED' }));
    try {
      await assert.rejects(() => signInPlayer('player@nextpari.test', 'password1'), /invalid credentials/);
    } finally {
      restore();
    }
  });

  it('registration posts /api/player/auth/register', async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    const restore = mockFetch(async (input, init) => {
      calls.push({
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return jsonResponse(409, { ok: false, error: 'EMAIL_CONFIRMATION_REQUIRED' });
    });
    try {
      const result = await signUpPlayer({
        email: 'new@nextpari.test',
        password: 'password1',
        phone: '+99365123456',
      });
      assert.equal(result.needsEmailConfirmation, true);
      assert.equal(result.session, null);
      assert.equal(calls[0]?.url, '/api/player/auth/register');
      assert.deepEqual(calls[0]?.body, {
        email: 'new@nextpari.test',
        password: 'password1',
        phone: '+99365123456',
      });
    } finally {
      restore();
    }
  });

  it('logout posts /api/player/auth/logout', async () => {
    let path = '';
    const restore = mockFetch(async (input, init) => {
      path = String(input);
      assert.equal(init?.method, 'POST');
      assert.equal(init?.credentials, 'same-origin');
      return jsonResponse(200, { ok: true });
    });
    try {
      await signOutPlayer();
      assert.equal(path, '/api/player/auth/logout');
    } finally {
      restore();
    }
  });
});

describe('player wallet bootstrap', () => {
  it('/api/player/me is required and no access without a session', async () => {
    const calls: string[] = [];
    const restore = mockFetch(async (input) => {
      calls.push(String(input));
      return jsonResponse(401, { ok: false, authenticated: false, error: 'JWT_REQUIRED' });
    });
    try {
      await assert.rejects(() => ensureOwnPlayerWallet(), /AUTH_REQUIRED/);
      assert.equal(await fetchPlayerMe(), null);
      assert.deepEqual(calls, ['/api/player/me', '/api/player/me']);
    } finally {
      restore();
    }
  });

  it('new player bootstrap balance is 0 and never exposes a wallet UUID', async () => {
    const restore = mockFetch(async (input) => {
      assert.equal(String(input), '/api/player/me');
      return jsonResponse(200, {
        ...PLAYER_ME,
        wallet: { ...PLAYER_ME.wallet, balance: 0 },
      });
    });
    try {
      const wallet = await ensureOwnPlayerWallet();
      assert.equal(wallet.balance, 0);
      assert.equal(wallet.publicId, '110790');
      assert.equal('walletId' in wallet, false);
    } finally {
      restore();
    }
  });

  it('local demo values cannot override server balance', async () => {
    persistLocalBalance(1000);
    assert.equal(readPlayerBalance(1000), 0);
    useUserStore.getState().hydrate({ publicId: '110790', balance: 0, walletId: null });
    useUserStore.getState().credit(500);
    useUserStore.getState().setBalance(1000);
    assert.equal(useUserStore.getState().debit(10), false);
    assert.equal(useUserStore.getState().balance, 0);

    const restore = mockFetch(async () => jsonResponse(200, PLAYER_ME));
    try {
      const snapshot = await syncPlayerWallet();
      assert.equal(snapshot.balance, 0);
      assert.equal(snapshot.walletId, null);
    } finally {
      restore();
    }
  });
});

describe('demo guest and money fallbacks are gone', () => {
  it('bootstrapGuestSession has no sessionStorage authority', () => {
    assert.equal(bootstrapGuestSession(), false);
    assert.equal(isAuthenticatedSession(), false);
  });

  it('clears local demo keys without treating them as security', () => {
    const store: Record<string, string> = {
      'nextpari-auth': '1',
      'nextpari-player-profile': '{"demoBalance":1000}',
      player_balance: '1000',
      'user-store': '{"state":{"balance":1000}}',
      'favorites-store': 'keep',
    };
    const prevSession = globalThis.sessionStorage;
    const prevLocal = globalThis.localStorage;
    const memory = {
      getItem(key: string) { return store[key] ?? null; },
      setItem(key: string, value: string) { store[key] = value; },
      removeItem(key: string) { delete store[key]; },
    };
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: memory });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
    try {
      clearDemoPlayerState();
      assert.equal(store['nextpari-auth'], undefined);
      assert.equal(store['nextpari-player-profile'], undefined);
      assert.equal(store.player_balance, undefined);
      assert.equal(store['user-store'], undefined);
      assert.equal(store['favorites-store'], 'keep');
    } finally {
      Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: prevSession });
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: prevLocal });
    }
  });
});

describe('betting and game money gates', () => {
  it('blocks real-money sports bet submission', async () => {
    assert.equal(CANONICAL_SPORTS_BET_ENABLED, false);
    const result = await placeBet({
      selections: [{
        matchId: 'm1',
        matchLabel: 'A — B',
        market: '1X2',
        outcome: '1',
        odds: 2,
      } as never],
      stake: 10,
      mode: 'single',
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Канонический betting engine/);
    assert.equal(blockedSportsBet()?.includes('реальные деньги'), true);
  });

  it('keeps persistWalletBalance non-authoritative after the canonical game engine', async () => {
    assert.equal(CANONICAL_GAMES_WAGER_ENABLED, true);
    const saved = await persistWalletBalance(50);
    assert.equal(saved.ok, false);
    assert.equal(blockedGamesWager(), null);
  });
});

describe('player money source scans', () => {
  it('opening the site without a session shows AuthScreen via /api/player/me', () => {
    const app = read('App.tsx');
    const hook = read('hooks/useAuth.ts');
    assert.match(app, /fetchPlayerMe\(/);
    assert.match(app, /\/api\/player\/me|fetchPlayerMe/);
    assert.equal(app.includes('supabase.auth'), false);
    assert.equal(hook.includes('onAuthStateChange'), false);
    assert.match(app, /if \(!isAuthenticated\)/);
    assert.match(app, /<AuthScreen/);
    assert.equal(app.includes('bootstrapGuestSession()'), false);
  });

  it('AuthScreen has no guest button and uses email + password labels', () => {
    const auth = read('screens/AuthScreen.tsx');
    assert.equal(auth.includes('Продолжить как гость'), false);
    assert.match(auth, /placeholder="Email"/);
    assert.match(auth, /placeholder="Пароль"/);
    assert.match(auth, /signInPlayer/);
    assert.match(auth, /signUpPlayer/);
    assert.match(auth, /email confirmation required|Подтвердите email/);
    assert.equal(auth.includes('walletId'), false);
    assert.equal(auth.includes('publicId'), false);
    assert.equal(auth.includes('supabase'), false);
  });

  it('removes demo balance authority from player money paths', () => {
    for (const file of playerMoneyFiles) {
      const source = read(file);
      assert.equal(source.includes('DEMO_BALANCE'), false, file);
      assert.equal(source.includes('ensureLocalGuest'), false, file);
      assert.equal(source.includes('demoBalance'), false, file);
    }
    const profile = read('lib/playerProfile.ts');
    const walletCtx = read('WalletContext.tsx');
    const userStore = read('stores/userStore.ts');
    const useAuth = read('hooks/useAuth.ts');
    assert.equal(profile.includes('1000'), false);
    assert.equal(walletCtx.includes('1000'), false);
    assert.equal(userStore.includes('1000'), false);
    assert.match(useAuth, /return false/);
    assert.equal(useAuth.includes("sessionStorage.setItem(AUTH_KEY, '1')"), false);
  });

  it('has no browser wallet insert, update, or first-wallet select in player money paths', () => {
    const files = [
      'lib/playerWallet.ts',
      'lib/playerProfile.ts',
      'WalletContext.tsx',
      'lib/bets.ts',
      'games/blackjack/wallet.ts',
    ];
    for (const file of files) {
      const source = read(file);
      assert.equal(source.includes(".insert(") && source.includes('wallets'), false, `${file} insert`);
      assert.equal(/from\('wallets'\)[\s\S]{0,200}\.insert\(/.test(source), false, `${file} insert`);
      assert.equal(/from\('wallets'\)[\s\S]{0,240}\.update\(/.test(source), false, `${file} update`);
      assert.equal(/order\('created_at'[\s\S]{0,80}limit\(1\)/.test(source), false, `${file} first wallet`);
      assert.equal(source.includes("rpc('ensure_player_account')"), false, `${file} browser rpc`);
    }
    const wallet = read('lib/playerWallet.ts');
    assert.match(wallet, /fetchPlayerMe/);
    assert.equal(wallet.includes('supabase'), false);
  });

  it('logout uses same-origin /api/player/auth/logout', () => {
    const app = read('App.tsx');
    assert.match(app, /signOutPlayer/);
    assert.match(read('lib/playerAuth.ts'), /\/api\/player\/auth\/logout/);
  });

  it('player production files never call *.supabase.co or supabase.auth', () => {
    for (const file of sameOriginPlayerFiles) {
      const source = read(file);
      assert.equal(source.includes('supabase.co'), false, file);
      assert.equal(source.includes('supabase.auth'), false, file);
      assert.equal(source.includes("from './supabase'"), false, file);
      assert.equal(source.includes("from '../lib/supabase'"), false, file);
      assert.equal(source.includes('createClient'), false, file);
    }
  });

  it('Header and Menu show unavailable instead of fake money', () => {
    const header = read('components/Header.tsx');
    const menu = read('screens/MenuScreen.tsx');
    assert.match(header, /balanceLabel/);
    assert.match(menu, /недоступен|formatPlayerMoney|balanceLabel/);
    assert.equal(menu.includes('DEMO_PUBLIC_ID'), false);
    assert.equal(read('lib/siteMessages.ts').includes('729767'), false);
  });
});

describe('new player profile onboarding', () => {
  it('new player shows Новый игрок and never Wiktoriya Sarkisyan', () => {
    const menu = read('screens/MenuScreen.tsx');
    assert.equal(menu.includes('Wiktoriya Sarkisyan'), false);
    assert.equal(menu.includes('Wiktoriya'), false);
    assert.match(menu, /playerDisplayName/);
    assert.match(menu, /ID:/);
    assert.match(menu, /Заполнить профиль/);
    assert.equal(playerDisplayName({ first_name: '', last_name: '' }), 'Новый игрок');
    assert.equal(playerDisplayName({ firstName: '', lastName: '' }), 'Новый игрок');
    assert.equal(playerDisplayName({ first_name: 'Азиз', last_name: 'Бердиев' }), 'Азиз Бердиев');
  });

  it('zero balance renders 0 TMTM and 401 does not poison wallet state', () => {
    assert.equal(formatPlayerMoney(0, true, false), '0 TMTM');
    assert.equal(formatPlayerMoney(0, false, false), 'недоступен');
    const idle = walletViewFromSnapshot(null);
    assert.equal(idle.available, false);
    assert.equal(idle.error, null);
    assert.equal(idle.balance, 0);
    assert.equal(idle.publicId, null);
    const ready = walletViewFromSnapshot({
      authenticated: true,
      player: { publicId: '110790', email: 'player@nextpari.test' },
      wallet: { balance: 0, currency: 'TMTM', status: 'active', migrationState: 'active' },
      profile: EMPTY_PLAYER_PROFILE,
    });
    assert.equal(ready.available, true);
    assert.equal(ready.balance, 0);
    assert.equal(ready.publicId, '110790');
    assert.equal(formatPlayerMoney(ready.balance, ready.available, false), '0 TMTM');
  });

  it('wallet and profile refresh after login and register', () => {
    const app = read('App.tsx');
    const auth = read('screens/AuthScreen.tsx');
    assert.match(app, /refreshWallet/);
    assert.match(app, /refreshProfile/);
    assert.match(app, /await Promise\.all\(\[refreshWallet\(\), refreshProfile\(\)\]\)/);
    assert.match(auth, /await onAuthSuccess\(\)/);
    assert.match(auth, /signInPlayer/);
    assert.match(auth, /signUpPlayer/);
  });

  it('profile starts empty and save is scoped to the current session', async () => {
    assert.equal(EMPTY_PLAYER_PROFILE.firstName, '');
    assert.equal(EMPTY_PLAYER_PROFILE.lastName, '');
    assert.equal(isPlayerProfileComplete(EMPTY_PLAYER_PROFILE), false);
    const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
    const restore = mockFetch(async (input, init) => {
      const method = String(init?.method ?? 'GET');
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
      calls.push({ url: String(input), method, body });
      if (method === 'GET') {
        return jsonResponse(401, { ok: false, authenticated: false, error: 'JWT_REQUIRED' });
      }
      return jsonResponse(200, {
        ok: true,
        authenticated: true,
        player: { publicId: '110790', email: 'player@nextpari.test' },
        profile: {
          firstName: 'Азиз',
          lastName: 'Бердиев',
          middleName: '',
          birthDate: '1995-01-02',
          passport: 'AB1234567',
          phone: '+99365123456',
          email: 'player@nextpari.test',
          phoneVerified: false,
          emailVerified: false,
        },
      });
    });
    try {
      assert.equal(await fetchPlayerProfile(), null);
      const saved = await savePlayerProfile({
        firstName: 'Азиз',
        lastName: 'Бердиев',
        middleName: '',
        birthDate: '1995-01-02',
        passport: 'AB1234567',
      });
      assert.equal(playerDisplayName(saved), 'Азиз Бердиев');
      assert.equal(saved.phoneVerified, false);
      assert.deepEqual(calls[0], { url: '/api/player/profile', method: 'GET', body: undefined });
      assert.equal(calls[1]?.url, '/api/player/profile');
      assert.equal(calls[1]?.method, 'PUT');
      assert.deepEqual(calls[1]?.body, {
        firstName: 'Азиз',
        lastName: 'Бердиев',
        middleName: '',
        birthDate: '1995-01-02',
        passport: 'AB1234567',
      });
      assert.equal(calls[1]?.body && 'userId' in calls[1].body, false);
      assert.equal(calls[1]?.body && 'walletId' in calls[1].body, false);
      assert.equal(calls[1]?.body && 'profileId' in calls[1].body, false);
    } finally {
      restore();
    }
  });

  it('has no fake OTP verification and no local identity', () => {
    const personal = read('screens/PersonalDataScreen.tsx');
    const profile = read('ProfileContext.tsx');
    const menu = read('screens/MenuScreen.tsx');
    assert.equal(personal.includes('setTimeout'), false);
    assert.equal(personal.includes('Сохранение временно недоступно'), false);
    assert.equal(personal.includes('Код из SMS'), false);
    assert.equal(personal.includes('Код из письма'), false);
    assert.match(personal, /save\(/);
    assert.match(profile, /savePlayerProfile|save\(/);
    assert.match(profile, /fetchPlayerProfile/);
    assert.equal(profile.includes('localStorage'), false);
    assert.equal(menu.includes('localStorage'), false);
    assert.equal(read('lib/playerAuth.ts').includes('userId'), false);
  });
});

describe('player source tree has no leftover guest login', () => {
  it('player screens do not offer guest entry', () => {
    const screens = listFiles(join(srcRoot, 'screens'))
      .filter((path) => path.endsWith('.tsx'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    assert.equal(screens.includes('Продолжить как гость'), false);
  });
});
