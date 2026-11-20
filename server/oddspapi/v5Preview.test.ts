import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveSportsQuoteProvider, SportsProviderUnsupportedError } from '../sports/quoteProvider.js';
import { applyCatalogNames, canonicalEventId, cardPricesForFixture, fixtureDisplay, indexV5Markets, presentV5Quotes, sevenSportCategories, unixSecondsToMs } from './canonical.js';
import { handleOddsPapiV5DemoRequest, handleOddsPapiV5PreviewRequest } from './previewHttp.js';
import { clearV5CatalogCache, OddsPapiV5TrialReader } from './v5TrialClient.js';
import { V5_STREAM_WORKER_DEPENDENCY } from './v5WebSocket.js';

const FIXTURE = 'id1000032566887160';
const env = {
  VERCEL_ENV: 'preview',
  ODDSPAPI_V5_READONLY_PREVIEW: '1',
  ODDSPAPI_V5_PREVIEW_KEY: 'preview-key',
  ODDSPAPI_V5_API_KEY: 'server-side-test-key-not-real',
};

function fixture(overrides: Record<string, unknown> = {}) {
  const selection = `${FIXTURE}:1xbet:101:0`;
  return {
    fixtureId: FIXTURE,
    participant1Name: 'Home Side',
    participant2Name: 'Away Side',
    sport: { sportId: 10 },
    status: { live: false },
    bookmakers: { '1xbet': { hasOdds: true, staleOdds: false, suspended: false } },
    odds: {
      '1xbet': {
        [selection]: {
          bookmaker: '1xbet',
          outcomeId: 101,
          marketId: 101,
          price: 1.9,
          active: true,
          changedAt: '2026-11-20T00:00:00.000Z',
        },
      },
    },
    ...overrides,
  };
}

const markets = [{
  marketId: 101,
  marketName: 'Full Time Result',
  marketType: '1x2',
  period: 'fulltime',
  handicap: 0,
  outcomes: [
    { outcomeId: 101, outcomeName: '1' },
    { outcomeId: 102, outcomeName: 'X' },
    { outcomeId: 103, outcomeName: '2' },
  ],
}];

describe('oddspapi v5 canonical preview', () => {
  it('keeps ten provider sports in a separate namespace', () => {
    const sports = sevenSportCategories();
    assert.equal(sports.length, 10);
    assert.equal(sports.find((item) => item.sportId === 25)?.sportKey, 'table-tennis');
    assert.equal(canonicalEventId(FIXTURE).startsWith('oddspapi-v5:event:'), true);
    assert.equal(canonicalEventId(FIXTURE).includes('betsapi'), false);
  });

  it('rejects ambiguous catalog rows and stale live quotes', () => {
    const catalog = indexV5Markets([
      ...markets,
      { ...markets[0], marketName: 'Different result' },
    ]);
    assert.equal(catalog.ambiguous.has(101), true);
    const presented = presentV5Quotes(fixture(), catalog, Date.parse('2026-11-20T00:01:00.000Z'));
    assert.equal(presented.accepted.length, 0);
    assert.equal(presented.rejected, 1);
  });

  it('accepts a fresh oriented 1x2 and hides the provider key', async () => {
    const reader = new OddsPapiV5TrialReader({
      env,
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/markets')) return Response.json(markets);
        return Response.json(fixture());
      },
    });
    const closed = await handleOddsPapiV5PreviewRequest({ method: 'GET', url: '/api/internal/oddspapi-v5-preview' }, { ...env, VERCEL_ENV: 'production' });
    assert.equal(closed.status, 404);
    const result = await handleOddsPapiV5PreviewRequest({
      method: 'GET',
      url: `/api/internal/oddspapi-v5-preview?view=odds&fixtureId=${FIXTURE}`,
      headers: { 'x-oddspapi-v5-preview-key': 'preview-key' },
    }, env, reader, Date.parse('2026-11-20T00:01:00.000Z'));
    assert.equal(result.status, 200);
    const quotes = result.body.quotes as Array<Record<string, unknown>>;
    assert.equal(quotes.length, 1);
    assert.equal(quotes[0].canonicalSelectionId, `oddspapi-v5:selection:${FIXTURE}:1xbet:101:0`);
    assert.equal(result.body.betsAccepted, false);
    assert.equal(JSON.stringify(result.body).includes('server-side-test-key'), false);
    assert.equal(JSON.stringify(result.body).includes(V5_STREAM_WORKER_DEPENDENCY), false);
  });

  it('serves the preview demo without a browser key and stays closed in production', async () => {
    const production = await handleOddsPapiV5DemoRequest({
      method: 'GET',
      url: '/api/internal/oddspapi-v5-demo?view=sports',
    }, { ...env, VERCEL_ENV: 'production' });
    assert.equal(production.status, 404);
    const demo = await handleOddsPapiV5DemoRequest({
      method: 'GET',
      url: '/api/internal/oddspapi-v5-demo?view=sports',
    }, env);
    assert.equal(demo.status, 200);
    assert.equal(demo.body.demo, true);
    assert.equal(demo.body.readOnly, true);
    assert.equal(demo.body.betsAccepted, false);
    assert.equal(demo.body.walletEnabled, false);
    assert.equal((demo.body.sports as unknown[]).length, 10);
    assert.equal(JSON.stringify(demo.body).includes('server-side-test-key'), false);
    assert.equal(JSON.stringify(demo.body).includes('preview-key'), false);
  });

  it('resolves catalog names and unix-second kickoff without inventing a clock', async () => {
    clearV5CatalogCache();
    const listed = {
      fixtureId: FIXTURE,
      sport: { sportId: 10 },
      status: { live: false },
      bookmakers: { '1xbet': { hasOdds: true, staleOdds: false, suspended: false } },
      participants: { participant1Id: 2999, participant2Id: 3010, participant1Name: 'Embedded Name' },
      tournament: { tournamentId: 238, tournamentName: 'Liga Portugal' },
      startTime: 1792437300,
    };
    assert.equal(unixSecondsToMs(1792437300), 1792437300000);
    assert.equal(unixSecondsToMs('not-a-time'), null);
    const bare = fixtureDisplay(listed);
    assert.equal(bare?.participant1Name, null);
    assert.equal(bare?.startTimeMs, 1792437300000);
    const participants = new Map([[2999, { name: 'SC Braga', sportId: 10 }], [3010, { name: 'Gil Vicente', sportId: 11 }]]);
    const named = applyCatalogNames(bare!, participants, new Map());
    assert.equal(named.participant1Name, 'SC Braga');
    assert.equal(named.participant2Name, null);
    assert.equal(named.tournamentName, 'Liga Portugal');
    const reader = {
      async today() {
        return { ok: true, status: 200, error: null, data: [listed, { ...listed, fixtureId: 'id1000032566887161' }] };
      },
      async participants() {
        return { ok: true, status: 200, error: null, data: [{ participantId: 2999, sportId: 10, name: 'SC Braga' }, { participantId: 3010, sportId: 10, name: 'Gil Vicente' }] };
      },
      async tournaments() {
        return { ok: true, status: 200, error: null, data: [] };
      },
    };
    const result = await handleOddsPapiV5PreviewRequest({
      method: 'GET',
      url: '/api/internal/oddspapi-v5-preview?view=today&sportId=10',
      headers: { 'x-oddspapi-v5-preview-key': 'preview-key' },
    }, env, reader as unknown as OddsPapiV5TrialReader, Date.parse('2026-11-20T00:01:00.000Z'));
    const fixtures = result.body.fixtures as Array<Record<string, unknown>>;
    assert.equal(result.body.upstreamFixtureCount, 2);
    assert.equal(result.body.shownFixtureCount, 2);
    assert.equal(fixtures[0].participant1Name, 'SC Braga');
    assert.equal(fixtures[0].participant2Name, 'Gil Vicente');
    assert.equal(fixtures[0].startTimeMs, 1792437300000);
    assert.equal(JSON.stringify(result.body).includes('Embedded Name'), false);
  });

  it('shows only one fresh full-time 1x2 and hides period prices', () => {
    const half = {
      marketId: 202,
      marketName: '1st half',
      marketType: '1x2',
      period: '1st half',
      handicap: 0,
      outcomes: [{ outcomeId: 201, outcomeName: '1' }, { outcomeId: 202, outcomeName: 'X' }, { outcomeId: 203, outcomeName: '2' }],
    };
    const full = { ...markets[0], period: 'fulltime' };
    const catalog = indexV5Markets([full, half]);
    const selection = (marketId: number, outcomeId: number, price: number) => ({
      bookmaker: '1xbet', outcomeId, marketId, price, active: true, changedAt: '2026-11-20T00:00:00.000Z',
    });
    const payload = fixture({
      odds: { '1xbet': {
        [`${FIXTURE}:1xbet:101:0`]: selection(101, 101, 1.9),
        [`${FIXTURE}:1xbet:102:0`]: selection(101, 102, 3.4),
        [`${FIXTURE}:1xbet:103:0`]: selection(101, 103, 4.1),
        [`${FIXTURE}:1xbet:201:0`]: selection(202, 201, 2.2),
      } },
    });
    const card = cardPricesForFixture(payload, catalog, Date.parse('2026-11-20T00:01:00.000Z'));
    assert.deepEqual(card?.prices, { '1': 1.9, x: 3.4, '2': 4.1 });
    const stale = fixture({ bookmakers: { '1xbet': { hasOdds: true, staleOdds: true, suspended: false } } });
    assert.equal(cardPricesForFixture(stale, catalog, Date.parse('2026-11-20T00:01:00.000Z'))?.available, false);
    const ambiguous = indexV5Markets([full, { ...full, marketId: 303, marketName: 'Second full time' }]);
    const doubled = fixture({
      odds: { '1xbet': {
        [`${FIXTURE}:1xbet:101:0`]: selection(101, 101, 1.9),
        [`${FIXTURE}:1xbet:102:0`]: selection(101, 102, 3.4),
        [`${FIXTURE}:1xbet:103:0`]: selection(101, 103, 4.1),
        [`${FIXTURE}:1xbet:101:1`]: selection(303, 101, 1.5),
        [`${FIXTURE}:1xbet:102:1`]: selection(303, 102, 3.1),
        [`${FIXTURE}:1xbet:103:1`]: selection(303, 103, 5.0),
      } },
    });
    assert.equal(cardPricesForFixture(doubled, ambiguous, Date.parse('2026-11-20T00:01:00.000Z'))?.available, false);
  });

  it('does not register the trial provider for bet placement', () => {
    assert.throws(() => resolveSportsQuoteProvider('oddspapi-v5', env), SportsProviderUnsupportedError);
    assert.equal(V5_STREAM_WORKER_DEPENDENCY.includes('durable worker'), true);
  });
});
