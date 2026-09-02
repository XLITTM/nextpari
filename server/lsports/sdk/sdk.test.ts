import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleLsportsShadowRequest, resolveLsportsHttpOptions } from '../bridge/http.js';
import { buildLsportsBrowserPayload } from '../bridge/payload.js';
import { resetLsportsShadowRuntimeForTests, runLsportsShadowBridge } from '../bridge/runtime.js';
import { LsportsSnapshotRateLimiter } from '../state/rateLimit.js';
import { LsportsInPlayStore } from '../state/store.js';
import { readActiveEvents } from '../state/parse.js';
import { classifySdkMessage } from './classify.js';
import { buildSdkHealthDiagnostics } from './health.js';
import {
  extractKeepAliveActiveEvents,
  LSPORTS_KEEPALIVE_PROBE_FIXTURE_ID,
} from './keepalive.js';
import { TRADE360_SDK_PACKAGE, TRADE360_SDK_VERSION } from './constants.js';
import { resolveLsportsTransport } from './mode.js';
import { orderLsportsFixtureById, readOrderFixtureArg } from './order.js';
import { reconstructPayloadFromSdk } from './payload.js';
import { wrapSdkSnapshotResult } from './snapshotIo.js';
import { LsportsSdkShadowCollector, resetSdkShadowsForTests, sdkShadowFor } from './shadow.js';
import {
  claimCanonicalWriter,
  currentCanonicalWriter,
  LsportsDualWriterError,
  releaseCanonicalWriter,
  resetCanonicalWritersForTests,
} from './writer.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const ENV = {
  LSPORTS_RMQ_USERNAME: 'shared-user',
  LSPORTS_RMQ_PASSWORD: 'shared-secret',
};

function type31(ids: number[]) {
  return {
    Header: { Type: 31, ServerTimestamp: 5000 },
    Body: { KeepAlive: { ActiveEvents: ids } },
  };
}

describe('lsports SDK transport mode', () => {
  it('defaults to direct and enables in-process shadow', () => {
    assert.deepEqual(resolveLsportsTransport({}), { transport: 'direct', shadow: true });
    assert.deepEqual(resolveLsportsTransport({ LSPORTS_TRANSPORT: 'sdk', LSPORTS_SDK_SHADOW: '0' }), {
      transport: 'sdk',
      shadow: false,
    });
    assert.equal(TRADE360_SDK_PACKAGE, 'trade360-nodejs-sdk');
    assert.equal(TRADE360_SDK_VERSION, '3.10.9');
  });
});

describe('lsports single canonical writer', () => {
  it('rejects a second transport on the same flow', () => {
    resetCanonicalWritersForTests();
    claimCanonicalWriter('inplay', 'direct');
    assert.equal(currentCanonicalWriter('inplay'), 'direct');
    assert.throws(
      () => claimCanonicalWriter('inplay', 'sdk'),
      (error: unknown) => error instanceof LsportsDualWriterError,
    );
    claimCanonicalWriter('prematch', 'sdk');
    assert.equal(currentCanonicalWriter('prematch'), 'sdk');
    releaseCanonicalWriter('inplay', 'direct');
    claimCanonicalWriter('inplay', 'sdk');
    assert.equal(currentCanonicalWriter('inplay'), 'sdk');
  });
});

describe('lsports SDK KeepAlive ActiveEvents', () => {
  it('reads PascalCase RMQ JSON and SDK camelCase keepAlive.activeEvents', () => {
    const pascal = extractKeepAliveActiveEvents(type31([20003734, 19981248]));
    assert.deepEqual(pascal.fixtureIds, [20003734, 19981248]);
    assert.equal(pascal.fixtureIds.includes(LSPORTS_KEEPALIVE_PROBE_FIXTURE_ID), true);
    const sdkShape = extractKeepAliveActiveEvents({
      keepAlive: { activeEvents: [20003734, 111] },
    });
    assert.deepEqual(sdkShape.fixtureIds, [20003734, 111]);
    assert.deepEqual(readActiveEvents(type31([20003734])), [20003734]);
    const reconstructed = reconstructPayloadFromSdk(
      { type: 31, serverTimestamp: 9 },
      { keepAlive: { activeEvents: [20003734] } },
    );
    assert.deepEqual(readActiveEvents(reconstructed), [20003734]);
  });
});

describe('lsports SDK message classification', () => {
  it('maps official EntityKey types and flags Type 31 schema failures', () => {
    assert.equal(classifySdkMessage({ Header: { Type: 1 } }).kind, 'type1');
    assert.equal(classifySdkMessage({ Header: { Type: 2 } }).kind, 'type2');
    assert.equal(classifySdkMessage({ Header: { Type: 3 } }).kind, 'type3');
    assert.equal(classifySdkMessage(type31([1])).kind, 'type31');
    assert.equal(classifySdkMessage({ Header: { Type: 32 } }).kind, 'type32');
    assert.equal(classifySdkMessage({ Header: { Type: 35 } }).kind, 'type35');
    assert.equal(classifySdkMessage({ Header: { Type: 99 } }).kind, 'unknown');
    assert.equal(classifySdkMessage({ Header: { Type: 31 }, Body: {} }).schemaFailure, true);
  });
});

describe('lsports SDK shadow does not write canonical state', () => {
  it('counts Type 2/3/31 without ingesting fixtures', () => {
    resetSdkShadowsForTests();
    const store = new LsportsInPlayStore();
    const shadow = new LsportsSdkShadowCollector('inplay');
    shadow.observe({ Header: { Type: 32, ServerTimestamp: 1 } });
    shadow.observe({
      Header: { Type: 2, ServerTimestamp: 2 },
      Body: { Events: [{ FixtureId: 20003734 }] },
    });
    shadow.observe({
      Header: { Type: 3, ServerTimestamp: 3 },
      Body: { Events: [{ FixtureId: 20003734, Markets: [] }] },
    });
    shadow.observe(type31([20003734, 9]));
    const snap = shadow.snapshot();
    assert.equal(snap.counters.heartbeatType32, 1);
    assert.equal(snap.counters.type2, 1);
    assert.equal(snap.counters.type3, 1);
    assert.equal(snap.counters.keepAliveType31, 1);
    assert.equal(snap.keepAlive.probeFixtureInKeepAlive, true);
    assert.equal(snap.keepAlive.activeEventCount, 2);
    assert.equal(store.metrics().fixtureCount, 0);
  });
});

describe('lsports SDK snapshot wrap and fixture order', () => {
  it('wraps SDK snapshot entities as Header Type 36 Body', () => {
    const wrapped = wrapSdkSnapshotResult({ fixtureId: 1 });
    assert.equal((wrapped as { Header: { Type: number } }).Header.Type, 36);
    assert.equal(((wrapped as { Body: unknown[] }).Body).length, 1);
  });

  it('requires an explicit FixtureId and never infers a blanket order', async () => {
    await assert.rejects(
      () => orderLsportsFixtureById('inplay', '', ENV),
      (error: unknown) => error instanceof Error && error.message === 'LSPORTS_SDK_ORDER_FIXTURE_REQUIRED',
    );
    const result = await orderLsportsFixtureById('inplay', '20003734', ENV, {
      subscribe: async (fixtureId) => ({ success: true, fixtureId }),
      quota: async () => ({ creditRemaining: 12 }),
    });
    assert.equal(result.fixtureId, 20003734);
    assert.equal(result.success, true);
    assert.equal(result.quotaRemaining, 12);
    assert.equal(readOrderFixtureArg(['--fixture=20003734']), '20003734');
    const worker = readFileSync(join(root, 'scripts/run-lsports-worker.ts'), 'utf8');
    assert.equal(worker.includes('subscribeByFixtures'), false);
    assert.equal(worker.includes('orderLsportsFixtureById'), false);
  });
});

describe('lsports SDK runtime fallback and health', () => {
  it('uses mocked SDK Feed as the only inplay writer', async () => {
    resetLsportsShadowRuntimeForTests();
    let now = 0;
    let runtime: Awaited<ReturnType<typeof runLsportsShadowBridge>> | null = null;
    try {
      runtime = await runLsportsShadowBridge({ ...ENV, LSPORTS_TRANSPORT: 'sdk' }, {
        listenHttp: false,
        distributionPollMs: 0,
        startDistribution: async () => {},
        limiter: new LsportsSnapshotRateLimiter(() => now),
        createIo: () => ({
          sleep: async (ms) => {
            now += ms;
          },
          fetchSnapshot: async () => ({ Header: { Type: 36 }, Body: [] }),
        }),
        startSdkFeed: async ({ onMessage }) => {
          onMessage({
            Header: { Type: 32, ServerTimestamp: 42 },
          });
          return { stop: async () => {} };
        },
      });
      assert.equal(currentCanonicalWriter('inplay'), 'sdk');
      assert.equal(runtime.consumerCount(), 1);
      assert.equal(sdkShadowFor('inplay').snapshot().connection, 'sdk-feed');
    } finally {
      await runtime?.stop();
    }
    assert.equal(currentCanonicalWriter('inplay'), null);
  });

  it('falls back to direct when SDK Feed fails to start', async () => {
    resetLsportsShadowRuntimeForTests();
    let now = 0;
    await assert.rejects(
      () => runLsportsShadowBridge({ ...ENV, LSPORTS_TRANSPORT: 'sdk' }, {
        listenHttp: false,
        distributionPollMs: 0,
        startDistribution: async () => {},
        limiter: new LsportsSnapshotRateLimiter(() => now),
        createIo: () => ({
          sleep: async (ms) => {
            now += ms;
          },
          fetchSnapshot: async () => ({ Header: { Type: 36 }, Body: [] }),
        }),
        startSdkFeed: async () => {
          throw new Error('sdk-down');
        },
      }),
    );
    now = 0;
    let runtime: Awaited<ReturnType<typeof runLsportsShadowBridge>> | null = null;
    try {
      runtime = await runLsportsShadowBridge({ ...ENV, LSPORTS_TRANSPORT: 'direct' }, {
        listenHttp: false,
        distributionPollMs: 0,
        startDistribution: async () => {},
        limiter: new LsportsSnapshotRateLimiter(() => now),
        connect: async () => new EventEmitter() as never,
        openChannel: async () => ({ cancel: async () => {}, ack() {} }) as never,
        checkQueue: async () => {},
        consume: async () => ({ consumerTag: 'direct-fallback' }),
        createIo: () => ({
          sleep: async (ms) => {
            now += ms;
          },
          fetchSnapshot: async () => ({ Header: { Type: 36 }, Body: [] }),
        }),
      });
      assert.equal(currentCanonicalWriter('inplay'), 'direct');
      assert.equal(runtime.started(), true);
    } finally {
      await runtime?.stop();
    }
  });

  it('exposes sanitized SDK diagnostics on /health without secrets or betting', () => {
    resetSdkShadowsForTests();
    sdkShadowFor('inplay').observe(type31([20003734]));
    const store = new LsportsInPlayStore();
    store.ingestHeartbeat({ Header: { Type: 32, ServerTimestamp: 1 } }, 1);
    const payload = buildLsportsBrowserPayload(store, 1);
    let body = '';
    const req = Object.assign(new EventEmitter(), { url: '/health', method: 'GET', headers: {} });
    const res = {
      statusCode: 0,
      setHeader() {},
      end(value?: string) {
        body = value ?? '';
      },
    };
    handleLsportsShadowRequest(
      req as never,
      res as never,
      () => payload,
      undefined,
      resolveLsportsHttpOptions({ LSPORTS_WORKER_MODE: 'remote' }),
    );
    const health = JSON.parse(body) as {
      sdk?: { package?: string; writer?: { inplay?: string | null } };
    };
    assert.equal(health.sdk?.package, 'trade360-nodejs-sdk');
    assert.equal(body.includes('shared-secret'), false);
    assert.equal(body.includes('password'), false);
    const gate = readFileSync(join(root, 'src/lib/playerMoneyGate.ts'), 'utf8');
    assert.match(gate, /CANONICAL_SPORTS_BET_ENABLED = false/);
    const diag = buildSdkHealthDiagnostics();
    assert.equal(diag.rmqConsumeInShadow, false);
    assert.equal(diag.fixtureOrdering.autoOnStartup, false);
    assert.equal(diag.inplay.keepAlive.probeFixtureInKeepAlive, true);
  });
});
