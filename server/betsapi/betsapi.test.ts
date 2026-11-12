import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { advertisedExtraMarketCount, applyFootballQuotes, footballCardToMatch, footballQuoteIds, mergeListedMatches } from '../../src/lib/footballFeed.js';
import { isRetiredSportsProvider } from '../sports/retiredProviders.js';
import { SharedRequestBudget } from './budget.js';
import { BetsApiReadOnlyClient, ODDS_REQUEST_GAP_MS } from './client.js';
import { handleFootballFeedRequest } from './footballFeedHttp.js';
import { diagnoseOddsPayload, normalizeFootballDetails, normalizeFootballList } from './parse.js';
import { handleBetsApiPreviewRequest } from './previewHttp.js';
import type { NormalizedMarket } from './types.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const TOKEN = 'unit-test-token';

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: '1001',
    sport_id: '1',
    time: 1_700_000_000,
    time_status: '1',
    league: { id: '8', name: 'Premier League', cc: 'gb' },
    home: { id: '11', name: 'Arsenal' },
    away: { id: '22', name: 'Chelsea' },
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function market(markets: NormalizedMarket[], key: NormalizedMarket['key'], line?: string | null): NormalizedMarket | undefined {
  return markets.find((item) => item.key === key && (line === undefined || item.line === line));
}

function prices(item: NormalizedMarket | undefined): number[] {
  return item?.outcomes.map((outcome) => outcome.price) ?? [];
}

describe('betsapi football normalization', () => {
  it('keeps football rows and drops other sports, missing status, and placeholder teams', () => {
    const payload = {
      success: 1,
      results: [
        event(),
        event({ id: '1002', sport_id: '13', home: { name: 'Tennis A' }, away: { name: 'Tennis B' } }),
        event({ id: '1003', sport_id: '', time_status: '1' }),
        event({ id: '1004', time_status: undefined }),
        event({ id: '1005', home: { name: '' }, away: { name: 'Chelsea' } }),
      ],
    };
    const events = normalizeFootballList(payload, 'inplay');
    assert.deepEqual(events.map((item) => item.eventId), ['1001']);
    assert.equal(events[0].sport, 'football');
    assert.equal(events[0].sportId, '1');
    assert.equal(events[0].league.name, 'Premier League');
    assert.equal(events[0].league.countryCode, 'GB');
    assert.equal(events[0].home.name, 'Arsenal');
    assert.equal(events[0].away.name, 'Chelsea');
    assert.equal(events[0].kickoff, '2023-11-14T22:13:20.000Z');
    assert.equal(events[0].status, 'live');
    assert.equal(events[0].score, null);
    assert.equal(events[0].league.name, 'Premier League');
  });

  it('maps provider time_status without turning suspended or unknown matches into prematch', () => {
    const rows = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '99'].map((timeStatus, index) => (
      event({ id: String(2000 + index), time_status: timeStatus, ss: '2-1' })
    ));
    const inplay = normalizeFootballList({ success: 1, results: rows }, 'inplay').map((item) => item.timeStatus);
    const upcoming = normalizeFootballList({ success: 1, results: rows }, 'upcoming').map((item) => item.timeStatus);
    const ended = normalizeFootballList({ success: 1, results: rows }, 'ended');
    assert.deepEqual(inplay, ['1']);
    assert.deepEqual(upcoming, ['0']);
    assert.deepEqual(ended.map((item) => item.timeStatus), ['2', '3', '4', '5', '6', '7', '8', '9', '10', '99']);
    assert.equal(ended.find((item) => item.timeStatus === '3')?.status, 'finished');
    assert.equal(ended.find((item) => item.timeStatus === '10')?.status, 'closed');
    assert.equal(ended.find((item) => item.timeStatus === '3')?.score?.home, 2);
    assert.equal(ended.find((item) => item.timeStatus === '10')?.score, null);
    assert.equal(upcoming.length === 1 && rows.some((row) => row.time_status == null), false);
  });

  it('uses the full football score and does not invent 0-0', () => {
    const summed = normalizeFootballList({
      success: 1,
      results: [event({
        time_status: '3',
        ss: '',
        scores: { '2': { home: '0', away: '1' }, '1': { home: '1', away: '0' } },
      })],
    }, 'ended');
    assert.deepEqual(summed[0].score, { home: 1, away: 1 });

    const explicit = normalizeFootballList({
      success: 1,
      results: [event({ time_status: '1', ss: '0-0' })],
    }, 'inplay');
    assert.deepEqual(explicit[0].score, { home: 0, away: 0 });

    const missing = normalizeFootballList({
      success: 1,
      results: [event({ time_status: '3', ss: null, scores: { '1': { home: 'x', away: '1' } } })],
    }, 'ended');
    assert.equal(missing[0].score, null);

    const sets = normalizeFootballList({
      success: 1,
      results: [event({ time_status: '3', ss: '6-4,6-3' })],
    }, 'ended');
    assert.equal(sets[0].score, null);
  });

  it('parses decimal, fractional and American prices and closes suspended, missing or malformed markets', () => {
    const details = normalizeFootballDetails({
      success: 1,
      results: [event({ time_status: '0' })],
    }, {
      success: 1,
      results: {
        odds: {
          '1_1': [
            { home_od: '2.10', draw_od: '3.25', away_od: '2.80', add_time: '1700000000' },
            { home_od: '-', draw_od: '3.40', away_od: '4.00', add_time: '1700000100', suspended: '1' },
          ],
          '1_3': [
            { over_od: '5/2', under_od: '+150', handicap: '2.5', add_time: '1700000100' },
            { over_od: '1.90', under_od: '1.90', handicap: 'abc', add_time: '1700000100' },
            { over_od: '1.80', under_od: '', handicap: '3.5', add_time: '1700000100' },
          ],
          '1_2': [
            { home_od: '1.95', away_od: '1.85', handicap: '0.5,1', add_time: '1700000000' },
            { home_od: '1.70', away_od: '2.10', handicap: '-0.25', add_time: '1700000200', su: '1' },
          ],
          '1_8': [{ home_od: '9.99', draw_od: '9.99', away_od: '9.99' }],
        },
      },
    });
    assert.ok(details);
    assert.equal(details?.status, 'prematch');
    assert.equal(details?.score, null);
    const oneXtwo = market(details?.markets ?? [], '1x2');
    assert.equal(oneXtwo?.status, 'closed');
    assert.deepEqual(oneXtwo?.outcomes, []);
    const total = market(details?.markets ?? [], 'over_under', '2.5');
    assert.equal(total?.status, 'open');
    assert.deepEqual(prices(total), [3.5, 2.5]);
    assert.equal(market(details?.markets ?? [], 'over_under', null)?.status, 'closed');
    assert.equal(market(details?.markets ?? [], 'over_under', '3.5')?.status, 'closed');
    assert.equal(market(details?.markets ?? [], 'asian_handicap', '+0.5,+1')?.status, 'open');
    assert.deepEqual(prices(market(details?.markets ?? [], 'asian_handicap', '+0.5,+1')), [1.95, 1.85]);
    assert.equal(market(details?.markets ?? [], 'asian_handicap', '-0.25')?.status, 'closed');
    assert.equal(JSON.stringify(details).includes('9.99'), false);
    assert.equal(JSON.stringify(details).includes('2.10'), false);
    assert.equal(details?.updatedAt, '2023-11-14T22:16:40.000Z');
  });

  it('does not invent a 2.5 line or copy 1X2 prices onto Asian Handicap', () => {
    const fromOdds = normalizeFootballDetails({
      success: 1,
      results: [event({ time_status: '0' })],
    }, {
      success: 1,
      results: { odds: { '1_1': [{ home_od: '1.91', draw_od: '3.40', away_od: '4.20', add_time: 1_700_000_100 }] } },
    });
    assert.equal(market(fromOdds?.markets ?? [], '1x2')?.status, 'open');
    assert.equal(market(fromOdds?.markets ?? [], 'over_under')?.status, 'closed');
    assert.equal(market(fromOdds?.markets ?? [], 'over_under')?.line, null);
    assert.equal(market(fromOdds?.markets ?? [], 'asian_handicap')?.status, 'closed');

    const flat = normalizeFootballList({
      success: 1,
      results: [event({
        time_status: '0',
        home_od: '1.91',
        draw_od: '3.40',
        away_od: '4.20',
        handicap: '-0.5',
      })],
    }, 'upcoming');
    assert.equal(market(flat[0].markets, '1x2')?.status, 'open');
    assert.equal(flat[0].markets.some((item) => item.key === 'asian_handicap'), false);
    assert.equal(JSON.stringify(flat).includes('2.50'), false);
  });

  it('keeps bookmaker, period, line and outcome identity and classifies missing odds', () => {
    const details = normalizeFootballDetails({
      success: 1,
      results: [event({ time_status: '1', ss: '1-0' })],
    }, {
      success: 1,
      results: {
        odds: {
          '1_1': {
            start: { '16': { home_od: '1.50', draw_od: '4.00', away_od: '6.00', add_time: '100', home_id: 'h-open' } },
            end: { '16': { home_od: '1.80', draw_od: '3.50', away_od: '4.20', add_time: '200', home_id: 'h-live' } },
          },
          '1_3': {
            '16': [
              { over_od: '1.91', under_od: '1.91', handicap: '2.5', add_time: '200', over_id: 'over-25' },
              { over_od: '1.85', under_od: '1.95', handicap: '3.5', add_time: '200' },
            ],
          },
          '1_2': {
            '16': [{ home_od: '1.95', away_od: '1.85', handicap: '-0.5', add_time: '200', home_id: 'ah-home' }],
          },
        },
      },
    });
    const oneXtwo = market(details?.markets ?? [], '1x2');
    assert.equal(oneXtwo?.status, 'open');
    assert.equal(oneXtwo?.bookmakerId, '16');
    assert.equal(oneXtwo?.externalPeriodId, 'end');
    assert.equal(oneXtwo?.externalMarketId, '1_1');
    assert.equal(oneXtwo?.outcomes.find((item) => item.key === 'home')?.sourceSelectionId, 'h-live');
    assert.deepEqual(prices(oneXtwo), [1.8, 3.5, 4.2]);
    const total = market(details?.markets ?? [], 'over_under', '2.5');
    assert.equal(total?.bookmakerId, '16');
    assert.equal(total?.externalMarketId, '1_3');
    assert.equal(total?.line, '2.5');
    assert.equal(total?.outcomes.find((item) => item.key === 'over')?.sourceSelectionId, 'over-25');
    const handicap = market(details?.markets ?? [], 'asian_handicap', '-0.5');
    assert.equal(handicap?.status, 'open');
    assert.equal(handicap?.bookmakerId, '16');
    assert.equal(handicap?.externalMarketId, '1_2');
    assert.equal(diagnoseOddsPayload({ success: 1, results: { odds: {} } }), 'unavailable');
    assert.equal(diagnoseOddsPayload({
      success: 1,
      results: { odds: { '1_1': { mystery: { value: 'x' } } } },
    }), 'unrecognized');
    assert.equal(diagnoseOddsPayload({
      success: 1,
      results: { odds: { '1_1': [{ home_od: '1.80', draw_od: '3.40', away_od: '4.20', suspended: '1', add_time: '10' }] } },
    }), 'suspended');
  });
});

describe('betsapi read-only client', () => {
  function client(options: {
    now: () => number;
    sleep?: (ms: number) => Promise<void>;
    fetchImpl: typeof fetch;
    freshMs?: { inplay: number };
    staleMs?: { inplay: number };
    timeoutMs?: number;
  }) {
    return new BetsApiReadOnlyClient({
      env: { BETSAPI_TOKEN: TOKEN },
      minGapMs: 0,
      now: options.now,
      sleep: options.sleep,
      fetchImpl: options.fetchImpl,
      freshMs: options.freshMs,
      staleMs: options.staleMs,
      timeoutMs: options.timeoutMs,
    });
  }

  it('requests only football list endpoints and keeps the token out of the result', async () => {
    const urls: string[] = [];
    let now = 1_700_000_000_000;
    const feed = client({
      now: () => now,
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        urls.push(url.toString());
        assert.equal(url.searchParams.get('token'), TOKEN);
        assert.equal(url.searchParams.get('sport_id'), '1');
        return jsonResponse({ success: 1, results: [event()] });
      },
    });
    const result = await feed.getInplay();
    assert.equal(result.ok, true);
    assert.equal(result.feed?.events[0]?.eventId, '1001');
    assert.equal(JSON.stringify(result).includes(TOKEN), false);
    assert.equal(urls[0].includes('/v3/events/inplay'), true);
    await feed.getInplay();
    assert.equal(urls.length, 1);
    now += 12_001;
    await feed.getUpcoming(1);
    assert.equal(urls.at(-1)?.includes('/v3/events/upcoming'), true);
    await feed.getEnded('20261110');
    assert.equal(urls.at(-1)?.includes('/v3/events/ended'), true);
    assert.equal(urls.at(-1)?.includes('day=20261110'), true);
  });

  it('loads a settlement result from the event view without an odds request', async () => {
    const urls: string[] = [];
    const feed = client({
      now: () => 1_700_000_000_000,
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        urls.push(`${url.pathname}${url.search}`);
        assert.equal(url.searchParams.get('token'), TOKEN);
        return jsonResponse({ success: 1, results: [event({ time_status: '3', ss: '2-1' })] });
      },
    });
    const result = await feed.getEventResult('1001');
    assert.equal(result.ok, true);
    assert.equal(result.feed?.events[0]?.status, 'finished');
    assert.equal(result.feed?.events[0]?.score?.home, 2);
    assert.equal(urls.length, 1);
    assert.equal(urls[0].includes('/v1/event/view'), true);
    assert.equal(urls[0].includes('event_id=1001'), true);
    assert.equal(JSON.stringify(result).includes(TOKEN), false);
  });

  it('serves a stale cached list on 429 and drops it after the stale window', async () => {
    let now = 1_000_000;
    let calls = 0;
    const slept: number[] = [];
    const feed = client({
      now: () => now,
      sleep: async (ms) => {
        slept.push(ms);
        now += ms;
      },
      freshMs: { inplay: 1_000 },
      staleMs: { inplay: 10_000 },
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return jsonResponse({ success: 1, results: [event({ ss: '1-0' })] }, 200, {
            'x-ratelimit-remaining': '2',
            'x-ratelimit-limit': '100',
          });
        }
        return jsonResponse({ success: 0 }, 429, { 'retry-after': '120' });
      },
    });
    const fresh = await feed.getInplay();
    assert.equal(fresh.feed?.stale, false);
    assert.equal(fresh.feed?.rateLimit?.remaining, 2);
    now += 5_000;
    const stale = await feed.getInplay();
    assert.equal(stale.ok, true);
    assert.equal(stale.feed?.stale, true);
    assert.equal(stale.feed?.rateLimited, true);
    assert.equal(stale.feed?.events[0]?.score?.home, 1);
    assert.equal(JSON.stringify(stale).includes(TOKEN), false);
    const expired = await feed.getInplay();
    assert.equal(expired.ok, false);
    assert.equal(expired.error, 'STALE');
    assert.equal(expired.feed, null);
    assert.equal(slept[0] >= 60_000, true);
  });

  it('backs off from Retry-After and from a depleted rate-limit header without calling the fallback host', async () => {
    let now = 1_700_000_000_000;
    const hosts: string[] = [];
    const slept: number[] = [];
    const feed = client({
      now: () => now,
      sleep: async (ms) => {
        slept.push(ms);
        now += ms;
      },
      freshMs: { inplay: 0 },
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        hosts.push(url.host);
        if (hosts.length === 1) {
          return jsonResponse({ success: 1, results: [] }, 200, {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(Math.floor((now + 180_000) / 1000)),
          });
        }
        return jsonResponse({ success: 0 }, 429, { 'retry-after': '90' });
      },
    });
    await feed.getInplay();
    now += 1;
    await feed.getInplay();
    assert.equal(hosts.length, 2);
    assert.deepEqual(hosts, ['api.b365api.com', 'api.b365api.com']);
    assert.equal(slept[0] >= 60_000, true);
  });

  it('falls back only after a server error and maps timeouts without leaking the token', async () => {
    const hosts: string[] = [];
    const feed = client({
      now: () => 10_000,
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        hosts.push(url.host);
        if (url.host === 'api.b365api.com') return jsonResponse({ success: 0 }, 500);
        return jsonResponse({ success: 1, results: [event({ time_status: '0' })] });
      },
    });
    const result = await feed.getUpcoming(1);
    assert.deepEqual(hosts, ['api.b365api.com', 'api.betsapi.com']);
    assert.equal(result.feed?.events[0]?.status, 'prematch');

    const blocked = client({
      now: () => 10_000,
      fetchImpl: async (input) => {
        hosts.push(new URL(String(input)).host);
        return jsonResponse({ success: 0 }, 401);
      },
    });
    hosts.length = 0;
    const denied = await blocked.getInplay();
    assert.deepEqual(hosts, ['api.b365api.com']);
    assert.equal(denied.error, 'UPSTREAM');
    assert.equal(JSON.stringify(denied).includes(TOKEN), false);

    const timed = client({
      now: () => 10_000,
      timeoutMs: 20,
      fetchImpl: (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error(TOKEN);
          error.name = 'AbortError';
          reject(error);
        });
      }),
    });
    const timeout = await timed.getInplay();
    assert.equal(timeout.error, 'TIMEOUT');
    assert.equal(JSON.stringify(timeout).includes(TOKEN), false);
  });

  it('loads event view and odds, and shares one in-flight list request', async () => {
    let listCalls = 0;
    const paths: string[] = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const feed = client({
      now: () => 20_000,
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        paths.push(url.pathname);
        if (url.pathname.endsWith('/inplay')) {
          listCalls += 1;
          await gate;
          return jsonResponse({ success: 1, results: [event()] });
        }
        if (url.pathname.endsWith('/view')) {
          return jsonResponse({ success: 1, results: event({ time_status: '1', ss: '1-0' }) });
        }
        return jsonResponse({
          success: 1,
          results: { odds: { '1_1': [{ home_od: '1.80', draw_od: '3.50', away_od: '4.60', add_time: 1_700_000_100 }] } },
        });
      },
    });
    const first = feed.getInplay();
    const second = feed.getInplay();
    release?.();
    const [left, right] = await Promise.all([first, second]);
    assert.equal(listCalls, 1);
    assert.equal(left.feed?.events.length, 1);
    assert.equal(right.feed?.events.length, 1);
    const details = await feed.getEvent('1001');
    assert.equal(paths.includes('/v1/event/view'), true);
    assert.equal(paths.includes('/v2/event/odds'), true);
    assert.equal(details.feed?.events[0]?.score?.home, 1);
    assert.equal(market(details.feed?.events[0]?.markets ?? [], '1x2')?.status, 'open');
    assert.equal(JSON.stringify(details).includes(TOKEN), false);
  });
});

describe('betsapi preview and retirement guards', () => {
  const previewEnv = {
    BETSAPI_READONLY_PREVIEW: '1',
    BETSAPI_PREVIEW_KEY: 'preview-key',
    BETSAPI_TOKEN: TOKEN,
    NODE_ENV: 'test',
  };

  it('keeps the preview closed unless staging is explicitly authorized', async () => {
    const closed = await handleBetsApiPreviewRequest({ method: 'GET', url: '/api/internal/betsapi-preview' }, {});
    assert.equal(closed.status, 404);
    const production = await handleBetsApiPreviewRequest({
      method: 'GET',
      url: '/api/internal/betsapi-preview?token=unit-test-token',
      headers: { 'x-betsapi-preview-key': 'preview-key' },
    }, { ...previewEnv, VERCEL_ENV: 'production' });
    assert.equal(production.status, 404);
    assert.equal(JSON.stringify(production.body).includes(TOKEN), false);
    const wrongKey = await handleBetsApiPreviewRequest({
      method: 'GET',
      headers: { 'x-betsapi-preview-key': 'nope' },
    }, previewEnv);
    assert.equal(wrongKey.status, 404);
  });

  it('returns normalized provider data for an authorized preview without calling betting', async () => {
    const result = await handleBetsApiPreviewRequest({
      method: 'GET',
      url: '/api/internal/betsapi-preview?view=inplay&token=unit-test-token',
      headers: { 'x-betsapi-preview-key': 'preview-key' },
    }, previewEnv, {
      async getInplay() {
        return {
          ok: true,
          error: null,
          upstreamStatus: 200,
          feed: {
            source: 'betsapi',
            mode: 'read-only',
            betting: 'disabled',
            settlement: 'disabled',
            endpoint: 'inplay',
            sportId: '1',
            fetchedAt: '2026-11-10T00:00:00.000Z',
            updatedAt: '2026-11-10T00:00:00.000Z',
            stale: false,
            rateLimited: false,
            rateLimit: null,
            events: [],
          },
        };
      },
      async getUpcoming() { throw new Error(TOKEN); },
      async getEnded() { throw new Error(TOKEN); },
      async getEvent() { throw new Error(TOKEN); },
    });
    assert.equal(result.status, 200);
    assert.equal(result.headers['Cache-Control'], 'no-store');
    assert.equal(result.body.ok, true);
    const feed = result.body.feed as { betting: string; settlement: string };
    assert.equal(feed.betting, 'disabled');
    assert.equal(feed.settlement, 'disabled');
    assert.equal(JSON.stringify(result.body).includes(TOKEN), false);
  });

  it('does not put the provider token in frontend code or weaken retired betting guards', () => {
    const files = [
      'server/betsapi/client.ts',
      'server/betsapi/parse.ts',
      'server/betsapi/previewHttp.ts',
      'server/betsapi/previewCli.ts',
      'api/internal/betsapi-preview.ts',
      'scripts/betsapi-readonly-preview.ts',
      'server/sports/betsapiSettlementRun.ts',
      'api/internal/sports/betsapi-settle.ts',
    ];
    for (const file of files) {
      const source = read(file);
      assert.equal(source.includes('VITE_BETSAPI'), false, file);
      assert.equal(source.includes(TOKEN), false, file);
    }
    const client = read('src/lib/betsapi.ts');
    assert.match(client, /export function getBetsApiToken\(\): string \{\s*return '';/);
    assert.match(client, /LEGACY_SPORTS_FEED_DISABLED/);
    const vite = read('vite.config.ts');
    assert.equal(vite.includes('betsapiGatewayPlugin'), false);
    assert.equal(vite.includes('betsapiLiveWsPlugin'), false);
    const proxy = read('api/betsapi/[...path].js');
    assert.equal(proxy.includes('gateway.js'), false);
    assert.equal(proxy.includes('server/betsapi'), false);
    assert.match(proxy, /410/);
    const gateway = read('api/betsapi/gateway.js');
    assert.equal(gateway.includes('VITE_BETSAPI'), false);
    assert.equal(isRetiredSportsProvider('betsapi'), true);
    assert.equal(isRetiredSportsProvider('b365api'), true);
    const place = read('server/player/sportsPlaceService.ts');
    assert.match(place, /isRetiredSportsProvider/);
    const sourceRoot = read('src/services/sports.ts');
    assert.equal(sourceRoot.includes('server/betsapi'), false);
  });
});

describe('football odds pacing', () => {
  it('keeps two concurrent instances inside the verified 1800 requests per hour account limit', async () => {
    assert.equal(ODDS_REQUEST_GAP_MS, 4_000);
    let now = 0;
    const slept: number[] = [];
    const budget = new SharedRequestBudget({
      minGapMs: 2_000,
      now: () => now,
      sleep: async (ms) => {
        slept.push(ms);
        now += ms;
      },
    });
    await budget.schedule(async () => undefined);
    await budget.schedule(async () => undefined);
    assert.equal(slept[0], 2_000);
    budget.noteQuota({
      remaining: 30,
      limit: 3_600,
      resetAtMs: now + 120_000,
      retryAfterMs: null,
    });
    await budget.schedule(async () => undefined);
    assert.ok((slept.at(-1) ?? 0) >= 8_000);
    assert.ok((slept.at(-1) ?? 0) <= 12_000);
  });
});

describe('football odds display', () => {
  it('loads a bounded odds batch, dedupes cache, and stops after a rate limit', async () => {
    const calls: string[] = [];
    const oddsClient = new BetsApiReadOnlyClient({
      env: { BETSAPI_TOKEN: TOKEN },
      minGapMs: 0,
      freshMs: { odds: 15_000 },
      now: () => 1_700_000_000_000,
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        const id = url.searchParams.get('event_id') ?? '';
        calls.push(id);
        assert.equal(url.pathname, '/v2/event/odds');
        if (id === '3') return jsonResponse({ success: 0 }, 429, { 'retry-after': '60' });
        return jsonResponse({
          success: 1,
          results: {
            odds: {
              '1_1': { '16': [{ home_od: '1.90', draw_od: '3.40', away_od: '4.20', add_time: '10', home_id: `h-${id}` }] },
              '1_3': { '16': [{ over_od: '1.87', under_od: '1.95', handicap: '2.5', add_time: '10' }] },
              '1_2': { '16': [{ home_od: '1.92', away_od: '1.90', handicap: '-0.5', add_time: '10' }] },
            },
          },
        });
      },
    });
    const listClient = new BetsApiReadOnlyClient({
      env: { BETSAPI_TOKEN: TOKEN },
      minGapMs: 0,
      fetchImpl: async () => {
        throw new Error('list client must not run for oddsFor');
      },
    });
    const response = await handleFootballFeedRequest({
      method: 'GET',
      url: 'http://127.0.0.1/api/player/sports/football-feed?oddsFor=1,2,3,4,nope,1',
    }, listClient, oddsClient);
    assert.equal(response.status, 200);
    assert.equal(JSON.stringify(response.body).includes(TOKEN), false);
    const quotes = response.body.quotes as Array<{ id: string; priceState: string; markets: Array<{ key: string; bookmakerId: string | null; line: string; externalMarketId: string }> }>;
    assert.deepEqual(quotes.map((quote) => quote.priceState), ['open', 'open', 'rate_limited', 'deferred']);
    assert.deepEqual(calls, ['1', '2', '3']);
    assert.equal(quotes[0].markets.find((item) => item.key === '1x2')?.bookmakerId, '16');
    assert.equal(quotes[0].markets.find((item) => item.key === 'over_under')?.line, '2.5');
    assert.equal(quotes[0].markets.find((item) => item.key === 'asian_handicap')?.externalMarketId, '1_2');
    calls.length = 0;
    await handleFootballFeedRequest({
      method: 'GET',
      url: 'http://127.0.0.1/api/player/sports/football-feed?oddsFor=1',
    }, listClient, oddsClient);
    assert.deepEqual(calls, []);
  });

  it('shows real extra markets and keeps prices across an unpriced list refresh', () => {
    const listed = footballCardToMatch({
      id: '1', league: 'L', country: 'GB', home: 'A', away: 'B', kickoff: null, live: true, score: { home: 0, away: 0 },
      priceState: 'unpriced', markets: [],
    });
    assert.equal(advertisedExtraMarketCount(listed, 0), null);
    assert.equal(listed.priceState, 'unpriced');
    const priced = applyFootballQuotes([listed], [{
      id: '1',
      priceState: 'open',
      markets: [
        { key: '1x2', name: '1X2', line: '', status: 'open', updatedAt: null, bookmakerId: '16', externalPeriodId: 'end', externalMarketId: '1_1', outcomes: [
          { key: 'home', name: 'Home', price: 1.8, sourceSelectionId: 'h1' },
          { key: 'draw', name: 'Draw', price: 3.4 },
          { key: 'away', name: 'Away', price: 4.2 },
        ] },
        { key: 'over_under', name: 'Over/Under', line: '2.5', status: 'open', updatedAt: null, bookmakerId: '16', externalPeriodId: null, externalMarketId: '1_3', outcomes: [
          { key: 'over', name: 'Over', price: 1.9 },
          { key: 'under', name: 'Under', price: 1.9 },
        ] },
      ],
    }]);
    assert.equal(priced[0].markets['1'], 1.8);
    assert.equal(priced[0].extraMarkets, 1);
    assert.equal(priced[0].betsapiQuotes?.['П1']?.bookmakerId, '16');
    assert.equal(priced[0].betsapiQuotes?.['П1']?.sourceSelectionId, 'h1');
    assert.equal(advertisedExtraMarketCount(priced[0], 1), 1);
    const kept = mergeListedMatches(priced, [listed]);
    assert.equal(kept[0].markets['1'], 1.8);
    assert.equal(kept[0].priceState, 'open');
    const suspended = footballCardToMatch({
      id: '2', league: 'L', country: 'GB', home: 'A', away: 'B', kickoff: null, live: true, score: null,
      priceState: 'suspended',
      markets: [{
        key: '1x2', name: '1X2', line: '', status: 'suspended', updatedAt: null,
        bookmakerId: null, externalPeriodId: null, externalMarketId: '1_1', outcomes: [],
      }],
    });
    assert.equal(suspended.marketsLocked, true);
    assert.equal(suspended.markets['1'], 0);
    assert.equal(suspended.betsapiQuotes?.['П1'], undefined);
    assert.equal(advertisedExtraMarketCount(suspended, 0), null);
    const plan = footballQuoteIds([
      { ...listed, id: 'live-open', priceState: 'open' },
      { ...listed, id: 'pre', isLive: false, priceState: 'unpriced' },
    ]);
    assert.deepEqual(plan.primary, ['pre']);
  });
});
