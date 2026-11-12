import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyFootballQuotes, mergeListedMatches, type FootballOddsQuote } from '../../src/lib/footballFeed.js';
import { footballClockLabel, presentedFootballClock } from '../../src/lib/footballClock.js';
import type { MatchEvent } from '../../src/types.js';
import { BetsApiReadOnlyClient } from './client.js';
import { handleFootballFeedRequest } from './footballFeedHttp.js';
import { LIVE_CLOCK_STALE_MS, publishLiveClock } from './liveClock.js';
import { eventWithOdds, normalizeFootballDetails, normalizeFootballList } from './parse.js';

const NOW = Date.parse('2026-11-12T12:00:00.000Z');

function row(timer: unknown, extra: Record<string, unknown> = {}) {
  return {
    id: '13441666',
    sport_id: '1',
    time: 1_700_000_000,
    time_status: '1',
    league: { id: '8', name: 'League', cc: 'gb' },
    home: { id: '1', name: 'Home' },
    away: { id: '2', name: 'Away' },
    timer,
    ...extra,
  };
}

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('football live clock', () => {
  it('keeps a running provider minute and second without using kickoff', () => {
    const events = normalizeFootballList({
      success: 1,
      results: [row({ tm: 43, ts: 12, tt: '1', ta: 4, md: 9 }, { time: NOW / 1000 - 3 * 60 * 60 })],
    }, 'inplay', NOW);
    assert.equal(events[0]?.liveClock?.minute, 43);
    assert.equal(events[0]?.liveClock?.second, 12);
    assert.equal(events[0]?.liveClock?.running, true);
    assert.equal(events[0]?.liveClock?.observedAt, '2026-11-12T12:00:00.000Z');
    assert.equal(events[0]?.liveClock?.stale, false);
    assert.equal(events[0]?.markets.length, 0);
  });

  it('stops a paused clock and does not invent a minute or period', () => {
    const stopped = normalizeFootballList({ success: 1, results: [row({ tm: '45', ts: '00', tt: 0 })] }, 'inplay', NOW);
    assert.equal(stopped[0]?.liveClock?.running, false);
    assert.equal(stopped[0]?.liveClock?.minute, 45);
    const missingTick = normalizeFootballList({ success: 1, results: [row({ tm: 12, ts: 1 })] }, 'inplay', NOW);
    assert.equal(missingTick[0]?.liveClock?.running, false);
    const missing = normalizeFootballList({ success: 1, results: [row(undefined)] }, 'inplay', NOW);
    assert.equal(missing[0]?.liveClock, null);
    const malformed = normalizeFootballList({
      success: 1,
      results: [
        row({ tm: '43+2', ts: 10, tt: '1' }),
        row({ id: '13441667', tm: 10, ts: 60, tt: '1' }),
        row({ id: '13441668', tm: -1, ts: 0, tt: '1' }),
        row({ id: '13441669', ts: 10, tt: '1', ta: 2, md: 1 }),
      ],
    }, 'inplay', NOW);
    assert.equal(malformed.length, 4);
    assert.deepEqual(malformed.map((event) => event.liveClock), [null, null, null, null]);
  });

  it('keeps the clock when odds replace markets and marks an old observation stale', () => {
    const details = normalizeFootballDetails({
      success: 1,
      results: [row({ tm: 67, ts: 5, tt: '1' })],
    }, {
      success: 1,
      results: { odds: { '1_1': [{ home_od: '1.80', draw_od: '3.40', away_od: '4.20' }] } },
    }, NOW);
    assert.equal(details?.liveClock?.minute, 67);
    assert.equal(details?.markets.find((market) => market.key === '1x2')?.status, 'open');
    const refreshed = eventWithOdds(details!, { odds: { '1_1': [{ home_od: '1.90', draw_od: '3.30', away_od: '4.00' }] } });
    assert.equal(refreshed.liveClock?.second, 5);
    assert.equal(refreshed.markets.find((market) => market.key === '1x2')?.outcomes[0]?.price, 1.9);
    const stale = publishLiveClock(details!.liveClock, NOW + LIVE_CLOCK_STALE_MS + 1);
    assert.equal(stale?.stale, true);
    assert.equal(stale?.running, false);
    assert.equal(stale?.minute, 67);
  });

  it('publishes the clock on the list and does not request odds to obtain it', async () => {
    const paths: string[] = [];
    const client = new BetsApiReadOnlyClient({
      env: { BETSAPI_TOKEN: 'unit-test-token' },
      minGapMs: 0,
      now: () => Date.now(),
      sleep: async () => undefined,
      fetchImpl: async (input) => {
        paths.push(new URL(String(input)).pathname);
        return response({ success: 1, results: [row({ tm: 8, ts: 4, tt: '1' })] });
      },
    });
    const list = await handleFootballFeedRequest({ method: 'GET', url: '/api/player/sports/football-feed' }, client, client);
    const events = list.body.events as Array<{ liveClock: { minute: number; running: boolean } | null }>;
    assert.equal(events[0]?.liveClock?.minute, 8);
    assert.equal(events[0]?.liveClock?.running, true);
    assert.deepEqual(paths.slice().sort(), ['/v3/events/inplay', '/v3/events/upcoming']);
  });
});

describe('football clock clients', () => {
  it('advances only a fresh running clock and preserves it across odds and list refreshes', () => {
    const clock = {
      minute: 43,
      second: 50,
      running: true,
      observedAt: new Date(NOW).toISOString(),
      stale: false,
    };
    assert.equal(footballClockLabel(clock, NOW + 12_000), '44:02');
    assert.equal(presentedFootballClock({ ...clock, running: false }, NOW + 12_000)?.second, 50);
    assert.equal(presentedFootballClock(clock, NOW + LIVE_CLOCK_STALE_MS + 1)?.running, false);
    const match = {
      id: '13441666',
      sport: 'football',
      league: 'League',
      country: 'GB',
      team1: 'Home',
      team2: 'Away',
      team1Color: '#000',
      team2Color: '#111',
      startTime: NOW,
      isLive: true,
      liveClock: clock,
      liveStatus: '43:50',
      markets: { '1': 1.8, x: 3.4, '2': 4.2 },
      extraMarkets: 0,
      feedTag: 'betsapi',
      priceState: 'open',
    } satisfies MatchEvent;
    const quote: FootballOddsQuote = {
      id: match.id,
      priceState: 'open',
      markets: [{
        key: '1x2',
        name: '1X2',
        line: '',
        status: 'open',
        outcomes: [
          { key: 'home', name: 'Home', price: 1.91 },
          { key: 'draw', name: 'Draw', price: 3.3 },
          { key: 'away', name: 'Away', price: 4.1 },
        ],
        updatedAt: null,
      }],
    };
    const quoted = applyFootballQuotes([match], [quote]);
    assert.equal(quoted[0]?.markets['1'], 1.91);
    assert.equal(quoted[0]?.liveClock?.second, 50);
    const relisted = mergeListedMatches([match], [{ ...match, liveClock: null, liveStatus: undefined, priceState: 'unpriced', markets: { '1': 0, x: 0, '2': 0 } }]);
    assert.equal(relisted[0]?.liveClock?.minute, 43);
    assert.equal(relisted[0]?.markets['1'], 1.8);
    const replaced = mergeListedMatches([match], [{ ...match, liveClock: { ...clock, minute: 44, second: 10, running: false } }]);
    assert.equal(replaced[0]?.liveClock?.minute, 44);
    assert.equal(replaced[0]?.liveClock?.running, false);
  });
});
