import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import { PLAYER_ACCESS_COOKIE } from '../player/playerCookies.js';
import { PLAYER_EXTERNAL_CASINO_GATE_RPC } from '../player/playerSecurityRestrictionGate.js';
import type { PlayerAuthGatewayPorts } from '../player/playerAuthService.js';
import {
  BETCONSTRUCT_METHOD_UNSUPPORTED,
  BETCONSTRUCT_NOT_CONFIGURED,
  BETCONSTRUCT_PROVIDER_KEY,
  BETCONSTRUCT_SINGLE_WALLET_METHODS,
  BETCONSTRUCT_SPORTSBOOK_OPERATOR_METHODS,
  betConstructCredentialStatus,
  isBetConstructLive,
} from './config.js';
import {
  bindCurrencyLaunchToken,
  buildBetConstructCasinoIframeUrl,
  buildBetConstructSportsbookIframeUrl,
  isAllowedBetConstructIframeSrc,
} from './iframe.js';
import {
  handleBetConstructRequest,
  isBetConstructPath,
} from './http.js';
import {
  BETCONSTRUCT_CASINO_SECURITY_GATE,
  PLAYER_BETCONSTRUCT_CASINO_LAUNCH_PATH,
  PLAYER_BETCONSTRUCT_SPORTSBOOK_LAUNCH_PATH,
} from './launch.js';
import {
  BETCONSTRUCT_OPERATOR_BASE,
  betConstructOperatorCallbackPath,
} from './operatorApi.js';
import {
  BETCONSTRUCT_WALLET_BASE,
  betConstructWalletCallbackPath,
} from './singleWallet.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function listTs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listTs(path);
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')
      ? entry.name.includes('.test.') ? [] : [path]
      : [];
  });
}

const FORBIDDEN_IMPORT = /from\s+['"][^'"]*(sportsStore|quoteProvider|lsports|sportsPlace)/;

const PLAYER_USER_ID = '11111111-1111-4111-8111-111111111111';
const WALLET_ID = '22222222-2222-4222-8222-222222222222';
const ISSUED_AT_MS = 1_714_000_000_000;

function playerCookie(access = 'player-access'): string {
  return `${PLAYER_ACCESS_COOKIE}=${encodeURIComponent(access)}`;
}

function rejectingPlayerPorts(): PlayerAuthGatewayPorts {
  const reject = async () => {
    throw staffError('JWT_INVALID', 401);
  };
  return {
    signInWithPassword: reject,
    signUp: reject,
    refreshSession: reject,
    getAuthUser: reject,
    ensurePlayerAccount: reject,
    loadOwnWallet: reject,
    savePlayerProfile: reject,
  };
}

function verifiedPlayerPorts(): PlayerAuthGatewayPorts {
  return {
    async signInWithPassword() {
      throw new Error('unused');
    },
    async signUp() {
      throw new Error('unused');
    },
    async refreshSession() {
      throw staffError('JWT_INVALID', 401);
    },
    async getAuthUser() {
      return { id: 'auth-user-1', email: 'player@nextpari.test' };
    },
    async ensurePlayerAccount() {
      return {
        walletId: WALLET_ID,
        publicId: '110790',
        legacyBalance: 0,
        migrationState: 'active',
      };
    },
    async loadOwnWallet() {
      return { balance: 10, currency: 'USD', status: 'active', publicId: '110790' };
    },
    async savePlayerProfile() {},
  };
}

describe('BetConstruct iframe-first architecture', () => {
  it('stays live=false even when dummy credentials are present', () => {
    assert.equal(isBetConstructLive(process.env), false);
    assert.equal(isBetConstructLive({
      BETCONSTRUCT_ENABLED: '1',
      BETCONSTRUCT_OPERATOR_ID: 'op',
      BETCONSTRUCT_SPORTS_SHARED_KEY: 'sports-key',
      BETCONSTRUCT_SPORTS_ALLOWED_IPS: '203.0.113.10',
      BETCONSTRUCT_CASINO_SHARED_KEY: 'casino-key',
      BETCONSTRUCT_CASINO_ALLOWED_IPS: '198.51.100.20',
      BETCONSTRUCT_SPORTSBOOK_IFRAME_ORIGIN: 'https://sport.example',
      BETCONSTRUCT_CASINO_IFRAME_ORIGIN: 'https://casino.example',
    }), false);
    assert.equal(BETCONSTRUCT_PROVIDER_KEY, 'betconstruct');
  });

  it('exposes sports and casino credential status separately without shared-key fallback', () => {
    const empty = betConstructCredentialStatus({});
    assert.equal(empty.allPresent, false);
    assert.equal(empty.sportsSharedKey, false);
    assert.equal(empty.casinoSharedKey, false);

    const sportsOnly = betConstructCredentialStatus({
      BETCONSTRUCT_ENABLED: '1',
      BETCONSTRUCT_OPERATOR_ID: 'op',
      BETCONSTRUCT_SPORTS_SHARED_KEY: 'sports-secret',
      BETCONSTRUCT_SPORTS_ALLOWED_IPS: '203.0.113.10',
      BETCONSTRUCT_SPORTSBOOK_IFRAME_ORIGIN: 'https://sport.example',
    });
    assert.equal(sportsOnly.sportsSharedKey, true);
    assert.equal(sportsOnly.sportsAllowedIps, true);
    assert.equal(sportsOnly.operatorId, true);
    assert.equal(sportsOnly.sportsbookIframeOrigin, true);
    assert.equal(sportsOnly.casinoSharedKey, false);
    assert.equal(sportsOnly.casinoAllowedIps, false);
    assert.equal(sportsOnly.casinoIframeOrigin, false);
    assert.equal(sportsOnly.allPresent, false);

    const genericLegacy = betConstructCredentialStatus({
      BETCONSTRUCT_SHARED_KEY: 'one-key',
      BETCONSTRUCT_IP_ALLOWLIST: '203.0.113.10',
    });
    assert.equal(genericLegacy.sportsSharedKey, false);
    assert.equal(genericLegacy.casinoSharedKey, false);
    assert.equal(genericLegacy.sportsAllowedIps, false);
    assert.equal(genericLegacy.casinoAllowedIps, false);

    const config = read('server/betconstruct/config.ts');
    assert.match(config, /BETCONSTRUCT_SPORTS_SHARED_KEY/);
    assert.match(config, /BETCONSTRUCT_CASINO_SHARED_KEY/);
    assert.match(config, /BETCONSTRUCT_SPORTS_ALLOWED_IPS/);
    assert.match(config, /BETCONSTRUCT_CASINO_ALLOWED_IPS/);
    assert.equal(config.includes('BETCONSTRUCT_SHARED_KEY'), false);
    assert.equal(config.includes('BETCONSTRUCT_IP_ALLOWLIST'), false);
  });

  it('builds sportsbook and casino iframe URLs with integrationMode=1 and AuthToken', () => {
    const sports = buildBetConstructSportsbookIframeUrl({
      origin: 'https://sport.betconstruct.example',
      authToken: 'tok-usd',
      lang: 'ru',
    });
    const sportsUrl = new URL(sports);
    assert.equal(sportsUrl.searchParams.get('integrationMode'), '1');
    assert.equal(sportsUrl.searchParams.get('AuthToken'), 'tok-usd');
    const casino = buildBetConstructCasinoIframeUrl({
      origin: 'https://casino.betconstruct.example',
      authToken: 'tok-uzs',
      gameId: 'roulette-1',
    });
    const casinoUrl = new URL(casino);
    assert.equal(casinoUrl.searchParams.get('integrationMode'), '1');
    assert.equal(casinoUrl.searchParams.get('AuthToken'), 'tok-uzs');
    assert.equal(casinoUrl.searchParams.get('gameId'), 'roulette-1');
  });

  it('rejects an iframe URL whose origin does not match providerOrigin', () => {
    const allowed = 'https://sport.betconstruct.example';
    const matching = `${allowed}/?integrationMode=1&AuthToken=opaque-token`;
    const mismatch = 'https://evil.example/?integrationMode=1&AuthToken=opaque-token';
    assert.equal(isAllowedBetConstructIframeSrc(matching, allowed), true);
    assert.equal(isAllowedBetConstructIframeSrc(mismatch, allowed), false);
    assert.equal(isAllowedBetConstructIframeSrc('http://sport.betconstruct.example/?integrationMode=1&AuthToken=x', allowed), false);

    const host = read('src/components/BetConstructIframeHost.tsx');
    const launchClient = read('src/lib/betconstructLaunch.ts');
    const screen = read('src/screens/ProviderIframeScreen.tsx');
    assert.match(host, /isAllowedBetConstructIframeSrc/);
    assert.match(host, /providerOrigin/);
    assert.match(launchClient, /providerOrigin/);
    assert.match(launchClient, /BETCONSTRUCT_IFRAME_ORIGIN_MISMATCH/);
    assert.match(screen, /providerOrigin=\{session\.providerOrigin\}/);
  });

  it('issues cryptographically opaque AuthTokens that do not encode player, wallet, or currency', () => {
    const iframe = read('server/betconstruct/iframe.ts');
    assert.match(iframe, /randomBytes/);
    assert.match(iframe, /base64url/);
    assert.equal(iframe.includes('launchTokenCurrency'), false);
    assert.equal(/\[.playerUserId.\s*,\s*.walletId./.test(iframe), false);

    const first = bindCurrencyLaunchToken({
      playerUserId: PLAYER_USER_ID,
      walletId: WALLET_ID,
      currency: 'USD',
      issuedAtMs: ISSUED_AT_MS,
    });
    const second = bindCurrencyLaunchToken({
      playerUserId: PLAYER_USER_ID,
      walletId: WALLET_ID,
      currency: 'USD',
      issuedAtMs: ISSUED_AT_MS,
    });
    assert.notEqual(first.token, second.token);
    assert.equal(first.currency, 'USD');
    assert.equal(second.currency, 'USD');
    for (const binding of [first, second]) {
      assert.equal(binding.playerUserId, PLAYER_USER_ID);
      assert.equal(binding.walletId, WALLET_ID);
      assert.equal(binding.token.includes(PLAYER_USER_ID), false);
      assert.equal(binding.token.includes(WALLET_ID), false);
      assert.equal(binding.token.includes('USD'), false);
      assert.equal(binding.token.includes(String(ISSUED_AT_MS)), false);
      assert.equal(binding.token.includes(String(binding.expiresAtMs)), false);
      assert.equal(binding.token.includes('rtp'), false);
      assert.equal(binding.token.length >= 32, true);
    }
  });

  it('lists Operator API and Single Wallet methods without native sports routing', () => {
    assert.deepEqual([...BETCONSTRUCT_SPORTSBOOK_OPERATOR_METHODS], [
      'GetClientDetails',
      'GetClientBalance',
      'BetPlaced',
      'BetResulted',
      'Rollback',
    ]);
    assert.deepEqual([...BETCONSTRUCT_SINGLE_WALLET_METHODS], [
      'Authentication',
      'GetBalance',
      'Withdraw',
      'Deposit',
      'WithdrawAndDeposit',
      'Rollback',
    ]);
    assert.equal(BETCONSTRUCT_CASINO_SECURITY_GATE, PLAYER_EXTERNAL_CASINO_GATE_RPC);
  });

  it('requires canonical player-session validation before the provider-config gate', async () => {
    const launch = read('server/betconstruct/launch.ts');
    assert.match(launch, /resolvePlayerSession/);
    assert.equal(launch.includes('requirePlayerCookie'), false);

    const unauth = await handleBetConstructRequest({
      method: 'POST',
      pathname: PLAYER_BETCONSTRUCT_SPORTSBOOK_LAUNCH_PATH,
    });
    assert.equal(unauth.status, 401);
    assert.equal(unauth.body.error, 'JWT_REQUIRED');

    const fakeCookie = await handleBetConstructRequest({
      method: 'POST',
      pathname: PLAYER_BETCONSTRUCT_SPORTSBOOK_LAUNCH_PATH,
      cookie: playerCookie('fake-not-a-session'),
      ports: rejectingPlayerPorts(),
    });
    assert.equal(fakeCookie.status, 401);
    assert.equal(fakeCookie.body.error, 'JWT_INVALID');
    assert.notEqual(fakeCookie.body.error, BETCONSTRUCT_NOT_CONFIGURED);
    assert.notEqual(fakeCookie.body.authenticated, true);

    const sports = await handleBetConstructRequest({
      method: 'POST',
      pathname: PLAYER_BETCONSTRUCT_SPORTSBOOK_LAUNCH_PATH,
      cookie: playerCookie(),
      ports: verifiedPlayerPorts(),
    });
    assert.equal(sports.status, 409);
    assert.equal(sports.body.error, BETCONSTRUCT_NOT_CONFIGURED);

    const casino = await handleBetConstructRequest({
      method: 'POST',
      pathname: PLAYER_BETCONSTRUCT_CASINO_LAUNCH_PATH,
      cookie: playerCookie(),
      ports: verifiedPlayerPorts(),
    });
    assert.equal(casino.status, 409);
    assert.equal(casino.body.error, BETCONSTRUCT_NOT_CONFIGURED);
  });

  it('routes public callbacks from method-specific URLs and ignores JSON method', async () => {
    assert.equal(existsSync(join(root, 'api/betconstruct/operator.ts')), false);
    assert.equal(existsSync(join(root, 'api/betconstruct/wallet.ts')), false);
    assert.equal(existsSync(join(root, 'api/betconstruct/operator/[method].ts')), true);
    assert.equal(existsSync(join(root, 'api/betconstruct/wallet/[method].ts')), true);
    assert.match(read('api/betconstruct/operator/[method].ts'), /vercelBetConstructCallback\('operator'\)/);
    assert.match(read('api/betconstruct/wallet/[method].ts'), /vercelBetConstructCallback\('wallet'\)/);

    for (const method of BETCONSTRUCT_SPORTSBOOK_OPERATOR_METHODS) {
      const pathname = betConstructOperatorCallbackPath(method);
      assert.equal(pathname, `${BETCONSTRUCT_OPERATOR_BASE}/${method}`);
      const result = await handleBetConstructRequest({
        method: 'POST',
        pathname,
        body: {},
      });
      assert.equal(result.status, 409, method);
      assert.equal(result.body.error, BETCONSTRUCT_NOT_CONFIGURED, method);
    }
    for (const method of BETCONSTRUCT_SINGLE_WALLET_METHODS) {
      const pathname = betConstructWalletCallbackPath(method);
      assert.equal(pathname, `${BETCONSTRUCT_WALLET_BASE}/${method}`);
      const result = await handleBetConstructRequest({
        method: 'POST',
        pathname,
        body: {},
      });
      assert.equal(result.status, 409, method);
      assert.equal(result.body.error, BETCONSTRUCT_NOT_CONFIGURED, method);
    }

    const pathWins = await handleBetConstructRequest({
      method: 'POST',
      pathname: betConstructOperatorCallbackPath('GetClientDetails'),
      body: { method: 'PlaceNativeSportsBet' },
    });
    assert.equal(pathWins.status, 409);
    assert.equal(pathWins.body.error, BETCONSTRUCT_NOT_CONFIGURED);

    const bodyCannotSelect = await handleBetConstructRequest({
      method: 'POST',
      pathname: BETCONSTRUCT_OPERATOR_BASE,
      body: { method: 'GetClientDetails' },
    });
    assert.equal(bodyCannotSelect.status, 404);
    assert.equal(bodyCannotSelect.body.error, BETCONSTRUCT_METHOD_UNSUPPORTED);

    const unknown = await handleBetConstructRequest({
      method: 'POST',
      pathname: betConstructOperatorCallbackPath('PlaceNativeSportsBet'),
      body: { method: 'GetClientDetails' },
    });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.error, BETCONSTRUCT_METHOD_UNSUPPORTED);
    assert.equal(isBetConstructPath('/api/player/sports/place'), false);

    const http = read('server/betconstruct/http.ts');
    assert.equal(http.includes('body.method'), false);
    assert.equal(http.includes('body.Method'), false);
    assert.match(http, /return toStaffResult\(await requestBetConstructLaunch/);
    assert.match(http, /return toStaffResult\(handleBetConstructOperatorMethod/);
    assert.match(http, /return toStaffResult\(handleBetConstructSingleWalletMethod/);
  });

  it('does not ingest BetConstruct markets or import the native sports engine', () => {
    const files = [
      ...listTs(join(root, 'server/betconstruct')),
      join(root, 'src/lib/betconstructLaunch.ts'),
      join(root, 'src/components/BetConstructIframeHost.tsx'),
      join(root, 'src/screens/ProviderIframeScreen.tsx'),
      join(root, 'src/screens/ProviderSportsbookScreen.tsx'),
    ];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      assert.equal(FORBIDDEN_IMPORT.test(src), false, file);
      assert.equal(src.includes('apply_wallet_entry('), false, file);
      assert.equal(src.includes('useSportsStore'), false, file);
      assert.equal(src.includes('MarketsGrid'), false, file);
      assert.equal(src.includes('BetSlipScreen'), false, file);
      assert.equal(/VITE_BETCONSTRUCT/.test(src), false, file);
    }
    const sportsStore = read('src/stores/sportsStore.ts');
    const place = read('src/lib/sportsPlaceRequest.ts');
    const lsports = read('src/lib/lsportsFeed.ts');
    assert.equal(sportsStore.toLowerCase().includes('betconstruct'), false);
    assert.equal(place.toLowerCase().includes('betconstruct'), false);
    assert.equal(lsports.toLowerCase().includes('betconstruct'), false);
    assert.match(place, /LSPORTS_PROVIDER = 'lsports'/);
    assert.equal(read('src/vite-env.d.ts').includes('VITE_BETCONSTRUCT'), false);
  });

  it('keeps native betslip and menu bet-builder separate from the provider iframe', () => {
    const host = read('src/components/BetConstructIframeHost.tsx');
    const menu = read('src/screens/MenuScreen.tsx');
    const sportsbook = read('src/screens/ProviderSportsbookScreen.tsx');
    const plugin = read('plugins/owner-staff-onboarding.ts');
    assert.match(host, /<iframe/);
    assert.match(host, /isAllowedBetConstructIframeSrc/);
    assert.equal(host.includes('useSportsStore'), false);
    assert.equal(host.includes('MarketsGrid'), false);
    assert.match(sportsbook, /product="sportsbook"/);
    assert.match(menu, /provider-sportsbook/);
    assert.match(menu, /Бетконструктор/);
    assert.match(plugin, /attachBetConstructHttp/);
    assert.equal(plugin.includes('adaptLsportsStore'), false);
  });
});
