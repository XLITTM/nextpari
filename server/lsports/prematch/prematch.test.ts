import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { adaptLsportsPrematchStore } from '../adapter/prematchAdapt.js';
import {
  LSPORTS_PREMATCH_DISPLAY_TAG,
  NEXTPARI_1X2_MARKET_KEY,
  NEXTPARI_HANDICAP_MARKET_KEY,
  NEXTPARI_TOTALS_MARKET_KEY,
} from '../adapter/types.js';
import { createLsportsDualHttpServer } from '../bridge/http.js';
import { buildLsportsBrowserPayload } from '../bridge/payload.js';
import {
  resetLsportsShadowRuntimeForTests,
  runLsportsShadowBridge,
} from '../bridge/runtime.js';
import { LsportsRecoveryCoordinator } from '../state/coordinator.js';
import { planPrematchSnapshotRequests } from '../state/plan.js';
import { LsportsSnapshotRateLimiter } from '../state/rateLimit.js';
import { LsportsRecoveryBuffer } from '../state/recovery.js';
import { LsportsInPlayStore } from '../state/store.js';
import {
  fetchPreMatchSnapshotBody,
  LSPORTS_PREMATCH_GET_FIXTURE_MARKETS_URL,
  LSPORTS_PREMATCH_GET_FIXTURES_URL,
  LSPORTS_PREMATCH_GET_SCORES_URL,
} from '../snapshot.js';
import { buildLsportsPrematchPayload, prematchPayloadHasSecrets } from './payload.js';
import {
  LsportsPrematchAlreadyRunningError,
  resetLsportsPrematchRuntimeForTests,
  runLsportsPrematchBridge,
} from './runtime.js';

const ENV = {
  LSPORTS_RMQ_USERNAME: 'shared-user',
  LSPORTS_RMQ_PASSWORD: 'shared-secret',
};

const FAKE_1X2 = { home: 2.1, draw: 3.25, away: 2.8 };
const FIXTURE_A = 41001001;
const FIXTURE_B = 41001002;
const HOME_BET = 9100001;
const DRAW_BET = 9100002;
const AWAY_BET = 9100003;

function fixturesSnapshot(ids: number[]) {
  return {
    Header: { Type: 36, ServerTimestamp: 1000 },
    Body: ids.map((fixtureId) => ({
      FixtureId: fixtureId,
      Fixture: {
        Sport: { Id: 6046, Name: 'Football' },
        Location: { Id: 248, Name: 'England' },
        League: { Id: 7, Name: 'Premier League' },
        StartDate: '2026-09-10T18:00:00Z',
        Status: 1,
        Participants: [
          { Id: 101, Name: 'Home FC', Position: '1' },
          { Id: 202, Name: 'Away FC', Position: '2' },
        ],
      },
    })),
  };
}

function type1Delta(fixtureId: number) {
  return {
    Header: { Type: 1, ServerTimestamp: 2000 },
    Body: [{
      FixtureId: fixtureId,
      Fixture: {
        Sport: { Id: 6046, Name: 'Football' },
        League: { Id: 7, Name: 'Premier League' },
        StartDate: '2026-09-10T18:00:00Z',
        Participants: [
          { Id: 101, Name: 'Home FC', Position: '1' },
          { Id: 202, Name: 'Away FC', Position: '2' },
        ],
      },
    }],
  };
}

function type3Markets(fixtureId: number, extras: {
  home?: string;
  draw?: string;
  away?: string;
  underOver?: { line: string; over: string; under: string };
  handicap?: { line: string; home: string; away: string };
  providerPrice?: string;
  status?: number;
} = {}) {
  const markets: Record<string, unknown>[] = [{
    Id: 1,
    Name: '1X2',
    Status: extras.status ?? 1,
    Bets: [
      { Id: HOME_BET, Name: '1', Status: 1, Price: extras.home ?? '1.95' },
      { Id: DRAW_BET, Name: 'X', Status: 1, Price: extras.draw ?? '3.40' },
      { Id: AWAY_BET, Name: '2', Status: 1, Price: extras.away ?? '4.10' },
    ],
    ProviderMarkets: [{
      Bets: [
        { Id: 1, Name: '1', Price: extras.providerPrice ?? '9.99' },
        { Id: 2, Name: 'X', Price: '8.88' },
        { Id: 3, Name: '2', Price: '7.77' },
      ],
    }],
  }];
  if (extras.underOver) {
    markets.push({
      Id: 2,
      Name: 'Under/Over',
      Status: 1,
      Line: extras.underOver.line,
      Bets: [
        { Id: 9200001, Name: 'Over', Status: 1, Price: extras.underOver.over, Line: extras.underOver.line },
        { Id: 9200002, Name: 'Under', Status: 1, Price: extras.underOver.under, Line: extras.underOver.line },
      ],
    });
  }
  if (extras.handicap) {
    markets.push({
      Id: 1439,
      Name: 'Asian Handicap - Full Time',
      Status: 1,
      Line: extras.handicap.line,
      Bets: [
        { Id: 9300001, Name: '1', Status: 1, Price: extras.handicap.home, Line: extras.handicap.line },
        { Id: 9300002, Name: '2', Status: 1, Price: extras.handicap.away, Line: extras.handicap.line },
      ],
    });
  }
  return {
    Header: { Type: 3, ServerTimestamp: 3000 },
    Body: { Events: [{ FixtureId: fixtureId, Markets: markets }] },
  };
}

describe('lsports prematch snapshot plan', () => {
  it('uses official PreMatch snapshot URLs and omits GetEvents', () => {
    assert.equal(LSPORTS_PREMATCH_GET_FIXTURES_URL, 'https://stm-snapshot.lsports.eu/PreMatch/GetFixtures');
    assert.equal(LSPORTS_PREMATCH_GET_FIXTURE_MARKETS_URL, 'https://stm-snapshot.lsports.eu/PreMatch/GetFixtureMarkets');
    assert.equal(LSPORTS_PREMATCH_GET_SCORES_URL, 'https://stm-snapshot.lsports.eu/PreMatch/GetScores');
    const plan = planPrematchSnapshotRequests({ mode: 'COLD_START' });
    assert.deepEqual(plan.map((item) => item.endpoint), ['GetFixtures', 'GetFixtureMarkets']);
    for (const item of plan) {
      assert.equal(item.unfiltered, false);
      assert.equal(item.timestamp, undefined);
    }
  });

  it('POSTs PreMatch GetFixtures with package 4352 and retries 429', async () => {
    const urls: string[] = [];
    let calls = 0;
    const result = await fetchPreMatchSnapshotBody(
      { endpoint: 'GetFixtures', unfiltered: true },
      ENV,
      {
        fetchImpl: async (url) => {
          urls.push(String(url));
          calls += 1;
          if (calls === 1) {
            return {
              ok: false,
              status: 429,
              headers: { get: () => '1' },
              async text() { return '{}'; },
            } as unknown as Response;
          }
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            async text() { return JSON.stringify({ Header: { Type: 36 }, Body: [] }); },
          } as unknown as Response;
        },
        sleep: async () => {},
        log: () => {},
      },
    );
    assert.equal(urls[0], LSPORTS_PREMATCH_GET_FIXTURES_URL);
    assert.equal(calls, 2);
    assert.equal((result as { Header?: { Type?: number } }).Header?.Type, 36);
  });
});

describe('lsports prematch state and adapter', () => {
  it('keeps full fixture state when a Type 1 delta names only one fixture', () => {
    const store = new LsportsInPlayStore();
    store.ingestFixturesSnapshot(fixturesSnapshot([FIXTURE_A, FIXTURE_B]));
    store.ingestRmq(type1Delta(FIXTURE_A));
    assert.equal(store.listFixtures().length, 2);
    assert.ok(store.getFixture(FIXTURE_A));
    assert.ok(store.getFixture(FIXTURE_B));
    const adapted = adaptLsportsPrematchStore(store);
    assert.equal(adapted.matches.length, 2);
    assert.equal(adapted.matches[0]?.event.time_status, '0');
    assert.equal(adapted.matches[0]?.event.our_events, LSPORTS_PREMATCH_DISPLAY_TAG);
  });

  it('does not hide fixtures when KeepAlive lists a subset', () => {
    const store = new LsportsInPlayStore();
    store.ingestFixturesSnapshot(fixturesSnapshot([FIXTURE_A, FIXTURE_B]));
    store.ingestKeepAlive({
      Header: { Type: 31 },
      Body: { KeepAlive: { ActiveEvents: [FIXTURE_A] } },
    });
    const adapted = adaptLsportsPrematchStore(store);
    assert.equal(adapted.matches.length, 2);
  });

  it('uses aggregated Bet.Price only and never ProviderMarkets or fake 1X2', () => {
    const store = new LsportsInPlayStore();
    store.ingestFixturesSnapshot(fixturesSnapshot([FIXTURE_A]));
    store.ingestRmq(type3Markets(FIXTURE_A, {
      home: '1.95',
      draw: '3.40',
      away: '4.10',
      underOver: { line: '2.5', over: '1.90', under: '1.95' },
      handicap: { line: '-0.25', home: '1.85', away: '2.05' },
      providerPrice: '9.99',
    }));
    const adapted = adaptLsportsPrematchStore(store);
    const json = JSON.stringify(adapted);
    assert.equal(json.includes('9.99'), false);
    assert.equal(json.includes(String(FAKE_1X2.home)), false);
    assert.equal(json.includes(String(FAKE_1X2.draw)), false);
    assert.equal(json.includes(String(FAKE_1X2.away)), false);
    const oneXtwo = adapted.matches[0]?.markets.find((market) => market.key === NEXTPARI_1X2_MARKET_KEY);
    const home = oneXtwo?.entries[0]?.outcomes.find((row) => row.key === 'home');
    assert.equal(home?.odds, 1.95);
    assert.equal(home?.providerBetId, String(HOME_BET));
    assert.ok(adapted.matches[0]?.markets.some((market) => market.key === NEXTPARI_TOTALS_MARKET_KEY));
    assert.ok(adapted.matches[0]?.markets.some((market) => market.key === NEXTPARI_HANDICAP_MARKET_KEY));
    const payload = buildLsportsPrematchPayload(store, 1_000, { consumerConnected: true, lastMessageAt: 1_000 });
    assert.equal(prematchPayloadHasSecrets(payload, [ENV.LSPORTS_RMQ_PASSWORD, ENV.LSPORTS_RMQ_USERNAME]), false);
    assert.equal(payload.diagnostics.open1x2WithPricesCount, 1);
    assert.equal(payload.diagnostics.sample?.price, 1.95);
  });

  it('omits suspended or missing 1X2 prices instead of fabricating them', () => {
    const store = new LsportsInPlayStore();
    store.ingestFixturesSnapshot(fixturesSnapshot([FIXTURE_A]));
    store.ingestRmq(type3Markets(FIXTURE_A, { status: 2 }));
    const adapted = adaptLsportsPrematchStore(store);
    assert.equal(adapted.matches[0]?.markets.some((market) => market.key === NEXTPARI_1X2_MARKET_KEY), false);
    assert.equal(adapted.open1x2WithPricesCount, 0);
    const json = JSON.stringify(adapted);
    assert.equal(json.includes('2.1'), false);
    assert.equal(json.includes('3.25'), false);
    assert.equal(json.includes('2.8'), false);
  });

  it('replays buffered PreMatch snapshots then LIVE without mixing InPlay state', async () => {
    const inplay = new LsportsInPlayStore();
    inplay.ingestFixturesSnapshot(fixturesSnapshot([FIXTURE_A]));
    const prematch = new LsportsInPlayStore();
    const requested: string[] = [];
    let now = 0;
    const coordinator = new LsportsRecoveryCoordinator({
      store: prematch,
      buffer: new LsportsRecoveryBuffer(prematch, () => now),
      limiter: new LsportsSnapshotRateLimiter(() => now),
      now: () => now,
      planSnapshots: planPrematchSnapshotRequests,
      io: {
        sleep: async (ms) => {
          now += ms;
        },
        fetchSnapshot: async (item) => {
          requested.push(item.endpoint);
          if (item.endpoint === 'GetFixtures') return fixturesSnapshot([FIXTURE_B]);
          return type3Markets(FIXTURE_B, { home: '2.05', draw: '3.10', away: '3.80' });
        },
      },
    });
    prematch.ingestRmq(type1Delta(FIXTURE_B));
    await coordinator.runColdStart();
    assert.deepEqual(requested, ['GetFixtures', 'GetFixtureMarkets']);
    assert.equal(coordinator.getMode(), 'LIVE');
    assert.ok((prematch.getFixture(FIXTURE_B)?.markets.size ?? 0) > 0);
    assert.equal(inplay.getFixture(FIXTURE_B), undefined);
    assert.equal(inplay.listFixtures().length, 1);
  });
});

describe('lsports prematch HTTP and isolated runtime', () => {
  it('serves /prematch without changing /inplay', async () => {
    const inplayStore = new LsportsInPlayStore();
    inplayStore.ingestFixturesSnapshot(fixturesSnapshot([FIXTURE_A]));
    inplayStore.ingestHeartbeat({ Header: { Type: 32, ServerTimestamp: 111 } }, 1_000);
    const prematchStore = new LsportsInPlayStore();
    prematchStore.ingestFixturesSnapshot(fixturesSnapshot([FIXTURE_B]));
    prematchStore.ingestRmq(type3Markets(FIXTURE_B));
    const server = createLsportsDualHttpServer(
      () => buildLsportsBrowserPayload(inplayStore, 1_000),
      () => buildLsportsPrematchPayload(prematchStore, 1_000, {
        consumerConnected: true,
        lastMessageAt: 1_000,
      }),
      {
        mode: 'remote',
        host: '127.0.0.1',
        port: 0,
        allowedOrigins: ['https://nextpari.net'],
        allowVercelPreviews: false,
        enableStream: false,
      },
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const headers = { Origin: 'https://nextpari.net' };
      const health = await fetch(`http://127.0.0.1:${port}/health`, { headers });
      const inplay = await fetch(`http://127.0.0.1:${port}/inplay`, { headers });
      const prematch = await fetch(`http://127.0.0.1:${port}/prematch`, { headers });
      const alias = await fetch(`http://127.0.0.1:${port}/api/lsports/prematch`, { headers });
      assert.equal(health.ok, true);
      assert.equal(inplay.ok, true);
      assert.equal(prematch.ok, true);
      assert.equal(alias.ok, true);
      const healthJson = await health.json() as { health?: string; prematch?: { available?: boolean } };
      const inplayJson = await inplay.json() as { source?: string };
      const prematchJson = await prematch.json() as { source?: string; matches?: unknown[] };
      assert.equal(healthJson.health, 'HEALTHY');
      assert.equal(healthJson.prematch?.available, true);
      assert.equal(inplayJson.source, 'lsports');
      assert.equal(prematchJson.source, 'lsports-prematch');
      assert.ok((prematchJson.matches?.length ?? 0) >= 1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('runs PreMatch beside InPlay without sharing stores or singletons', async () => {
    resetLsportsShadowRuntimeForTests();
    resetLsportsPrematchRuntimeForTests();
    const fakeChannel = () => ({ cancel: async () => {}, ack() {} });
    let inplayNow = 0;
    let prematchNow = 0;
    const startInplay = () => runLsportsShadowBridge(ENV, {
      listenHttp: false,
      distributionPollMs: 0,
      startDistribution: async () => {},
      limiter: new LsportsSnapshotRateLimiter(() => inplayNow),
      connect: async () => ({ fake: true }) as never,
      openChannel: async () => fakeChannel() as never,
      checkQueue: async () => {},
      consume: async () => ({ consumerTag: 'inplay-c1' }),
      createIo: () => ({
        sleep: async (ms) => {
          inplayNow += ms;
        },
        fetchSnapshot: async () => ({ Header: { Type: 36 }, Body: [] }),
      }),
    });
    const startPrematch = () => runLsportsPrematchBridge(ENV, {
      distributionPollMs: 0,
      startDistribution: async () => {},
      limiter: new LsportsSnapshotRateLimiter(() => prematchNow),
      connect: async () => new EventEmitter() as never,
      openChannel: async () => fakeChannel() as never,
      checkQueue: async () => {},
      consume: async () => ({ consumerTag: 'prematch-c1' }),
      createIo: () => ({
        sleep: async (ms) => {
          prematchNow += ms;
        },
        fetchSnapshot: async () => ({ Header: { Type: 36 }, Body: [] }),
      }),
    });
    const inplay = await startInplay();
    const prematch = await startPrematch();
    assert.equal(inplay.started(), true);
    assert.equal(prematch.started(), true);
    assert.equal(inplay.consumerCount(), 1);
    assert.equal(prematch.consumerCount(), 1);
    await assert.rejects(
      () => startPrematch(),
      (error: unknown) => error instanceof LsportsPrematchAlreadyRunningError,
    );
    const inplayPayload = inplay.getPayload();
    const prematchPayload = prematch.getPayload();
    assert.equal(inplayPayload.source, 'lsports');
    assert.equal(prematchPayload.source, 'lsports-prematch');
    await prematch.stop();
    assert.equal(inplay.started(), true);
    await inplay.stop();
  });
});
