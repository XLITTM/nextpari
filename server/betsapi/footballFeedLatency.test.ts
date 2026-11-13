import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BetsApiReadOnlyClient, LISTED_FEED_DEADLINE_MS } from './client.js';
import { handleFootballFeedRequest } from './footballFeedHttp.js';

function row(id: string, league: string, time: number, live = false) {
  return {
    id,
    sport_id: '1',
    time_status: live ? '1' : '0',
    time,
    league: { id, name: league, cc: 'gb' },
    home: { id: `${id}h`, name: 'Home' },
    away: { id: `${id}a`, name: 'Away' },
    ...(live ? { timer: { tm: 10, ts: 0, tt: '1', md: 0 }, ss: '0-0' } : {}),
  };
}

describe('football feed latency', () => {
  it('returns inside the deadline with one live read and one prematch slice', async () => {
    let now = 0;
    const paths: string[] = [];
    const client = new BetsApiReadOnlyClient({
      env: { BETSAPI_TOKEN: 'unit-test-token' },
      minGapMs: 12_000,
      timeoutMs: 8_000,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
      fetchImpl: async (input) => {
        now += 1_000;
        const url = new URL(String(input));
        paths.push(url.pathname);
        const live = url.pathname.endsWith('/inplay');
        return Response.json({
          success: 1,
          pager: { page: 1, per_page: 50, total: 1 },
          results: [row(live ? '555' : '777', live ? 'Premier League' : 'UEFA Nations League', live ? 1 : 7_200, live)],
        });
      },
    });
    const response = await handleFootballFeedRequest({ method: 'GET', url: '/api/player/sports/football-feed' }, client, client);
    const events = response.body.events as Array<{ id: string; live: boolean; priceState: string; markets: unknown[] }>;
    assert.equal(response.status, 200);
    assert.equal(paths.filter((path) => path.endsWith('/inplay')).length, 1);
    assert.equal(paths.filter((path) => path.endsWith('/upcoming')).length, 1);
    assert.equal(now < LISTED_FEED_DEADLINE_MS, true);
    assert.equal(now < 60_000, true);
    assert.equal(events.find((event) => event.id === '555')?.live, true);
    assert.equal(events.find((event) => event.id === '777')?.live, false);
    assert.equal(events.every((event) => event.priceState === 'unpriced' && event.markets.length === 0), true);
    assert.equal(paths.filter((path) => path.endsWith('/odds')).length <= 1, true);
  });

  it('does not let the remaining coverage crawl block the response', async () => {
    let now = 0;
    const upcoming: string[] = [];
    const client = new BetsApiReadOnlyClient({
      env: { BETSAPI_TOKEN: 'unit-test-token' },
      minGapMs: 12_000,
      timeoutMs: 8_000,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/upcoming')) upcoming.push(`${url.searchParams.get('day') ?? ''}:${url.searchParams.get('page') ?? '1'}:${url.searchParams.get('league_id') ?? ''}`);
        return Response.json({ success: 1, pager: { page: 1, per_page: 50, total: 1 }, results: [row(String(upcoming.length || 1), 'Regional Cup', now / 1000 + 3600)] });
      },
    });
    const perRead: number[] = [];
    for (let index = 0; index < 8; index += 1) {
      const before = upcoming.length;
      await handleFootballFeedRequest({ method: 'GET', url: '/api/player/sports/football-feed' }, client, client);
      perRead.push(upcoming.length - before);
    }
    assert.deepEqual(perRead, [1, 1, 1, 1, 1, 1, 1, 1]);
    assert.equal(new Set(upcoming).size, upcoming.length);
    assert.equal(upcoming[0]?.endsWith(':1:'), true);
    assert.equal(upcoming[1]?.endsWith(':2:'), true);
    assert.equal(upcoming.some((job) => job.endsWith(':1:94')), true);
  });

  it('serves cached prematch without a second provider request and skips a call that cannot finish', async () => {
    let now = 1_000;
    let upcomingCalls = 0;
    const client = new BetsApiReadOnlyClient({
      env: { BETSAPI_TOKEN: 'unit-test-token' },
      minGapMs: 12_000,
      timeoutMs: 8_000,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
      fetchImpl: async (input) => {
        const upcoming = new URL(String(input)).pathname.endsWith('/upcoming');
        if (upcoming) upcomingCalls += 1;
        return Response.json({ success: 1, pager: { page: 1, per_page: 50, total: 1 }, results: [row('777', 'UEFA Nations League', 10_000)] });
      },
    });
    const first = await client.readListedFootball(now + LISTED_FEED_DEADLINE_MS);
    assert.equal(first.upcoming.feed?.events.some((event) => event.eventId === '777'), true);
    const afterFirst = upcomingCalls;
    const cached = await client.readListedFootball(now + 1_000);
    assert.equal(upcomingCalls, afterFirst);
    assert.equal(cached.upcoming.feed?.events.some((event) => event.eventId === '777'), true);
    const tight = await client.readListedFootball(now + 1_000);
    assert.equal(upcomingCalls, afterFirst);
    assert.equal(tight.live.ok || tight.upcoming.ok, true);
  });

  it('returns live events when prematch is missing and does not invent a fixture', async () => {
    const client = new BetsApiReadOnlyClient({
      env: { BETSAPI_TOKEN: 'unit-test-token' },
      minGapMs: 0,
      sleep: async () => undefined,
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/inplay')) {
          return Response.json({ success: 1, results: [row('555', 'Premier League', 1, true)] });
        }
        return new Response(JSON.stringify({ success: 0 }), { status: 502 });
      },
    });
    const response = await handleFootballFeedRequest({ method: 'GET', url: '/api/player/sports/football-feed?includeCatalog=1' }, client, client);
    const events = response.body.events as Array<{ id: string; live: boolean }>;
    assert.equal(response.status, 200);
    assert.deepEqual(events.map((event) => event.id), ['555']);
    assert.equal(events[0]?.live, true);
    assert.equal((response.body.freshness as { prematch: string }).prematch, 'absent');
    const catalog = response.body.identityCatalog as { verifiedProviderIdsAdded: string[] };
    assert.deepEqual(catalog.verifiedProviderIdsAdded, []);
  });

  it('does not send another upstream call while the provider rate limit is cooling down', async () => {
    let calls = 0;
    const client = new BetsApiReadOnlyClient({
      env: { BETSAPI_TOKEN: 'unit-test-token' },
      minGapMs: 12_000,
      now: () => 0,
      sleep: async () => undefined,
      fetchImpl: async (input) => {
        calls += 1;
        const live = new URL(String(input)).pathname.endsWith('/inplay');
        if (live) return Response.json({ success: 1, results: [row('555', 'Premier League', 1, true)] });
        return new Response(JSON.stringify({ success: 0 }), { status: 429, headers: { 'retry-after': '60' } });
      },
    });
    await client.readListedFootball(LISTED_FEED_DEADLINE_MS);
    const afterLimit = calls;
    await client.readListedFootball(LISTED_FEED_DEADLINE_MS);
    assert.equal(calls, afterLimit);
  });

  it('shares one in-flight prematch slice across overlapping reads', async () => {
    const days: string[] = [];
    const client = new BetsApiReadOnlyClient({
      env: { BETSAPI_TOKEN: 'unit-test-token' },
      minGapMs: 0,
      sleep: async () => undefined,
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/upcoming')) days.push(`${url.searchParams.get('day') ?? 'undated'}:${url.searchParams.get('page') ?? '1'}:${url.searchParams.get('league_id') ?? ''}`);
        return Response.json({ success: 1, pager: { page: 1, per_page: 50, total: 1 }, results: [] });
      },
    });
    await Promise.all([
      client.readListedFootball(Date.now() + LISTED_FEED_DEADLINE_MS),
      client.readListedFootball(Date.now() + LISTED_FEED_DEADLINE_MS),
    ]);
    assert.equal(new Set(days).size, days.length);
    assert.equal(days.length <= 2, true);
  });

  it('requests a seen Nations League id before later pages and only shows page-two fixtures after that page is read', async () => {
    const upcoming: string[] = [];
    const client = new BetsApiReadOnlyClient({
      env: { BETSAPI_TOKEN: 'unit-test-token' },
      minGapMs: 0,
      sleep: async () => undefined,
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/inplay')) {
          return Response.json({ success: 1, results: [row('30976', 'UEFA Nations League C', 1, true)] });
        }
        if (url.pathname.endsWith('/odds')) return Response.json({ success: 1, results: { odds: {} } });
        upcoming.push(`${url.searchParams.get('league_id') ?? ''}:${url.searchParams.get('page') ?? '1'}`);
        const page = url.searchParams.get('page');
        const league = url.searchParams.get('league_id');
        const results = !league && page === '2'
          ? [{
            id: '9001',
            sport_id: '1',
            time_status: '0',
            time: 2_000,
            league: { id: '400', name: 'UEFA Nations League A', cc: 'eu' },
            home: { id: '1', name: 'Netherlands' },
            away: { id: '2', name: 'Greece' },
          }]
          : [];
        return Response.json({ success: 1, pager: { page: Number(page ?? 1), per_page: 50, total: 80 }, results });
      },
    });
    const first = await handleFootballFeedRequest({ method: 'GET', url: '/api/player/sports/football-feed' }, client, client);
    const firstEvents = first.body.events as Array<{ home: string; away: string }>;
    assert.equal(upcoming[0], '30976:1');
    assert.equal(firstEvents.some((event) => event.home === 'Netherlands' && event.away === 'Greece'), false);
    await handleFootballFeedRequest({ method: 'GET', url: '/api/player/sports/football-feed' }, client, client);
    const third = await handleFootballFeedRequest({ method: 'GET', url: '/api/player/sports/football-feed' }, client, client);
    const events = third.body.events as Array<{ home: string; away: string; league: string }>;
    assert.equal(events.filter((event) => event.home === 'Netherlands' && event.away === 'Greece').length, 1);
    assert.equal(events.find((event) => event.home === 'Netherlands')?.league, 'UEFA Nations League A');
  });
});
