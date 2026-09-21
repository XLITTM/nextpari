import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { LEGACY_SPORTS_RUNTIME_RETIRED } from './legacySportsRuntime.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('legacy sports runtime retirement — browser/vite', () => {
  it('A. LiveMatchesProvider does not mount useEventsList or useLsportsShadowFeed', () => {
    const src = read('src/LiveMatchesContext.tsx');
    assert.equal(LEGACY_SPORTS_RUNTIME_RETIRED, true);
    assert.equal(src.includes('useEventsList'), false);
    assert.equal(src.includes('useLsportsShadowFeed'), false);
    assert.equal(src.includes("from './hooks/useEventsList'"), false);
    assert.equal(src.includes("from './hooks/useLsportsShadowFeed'"), false);
    assert.match(src, /liveMatches: EMPTY_MATCHES/);
    assert.match(src, /upcomingMatches: EMPTY_MATCHES/);
    assert.match(src, /loading: false/);
    assert.match(src, /clearEvents/);
  });

  it('B. active Vite config does not register legacy sports plugins', () => {
    const src = read('vite.config.ts');
    assert.equal(src.includes('betsapiGatewayPlugin'), false);
    assert.equal(src.includes('betsapiLiveWsPlugin'), false);
    assert.equal(src.includes('sportsCatalogPlugin'), false);
    assert.equal(src.includes('sportsInplayPlugin'), false);
    assert.equal(src.includes('lsportsShadowPlugin'), false);
    assert.equal(src.includes("from './plugins/betsapi-gateway'"), false);
    assert.equal(src.includes("from './plugins/lsports-shadow'"), false);
    assert.match(src, /ownerStaffOnboardingPlugin/);
    assert.match(src, /@vitejs\/plugin-react/);
  });

  it('C. vite.config contains no VITE_BETSAPI secret plumbing', () => {
    const src = read('vite.config.ts');
    assert.equal(src.includes('VITE_BETSAPI_KEY'), false);
    assert.equal(src.includes('VITE_BETSAPI_TOKEN'), false);
    assert.equal(src.includes('BETSAPI_KEY'), false);
    assert.equal(src.includes('BETSAPI_TOKEN'), false);
    const env = read('src/vite-env.d.ts');
    assert.equal(env.includes('VITE_BETSAPI_KEY'), false);
    assert.equal(env.includes('VITE_BETSAPI_TOKEN'), false);
    const betsapi = read('src/lib/betsapi.ts');
    assert.equal(betsapi.includes('VITE_BETSAPI_KEY'), false);
    assert.equal(betsapi.includes('VITE_BETSAPI_TOKEN'), false);
    assert.match(betsapi, /export function getBetsApiToken\(\): string \{\s*return '';/);
    assert.match(betsapi, /LEGACY_SPORTS_FEED_DISABLED/);
  });

  it('G. fake 2.10/3.25/2.80 odds are not injected by live card/catalog mapping', () => {
    const live = read('src/lib/liveMatches.ts');
    const cards = read('src/lib/cardOdds.ts');
    const sports = read('src/services/sports.ts');
    assert.equal(live.includes('2.1'), false);
    assert.equal(live.includes('3.25'), false);
    assert.equal(live.includes('2.8'), false);
    assert.equal(cards.includes('2.1'), false);
    assert.equal(cards.includes('3.25'), false);
    assert.equal(cards.includes('2.8'), false);
    assert.equal(sports.includes('home || DEFAULT_1X2.home'), false);
    const odds = read('src/hooks/useLiveOdds.ts');
    assert.equal(odds.includes('fetchEventOdds'), false);
    assert.equal(odds.includes('setInterval'), false);
  });

  it('I. BetConstruct launch/API/server files remain present and unmodified by this retirement', () => {
    const launch = read('src/lib/betconstructLaunch.ts');
    assert.match(launch, /iframeUrl|AuthToken|providerOrigin|betconstruct/i);
    const apiOperator = read('api/betconstruct/operator/[method].ts');
    const apiWallet = read('api/betconstruct/wallet/[method].ts');
    assert.ok(apiOperator.length > 0);
    assert.ok(apiWallet.length > 0);
    const wallet = read('server/betconstruct/wallet/index.ts');
    assert.ok(wallet.length > 0);
    const context = read('src/LiveMatchesContext.tsx');
    const vite = read('vite.config.ts');
    assert.equal(context.includes('betconstruct'), false);
    assert.equal(vite.includes('betconstruct'), false);
  });
});
