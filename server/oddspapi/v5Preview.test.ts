import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveSportsQuoteProvider, SportsProviderUnsupportedError } from '../sports/quoteProvider.js';
import { canonicalEventId, indexV5Markets, presentV5Quotes, sevenSportCategories } from './canonical.js';
import { handleOddsPapiV5PreviewRequest } from './previewHttp.js';
import { OddsPapiV5TrialReader } from './v5TrialClient.js';
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

  it('does not register the trial provider for bet placement', () => {
    assert.throws(() => resolveSportsQuoteProvider('oddspapi-v5', env), SportsProviderUnsupportedError);
    assert.equal(V5_STREAM_WORKER_DEPENDENCY.includes('durable worker'), true);
  });
});
