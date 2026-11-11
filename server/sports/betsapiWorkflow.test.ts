import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { footballCardToMatch } from '../../src/lib/footballFeed.js';
import { BetsApiReadOnlyClient } from '../betsapi/client.js';
import { handleFootballFeedRequest } from '../betsapi/footballFeedHttp.js';
import {
  betsapiStakeAllowed,
  canPlaceBetsapiBet,
  isSportsbookEmergencyStop,
} from './betsapiActivation.js';
import { quoteFromFootballEvent } from './betsapiQuote.js';
import { gradeFootballOutcome, settlementNoticeForLeg } from './betsapiSettlement.js';
import { SPORTS_SETTLEMENT } from './settlement.js';
import type { NormalizedEvent } from '../betsapi/types.js';

const PLAYER = '11111111-1111-4111-8111-111111111111';

function event(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    eventId: '1001',
    sportId: '1',
    sport: 'football',
    league: { id: '8', name: 'Premier League', countryCode: 'GB' },
    home: { id: '1', name: 'Arsenal' },
    away: { id: '2', name: 'Chelsea' },
    kickoff: '2026-11-12T18:00:00.000Z',
    status: 'finished',
    timeStatus: '3',
    score: { home: 2, away: 1 },
    marketsKnown: true,
    markets: [{
      key: '1x2',
      name: '1X2',
      line: null,
      status: 'open',
      outcomes: [
        { key: 'home', name: 'Home', price: 1.8 },
        { key: 'draw', name: 'Draw', price: 3.4 },
        { key: 'away', name: 'Away', price: 4.5 },
      ],
      updatedAt: '2026-11-12T18:10:00.000Z',
    }],
    updatedAt: '2026-11-12T18:10:00.000Z',
    ...overrides,
  };
}

describe('betsapi real sportsbook gates', () => {
  it('stays stopped and unauthorized until the owner sets every control', () => {
    assert.equal(isSportsbookEmergencyStop({}), true);
    assert.equal(canPlaceBetsapiBet(PLAYER, {
      CANONICAL_SPORTS_BET_ENABLED: '1',
      BETSAPI_TOKEN: 'server-token',
      BETSAPI_SPORTSBOOK_QUOTE: '1',
      SPORTSBOOK_EMERGENCY_STOP: '0',
      SPORTSBOOK_AUTHORIZED_PLAYER_IDS: '',
    }), false);
    assert.equal(canPlaceBetsapiBet(PLAYER, {
      CANONICAL_SPORTS_BET_ENABLED: '1',
      BETSAPI_TOKEN: 'server-token',
      BETSAPI_SPORTSBOOK_QUOTE: '1',
      SPORTSBOOK_EMERGENCY_STOP: '0',
      SPORTSBOOK_AUTHORIZED_PLAYER_IDS: PLAYER,
    }), true);
    assert.equal(betsapiStakeAllowed(25, { SPORTSBOOK_MAX_STAKE: '20' }).ok, false);
    assert.equal(betsapiStakeAllowed(20, { SPORTSBOOK_MAX_STAKE: '20' }).ok, true);
    assert.equal(betsapiStakeAllowed(10, {}).ok, false);
  });

  it('quotes only an open server price and settles win, void, and quarter-line results', () => {
    const live = event({ status: 'live', timeStatus: '1', score: { home: 0, away: 0 } });
    const open = quoteFromFootballEvent(live, {
      provider: 'betsapi',
      fixtureId: '1001',
      marketId: '1_1',
      marketKey: '1x2',
      line: '',
      outcomeId: 'home',
    }, Date.parse('2026-11-12T18:10:05.000Z'), '2026-11-12T18:10:00.000Z', false);
    assert.equal(open.selectable, true);
    assert.equal(open.price, 1.8);
    assert.equal(open.health, 'HEALTHY');

    const suspended = quoteFromFootballEvent(event({
      markets: [{ ...event().markets[0], status: 'closed', outcomes: [] }],
    }), {
      fixtureId: '1001',
      marketKey: '1x2',
      line: '',
      outcomeId: 'home',
    }, Date.now(), null, false);
    assert.equal(suspended.selectable, false);
    assert.equal(suspended.price, null);

    assert.equal(gradeFootballOutcome({
      status: 'finished', timeStatus: '3', score: { home: 2, away: 1 }, marketKey: '1x2', line: '', outcomeId: 'home',
    }), SPORTS_SETTLEMENT.Won);
    assert.equal(gradeFootballOutcome({
      status: 'finished', timeStatus: '3', score: { home: 1, away: 1 }, marketKey: 'over_under', line: '2', outcomeId: 'over',
    }), SPORTS_SETTLEMENT.Refund);
    assert.equal(gradeFootballOutcome({
      status: 'finished', timeStatus: '3', score: { home: 1, away: 1 }, marketKey: 'asian_handicap', line: '-0.25', outcomeId: 'home',
    }), SPORTS_SETTLEMENT.HalfLost);
    assert.equal(gradeFootballOutcome({
      status: 'closed', timeStatus: '5', score: null, marketKey: '1x2', line: '', outcomeId: 'home',
    }), SPORTS_SETTLEMENT.Cancelled);
    assert.equal(gradeFootballOutcome({
      status: 'finished', timeStatus: '3', score: null, marketKey: '1x2', line: '', outcomeId: 'home',
    }), null);
    const notice = settlementNoticeForLeg(event(), { marketKey: '1x2', line: '', outcomeId: 'home' });
    assert.equal(notice?.settlement, SPORTS_SETTLEMENT.Won);
    assert.equal(notice?.fingerprint.length, 64);
  });

  it('serves football cards without the provider token', async () => {
    const client = new BetsApiReadOnlyClient({
      env: { BETSAPI_TOKEN: 'unit-test-token' },
      minGapMs: 0,
      fetchImpl: async () => new Response(JSON.stringify({
        success: 1,
        results: [{
          id: '1001',
          sport_id: '1',
          time_status: '1',
          time: 1_700_000_000,
          league: { name: 'Premier League', cc: 'gb' },
          home: { name: 'Arsenal' },
          away: { name: 'Chelsea' },
          ss: '1-0',
        }],
      }), { status: 200 }),
    });
    const result = await handleFootballFeedRequest({ method: 'GET', url: '/api/player/sports/football-feed' }, client);
    assert.equal(result.status, 200);
    assert.equal(JSON.stringify(result.body).includes('unit-test-token'), false);
    const events = result.body.events as Array<{ id: string; home: string; live: boolean }>;
    assert.equal(events[0].home, 'Arsenal');
    assert.equal(events[0].live, true);
    const match = footballCardToMatch({
      id: '1001',
      league: 'Premier League',
      country: 'GB',
      home: 'Arsenal',
      away: 'Chelsea',
      kickoff: '2026-11-12T18:00:00.000Z',
      live: true,
      score: { home: 1, away: 0 },
      markets: [{
        key: '1x2',
        name: '1X2',
        line: '',
        status: 'open',
        updatedAt: null,
        outcomes: [
          { key: 'home', name: 'Home', price: 1.7 },
          { key: 'draw', name: 'Draw', price: 3.6 },
          { key: 'away', name: 'Away', price: 5.1 },
        ],
      }],
    });
    assert.equal(match.feedTag, 'betsapi');
    assert.equal(match.markets['1'], 1.7);
    assert.equal(match.betsapiQuotes?.['П1']?.outcomeId, 'home');
    assert.equal(match.betsapiQuotes?.['П1']?.provider, 'betsapi');
  });
});
