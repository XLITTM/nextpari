import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { BetsApiReadOnlyClient } from './client.js';
import { handleFootballFeedRequest } from './footballFeedHttp.js';
import { marketsFromOddsPayload, normalizeFootballList } from './parse.js';
import { eventTier, rankFeaturedFootball } from './footballCoverage.js';

const fixture = (sportId: string, id = '42', league = 'NBA') => ({
  id, sport_id: sportId, time_status: '1', time: '1794491000', ss: '32-29',
  league: { id: '20', name: league, cc: 'us' },
  home: { id: '2', name: 'Home' }, away: { id: '3', name: 'Away' },
});
const quote = { id: '3', add_time: 1794491000, home_od: '1.95', away_od: '2.02' };
const odds = (matching: string) => ({
  results: { stats: { matching_dir: matching }, odds: {
    '18_1': [quote],
    '18_3': [{ add_time: 1794491000, handicap: '205.5', over_od: '1.8', under_od: '2' }],
    '18_2': [{ ...quote, handicap: '-2.5' }],
    '1_1': [{ ...quote, draw_od: '3.1' }],
  } },
});

test('normalizes actual sport IDs without merging same event numbers or prioritizing virtual play', () => {
  const basketball = normalizeFootballList({ results: [fixture('18'), fixture('1')] }, 'inplay', Date.now(), '18');
  assert.equal(basketball.length, 1);
  assert.equal(basketball[0].sport, 'basketball');
  assert.deepEqual(basketball[0].score, { home: 32, away: 29 });
  assert.equal(basketball[0].liveClock, null);
  const football = normalizeFootballList({ results: [fixture('1', '42', 'UEFA Nations League'), fixture('1', '99', 'Esoccer 6 min')] }, 'inplay');
  assert.equal(eventTier(basketball[0]), eventTier(football[0]));
  assert.equal(rankFeaturedFootball([...football, ...basketball]).length, 2);
  assert.equal(rankFeaturedFootball([...football, ...basketball], true).at(-1)?.eventId, '99');
});

test('retains market IDs and exact observations, rejects orientation and locks ambiguous handicaps', () => {
  const markets = marketsFromOddsPayload(odds('1'), '18');
  assert.deepEqual(markets.map((market) => [market.externalMarketId, market.key, market.line, market.status]), [
    ['18_1', 'moneyline', null, 'open'], ['18_3', 'over_under', '205.5', 'open'],
    ['18_2', 'asian_handicap', '-2.5', 'closed'],
  ]);
  assert.deepEqual(marketsFromOddsPayload(odds('2'), '18'), []);
  const inconsistent = odds('1');
  inconsistent.results.odds['18_1'].push({ ...quote, away_od: '3' });
  assert.equal(marketsFromOddsPayload(inconsistent, '18')[0].availability, 'suspended');
});

test('only configured additional sport details are requested, with exact fixture identity', async () => {
  const paths: string[] = [];
  const client = new BetsApiReadOnlyClient({
    env: { BETSAPI_KEY: 'test-token', BETSAPI_MULTISPORT_SPORT_IDS: '18' },
    minGapMs: 0,
    sleep: async () => undefined,
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      paths.push(url.pathname);
      return Response.json({ success: 1, results: [fixture('13')] });
    },
  });
  const denied = await handleFootballFeedRequest({ url: '/?eventId=betsapi:13:42' }, client);
  assert.equal(denied.status, 404);
  assert.deepEqual(paths, []);
  const mismatched = await handleFootballFeedRequest({ url: '/?eventId=betsapi:18:42' }, client);
  assert.deepEqual(mismatched.body.events, []);
  assert.deepEqual(paths, ['/v1/event/view']);
});
