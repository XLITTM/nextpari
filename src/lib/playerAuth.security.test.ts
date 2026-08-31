import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  clearDemoPlayerState,
  mapPlayerAuthError,
  signInPlayer,
  signOutPlayer,
  signUpPlayer,
  validatePlayerEmail,
  validatePlayerPassword,
  validatePlayerPhone,
} from './playerAuth';
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
import { supabase } from './supabase';
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
  'WalletContext.tsx',
  'stores/userStore.ts',
  'hooks/useAuth.ts',
  'lib/bets.ts',
  'games/blackjack/wallet.ts',
  'screens/AuthScreen.tsx',
  'App.tsx',
];

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
    assert.equal(mapPlayerAuthError({ message: 'Password should be at least 8 characters' }), 'password too short');
    assert.equal(mapPlayerAuthError({ message: 'Unable to validate email address' }), 'invalid email');
  });
});

describe('player auth uses Supabase only', () => {
  it('fake a/a does not login and does not call Supabase', async () => {
    let called = false;
    const original = supabase.auth.signInWithPassword;
    supabase.auth.signInWithPassword = async () => {
      called = true;
      return { data: { session: null, user: null }, error: null } as never;
    };
    try {
      await assert.rejects(() => signInPlayer('a', 'a'), /invalid email/);
      assert.equal(called, false);
    } finally {
      supabase.auth.signInWithPassword = original;
    }
  });

  it('valid signIn uses supabase.auth.signInWithPassword', async () => {
    const calls: Array<{ email: string; password: string }> = [];
    const original = supabase.auth.signInWithPassword;
    supabase.auth.signInWithPassword = async (creds) => {
      calls.push({ email: creds.email, password: creds.password });
      return {
        data: {
          session: { user: { id: 'user-1' }, access_token: 'tok' },
          user: { id: 'user-1' },
        },
        error: null,
      } as never;
    };
    try {
      const session = await signInPlayer('player@nextpari.test', 'password1');
      assert.equal(session.user.id, 'user-1');
      assert.deepEqual(calls, [{ email: 'player@nextpari.test', password: 'password1' }]);
    } finally {
      supabase.auth.signInWithPassword = original;
    }
  });

  it('does not call onAuthSuccess path without a session', async () => {
    const original = supabase.auth.signInWithPassword;
    supabase.auth.signInWithPassword = async () => ({
      data: { session: null, user: null },
      error: null,
    }) as never;
    try {
      await assert.rejects(() => signInPlayer('player@nextpari.test', 'password1'), /invalid credentials/);
    } finally {
      supabase.auth.signInWithPassword = original;
    }
  });

  it('registration uses supabase.auth.signUp', async () => {
    const calls: Array<{ email: string; password: string; phone?: string }> = [];
    const original = supabase.auth.signUp;
    supabase.auth.signUp = async (creds) => {
      calls.push({
        email: creds.email,
        password: creds.password,
        phone: (creds.options?.data as { phone?: string } | undefined)?.phone,
      });
      return {
        data: { session: null, user: { id: 'user-2' } },
        error: null,
      } as never;
    };
    try {
      const result = await signUpPlayer({
        email: 'new@nextpari.test',
        password: 'password1',
        phone: '+99365123456',
      });
      assert.equal(result.needsEmailConfirmation, true);
      assert.equal(result.session, null);
      assert.equal(calls[0]?.email, 'new@nextpari.test');
      assert.equal(calls[0]?.phone, '+99365123456');
    } finally {
      supabase.auth.signUp = original;
    }
  });

  it('logout calls supabase.auth.signOut', async () => {
    let signedOut = false;
    const original = supabase.auth.signOut;
    supabase.auth.signOut = async () => {
      signedOut = true;
      return { error: null } as never;
    };
    try {
      await signOutPlayer();
      assert.equal(signedOut, true);
    } finally {
      supabase.auth.signOut = original;
    }
  });
});

describe('player wallet bootstrap', () => {
  it('ensure_player_account is called only after a real session', async () => {
    const originalSession = supabase.auth.getSession;
    const originalRpc = supabase.rpc;
    let rpcCalled = false;
    supabase.auth.getSession = async () => ({ data: { session: null }, error: null }) as never;
    supabase.rpc = async () => {
      rpcCalled = true;
      return { data: null, error: null } as never;
    };
    try {
      await assert.rejects(() => ensureOwnPlayerWallet(), /AUTH_REQUIRED/);
      assert.equal(rpcCalled, false);
    } finally {
      supabase.auth.getSession = originalSession;
      supabase.rpc = originalRpc;
    }
  });

  it('new player bootstrap balance is 0 and reads only own wallet by id', async () => {
    const originalSession = supabase.auth.getSession;
    const originalRpc = supabase.rpc;
    const originalFrom = supabase.from;
    const filters: string[] = [];
    supabase.auth.getSession = async () => ({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    }) as never;
    supabase.rpc = async (name: string) => {
      assert.equal(name, 'ensure_player_account');
      return {
        data: { wallet_id: 'wallet-own', public_id: '110790', legacy_balance: 0, migration_state: 'active' },
        error: null,
      } as never;
    };
    supabase.from = ((table: string) => {
      assert.equal(table, 'wallets');
      return {
        select() {
          return this;
        },
        eq(column: string, value: string) {
          filters.push(`${column}:${value}`);
          return this;
        },
        maybeSingle: async () => ({
          data: { id: 'wallet-own', balance: 0, public_id: '110790' },
          error: null,
        }),
      };
    }) as typeof supabase.from;
    try {
      const wallet = await ensureOwnPlayerWallet();
      assert.equal(wallet.balance, 0);
      assert.equal(wallet.walletId, 'wallet-own');
      assert.deepEqual(filters, ['id:wallet-own']);
    } finally {
      supabase.auth.getSession = originalSession;
      supabase.rpc = originalRpc;
      supabase.from = originalFrom;
    }
  });

  it('local demo values cannot override server balance', async () => {
    persistLocalBalance(1000);
    assert.equal(readPlayerBalance(1000), 0);
    useUserStore.getState().hydrate({ publicId: '110790', balance: 0, walletId: 'wallet-own' });
    useUserStore.getState().credit(500);
    useUserStore.getState().setBalance(1000);
    assert.equal(useUserStore.getState().debit(10), false);
    assert.equal(useUserStore.getState().balance, 0);

    const originalSession = supabase.auth.getSession;
    const originalRpc = supabase.rpc;
    const originalFrom = supabase.from;
    supabase.auth.getSession = async () => ({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    }) as never;
    supabase.rpc = async () => ({
      data: { wallet_id: 'wallet-own', public_id: '110790', legacy_balance: 0 },
      error: null,
    }) as never;
    supabase.from = (() => ({
      select() { return this; },
      eq() { return this; },
      maybeSingle: async () => ({ data: { id: 'wallet-own', balance: 0, public_id: '110790' }, error: null }),
    })) as typeof supabase.from;
    try {
      const snapshot = await syncPlayerWallet();
      assert.equal(snapshot.balance, 0);
    } finally {
      supabase.auth.getSession = originalSession;
      supabase.rpc = originalRpc;
      supabase.from = originalFrom;
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

  it('blocks real-money game wager writes', async () => {
    assert.equal(CANONICAL_GAMES_WAGER_ENABLED, false);
    const saved = await persistWalletBalance(50);
    assert.equal(saved.ok, false);
    assert.equal(blockedGamesWager()?.includes('game engine'), true);
  });
});

describe('player money source scans', () => {
  it('opening the site without a session shows AuthScreen', () => {
    const app = read('App.tsx');
    const hook = read('hooks/useAuth.ts');
    assert.match(app, /getPlayerSession\(/);
    assert.match(app, /subscribePlayerAuth/);
    assert.match(hook, /onAuthStateChange/);
    assert.match(app, /if \(!isAuthenticated\)/);
    assert.match(app, /<AuthScreen/);
    assert.equal(app.includes('bootstrapGuestSession()'), false);
  });

  it('AuthScreen has no guest button and uses email + password labels', () => {
    const auth = read('screens/AuthScreen.tsx');
    assert.equal(auth.includes('Продолжить как гость'), false);
    assert.match(auth, /placeholder="Email"/);
    assert.match(auth, /placeholder="Пароль"/);
    assert.match(auth, /signInWithPassword|signInPlayer/);
    assert.match(auth, /signUpPlayer/);
    assert.match(auth, /ensure_player_account|bootstrapOwnPlayerAccount/);
    assert.equal(auth.includes('walletId'), false);
    assert.equal(auth.includes('publicId'), false);
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
    }
    const wallet = read('lib/playerWallet.ts');
    assert.match(wallet, /rpc\('ensure_player_account'\)/);
    assert.match(wallet, /\.eq\('id', walletId\)/);
  });

  it('logout uses supabase signOut', () => {
    const app = read('App.tsx');
    assert.match(app, /signOutPlayer/);
    assert.equal(read('lib/playerAuth.ts').includes('supabase.auth.signOut()'), true);
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

describe('player source tree has no leftover guest login', () => {
  it('player screens do not offer guest entry', () => {
    const screens = listFiles(join(srcRoot, 'screens'))
      .filter((path) => path.endsWith('.tsx'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    assert.equal(screens.includes('Продолжить как гость'), false);
  });
});
