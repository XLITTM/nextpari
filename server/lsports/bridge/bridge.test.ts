import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, it } from 'node:test';
import { LsportsInPlayStore } from '../state/store.js';
import { AddressInfo } from 'node:net';
import { corsOriginForRequest, parseAllowedOrigins, resolveAllowedOrigins } from './cors.js';
import {
  createLsportsShadowHttpServer,
  handleLsportsShadowRequest,
  resolveLsportsHttpOptions,
} from './http.js';
import { LSPORTS_HTTP_INPLAY_RATE_MAX, LsportsHttpRateLimiter } from './rateLimitHttp.js';
import { browserPayloadHasSecrets, buildLsportsBrowserPayload } from './payload.js';
import { LsportsDisplayBridge } from './publisher.js';

const FIXTURE_A = 19981248;
const FIXTURE_B = 20000088;
const HOME_BET = 117469638719981250;
const DRAW_BET = 212242794219981250;
const AWAY_BET = 155418696819981250;

function snapshotFixtures(fixtureId = FIXTURE_A) {
  return {
    Header: { Type: 36, ServerTimestamp: 1000 },
    Body: [{
      FixtureId: fixtureId,
      Fixture: {
        Sport: { Id: 6046, Name: 'Football' },
        Location: { Id: 248, Name: 'England' },
        League: { Id: 7, Name: 'Premier League' },
        StartDate: '2026-09-01T22:00:00Z',
        Participants: [
          { Id: 101, Name: 'Home FC', Position: '1' },
          { Id: 202, Name: 'Away FC', Position: '2' },
        ],
      },
    }],
  };
}

function type2(fixtureId = FIXTURE_A, home = '1', away = '2', seconds = 3120) {
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
            CurrentPeriod: 20,
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

function type3(fixtureId: number, priceHome: string, lastUpdate = '2026-09-01T22:51:11Z') {
  return {
    Header: { Type: 3, ServerTimestamp: 3000 },
    Body: {
      Events: [{
        FixtureId: fixtureId,
        Markets: [{
          Id: 1,
          Name: '1X2',
          Status: 1,
          Bets: [
            { Id: HOME_BET, Name: '1', Price: priceHome, Status: 1, LastUpdate: lastUpdate },
            { Id: DRAW_BET, Name: 'X', Price: '3.40', Status: 1, LastUpdate: lastUpdate },
            { Id: AWAY_BET, Name: '2', Price: '4.20', Status: 1, LastUpdate: lastUpdate },
          ],
        }],
      }],
    },
  };
}

function seedTwo(store: LsportsInPlayStore) {
  store.ingestFixturesSnapshot(snapshotFixtures(FIXTURE_A));
  store.ingestFixturesSnapshot(snapshotFixtures(FIXTURE_B));
  store.ingestRmq(type2(FIXTURE_A, '1', '0'));
  store.ingestRmq(type2(FIXTURE_B, '0', '0', 120));
  store.ingestRmq(type3(FIXTURE_A, '1.85'));
  store.ingestRmq(type3(FIXTURE_B, '2.05', '2026-09-01T22:51:12Z'));
}

function homeOdds(bridge: LsportsDisplayBridge, id: string) {
  const match = bridge.getPayload().matches.find((row) => row.event.id === id);
  return match?.markets[0]?.entries[0]?.outcomes.find((row) => row.key === 'home')?.odds;
}

describe('lsports shadow bridge', () => {
  it('publishes the full active football set', () => {
    const store = new LsportsInPlayStore();
    seedTwo(store);
    store.ingestHeartbeat({ Header: { Type: 32, ServerTimestamp: 111 } }, 1_000);
    const bridge = new LsportsDisplayBridge({ store, coalesceMs: 0, now: () => 1_000 });
    const payload = bridge.publishNow();
    assert.equal(payload.source, 'lsports');
    assert.equal(payload.matches.length, 2);
    assert.ok(payload.matches.some((row) => row.event.id === String(FIXTURE_A)));
    assert.ok(payload.matches.some((row) => row.event.id === String(FIXTURE_B)));
    assert.equal(payload.diagnostics.adaptedFixtureCount, 2);
  });

  it('keeps credentials out of the browser payload', () => {
    const store = new LsportsInPlayStore();
    seedTwo(store);
    store.ingestHeartbeat({ Header: { Type: 32, ServerTimestamp: 111 } }, 1_000);
    const payload = buildLsportsBrowserPayload(store, 1_000);
    assert.equal(browserPayloadHasSecrets(payload, ['shared-secret', 'shared-user']), false);
    const json = JSON.stringify(payload);
    assert.equal(json.includes('password'), false);
    assert.equal(json.includes('userName'), false);
    assert.equal(json.includes('VITE_'), false);
  });

  it('applies a Type 2 score change', () => {
    let now = 1_000;
    const store = new LsportsInPlayStore(() => now);
    seedTwo(store);
    store.ingestHeartbeat({ Header: { Type: 32, ServerTimestamp: 111 } }, now);
    const bridge = new LsportsDisplayBridge({ store, coalesceMs: 0, now: () => now });
    bridge.publishNow();
    now = 2_000;
    bridge.handleRmq(type2(FIXTURE_A, '4', '1', 3180));
    assert.equal(bridge.getPayload().matches.find((row) => row.event.id === String(FIXTURE_A))?.event.ss, '4-1');
    assert.equal(bridge.getPayload().matches.find((row) => row.event.id === String(FIXTURE_B))?.event.ss, '0-0');
  });

  it('applies a Type 3 1X2 update without deleting the sibling fixture', () => {
    let now = 1_000;
    const store = new LsportsInPlayStore(() => now);
    seedTwo(store);
    store.ingestHeartbeat({ Header: { Type: 32, ServerTimestamp: 111 } }, now);
    const bridge = new LsportsDisplayBridge({ store, coalesceMs: 0, now: () => now });
    bridge.publishNow();
    now = 2_000;
    bridge.handleRmq(type3(FIXTURE_A, '1.91', '2026-09-01T22:52:00Z'));
    assert.equal(bridge.getPayload().matches.length, 2);
    assert.equal(homeOdds(bridge, String(FIXTURE_A)), 1.91);
    assert.equal(homeOdds(bridge, String(FIXTURE_B)), 2.05);
  });

  it('locks LSports odds when the heartbeat is stale and restores them when healthy', () => {
    let now = 1_000;
    const store = new LsportsInPlayStore(() => now);
    seedTwo(store);
    store.ingestHeartbeat({ Header: { Type: 32, ServerTimestamp: 111 } }, now);
    const bridge = new LsportsDisplayBridge({ store, coalesceMs: 0, now: () => now });
    assert.equal(bridge.publishNow().health, 'HEALTHY');
    assert.ok((homeOdds(bridge, String(FIXTURE_A)) ?? 0) > 1);
    now = 1_000 + 12_001;
    bridge.refreshHealth();
    assert.equal(bridge.getPayload().health, 'STALE');
    const stale = bridge.getPayload().matches[0];
    assert.equal(stale?.markets[0]?.entries.length, 0);
    assert.equal(JSON.stringify(bridge.getPayload()).includes('2.1'), false);
    now = 20_000;
    bridge.handleRmq({ Header: { Type: 32, ServerTimestamp: 222 } });
    assert.equal(bridge.getPayload().health, 'HEALTHY');
    assert.ok((homeOdds(bridge, String(FIXTURE_A)) ?? 0) > 1);
  });

  it('locks LSports odds when distribution is disabled without fabricating prices', () => {
    let now = 1_000;
    const store = new LsportsInPlayStore(() => now);
    seedTwo(store);
    store.ingestHeartbeat({ Header: { Type: 32, ServerTimestamp: 111 } }, now);
    const bridge = new LsportsDisplayBridge({ store, coalesceMs: 0, now: () => now });
    assert.equal(bridge.publishNow().health, 'HEALTHY');
    assert.ok((homeOdds(bridge, String(FIXTURE_A)) ?? 0) > 1);
    const locked = bridge.noteDistributionStatus({
      distributionActive: false,
      consumerCount: 0,
      numberMessagesInQueue: 0,
      messagesPerSecond: 0,
      polledAt: now,
    });
    assert.equal(locked.health, 'STALE');
    assert.equal(locked.diagnostics.distributionActive, false);
    assert.equal(locked.matches[0]?.markets[0]?.entries.length, 0);
    assert.equal(JSON.stringify(locked).includes('2.1'), false);
    assert.equal(JSON.stringify(locked).includes('3.25'), false);
    assert.equal(JSON.stringify(locked).includes('2.8'), false);
  });

  it('exposes store vs adapted market inventory on the browser payload', () => {
    const store = new LsportsInPlayStore();
    seedTwo(store);
    store.ingestHeartbeat({ Header: { Type: 32, ServerTimestamp: 111 } }, 1_000);
    const payload = buildLsportsBrowserPayload(store, 1_000);
    assert.ok(payload.diagnostics.storeMarketCount >= 2);
    assert.equal(payload.diagnostics.adaptedMarketCount, 2);
    assert.equal(payload.diagnostics.marketCount, 2);
    assert.equal(payload.diagnostics.marketInventory.market1.count, 2);
    assert.equal(payload.diagnostics.marketInventory.market1.openMarketCount, 2);
    assert.ok(payload.diagnostics.marketInventory.ingest.market1AppliedFromType3 >= 2);
    assert.equal(payload.diagnostics.market1Adapter.adapted, 2);
    assert.equal(JSON.stringify(payload).includes('ProviderMarkets'), false);
    assert.equal(JSON.stringify(payload).includes('2.1'), false);
  });

  it('never includes fake 2.10/3.25/2.80 in LSports mode', () => {
    const store = new LsportsInPlayStore();
    store.ingestFixturesSnapshot(snapshotFixtures());
    store.ingestRmq(type2());
    store.ingestHeartbeat({ Header: { Type: 32, ServerTimestamp: 111 } }, 1_000);
    const payload = buildLsportsBrowserPayload(store, 1_000);
    const json = JSON.stringify(payload);
    assert.equal(json.includes('2.1'), false);
    assert.equal(json.includes('3.25'), false);
    assert.equal(json.includes('2.8'), false);
    assert.equal(payload.matches[0]?.markets.length, 0);
  });

  it('serves sanitized JSON over the shadow HTTP handler', () => {
    const store = new LsportsInPlayStore();
    seedTwo(store);
    store.ingestHeartbeat({ Header: { Type: 32, ServerTimestamp: 111 } }, 1_000);
    const payload = buildLsportsBrowserPayload(store, 1_000);
    let body = '';
    const req = Object.assign(new EventEmitter(), { url: '/api/lsports/inplay', method: 'GET' }) as IncomingMessage;
    const res = {
      statusCode: 0,
      setHeader() {},
      end(value?: string) {
        body = value ?? '';
      },
    } as unknown as ServerResponse;
    assert.equal(handleLsportsShadowRequest(req, res, () => payload), true);
    assert.equal(body.includes('shared-secret'), false);
    assert.equal(body.includes('password'), false);
    const parsed = JSON.parse(body) as { matches: unknown[] };
    assert.equal(parsed.matches.length, 2);
  });

  it('allows nextpari.net CORS and rejects wildcards', () => {
    assert.deepEqual(parseAllowedOrigins('*,https://nextpari.net'), ['https://nextpari.net']);
    assert.deepEqual(
      resolveAllowedOrigins({ LSPORTS_ALLOWED_ORIGINS: '' }, 'remote'),
      ['https://nextpari.net', 'https://www.nextpari.net', 'http://127.0.0.1:5173', 'http://localhost:5173'],
    );
    assert.equal(
      corsOriginForRequest('http://127.0.0.1:5173', resolveAllowedOrigins({}, 'remote'), false),
      'http://127.0.0.1:5173',
    );
    assert.equal(corsOriginForRequest('https://evil.example', ['https://nextpari.net'], false), null);
    assert.equal(
      corsOriginForRequest('https://nextpari-preview.vercel.app', ['https://nextpari.net'], true),
      'https://nextpari-preview.vercel.app',
    );
    assert.equal(
      corsOriginForRequest('https://evil.vercel.app.example.com', ['https://nextpari.net'], true),
      null,
    );
    const remote = resolveLsportsHttpOptions({ LSPORTS_WORKER_MODE: 'remote', PORT: '8080' });
    assert.equal(remote.host, '0.0.0.0');
    assert.equal(remote.port, 8080);
    assert.equal(remote.enableStream, false);
  });

  it('rate-limits inplay and hides stack traces', () => {
    const payload = buildLsportsBrowserPayload(new LsportsInPlayStore(), 1_000);
    const limiter = new LsportsHttpRateLimiter(60_000, () => 1);
    const options = resolveLsportsHttpOptions({ LSPORTS_WORKER_MODE: 'remote' });
    let lastStatus = 0;
    let body = '';
    const res = {
      statusCode: 0,
      setHeader() {},
      end(value?: string) {
        lastStatus = res.statusCode;
        body = value ?? '';
      },
    };
    const response = res as unknown as ServerResponse;
    for (let i = 0; i < LSPORTS_HTTP_INPLAY_RATE_MAX; i += 1) {
      const req = Object.assign(new EventEmitter(), {
        url: '/inplay',
        method: 'GET',
        headers: {},
        socket: { remoteAddress: '10.0.0.2' },
      }) as IncomingMessage;
      handleLsportsShadowRequest(req, response, () => payload, undefined, options, limiter);
    }
    const blocked = Object.assign(new EventEmitter(), {
      url: '/inplay',
      method: 'GET',
      headers: {},
      socket: { remoteAddress: '10.0.0.2' },
    }) as IncomingMessage;
    handleLsportsShadowRequest(blocked, response, () => payload, undefined, options, limiter);
    assert.equal(lastStatus, 429);
    assert.equal(body.includes('rate-limited'), true);
    const boom = Object.assign(new EventEmitter(), {
      url: '/health',
      method: 'GET',
      headers: {},
    }) as IncomingMessage;
    handleLsportsShadowRequest(boom, response, () => {
      throw new Error('secret-stack shared-secret');
    }, undefined, options, limiter);
    assert.equal(lastStatus, 500);
    assert.equal(body.includes('unavailable'), true);
    assert.equal(body.includes('shared-secret'), false);
    assert.equal(body.includes('secret-stack'), false);
  });

  it('boots a remote worker HTTP listener for /health and /inplay only', async () => {
    const store = new LsportsInPlayStore();
    seedTwo(store);
    store.ingestHeartbeat({ Header: { Type: 32, ServerTimestamp: 111 } }, 1_000);
    const payload = buildLsportsBrowserPayload(store, 1_000);
    const server = createLsportsShadowHttpServer(
      () => payload,
      () => () => {},
      {
        mode: 'remote',
        host: '127.0.0.1',
        port: 0,
        allowedOrigins: ['https://nextpari.net'],
        allowVercelPreviews: true,
        enableStream: false,
      },
    );
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as AddressInfo;
    try {
      const headers = { Origin: 'https://nextpari.net' };
      const health = await fetch(`http://127.0.0.1:${port}/health`, { headers });
      const inplay = await fetch(`http://127.0.0.1:${port}/inplay`, { headers });
      const stream = await fetch(`http://127.0.0.1:${port}/stream`, { headers });
      const denied = await fetch(`http://127.0.0.1:${port}/inplay`, { headers: { Origin: 'https://evil.example' } });
      assert.equal(health.ok, true);
      assert.equal(inplay.ok, true);
      assert.equal(stream.status, 404);
      const healthJson = await health.json() as { health?: string; password?: string };
      const inplayText = await inplay.text();
      assert.equal(healthJson.health, 'HEALTHY');
      assert.equal('password' in healthJson, false);
      assert.equal(inplayText.includes('shared-secret'), false);
      assert.equal(inplayText.includes('password'), false);
      assert.equal(inplay.headers.get('access-control-allow-origin'), 'https://nextpari.net');
      assert.equal(denied.headers.get('access-control-allow-origin'), null);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
