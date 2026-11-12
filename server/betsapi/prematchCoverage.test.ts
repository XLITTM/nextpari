import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { footballCardToMatch } from '../../src/lib/footballFeed.js';
import { BetsApiReadOnlyClient } from './client.js';
import { handleFootballFeedRequest } from './footballFeedHttp.js';
import {
  coverageDays,
  footballTier,
  isEsoccerLeague,
  isSimulatedLeague,
  preparePrematch,
  PREMATCH_REQUEST_BUDGET,
  rankFeaturedFootball,
  readUpcomingPager,
} from './footballCoverage.js';
import type { NormalizedEvent } from './types.js';

const NOW = Date.parse('2026-11-12T14:00:00.000Z');

function event(id: string, league: string, kickoff: string, status: NormalizedEvent['status'] = 'prematch'): NormalizedEvent {
  return {
    eventId: id,
    sportId: '1',
    sport: 'football',
    league: { id: league, name: league, countryCode: null },
    home: { id: null, name: 'Home' },
    away: { id: null, name: 'Away' },
    kickoff,
    status,
    timeStatus: status === 'prematch' ? '0' : '1',
    score: null,
    marketsKnown: false,
    markets: [],
    updatedAt: null,
  };
}

function providerRow(id: string, league: string, time: number) {
  return {
    id,
    sport_id: '1',
    time_status: '0',
    time,
    league: { id, name: league, cc: '' },
    home: { id: `${id}h`, name: 'Home' },
    away: { id: `${id}a`, name: 'Away' },
  };
}

describe('real football prematch coverage', () => {
  it('covers six UTC days from November 12 and reads the provider pager', () => {
    assert.deepEqual(coverageDays(NOW), ['20261112', '20261113', '20261114', '20261115', '20261116', '20261117']);
    assert.deepEqual(readUpcomingPager({
      pager: { page: '1', per_page: '50', total: '120' },
    }), { page: 1, perPage: 50, total: 120 });
    assert.equal(readUpcomingPager({ results: [] }), null);
  });

  it('drops provider Esoccer leagues, dedupes ids, and ranks Nations League first', () => {
    assert.equal(isEsoccerLeague('Esoccer Battle Volta - 6 mins play'), true);
    assert.equal(isEsoccerLeague('UEFA Nations League'), false);
    const ranked = preparePrematch([
      event('1', 'Esoccer H2H GG League - 8 mins play', '2026-11-12T15:00:00.000Z'),
      event('2', 'Regional Cup', '2026-11-12T15:05:00.000Z'),
      event('3', 'UEFA Nations League', '2026-11-12T19:45:00.000Z'),
      event('3', 'UEFA Nations League', '2026-11-12T19:45:00.000Z'),
      event('4', 'UEFA Champions League', '2026-11-12T17:00:00.000Z'),
      event('5', 'Esoccer Battle Volta - 6 mins play', '2026-11-12T15:01:00.000Z', 'live'),
    ]);
    assert.deepEqual(ranked.map((item) => item.eventId), ['4', '3', '2']);
  });

  it('ranks exact top leagues above other football and lower divisions, including live', () => {
    assert.equal(footballTier({ name: 'England Premier League' }), 0);
    assert.equal(footballTier({ name: '2. Bundesliga' }), 2);
    assert.equal(footballTier({ name: 'National Premier League' }), 1);
    assert.equal(isSimulatedLeague('Virtual Football League'), true);
    assert.equal(isSimulatedLeague('Virtus Entella'), false);
    const markets = event('10', 'England Premier League', '2026-11-12T15:00:00.000Z', 'live').markets;
    const liveTop = {
      ...event('10', 'England Premier League', '2026-11-12T15:00:00.000Z', 'live'),
      markets,
    };
    const ranked = rankFeaturedFootball([
      event('21', 'Esoccer Premier League', '2026-11-12T12:00:00.000Z', 'live'),
      event('22', 'Virtual Football League', '2026-11-12T12:00:00.000Z', 'live'),
      event('23', '2. Bundesliga', '2026-11-12T13:00:00.000Z', 'live'),
      event('24', 'Regional Cup', '2026-11-12T18:00:00.000Z'),
      event('25', 'UEFA Nations League', '2026-11-12T19:45:00.000Z'),
      liveTop,
      event('26', 'England League One', '2026-11-12T14:00:00.000Z'),
    ]);
    assert.deepEqual(ranked.map((item) => item.eventId), ['10', '25', '24', '23', '26']);
    assert.equal(ranked[0]?.markets, markets);
    assert.equal(ranked.every((item) => item.marketsKnown === false), true);
  });

  it('does not create a Nations League fixture that the provider did not return', () => {
    const ranked = preparePrematch([
      event('9', 'Regional Cup', '2026-11-12T16:00:00.000Z'),
    ]);
    assert.equal(ranked.some((item) => /nations league/i.test(item.league.name ?? '')), false);
  });

  it('pages the documented window, skips esoccer at the provider, and stops on the request budget', async () => {
    const urls: URL[] = [];
    const client = new BetsApiReadOnlyClient({
      env: { BETSAPI_TOKEN: 'unit-test-token' },
      minGapMs: 0,
      now: () => NOW,
      sleep: async () => undefined,
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        urls.push(url);
        const page = Number(url.searchParams.get('page') ?? '1');
        const total = page === 1 ? 80 : 80;
        return new Response(JSON.stringify({
          success: 1,
          pager: { page, per_page: 50, total },
          results: page > 2 ? [] : [providerRow(`${url.searchParams.get('day') ?? '1000'}${page}`, page === 1 && !url.searchParams.get('day')
            ? 'Esoccer Battle Volta - 6 mins play'
            : 'UEFA Nations League', NOW / 1000 + 3600)],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });
    const coverage = await client.getPrematchCoverage();
    assert.equal(coverage.ok, true);
    assert.equal(urls.length <= PREMATCH_REQUEST_BUDGET, true);
    assert.equal(urls.every((url) => url.pathname === '/v3/events/upcoming'), true);
    assert.equal(urls.every((url) => url.searchParams.get('skip_esports') === '1'), true);
    assert.equal(urls.some((url) => url.searchParams.get('day') === '20261112'), true);
    assert.equal(urls.some((url) => url.searchParams.get('day') === '20261117'), true);
    assert.equal(urls.some((url) => url.searchParams.get('page') === '3'), false);
    assert.equal(coverage.feed?.events.every((event) => !isEsoccerLeague(event.league.name)), true);
    assert.equal(coverage.feed?.events.some((event) => event.league.name === 'UEFA Nations League'), true);
    const ids = coverage.feed?.events.map((event) => event.eventId) ?? [];
    assert.equal(new Set(ids).size, ids.length);
  });

  it('keeps a real fixture without odds unavailable and leaves the live clock path intact', async () => {
    const client = new BetsApiReadOnlyClient({
      env: { BETSAPI_TOKEN: 'unit-test-token' },
      minGapMs: 0,
      now: () => NOW,
      sleep: async () => undefined,
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/inplay')) {
          return new Response(JSON.stringify({
            success: 1,
            results: [{
              id: '555',
              sport_id: '1',
              time_status: '1',
              time: NOW / 1000,
              timer: { tm: 12, ts: 4, tt: '1' },
              league: { id: '1', name: 'Premier League', cc: 'gb' },
              home: { name: 'Arsenal' },
              away: { name: 'Chelsea' },
              ss: '0-0',
            }],
          }), { status: 200 });
        }
        return new Response(JSON.stringify({
          success: 1,
          pager: { page: 1, per_page: 50, total: 1 },
          results: [providerRow('777', 'UEFA Nations League', NOW / 1000 + 7200)],
        }), { status: 200 });
      },
    });
    const response = await handleFootballFeedRequest({ method: 'GET', url: '/api/player/sports/football-feed' }, client, client);
    const events = response.body.events as Array<{ id: string; live: boolean; priceState: string; markets: unknown[]; liveClock: { minute: number } | null }>;
    const live = events.find((item) => item.id === '555');
    const prematch = events.find((item) => item.id === '777');
    assert.equal(live?.liveClock?.minute, 12);
    assert.equal(prematch?.live, false);
    assert.equal(prematch?.priceState, 'unpriced');
    assert.deepEqual(prematch?.markets, []);
    const card = footballCardToMatch({
      id: '777',
      league: 'UEFA Nations League',
      country: '',
      home: 'Home',
      away: 'Away',
      kickoff: '2026-11-12T16:00:00.000Z',
      live: false,
      score: null,
      priceState: 'unpriced',
      markets: [],
    });
    assert.equal(card.marketsLocked, true);
    assert.equal(card.markets['1'], 0);
  });

  it('stops paging when the provider rate limit is reached', async () => {
    let calls = 0;
    const client = new BetsApiReadOnlyClient({
      env: { BETSAPI_TOKEN: 'unit-test-token' },
      minGapMs: 0,
      now: () => NOW,
      sleep: async () => undefined,
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response(JSON.stringify({
            success: 1,
            pager: { page: 1, per_page: 50, total: 1 },
            results: [providerRow('1', 'UEFA Nations League', NOW / 1000 + 3600)],
          }), { status: 200 });
        }
        return new Response(JSON.stringify({ success: 0 }), {
          status: 429,
          headers: { 'retry-after': '60' },
        });
      },
    });
    const coverage = await client.getPrematchCoverage();
    assert.equal(coverage.ok, true);
    assert.equal(coverage.feed?.rateLimited, true);
    assert.equal(coverage.feed?.events.length, 1);
    assert.equal(calls < PREMATCH_REQUEST_BUDGET, true);
  });
});
