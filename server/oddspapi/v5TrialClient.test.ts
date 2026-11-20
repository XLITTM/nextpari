import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { extractActiveV5Quotes, OddsPapiV5TrialReader, summarizeV5Fixture, V5_SPORT_IDS } from './v5TrialClient.js';
import { decideV5StreamFrame, makeV5Login } from './v5WebSocket.js';

const id = 'id1000032566887160';
const selectionId = id + ':1xbet:101000:0';
function validFixture() {
  return {
    fixtureId: id, sport: { sportId: 10 }, status: { live: true },
    bookmakers: { '1xbet': { hasOdds: true, staleOdds: false, suspended: false } },
    odds: { '1xbet': { [selectionId]: {
      bookmaker: '1xbet', outcomeId: 101000, marketId: 101000,
      price: 1.92, active: true, changedAt: 1795000000000,
    } } },
  };
}

test('provider sport IDs are independent from BetsAPI and include 7 named categories', () => {
  assert.equal(V5_SPORT_IDS.football, 10);
  assert.equal(V5_SPORT_IDS.tableTennis, 25);
  assert.equal(V5_SPORT_IDS.esportsValorant, 61);
  assert.equal(Object.keys(V5_SPORT_IDS).length, 10);
});

test('extracts only active provider IDs when bookmaker is safe', () => {
  const fixture = validFixture();
  const summary = summarizeV5Fixture(fixture);
  assert.deepEqual({ live: summary?.live, hasOdds: summary?.hasOdds, staleOdds: summary?.staleOdds, suspended: summary?.suspended },
    { live: true, hasOdds: true, staleOdds: false, suspended: false });
  const quotes = extractActiveV5Quotes(fixture);
  assert.equal(quotes.length, 1);
  assert.equal(quotes[0].sourceSelectionId, selectionId);
  assert.equal(quotes[0].source, 'oddspapi-v5');
});

test('fails closed on stale or suspended bookmaker', () => {
  for (const flag of ['staleOdds', 'suspended']) {
    const fixture = validFixture();
    (fixture.bookmakers['1xbet'] as Record<string, unknown>)[flag] = true;
    assert.deepEqual(extractActiveV5Quotes(fixture), []);
  }
  const missing = validFixture();
  delete (missing.bookmakers['1xbet'] as Record<string, unknown>).staleOdds;
  assert.deepEqual(extractActiveV5Quotes(missing), []);
});

test('rejects inactive, invalid, mismatched and source-crossed selections', () => {
  const fixture = validFixture();
  const item = fixture.odds['1xbet'][selectionId];
  item.active = false;
  assert.deepEqual(extractActiveV5Quotes(fixture), []);
  item.active = true;
  item.price = NaN;
  assert.deepEqual(extractActiveV5Quotes(fixture), []);
  item.price = 1.9;
  const mismatch = validFixture();
  mismatch.fixtureId = 'id1000032566887174';
  assert.deepEqual(extractActiveV5Quotes(mismatch), []);
});

test('never accesses network without server-side key', async () => {
  const client = new OddsPapiV5TrialReader({ env: {}, fetchImpl: async () => { throw new Error('must not fetch'); } });
  const result = await client.live(10);
  assert.equal(result.error, 'NOT_CONFIGURED');
});

test('all requests are GET, use 1xbet, and never accept user-supplied bookmaker or host', async () => {
  const requests: Array<{ uri: string; method: string | undefined }> = [];
  const client = new OddsPapiV5TrialReader({ env: { ODDSPAPI_V5_API_KEY: 'test-only-not-production' }, fetchImpl: async (input, init) => {
    requests.push({ uri: String(input), method: init?.method });
    return Response.json([]);
  } });
  assert.equal((await client.today(10)).ok, true);
  assert.equal((await client.live(25)).ok, true);
  assert.equal((await client.fixtureOdds(id)).ok, true);
  const invalid = await client.today(999);
  assert.equal(invalid.error, 'INVALID_RESPONSE');
  assert.equal(requests.length, 3);
  for (const request of requests) {
    const url = new URL(request.uri);
    assert.equal(url.origin, 'https://v5.oddspapi.io');
    assert.equal(url.searchParams.get('bookmakers'), '1xbet');
    assert.equal(request.method, 'GET');
  }
});

test('handles rate-limit failures without logging credentials', async () => {
  const client = new OddsPapiV5TrialReader({ env: { ODDSPAPI_V5_API_KEY: 'secret-example-value' }, fetchImpl: async () => new Response('private error text', { status: 429 }) });
  const result = await client.live(10);
  assert.deepEqual({ ok: result.ok, status: result.status, error: result.error, data: result.data },
    { ok: false, status: 429, error: 'RATE_LIMITED', data: null });
  assert.equal(result.retryAfterMs, null);
  const waited = new OddsPapiV5TrialReader({
    env: { ODDSPAPI_V5_API_KEY: 'secret-example-value' },
    fetchImpl: async () => new Response(JSON.stringify({ retryAfterSec: 2, message: 'rate limit exceeded' }), {
      status: 429,
      headers: { 'retry-after': '2' },
    }),
  });
  assert.equal((await waited.today(10)).retryAfterMs, 2_000);
});

test('websocket login requests channels explicitly to avoid login_failed', () => {
  const login = makeV5Login('test-key-representing-a-trial-credential', [10, 11, 12, 15, 23, 25]);
  assert.deepEqual(login.bookmakers, ['1xbet']);
  assert.equal(login.type, 'login');
  assert.equal(login.channels.includes('odds'), true);
  assert.equal(login.channels.includes('fixtures'), true);
  assert.equal(decideV5StreamFrame({ type: 'login_ok' }), 'authenticated');
  assert.equal(decideV5StreamFrame({ type: 'snapshot_required' }), 'snapshot_required');
  assert.equal(decideV5StreamFrame({ type: 'error' }), 'pause_quotes');
});
