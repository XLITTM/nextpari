import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bet365Groups } from '../../src/lib/bet365View.js';
import { betsapiDetailLines, betsapiDetailTabs } from '../../src/lib/footballFeed.js';
import type { MatchEvent } from '../../src/types.js';
import { BetsApiReadOnlyClient } from './client.js';
import { handleFootballFeedRequest } from './footballFeedHttp.js';
import {
  bet365Directory,
  findBet365Link,
  linkFromBet365ListRow,
  normalizeBet365Live,
  normalizeBet365Prematch,
} from './bet365Markets.js';

const NOW = Date.parse('2026-11-12T11:46:40.000Z');

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'X-RateLimit-Limit': '1800',
      'X-RateLimit-Remaining': '1750',
      'X-RateLimit-Reset': '1794488400',
    },
  });
}

describe('bet365 market normalization', () => {
  it('prices documented prematch markets and skips a category that has no selections', () => {
    const parsed = normalizeBet365Prematch({
      success: 1,
      results: [{
        FI: '204466718',
        event_id: '13445267',
        main: {
          updated_at: '1762948000',
          sp: {
            full_time_result: {
              id: '40',
              name: 'Full Time Result',
              odds: [
                { id: '440351714', odds: '2.10', name: '1' },
                { id: '440351715', odds: '3.40', name: 'Draw' },
                { id: '440351716', odds: '3.20', name: '2' },
              ],
            },
            double_chance: { id: '10114', name: 'Double Chance', odds: [] },
            both_teams_to_score: {
              id: '10115',
              name: 'Both Teams to Score',
              odds: [
                { id: '440351801', odds: '1.72', name: 'Yes' },
                { id: '440351802', odds: '2.05', name: 'No' },
              ],
            },
            goals_over_under: {
              id: '981',
              name: 'Goals Over/Under',
              odds: [
                { id: '440351717', odds: '1.90', name: 'Over', handicap: '2.5' },
                { id: '440351718', odds: '1.90', name: 'Under', handicap: '2.5' },
              ],
            },
            correct_score: {
              id: '43',
              name: 'Correct Score',
              odds: [
                { id: '440403684', odds: '9.00', name: '3-2' },
                { id: '440403704', odds: '15.00', name: '6-3' },
              ],
            },
          },
        },
        half: {
          sp: {
            half_time_result: {
              id: '41',
              name: 'Half Time Result',
              odds: [
                { id: '440360101', odds: '2.40', name: '1' },
                { id: '440360102', odds: '2.20', name: 'Draw' },
                { id: '440360103', odds: '3.10', name: '2' },
              ],
            },
          },
        },
        asian_lines: {
          updated_at: '1762948000',
          sp: {
            asian_handicap: {
              id: '938',
              name: 'Asian Handicap',
              odds: [
                { id: '440351739', odds: '1.90', name: 'Home', handicap: '+0.5' },
                { id: '440351748', odds: '1.90', name: 'Away', handicap: '-0.5' },
              ],
            },
            goal_line: {
              id: '10143',
              name: 'Goal Line',
              odds: [
                { id: '440351751', odds: '1.85', name: 'Over', handicap: '2.5,3.0' },
                { id: '440351756', odds: '1.95', name: 'Under', handicap: '2.5,3.0' },
              ],
            },
          },
        },
        others: [{
          id: '10544',
          name: 'Draw No Bet',
          odds: [
            { id: '440404059', odds: '1.36', name: '1' },
            { id: '440404065', odds: '3.10', name: '2' },
          ],
        }],
      }],
    }, NOW);
    assert.equal(parsed?.fi, '204466718');
    assert.equal(parsed?.eventsId, '13445267');
    assert.equal(parsed?.markets.some((market) => market.family === 'double_chance'), false);
    const result = parsed?.markets.find((market) => market.marketId === '40');
    assert.equal(result?.russianName, 'Исход');
    assert.deepEqual(result?.selections.map((item) => item.selectionId), ['440351714', '440351715', '440351716']);
    assert.equal(result?.selections[0]?.price, 2.1);
    const total = parsed?.markets.find((market) => market.marketId === '981');
    assert.equal(total?.line, '2.5');
    assert.equal(total?.russianName, 'Тотал 2.5');
    const handicaps = parsed?.markets.filter((market) => market.marketId === '938') ?? [];
    assert.deepEqual(handicaps.map((market) => market.line), ['+0.5', '-0.5']);
    assert.equal(parsed?.markets.find((market) => market.marketId === '43')?.family, 'correct_score');
    assert.equal(parsed?.markets.find((market) => market.marketId === '10544')?.russianName, 'Победа без ничьей');
    assert.equal(parsed?.markets.find((market) => market.family === 'btts')?.russianName, 'Обе забьют');
    assert.equal(parsed?.markets.find((market) => market.marketId === '41')?.russianName, 'Победа в 1-м тайме');
  });

  it('keeps live selection ids and does not price an empty market node', () => {
    const parsed = normalizeBet365Live({
      success: 1,
      results: [[
        { type: 'EV', FI: '204343051', TU: '20261112114635' },
        { type: 'MG', ID: '1778', NA: '5th Goal' },
        { type: 'PA', ID: '445629075', NA: 'ASC Center FC', OD: '6/4' },
        { type: 'PA', ID: '445629080', NA: 'No 5th Goal', OD: '2/1', SU: '1' },
        { type: 'MG', ID: '12', NA: 'Asian Handicap' },
        { type: 'MG', ID: '10562', NA: 'Goals Odd/Even' },
        { type: 'PA', ID: '423077611', NA: 'Odd', OD: '1.90' },
        { type: 'PA', ID: '423077614', NA: 'Even', OD: '1.90' },
      ]],
    }, NOW);
    assert.equal(parsed?.fi, '204343051');
    assert.equal(parsed?.eventsId, null);
    assert.equal(parsed?.stale, false);
    const goal = parsed?.markets.find((market) => market.marketId === '1778');
    assert.equal(goal?.russianName, '5-й гол');
    assert.equal(goal?.selections[0]?.price, 2.5);
    assert.equal(goal?.selections[1]?.suspended, true);
    assert.equal(goal?.selections[1]?.price, null);
    assert.equal(parsed?.markets.some((market) => market.marketId === '12'), false);
    assert.equal(parsed?.markets.find((market) => market.marketId === '10562')?.russianName, 'Тотал чет/нечет');
  });

  it('marks a live payload stale when its timestamp is older than the freshness window', () => {
    const parsed = normalizeBet365Live({
      success: 1,
      results: [[{ type: 'EV', FI: '204343051', TU: '20261112114000' }, { type: 'MG', ID: '40', NA: 'Full Time Result' }, { type: 'PA', ID: '1', NA: '1', OD: '1.80' }]],
    }, NOW);
    assert.equal(parsed?.stale, true);
  });

  it('links only numeric Bet365 FI and Events ids from the same row', () => {
    const links = bet365Directory({
      success: 1,
      results: [
        { id: '204343051', our_event_id: '13441666', home: { name: 'A' }, away: { name: 'B' } },
        { id: '204454071', our_event_id: '0', home: { name: 'A' }, away: { name: 'B' } },
        { home: { name: 'A' }, away: { name: 'B' } },
        { id: '204347831', our_event_id: '13438030' },
      ],
    }, 'live');
    assert.deepEqual(links.map((link) => [link.fi, link.eventsId]), [
      ['204343051', '13441666'],
      ['204347831', '13438030'],
    ]);
    assert.equal(linkFromBet365ListRow({ home: { name: 'Same' }, away: { name: 'Teams' } }, 'prematch'), null);
    assert.equal(findBet365Link(links, '13441666', 'prematch'), null);
    assert.equal(findBet365Link(links, '13441666', 'live')?.fi, '204343051');
  });
});

describe('bet365 expanded read', () => {
  it('uses the explicit directory link and rejects a detail whose Events id does not match', async () => {
    const urls: string[] = [];
    const client = new BetsApiReadOnlyClient({
      env: { BETSAPI_TOKEN: 'unit-test-token' },
      minGapMs: 0,
      now: () => NOW,
      sleep: async () => undefined,
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        urls.push(url.pathname);
        assert.equal(url.searchParams.get('token'), 'unit-test-token');
        if (url.pathname === '/v1/bet365/upcoming') {
          return response({ success: 1, results: [{ id: '204466718', our_event_id: '13445267', home: { name: 'A' }, away: { name: 'B' } }] });
        }
        return response({ success: 1, results: [{ FI: '204466718', event_id: '999', main: { sp: { full_time_result: { id: '40', name: 'Full Time Result', odds: [{ id: '1', odds: '1.5', name: '1' }] } } } }] });
      },
    });
    const read = await client.readBet365Expanded('13445267', false);
    assert.equal(read.mapped, true);
    assert.equal(read.markets, null);
    assert.deepEqual(urls, ['/v1/bet365/upcoming', '/v4/bet365/prematch']);
  });

  it('does not call a detail endpoint when the directory has no matching Events id', async () => {
    const paths: string[] = [];
    const client = new BetsApiReadOnlyClient({
      env: { BETSAPI_TOKEN: 'unit-test-token' },
      minGapMs: 0,
      now: () => NOW,
      sleep: async () => undefined,
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        paths.push(url.pathname);
        return response({ success: 1, results: [{ id: '204343051', our_event_id: '13441666' }] });
      },
    });
    const read = await client.readBet365Expanded('13445267', true);
    assert.equal(read.mapped, false);
    assert.deepEqual(paths, ['/v1/bet365/inplay_filter']);
  });

  it('keeps the Events list path free of Bet365 requests', async () => {
    const paths: string[] = [];
    const client = new BetsApiReadOnlyClient({
      env: { BETSAPI_TOKEN: 'unit-test-token' },
      minGapMs: 0,
      now: () => NOW,
      sleep: async () => undefined,
      fetchImpl: async (input) => {
        paths.push(new URL(String(input)).pathname);
        return response({ success: 1, results: [] });
      },
    });
    const list = await handleFootballFeedRequest({ method: 'GET', url: '/api/player/sports/football-feed' }, client, client);
    assert.equal(list.body.ok, true);
    assert.equal(paths.some((path) => path.includes('bet365')), false);
    const expanded = await handleFootballFeedRequest({ method: 'GET', url: '/api/player/sports/football-feed?bet365For=13441666&live=1' }, client, client);
    assert.equal(expanded.body.mapped, false);
    assert.deepEqual(expanded.body.markets, []);
    assert.equal(paths.includes('/v1/bet365/inplay_filter'), true);
  });
});

describe('bet365 website lines', () => {
  it('shows priced families, separate handicap lines, and a locked selection', () => {
    const match: MatchEvent = {
      id: '13445267',
      sport: 'football',
      league: 'League',
      country: 'GB',
      team1: 'Home',
      team2: 'Away',
      team1Color: '#000',
      team2Color: '#111',
      startTime: NOW,
      isLive: false,
      markets: { '1': 1.8, x: 3.4, '2': 4.2 },
      extraMarkets: 0,
      feedTag: 'betsapi',
      priceState: 'open',
    };
    const groups = bet365Groups([
      {
        marketId: '40',
        name: 'Full Time Result',
        russianName: 'Исход',
        family: 'full_time_result',
        period: 'full_time',
        line: null,
        bookmakerId: 'bet365',
        updatedAt: '1762948000',
        locked: false,
        selections: [
          { selectionId: '440351714', name: '1', price: 2.1, line: null, suspended: false },
          { selectionId: '440351715', name: 'Draw', price: 3.4, line: null, suspended: false },
          { selectionId: '440351716', name: '2', price: 3.2, line: null, suspended: false },
        ],
      },
      {
        marketId: '981',
        name: 'Goals Over/Under',
        russianName: 'Тотал 2.5',
        family: 'goal_totals',
        period: 'full_time',
        line: '2.5',
        bookmakerId: 'bet365',
        updatedAt: '1762948000',
        locked: false,
        selections: [
          { selectionId: '440351717', name: 'Over', price: 1.9, line: '2.5', suspended: false },
          { selectionId: '440351718', name: 'Under', price: 1.9, line: '2.5', suspended: false },
        ],
      },
      {
        marketId: '938',
        name: 'Asian Handicap',
        russianName: 'Фора +0.5',
        family: 'asian_handicap',
        period: 'full_time',
        line: '+0.5',
        bookmakerId: 'bet365',
        updatedAt: '1762948000',
        locked: false,
        selections: [{ selectionId: '440351739', name: 'Home', price: 1.9, line: '+0.5', suspended: false }],
      },
      {
        marketId: '43',
        name: 'Correct Score',
        russianName: 'Точный счёт',
        family: 'correct_score',
        period: 'full_time',
        line: null,
        bookmakerId: 'bet365',
        updatedAt: '1762948000',
        locked: false,
        selections: [{ selectionId: '440403684', name: '3-2', price: 9, line: null, suspended: false }],
      },
      {
        marketId: '10114',
        name: 'Double Chance',
        russianName: 'Двойной шанс',
        family: 'double_chance',
        period: 'full_time',
        line: null,
        bookmakerId: 'bet365',
        updatedAt: null,
        locked: true,
        selections: [{ selectionId: '440360001', name: '1X', price: null, line: null, suspended: true }],
      },
    ], match);
    const lines = betsapiDetailLines({ ...match, marketGroups: groups, extraMarkets: groups.length });
    assert.equal(lines.some((line) => line.title === 'Двойной шанс' && line.outcomes.every((item) => item.locked)), true);
    const total = lines.find((line) => line.title === 'Тотал 2.5');
    assert.equal(total?.tab, 'totals');
    assert.equal(total?.outcomes[0]?.selection?.sourceSelectionId, '440351717');
    assert.equal(total?.outcomes[0]?.selection?.bookmakerId, 'bet365');
    assert.equal(lines.find((line) => line.title === 'Фора +0.5')?.tab, 'handicaps');
    assert.equal(lines.find((line) => line.title === 'Точный счёт')?.tab, 'other');
    const tabs = betsapiDetailTabs(lines);
    assert.deepEqual(tabs.map((tab) => tab.label), ['Все', '1X2', 'Тоталы', 'Форы', 'Другие']);
  });
});
