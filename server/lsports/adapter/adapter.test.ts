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
    const nextGoal = row.markets.find((item) => item.marketId === '59');
    assert.ok(nextGoal);
    assert.equal(nextGoal.name, 'Next Goal');
    assert.equal(nextGoal.entries[0]?.outcomes[0]?.providerBetId, '46928646919981250');
    assert.equal(diagnostics.unsupportedMarkets.some((item) => item.marketId === '59'), false);
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
    assert.equal(diagnostics.market1Adapter.seen, 0);
    const card = projectLsportsCard(matches[0]!);
    assert.equal(isFakeDefault(card.markets), false);
    assert.deepEqual(card.markets, { '1': 0, x: 0, '2': 0 });
    assert.equal(card.marketsLocked, true);
    assert.ok(card.buttons.every((row) => row.locked && row.odds === 0));
    assert.equal(JSON.stringify(matches).includes('2.1'), false);
    assert.equal(JSON.stringify(matches).includes('3.25'), false);
    assert.equal(JSON.stringify(matches).includes('2.8'), false);
  });

  it('re-adapts open 1X2 after Type 35 settlement is cleared by a later Type 3', () => {
    const store = new LsportsInPlayStore();
    store.ingestFixturesSnapshot(snapshotFixtures());
    store.ingestRmq(type2());
    store.ingestRmq(type3(FIXTURE_A, '1.85'));
    store.ingestRmq({
      Header: { Type: 35, ServerTimestamp: 4000, MsgGuid: 'settle' },
      Body: {
        Events: [{
          FixtureId: FIXTURE_A,
          Markets: [{
            Id: 1,
            Name: '1X2',
            Status: 3,
            Bets: [
              { Id: HOME_BET, Name: '1', Status: 3, BetStatusId: 3, Settlement: 1, LastUpdate: '2026-09-01T22:53:45Z' },
              { Id: DRAW_BET, Name: 'X', Status: 3, BetStatusId: 3, Settlement: 2, LastUpdate: '2026-09-01T22:53:45Z' },
              { Id: AWAY_BET, Name: '2', Status: 3, BetStatusId: 3, Settlement: 3, LastUpdate: '2026-09-01T22:53:45Z' },
            ],
          }],
        }],
      },
    });
    assert.equal(adaptLsportsStore(store).diagnostics.adaptedMarketCount, 0);
    store.ingestRmq(type3(FIXTURE_A, '1.91', false, '2026-09-01T22:56:00Z'));
    const { matches, diagnostics } = adaptLsportsStore(store);
    assert.equal(diagnostics.adaptedMarketCount, 1);
    assert.equal(diagnostics.market1Adapter.adapted, 1);
    assert.equal(diagnostics.market1Adapter.openSelectableOutcomes, 3);
    assert.equal(mainOdds(matches[0]?.markets ?? [])['1'], 1.91);
    assert.equal(isFakeDefault(mainOdds(matches[0]?.markets ?? [])), false);
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
    const nextGoal = matches.find((row) => row.event.id === String(FIXTURE_A))
      ?.markets.find((market) => market.marketId === '59');
    assert.ok(nextGoal);
    assert.equal(nextGoal.name, 'Next Goal');
    assert.equal(diagnostics.unsupportedMarkets.some((item) => item.marketId === '59'), false);
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

const OVER_25 = '220000000000000001';
const UNDER_25 = '220000000000000002';
const OVER_35 = '220000000000000003';
const UNDER_35 = '220000000000000004';
const AH_HOME_05 = '330000000000000001';
const AH_AWAY_05 = '330000000000000002';
const AH_HOME_15 = '330000000000000003';
const AH_AWAY_15 = '330000000000000004';
const BTTS_YES = '170000000000000001';
const BTTS_NO = '170000000000000002';
const DC_1X = '457000000000000001';
const DC_12 = '457000000000000002';
const DC_X2 = '457000000000000003';
const BAD_PRICE_BET = '990000000000000001';
const UNKNOWN_BET = '880000000000000001';

function footballType3(markets: unknown[], fixtureId = FIXTURE_A) {
  return {
    Header: { Type: 3, ServerTimestamp: 3000 },
    Body: { Events: [{ FixtureId: fixtureId, Markets: markets }] },
  };
}

function open1x2Bets(priceHome = '1.85', lastUpdate = '2026-09-03T12:00:00Z') {
  return {
    Id: 1,
    Name: '1X2',
    Status: 1,
    Bets: [
      { Id: HOME_BET, Name: '1', Price: priceHome, Status: 1, BetStatusId: 1, LastUpdate: lastUpdate },
      { Id: DRAW_BET, Name: 'X', Price: '3.40', Status: 1, BetStatusId: 1, LastUpdate: lastUpdate },
      { Id: AWAY_BET, Name: '2', Price: '4.20', Status: 1, BetStatusId: 1, LastUpdate: lastUpdate },
    ],
  };
}

describe('lsports multi-market football adapter', () => {
  it('adapts 1X2, multi-line totals, multi-line handicap, BTTS, and double chance from observed names', () => {
    const store = new LsportsInPlayStore();
    store.ingestFixturesSnapshot(snapshotFixtures());
    store.ingestRmq(type2());
    store.ingestRmq(footballType3([
      open1x2Bets(),
      {
        Id: 2,
        Name: 'Under/Over',
        Status: 1,
        BaseLine: '2.5',
        Bets: [
          { Id: OVER_25, Name: 'Over', Line: '2.5', BaseLine: '2.5', Price: '1.90', Status: 1, LastUpdate: '2026-09-03T12:00:00Z' },
          { Id: UNDER_25, Name: 'Under', Line: '2.5', BaseLine: '2.5', Price: '1.95', Status: 1, LastUpdate: '2026-09-03T12:00:00Z' },
        ],
      },
      {
        Id: 2,
        Name: 'Under/Over',
        Status: 1,
        BaseLine: '3.5',
        Bets: [
          { Id: OVER_35, Name: 'Over', Line: '3.5', BaseLine: '3.5', Price: '2.20', Status: 1, LastUpdate: '2026-09-03T12:00:00Z' },
          { Id: UNDER_35, Name: 'Under', Line: '3.5', BaseLine: '3.5', Price: '1.70', Status: 1, LastUpdate: '2026-09-03T12:00:00Z' },
        ],
      },
      {
        Id: 1439,
        Name: 'Asian Handicap - Full Time',
        Status: 1,
        Line: '-0.5',
        Bets: [
          { Id: AH_HOME_05, Name: '1', Line: '-0.5', Price: '1.88', Status: 1, LastUpdate: '2026-09-03T12:00:00Z' },
          { Id: AH_AWAY_05, Name: '2', Line: '-0.5', Price: '1.98', Status: 1, LastUpdate: '2026-09-03T12:00:00Z' },
        ],
      },
      {
        Id: 1439,
        Name: 'Asian Handicap - Full Time',
        Status: 1,
        Line: '-1.5',
        Bets: [
          { Id: AH_HOME_15, Name: '1', Line: '-1.5', Price: '2.40', Status: 1, LastUpdate: '2026-09-03T12:00:00Z' },
          { Id: AH_AWAY_15, Name: '2', Line: '-1.5', Price: '1.55', Status: 1, LastUpdate: '2026-09-03T12:00:00Z' },
        ],
      },
      {
        Id: 1439,
        Name: 'Asian Handicap - Full Time',
        Status: 1,
        Line: '+0.5',
        Bets: [
          { Id: '330000000000000005', Name: '1', Line: '+0.5', Price: '1.62', Status: 1, LastUpdate: '2026-09-03T12:00:00Z' },
          { Id: '330000000000000006', Name: '2', Line: '+0.5', Price: '2.30', Status: 1, LastUpdate: '2026-09-03T12:00:00Z' },
        ],
      },
      {
        Id: 17,
        Name: 'Both Teams To Score',
        Status: 1,
        Bets: [
          { Id: BTTS_YES, Name: 'Yes', Price: '1.80', Status: 1, LastUpdate: '2026-09-03T12:00:00Z' },
          { Id: BTTS_NO, Name: 'No', Price: '2.05', Status: 1, LastUpdate: '2026-09-03T12:00:00Z' },
        ],
      },
      {
        Id: 457,
        Name: 'Double Chance 2nd Period',
        Status: 1,
        Bets: [
          { Id: DC_1X, Name: '1X', Price: '1.40', Status: 1, LastUpdate: '2026-09-03T12:00:00Z' },
          { Id: DC_12, Name: '12', Price: '1.30', Status: 1, LastUpdate: '2026-09-03T12:00:00Z' },
          { Id: DC_X2, Name: 'X2', Price: '1.60', Status: 1, LastUpdate: '2026-09-03T12:00:00Z' },
        ],
      },
    ]));
    const { matches } = adaptLsportsStore(store);
    const adapted = matches[0]?.markets ?? [];
    assert.equal(adapted.some((market) => market.key === NEXTPARI_1X2_MARKET_KEY), true);
    const totals = adapted.find((market) => market.marketId === '2');
    assert.ok(totals);
    assert.equal(totals.entries.length, 2);
    assert.deepEqual(totals.entries.map((entry) => entry.line).sort(), ['2.5', '3.5']);
    assert.equal(totals.entries.find((entry) => entry.line === '2.5')?.outcomes.find((row) => row.key === 'over')?.providerBetId, String(OVER_25));
    assert.equal(totals.entries.find((entry) => entry.line === '3.5')?.outcomes.find((row) => row.key === 'over')?.odds, 2.2);
    const handicap = adapted.find((market) => market.marketId === '1439');
    assert.ok(handicap);
    assert.equal(handicap.entries.length, 3);
    assert.equal(handicap.category, 'main');
    const minusHalf = handicap.entries.find((entry) => entry.line === '-0.5');
    const plusHalf = handicap.entries.find((entry) => entry.line === '+0.5');
    assert.equal(minusHalf?.canonicalKey, `${FIXTURE_A}:1439:-0.5`);
    assert.equal(plusHalf?.canonicalKey, `${FIXTURE_A}:1439:+0.5`);
    assert.equal(minusHalf?.outcomes.find((row) => row.key === 'home')?.providerBetId, String(AH_HOME_05));
    assert.equal(plusHalf?.outcomes.find((row) => row.key === 'home')?.providerBetId, '330000000000000005');
    assert.notEqual(minusHalf?.canonicalKey, plusHalf?.canonicalKey);
    const btts = adapted.find((market) => market.marketId === '17');
    assert.deepEqual(btts?.entries[0]?.outcomes.map((row) => row.key), ['yes', 'no']);
    const dc = adapted.find((market) => market.marketId === '457');
    assert.equal(dc?.category, 'half');
    assert.deepEqual(dc?.entries[0]?.outcomes.map((row) => row.key), ['1x', '12', 'x2']);
    assert.equal(JSON.stringify(adapted).includes('2.1'), false);
    assert.equal(JSON.stringify(adapted).includes('3.25'), false);
  });

  it('keeps 2.5 and 3.5 isolated when Type 3 replaces only one totals line', () => {
    const store = new LsportsInPlayStore();
    store.ingestFixturesSnapshot(snapshotFixtures());
    store.ingestRmq(type2());
    store.ingestRmq(footballType3([
      open1x2Bets('1.85'),
      {
        Id: 2,
        Name: 'Under/Over',
        Status: 1,
        BaseLine: '2.5',
        Bets: [
          { Id: OVER_25, Name: 'Over', Line: '2.5', BaseLine: '2.5', Price: '1.90', Status: 1 },
          { Id: UNDER_25, Name: 'Under', Line: '2.5', BaseLine: '2.5', Price: '1.95', Status: 1 },
        ],
      },
      {
        Id: 2,
        Name: 'Under/Over',
        Status: 1,
        BaseLine: '3.5',
        Bets: [
          { Id: OVER_35, Name: 'Over', Line: '3.5', BaseLine: '3.5', Price: '2.20', Status: 1 },
          { Id: UNDER_35, Name: 'Under', Line: '3.5', BaseLine: '3.5', Price: '1.70', Status: 1 },
        ],
      },
    ]));
    store.ingestRmq(footballType3([{
      Id: 2,
      Name: 'Under/Over',
      Status: 1,
      BaseLine: '2.5',
      Bets: [
        { Id: OVER_25, Name: 'Over', Line: '2.5', BaseLine: '2.5', Price: '1.72', Status: 1, LastUpdate: '2026-09-03T12:05:00Z' },
        { Id: UNDER_25, Name: 'Under', Line: '2.5', BaseLine: '2.5', Price: '2.10', Status: 1, LastUpdate: '2026-09-03T12:05:00Z' },
      ],
    }]));
    const { matches } = adaptLsportsStore(store);
    const totals = matches[0]?.markets.find((market) => market.marketId === '2');
    const line25 = totals?.entries.find((entry) => entry.line === '2.5');
    const line35 = totals?.entries.find((entry) => entry.line === '3.5');
    assert.equal(line25?.outcomes.find((row) => row.key === 'over')?.odds, 1.72);
    assert.equal(line35?.outcomes.find((row) => row.key === 'over')?.odds, 2.2);
    assert.equal(line25?.outcomes.find((row) => row.key === 'over')?.providerBetId, String(OVER_25));
    assert.equal(mainOdds(matches[0]?.markets ?? [])['1'], 1.85);
  });

  it('does not publish suspended or settled extra markets and never uses invalid Price', () => {
    const store = new LsportsInPlayStore();
    store.ingestFixturesSnapshot(snapshotFixtures());
    store.ingestRmq(type2());
    store.ingestRmq(footballType3([
      open1x2Bets(),
      {
        Id: 2,
        Name: 'Under/Over',
        Status: 2,
        BaseLine: '2.5',
        Bets: [
          { Id: OVER_25, Name: 'Over', Line: '2.5', Price: '1.90', Status: 1 },
          { Id: UNDER_25, Name: 'Under', Line: '2.5', Price: '1.95', Status: 1 },
        ],
      },
      {
        Id: 17,
        Name: 'Both Teams To Score',
        Status: 3,
        Bets: [
          { Id: BTTS_YES, Name: 'Yes', Price: '1.80', Status: 3, Settlement: 2 },
          { Id: BTTS_NO, Name: 'No', Price: '2.05', Status: 3, Settlement: 1 },
        ],
      },
      {
        Id: 59,
        Name: 'Next Goal',
        Status: 1,
        Bets: [
          { Id: BAD_PRICE_BET, Name: '1', Price: '1', Status: 1 },
        ],
      },
      {
        Id: 99999,
        Name: 'Unknown Widget',
        Status: 1,
        Bets: [
          { Id: UNKNOWN_BET, Name: 'Widget', Price: '1.55', Status: 1 },
        ],
      },
    ]));
    const { matches, diagnostics } = adaptLsportsStore(store);
    const adapted = matches[0]?.markets ?? [];
    assert.equal(adapted.some((market) => market.marketId === '2'), false);
    assert.equal(adapted.some((market) => market.marketId === '17'), false);
    assert.equal(adapted.some((market) => market.marketId === '59'), false);
    const unknown = adapted.find((market) => market.marketId === '99999');
    assert.ok(unknown);
    assert.equal(unknown.entries[0]?.outcomes[0]?.providerBetId, String(UNKNOWN_BET));
    assert.equal(unknown.entries[0]?.outcomes[0]?.odds, 1.55);
    assert.equal(mainOdds(adapted)['1'], 1.85);
    assert.equal(diagnostics.unsupportedMarkets.some((item) => item.marketId === '59'), true);
    assert.equal(JSON.stringify(adapted).includes('"odds":1}'), false);
  });

  it('omits a suspended extra-market Bet without dropping sibling outcomes', () => {
    const store = new LsportsInPlayStore();
    store.ingestFixturesSnapshot(snapshotFixtures());
    store.ingestRmq(type2());
    store.ingestRmq(footballType3([
      open1x2Bets(),
      {
        Id: 17,
        Name: 'Both Teams To Score',
        Status: 1,
        Bets: [
          { Id: BTTS_YES, Name: 'Yes', Price: '1.80', Status: 2, BetStatusId: 2 },
          { Id: BTTS_NO, Name: 'No', Price: '2.05', Status: 1, BetStatusId: 1 },
        ],
      },
    ]));
    const { matches } = adaptLsportsStore(store);
    const btts = matches[0]?.markets.find((market) => market.marketId === '17');
    assert.equal(btts?.entries[0]?.outcomes.some((row) => row.key === 'yes'), false);
    assert.equal(btts?.entries[0]?.outcomes.find((row) => row.key === 'no')?.odds, 2.05);
    assert.equal(btts?.entries[0]?.outcomes.find((row) => row.key === 'no')?.providerBetId, String(BTTS_NO));
  });

  it('splits a packed live Under/Over + opposite-line handicap object into distinct canonical keys', () => {
    const store = new LsportsInPlayStore();
    store.ingestFixturesSnapshot(snapshotFixtures());
    store.ingestRmq(type2());
    store.ingestRmq(footballType3([
      open1x2Bets(),
      {
        Id: 2,
        Name: 'Under/Over',
        Status: 1,
        MainLine: '2.5',
        BaseLine: null,
        Line: null,
        Bets: [
          { Id: OVER_25, Name: 'Over', Status: 1, Line: '2.5', BaseLine: '2.5', Price: '2.14' },
          { Id: UNDER_25, Name: 'Under', Status: 1, Line: '2.5', BaseLine: '2.5', Price: '1.675' },
          { Id: OVER_35, Name: 'Over', Status: 1, Line: '3.5', BaseLine: '3.5', Price: '4.08' },
          { Id: UNDER_35, Name: 'Under', Status: 1, Line: '3.5', BaseLine: '3.5', Price: '1.22' },
        ],
      },
      {
        Id: 1439,
        Name: 'Asian Handicap - Full Time',
        Status: 1,
        MainLine: '-1.0',
        BaseLine: null,
        Line: null,
        Bets: [
          { Id: AH_HOME_05, Name: '1', Status: 1, Line: '-1.0', BaseLine: '-1.0', Price: '1.97' },
          { Id: AH_AWAY_05, Name: '2', Status: 1, Line: '1.0', BaseLine: '-1.0', Price: '1.795' },
        ],
      },
    ]));
    const { matches } = adaptLsportsStore(store);
    const totals = matches[0]?.markets.find((market) => market.marketId === '2');
    assert.deepEqual(totals?.entries.map((entry) => entry.line).sort(), ['2.5', '3.5']);
    assert.equal(totals?.entries.find((entry) => entry.line === '2.5')?.canonicalKey, `${FIXTURE_A}:2:2.5`);
    assert.equal(totals?.entries.find((entry) => entry.line === '3.5')?.canonicalKey, `${FIXTURE_A}:2:3.5`);
    const handicap = matches[0]?.markets.find((market) => market.marketId === '1439');
    assert.equal(handicap?.entries.length, 1);
    assert.equal(handicap?.entries[0]?.line, '-1.0');
    assert.equal(handicap?.entries[0]?.canonicalKey, `${FIXTURE_A}:1439:-1.0`);
    assert.equal(handicap?.entries[0]?.outcomes.length, 2);
  });
});
