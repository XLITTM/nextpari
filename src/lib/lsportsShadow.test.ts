import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isLsportsDisplayFeedEnabled, setLsportsDisplayFeedEnabledForTests } from './lsportsFeed';
import {
  displayMatchesFromFeed,
  lsportsHealthUrl,
  lsportsInplayUrl,
  type LsportsBrowserFeed,
} from './lsportsShadowFeed';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const staleFeed: LsportsBrowserFeed = {
  source: 'lsports',
  health: 'STALE',
  generatedAt: 1,
  matches: [{
    event: {
      id: '19981248',
      sport_id: '1',
      league: { name: 'Premier League' },
      home: { name: 'Home FC' },
      away: { name: 'Away FC' },
      time_status: '1',
      start_time: '1',
      our_events: 'lsports',
      ss: '1-0',
    },
    markets: [{
      key: '1_1',
      bookmaker: '1',
      marketId: '1',
      name: '1X2',
      category: 'main',
      entries: [{
        id: 'x',
        updatedAt: 1,
        outcomes: [
          { key: 'home', odds: 1.85, raw: '1.85' },
          { key: 'draw', odds: 3.4, raw: '3.40' },
          { key: 'away', odds: 4.2, raw: '4.20' },
        ],
      }],
    }],
  }],
};

describe('lsports shadow client guards', () => {
  it('leaves BetsAPI inplay wiring in place when the display flag is off', () => {
    setLsportsDisplayFeedEnabledForTests(null);
    assert.equal(isLsportsDisplayFeedEnabled(), false);
    const hook = readFileSync(join(root, 'src/hooks/useEventsList.ts'), 'utf8');
    assert.match(hook, /fetchSportsFeed\('inplay'/);
    assert.match(hook, /isLsportsDisplayFeedEnabled\(\)/);
    const sports = readFileSync(join(root, 'src/services/sports.ts'), 'utf8');
    assert.match(sports, /\/api\/sports\?type=/);
    assert.equal(sports.includes('/api/lsports'), false);
    const context = readFileSync(join(root, 'src/LiveMatchesContext.tsx'), 'utf8');
    assert.match(context, /useLsportsShadowFeed/);
  });

  it('locks stale LSports feeds without fabricating 2.10/3.25/2.80', () => {
    const matches = displayMatchesFromFeed(staleFeed);
    const json = JSON.stringify(matches);
    assert.equal(matches[0]?.markets[0]?.entries.length, 0);
    assert.equal(json.includes('1.85'), false);
    assert.equal(json.includes('2.1'), false);
    assert.equal(json.includes('3.25'), false);
    assert.equal(json.includes('2.8'), false);
    const healthy = displayMatchesFromFeed({ ...staleFeed, health: 'HEALTHY' });
    assert.equal(healthy[0]?.markets[0]?.entries[0]?.outcomes[0]?.odds, 1.85);
  });

  it('uses the remote worker HTTPS feed when a base URL is set', () => {
    const env = { VITE_LSPORTS_FEED_BASE_URL: 'https://lsports-inplay.example.test/' };
    assert.equal(lsportsInplayUrl(env), 'https://lsports-inplay.example.test/inplay');
    assert.equal(lsportsHealthUrl(env), 'https://lsports-inplay.example.test/health');
    assert.equal(lsportsInplayUrl(env).includes('localhost'), false);
    assert.equal(lsportsInplayUrl(env).includes('127.0.0.1'), false);
    assert.equal(lsportsInplayUrl({}), '/api/lsports/inplay');
    const publish = readFileSync(join(root, 'src/lib/lsportsShadowPublish.ts'), 'utf8');
    assert.match(publish, /lsportsInplayUrl\(\)/);
    assert.match(publish, /lsportsHealthUrl\(\)/);
    const hook = readFileSync(join(root, 'src/hooks/useLsportsShadowFeed.ts'), 'utf8');
    assert.match(hook, /fetchLsportsShadowHealth/);
    assert.match(hook, /fetchLsportsShadowInplay/);
  });
});
