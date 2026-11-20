import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  betsapiDetailLines,
  betsapiDetailTabs,
  footballCardToMatch,
  homeMarketsLabel,
  resolveDetailsMatch,
} from './footballFeed.js';
import type { MatchEvent } from '../types.js';

function pricedCard() {
  return footballCardToMatch({
    id: '13450001',
    league: 'India Mumbai Super Division',
    country: 'IN',
    home: 'Soccerstar FC',
    away: 'Sports Gen',
    kickoff: null,
    live: true,
    score: { home: 1, away: 0 },
    priceState: 'open',
    markets: [
      {
        key: '1x2', name: '1X2', line: '', status: 'open', updatedAt: null,
        bookmakerId: '16', externalPeriodId: 'end', externalMarketId: '1_1',
        outcomes: [
          { key: 'home', name: 'Home', price: 1.8, sourceSelectionId: 'h1' },
          { key: 'draw', name: 'Draw', price: 3.4 },
          { key: 'away', name: 'Away', price: 4.2 },
        ],
      },
      ...['0.5', '1.5', '2.5', '3.5', '4.5', '5.5'].map((line) => ({
        key: 'over_under' as const, name: 'Over/Under', line, status: 'open' as const, updatedAt: null,
        bookmakerId: '16', externalPeriodId: 'end', externalMarketId: '1_3',
        outcomes: [
          { key: 'over', name: 'Over', price: 1.9 },
          { key: 'under', name: 'Under', price: 1.9 },
        ],
      })),
      ...['-0.5', '0', '+0.5', '+1'].map((line) => ({
        key: 'asian_handicap' as const, name: 'Asian Handicap', line, status: 'open' as const, updatedAt: null,
        bookmakerId: '16', externalPeriodId: 'end', externalMarketId: '1_2',
        outcomes: [
          { key: 'home', name: 'Home', price: 1.85 },
          { key: 'away', name: 'Away', price: 1.95 },
        ],
      })),
      {
        key: '1x2' as const, name: '1X2', line: '', status: 'suspended' as const, updatedAt: null,
        bookmakerId: null, externalPeriodId: null, externalMarketId: '1_1', outcomes: [],
      },
    ],
  });
}

function emptyStoreProjection(id: string): MatchEvent {
  return {
    id,
    sport: 'football',
    league: 'India Mumbai Super Division',
    country: 'IN',
    team1: 'Soccerstar FC',
    team2: 'Sports Gen',
    team1Color: '#000',
    team2Color: '#fff',
    startTime: 0,
    isLive: true,
    markets: { '1': 0, x: 0, '2': 0 },
    extraMarkets: 0,
    marketsLocked: true,
  };
}

describe('betsapi match details navigation', () => {
  it('keeps the priced BetsAPI match when the legacy store is empty', () => {
    const catalog = pricedCard();
    const opened = resolveDetailsMatch(catalog, emptyStoreProjection(catalog.id));
    assert.equal(opened?.id, '13450001');
    assert.equal(opened?.feedTag, 'betsapi');
    assert.equal(opened?.markets['1'], 1.8);
    const lines = betsapiDetailLines(opened!);
    assert.equal(lines.filter((line) => line.tab === 'main').length, 1);
    assert.equal(lines.filter((line) => line.tab === 'totals').length, 6);
    assert.equal(lines.filter((line) => line.tab === 'handicaps').length, 4);
    assert.deepEqual(betsapiDetailTabs(lines).map((tab) => tab.label), ['Все', '1X2', 'Тоталы', 'Форы']);
    assert.equal(lines.some((line) => line.title.includes('Основная игра') || line.title.includes('Угловые')), false);
    const total = lines.find((line) => line.title === 'Тотал 2.5');
    assert.equal(total?.outcomes[0]?.selection?.marketKey, 'over_under');
    assert.equal(total?.outcomes[0]?.selection?.line, '2.5');
    assert.equal(total?.outcomes[0]?.selection?.bookmakerId, '16');
    assert.equal(total?.outcomes[0]?.selection?.externalMarketId, '1_3');
    assert.equal(homeMarketsLabel(catalog), 'Все рынки · 10');
  });

  it('does not offer a selectable price for a suspended or missing market', () => {
    const suspended = footballCardToMatch({
      id: '2', league: 'L', country: 'IN', home: 'A', away: 'B', kickoff: null, live: false, score: null,
      priceState: 'suspended',
      markets: [{
        key: '1x2', name: '1X2', line: '', status: 'suspended', updatedAt: null,
        bookmakerId: '16', externalPeriodId: null, externalMarketId: '1_1', outcomes: [],
      }],
    });
    assert.equal(betsapiDetailLines(suspended).length, 0);
    assert.deepEqual(betsapiDetailTabs(betsapiDetailLines(suspended)), []);
    assert.equal(homeMarketsLabel(suspended), 'Коэффициенты приостановлены');
    assert.equal(resolveDetailsMatch(undefined, emptyStoreProjection('2'))?.feedTag, undefined);
  });
});
