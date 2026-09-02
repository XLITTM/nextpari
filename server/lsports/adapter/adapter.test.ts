import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LsportsInPlayStore } from '../state/store.js';
import { adaptLsportsStore } from './adapt.js';
import { isLsportsDisplayFeedEnabled } from './config.js';
import { adaptLsportsEvent, mapConfirmedPeriod } from './event.js';
import { publishLsportsSnapshot } from './publish.js';
import { formatClockSeconds } from './read.js';
import {
  LSPORTS_DISPLAY_TAG,
  NEXTPARI_1X2_MARKET_KEY,
  type AdaptedBetsEvent,
  type AdaptedMarket,
  type AdaptedOutcome,
  type LsportsAdaptedMatch,
} from './types.js';

const FIXTURE_A = 19981248;
const FIXTURE_B = 20000088;
const HOME_BET = 117469638719981250;
const DRAW_BET = 212242794219981250;
const AWAY_BET = 155418696819981250;
const FAKE_1X2 = { home: 2.1, draw: 3.25, away: 2.8 };

function snapshotFixtures(fixtureId = FIXTURE_A, sportId = 6046) {
  return {
    Header: { Type: 36, ServerTimestamp: 1000 },
    Body: [{
      FixtureId: fixtureId,
      Fixture: {
        Sport: { Id: sportId, Name: 'Football' },
        Location: { Id: 248, Name: 'England' },
        League: { Id: 7, Name: 'Premier League' },
        StartDate: '2026-09-01T22:00:00Z',
        Status: 2,
        Participants: [
          { Id: 101, Name: 'Home FC', Position: '1' },
          { Id: 202, Name: 'Away FC', Position: '2' },
        ],
      },
    }],
  };
}

function type2(fixtureId = FIXTURE_A, home = '1', away = '2', seconds = 3120, period = 20) {
  return {
    Header: { Type: 2, ServerTimestamp: 2000 },
    Body: {
      Events: [{
        FixtureId: fixtureId,
        Fixture: {
          Sport: { Id: 6046, Name: 'Football' },
          Participants: [
            { Id: 101, Name: 'Home FC', Position: '1' },
            { Id: 202, Name: 'Away FC', Position: '2' },
          ],
        },
        Livescore: {
          Scoreboard: {
            Status: 2,
            CurrentPeriod: period,
            Results: [
              { Position: '1', Value: home },
              { Position: '2', Value: away },
            ],
            Clock: { Seconds: seconds },
          },
        },
      }],
    },
  };
}

function type3(
  fixtureId: number,
  priceHome: string,
  extraMarket = false,
  lastUpdate = '2026-09-01T22:51:11Z',
  betStatus = 1,
) {
  const markets: unknown[] = [{
    Id: 1,
    Name: '1X2',
    Status: 1,
    Bets: [
      { Id: HOME_BET, Name: '1', Price: priceHome, Status: betStatus, BetStatusId: betStatus, LastUpdate: lastUpdate },
      { Id: DRAW_BET, Name: 'X', Price: '3.40', Status: 1, BetStatusId: 1, LastUpdate: lastUpdate },
      { Id: AWAY_BET, Name: '2', Price: '4.20', Status: 1, BetStatusId: 1, LastUpdate: lastUpdate },
    ],
  }];
  if (extraMarket) {
    markets.push({
      Id: 59,
      Name: 'Next Goal',
      Status: 1,
      Bets: [
        { Id: 46928646919981250, Name: '1', Line: '3.0', Price: '18.25', Status: 1, LastUpdate: lastUpdate },
      ],
    });
  }
  return {
    Header: { Type: 3, ServerTimestamp: 3000 },
    Body: { Events: [{ FixtureId: fixtureId, Markets: markets }] },
  };
}

function seededStore(extraMarket = true): LsportsInPlayStore {
  const store = new LsportsInPlayStore();
  store.ingestFixturesSnapshot(snapshotFixtures());
  store.ingestRmq(type2());
  store.ingestRmq(type3(FIXTURE_A, '1.85', extraMarket));
  return store;
}

function mainOdds(markets: AdaptedMarket[]): { '1': number; x: number; '2': number } {
  const outcomes = markets.find((market) => market.key === NEXTPARI_1X2_MARKET_KEY)?.entries[0]?.outcomes ?? [];
  const pick = (key: string) => outcomes.find((row) => row.key === key)?.odds ?? 0;
  return { '1': pick('home'), x: pick('draw'), '2': pick('away') };
}

function projectLsportsCard(match: LsportsAdaptedMatch) {
  const raw = mainOdds(match.markets);
  const markets = {
    '1': raw['1'] > 1 ? raw['1'] : 0,
    x: raw.x > 1 ? raw.x : 0,
    '2': raw['2'] > 1 ? raw['2'] : 0,
  };
  const marketsLocked = !(markets['1'] > 1 && markets.x > 1 && markets['2'] > 1);
  const buttons = [
    { key: 'П1', odds: marketsLocked && markets['1'] <= 1 ? 0 : markets['1'], locked: marketsLocked && markets['1'] <= 1 },
    { key: 'X', odds: marketsLocked && markets.x <= 1 ? 0 : markets.x, locked: marketsLocked && markets.x <= 1 },
    { key: 'П2', odds: marketsLocked && markets['2'] <= 1 ? 0 : markets['2'], locked: marketsLocked && markets['2'] <= 1 },
  ];
  return { markets, marketsLocked, buttons };
}

function isFakeDefault(odds: { '1': number; x: number; '2': number }): boolean {
  return odds['1'] === FAKE_1X2.home && odds.x === FAKE_1X2.draw && odds['2'] === FAKE_1X2.away;
}

describe('lsports display adapter', () => {
  it('maps FixtureId, participants, score, clock, and 1X2 names', () => {
    const store = seededStore();
    const { matches, diagnostics } = adaptLsportsStore(store);
    assert.equal(matches.length, 1);
    const [row] = matches;
    assert.ok(row);
    assert.equal(row.event.id, '19981248');
    assert.equal(row.event.sport_id, '1');
    assert.equal(row.event.home.name, 'Home FC');
    assert.equal(row.event.home.id, '101');
    assert.equal(row.event.away.name, 'Away FC');
    assert.equal(row.event.away.id, '202');
    assert.equal(row.event.ss, '1-2');
    assert.equal(row.event.time_str, '52:00');
    assert.equal(row.event.period, '2');
    assert.equal(row.event.league.name, 'Premier League');
    assert.equal(row.event.league.id, '7');
    assert.equal(row.event.league.cc, 'England');
    assert.equal(row.event.time_status, '1');
    assert.equal(row.event.our_events, LSPORTS_DISPLAY_TAG);
    const market = row.markets.find((item) => item.key === NEXTPARI_1X2_MARKET_KEY);
    assert.ok(market);
    const keys = market.entries[0]?.outcomes.map((outcome) => outcome.key);
    assert.deepEqual(keys, ['home', 'draw', 'away']);
    assert.equal(market.entries[0]?.outcomes.find((outcome) => outcome.key === 'home')?.odds, 1.85);
    assert.equal(market.entries[0]?.outcomes.find((outcome) => outcome.key === 'home')?.providerBetId, String(HOME_BET));
    assert.equal(diagnostics.unsupportedMarkets.some((item) => item.marketId === '59'), true);
    assert.equal(formatClockSeconds(3120), '52:00');
    assert.equal(mapConfirmedPeriod(10), '1');
    assert.equal(mapConfirmedPeriod(20), '2');
    assert.equal(mapConfirmedPeriod(30), undefined);
  });

  it('preserves exact LSports Bet.Id and decimal prices', () => {
    const store = seededStore(false);
    const { matches } = adaptLsportsStore(store);
    const outcomes = matches[0]?.markets[0]?.entries[0]?.outcomes ?? [];
    const byKey = Object.fromEntries(outcomes.map((row) => [row.key, row]));
    assert.equal(byKey.home?.providerBetId, '117469638719981250');
    assert.equal(byKey.draw?.providerBetId, '212242794219981250');
    assert.equal(byKey.away?.providerBetId, '155418696819981250');
    assert.equal(byKey.draw?.odds, 3.4);
    assert.equal(byKey.away?.raw, '4.20');
  });

  it('omits a suspended outcome so it is not selectable', () => {
    const store = new LsportsInPlayStore();
    store.ingestFixturesSnapshot(snapshotFixtures());
    store.ingestRmq(type2());
    store.ingestRmq(type3(FIXTURE_A, '1.85', false, '2026-09-01T22:51:11Z', 2));
    const { matches, diagnostics } = adaptLsportsStore(store);
    const outcomes = matches[0]?.markets[0]?.entries[0]?.outcomes ?? [];
    assert.equal(outcomes.some((row) => row.key === 'home'), false);
    assert.equal(outcomes.some((row) => row.key === 'draw'), true);
    assert.equal(diagnostics.suspendedOutcomeCount >= 1, true);
    const card = projectLsportsCard(matches[0]!);
    assert.equal(card.markets['1'] > 1, false);
    assert.equal(card.buttons[0]?.locked, true);
    assert.equal(card.buttons[0]?.odds, 0);
  });

  it('never injects fake 2.10/3.25/2.80 when 1X2 is missing', () => {
    const store = new LsportsInPlayStore();
    store.ingestFixturesSnapshot(snapshotFixtures());
    store.ingestRmq(type2());
    const { matches, diagnostics } = adaptLsportsStore(store);
    assert.equal(matches[0]?.markets.length, 0);
    assert.deepEqual(diagnostics.fixturesMissing1x2, ['19981248']);
    const card = projectLsportsCard(matches[0]!);
    assert.equal(isFakeDefault(card.markets), false);
    assert.deepEqual(card.markets, { '1': 0, x: 0, '2': 0 });
    assert.equal(card.marketsLocked, true);
    assert.ok(card.buttons.every((row) => row.locked && row.odds === 0));
    assert.equal(JSON.stringify(matches).includes('2.1'), false);
    assert.equal(JSON.stringify(matches).includes('3.25'), false);
    assert.equal(JSON.stringify(matches).includes('2.8'), false);
  });

  it('skips unsupported markets and non-football fixtures', () => {
    const store = seededStore(true);
    store.ingestFixturesSnapshot(snapshotFixtures(FIXTURE_B, 48242));
    store.ingestRmq({
      Header: { Type: 2, ServerTimestamp: 2001 },
      Body: {
        Events: [{
          FixtureId: FIXTURE_B,
          Fixture: {
            Sport: { Id: 48242, Name: 'Basketball' },
            Participants: [
              { Id: 1, Name: 'A', Position: '1' },
              { Id: 2, Name: 'B', Position: '2' },
            ],
          },
          Livescore: { Scoreboard: { Results: [{ Position: '1', Value: '10' }, { Position: '2', Value: '8' }] } },
        }],
      },
    });
    const { matches, diagnostics } = adaptLsportsStore(store);
    assert.equal(matches.every((row) => row.event.sport_id === '1'), true);
    assert.equal(matches.some((row) => row.event.id === String(FIXTURE_B)), false);
    assert.equal(diagnostics.skippedReasons.not_football, 1);
    assert.equal(diagnostics.unsupportedMarkets[0]?.marketId, '59');
    assert.equal(diagnostics.unsupportedMarkets[0]?.name, 'Next Goal');
  });

  it('does not remove unrelated fixtures when a Type 3 update is republished', () => {
    const store = seededStore(false);
    store.ingestFixturesSnapshot(snapshotFixtures(FIXTURE_B));
    store.ingestRmq(type2(FIXTURE_B, '0', '0', 120, 10));
    store.ingestRmq(type3(FIXTURE_B, '2.05', false, '2026-09-01T22:51:12Z'));

    const live = new Map<string, LsportsAdaptedMatch>();
    const sink = {
      applyInplay(events: AdaptedBetsEvent[], marketsById: Record<string, AdaptedMarket[]>) {
        live.clear();
        for (const event of events) {
          live.set(event.id, { event, markets: marketsById[event.id] ?? [] });
        }
      },
    };
    publishLsportsSnapshot(store, sink);
    assert.equal(live.size, 2);
    store.ingestRmq(type3(FIXTURE_A, '1.90', false, '2026-09-01T22:52:00Z'));
    publishLsportsSnapshot(store, sink);
    assert.equal(live.has(String(FIXTURE_A)), true);
    assert.equal(live.has(String(FIXTURE_B)), true);
    const homeOf = (id: string) => live.get(id)?.markets[0]?.entries[0]?.outcomes.find((row: AdaptedOutcome) => row.key === 'home')?.odds;
    assert.equal(homeOf(String(FIXTURE_A)), 1.9);
    assert.equal(homeOf(String(FIXTURE_B)), 2.05);
  });

  it('keeps the existing sports UI contract compile-compatible', () => {
    const store = seededStore(false);
    const { matches } = adaptLsportsStore(store);
    const match = matches[0];
    assert.ok(match);
    assert.equal(typeof match.event.id, 'string');
    assert.equal(typeof match.event.time_status, 'string');
    assert.equal(typeof match.event.start_time, 'string');
    assert.equal(typeof match.event.home.name, 'string');
    assert.equal(match.markets[0]?.key, '1_1');
    assert.equal(match.markets[0]?.marketId, '1');
    assert.ok(match.markets[0]?.entries[0]?.outcomes.every((row) => typeof row.odds === 'number' && row.odds > 1));
    const fixture = store.getFixture(FIXTURE_A);
    assert.ok(fixture);
    assert.equal(adaptLsportsEvent(fixture)?.id, match.event.id);
  });

  it('reads the explicit display-feed flag and ignores other values', () => {
    assert.equal(isLsportsDisplayFeedEnabled({}), false);
    assert.equal(isLsportsDisplayFeedEnabled({ LSPORTS_DISPLAY_FEED: '1' }), true);
    assert.equal(isLsportsDisplayFeedEnabled({ LSPORTS_DISPLAY_FEED: 'true' }), false);
    assert.equal(JSON.stringify(adaptLsportsStore(seededStore(false)).diagnostics).includes('shared-secret'), false);
  });
});
