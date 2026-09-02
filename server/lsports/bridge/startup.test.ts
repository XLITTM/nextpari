import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  connectLsportsRmqWithRetry,
  LSPORTS_RMQ_STARTUP_RETRY_DELAYS_MS,
  LsportsRmqError,
} from '../rmq.js';
import {
  fetchInPlaySnapshotBody,
  LSPORTS_SNAPSHOT_RETRY_DELAYS_MS,
  readRetryAfterMs,
  snapshot429WaitMs,
} from '../snapshot.js';
import { LsportsSnapshotRateLimiter } from '../state/rateLimit.js';
import {
  resetLsportsShadowRuntimeForTests,
  runLsportsShadowBridge,
  LsportsShadowAlreadyRunningError,
} from './runtime.js';

const ENV = {
  LSPORTS_RMQ_USERNAME: 'shared-user',
  LSPORTS_RMQ_PASSWORD: 'shared-secret',
};

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name: string) {
        return headers?.[name.toLowerCase()] ?? headers?.[name] ?? null;
      },
    },
    async text() {
      return JSON.stringify(body);
    },
  } as Response;
}

describe('lsports snapshot 429 retry', () => {
  it('honors Retry-After on HTTP 429', async () => {
    assert.equal(readRetryAfterMs('3'), 3_000);
    assert.equal(snapshot429WaitMs(0, '5'), 5_000);
    const waits: number[] = [];
    let calls = 0;
    const logs: Array<Record<string, unknown>> = [];
    const result = await fetchInPlaySnapshotBody(
      { endpoint: 'GetFixtures', unfiltered: true },
      ENV,
      {
        fetchImpl: async () => {
          calls += 1;
          if (calls === 1) return jsonResponse(429, { error: 'rate' }, { 'retry-after': '2' });
          return jsonResponse(200, { Header: { Type: 36 }, Body: [] });
        },
        sleep: async (ms) => {
          waits.push(ms);
        },
        log: (parts) => {
          logs.push(parts);
        },
      },
    );
    assert.equal(calls, 2);
    assert.deepEqual(waits, [2_000]);
    assert.equal((result as { Header?: { Type?: number } }).Header?.Type, 36);
    assert.equal(JSON.stringify(logs).includes('shared-secret'), false);
    assert.equal(logs[0]?.http, 429);
    assert.equal(logs[0]?.endpoint, 'GetFixtures');
  });

  it('uses bounded 2s/4s/8s delays when Retry-After is absent', async () => {
    const waits: number[] = [];
    let calls = 0;
    await assert.rejects(
      () => fetchInPlaySnapshotBody(
        { endpoint: 'GetScores', unfiltered: true },
        ENV,
        {
          fetchImpl: async () => {
            calls += 1;
            return jsonResponse(429, { error: 'rate' });
          },
          sleep: async (ms) => {
            waits.push(ms);
          },
          log: () => {},
        },
      ),
      /LSPORTS_SNAPSHOT_HTTP_429/,
    );
    assert.equal(calls, 4);
    assert.deepEqual(waits, [...LSPORTS_SNAPSHOT_RETRY_DELAYS_MS]);
  });
});

describe('lsports RMQ startup retry', () => {
  const config = {
    flow: 'inplay' as const,
    host: 'stm-inplay.lsports.eu',
    port: 5672,
    vhost: 'StmInPlay',
    packageId: 4351,
    queue: '_4351_',
    heartbeat: 30,
    connectionTimeoutMs: 10_000,
    username: 'shared-user',
    password: 'shared-secret',
    ssl: false as const,
  };

  it('retries a transient AUTH_REFUSED then succeeds', async () => {
    const waits: number[] = [];
    let calls = 0;
    const logs: Array<Record<string, unknown>> = [];
    const connection = { fake: true };
    const result = await connectLsportsRmqWithRetry(config, {
      connect: async () => {
        calls += 1;
        if (calls === 1) throw new LsportsRmqError('AUTH_REFUSED', '403 ACCESS-REFUSED login');
        return connection as never;
      },
      sleep: async (ms) => {
        waits.push(ms);
      },
      log: (parts) => {
        logs.push(parts);
      },
    });
    assert.equal(result, connection);
    assert.equal(calls, 2);
    assert.deepEqual(waits, [2_000]);
    assert.equal(logs[0]?.code, 'AUTH_REFUSED');
    assert.equal(JSON.stringify(logs).includes('shared-secret'), false);
  });

  it('exhausts bounded RMQ startup retries', async () => {
    const waits: number[] = [];
    let calls = 0;
    await assert.rejects(
      () => connectLsportsRmqWithRetry(config, {
        connect: async () => {
          calls += 1;
          throw new LsportsRmqError('AUTH_REFUSED', '403 ACCESS-REFUSED login');
        },
        sleep: async (ms) => {
          waits.push(ms);
        },
        log: () => {},
      }),
      (error: unknown) => error instanceof LsportsRmqError && error.code === 'AUTH_REFUSED',
    );
    assert.equal(calls, 4);
    assert.deepEqual(waits, [...LSPORTS_RMQ_STARTUP_RETRY_DELAYS_MS]);
  });
});

describe('lsports shadow lifecycle', () => {
  const env = { ...ENV };

  function fakeChannel() {
    return {
      cancel: async () => {},
      ack() {},
    };
  }

  async function start(
    overrides: Parameters<typeof runLsportsShadowBridge>[1] = {},
    hooks: { onSnapshot?: () => void } = {},
  ) {
    let now = 0;
    return runLsportsShadowBridge(env, {
      listenHttp: false,
      distributionPollMs: 0,
      startDistribution: async () => {},
      limiter: new LsportsSnapshotRateLimiter(() => now),
      connect: async () => ({ fake: true }) as never,
      openChannel: async () => fakeChannel() as never,
      checkQueue: async () => {},
      consume: async () => ({ consumerTag: 'c1' }),
      createIo: () => ({
        sleep: async (ms) => {
          now += ms;
        },
        fetchSnapshot: async () => {
          hooks.onSnapshot?.();
          return { Header: { Type: 36 }, Body: [] };
        },
      }),
      ...overrides,
    });
  }

  it('starts Distribution before RMQ connect and snapshots', async () => {
    resetLsportsShadowRuntimeForTests();
    const events: string[] = [];
    const runtime = await start({
      startDistribution: async () => {
        events.push('start');
      },
      connect: async () => {
        events.push('connect');
        return { fake: true } as never;
      },
      consume: async () => {
        events.push('consume');
        return { consumerTag: 'c1' };
      },
    }, {
      onSnapshot: () => {
        events.push('snapshot');
      },
    });
    assert.deepEqual(events.slice(0, 4), ['start', 'connect', 'consume', 'snapshot']);
    assert.equal(events.filter((event) => event === 'start').length, 1);
    await runtime.stop();
  });

  it('connects RMQ after a successful Start', async () => {
    resetLsportsShadowRuntimeForTests();
    const events: string[] = [];
    const runtime = await start({
      startDistribution: async () => {
        events.push('start');
      },
      connect: async () => {
        events.push('connect');
        return { fake: true } as never;
      },
    });
    assert.deepEqual(events, ['start', 'connect']);
    await runtime.stop();
  });

  it('reconnects a single consumer after an unexpected RMQ close', async () => {
    resetLsportsShadowRuntimeForTests();
    const { EventEmitter } = await import('node:events');
    const connection = new EventEmitter();
    let consumes = 0;
    const runtime = await start({
      connect: async () => connection as never,
      consume: async () => {
        consumes += 1;
        return { consumerTag: `c${consumes}` };
      },
    });
    assert.equal(runtime.consumerCount(), 1);
    connection.emit('close');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(consumes, 2);
    assert.equal(runtime.consumerCount(), 1);
    await runtime.stop();
  });

  it('starts only one consumer and rejects a second lifecycle', async () => {
    resetLsportsShadowRuntimeForTests();
    const first = await start();
    assert.equal(first.started(), true);
    assert.equal(first.consumerCount(), 1);
    await assert.rejects(() => start(), (error: unknown) => error instanceof LsportsShadowAlreadyRunningError);
    await first.stop();
    assert.equal(first.started(), false);
    assert.equal(first.consumerCount(), 0);
  });

  it('closes RMQ and clears the singleton on stop and on startup failure', async () => {
    resetLsportsShadowRuntimeForTests();
    let closed = 0;
    const runtime = await start({
      openChannel: async () => ({
        cancel: async () => {
          closed += 1;
        },
        ack() {},
      }) as never,
    });
    await runtime.stop();
    await runtime.stop();
    assert.equal(closed, 1);
    resetLsportsShadowRuntimeForTests();
    await assert.rejects(
      () => start({
        connect: async () => {
          throw new LsportsRmqError('AUTH_REFUSED', '403 ACCESS-REFUSED login');
        },
      }),
    );
    const second = await start();
    assert.equal(second.started(), true);
    await second.stop();
  });

  it('exposes sanitized distribution status and warns at queue depth 500', async () => {
    resetLsportsShadowRuntimeForTests();
    const warnings: Array<Record<string, unknown>> = [];
    const logs: Array<Record<string, unknown>> = [];
    const runtime = await start({
      warn: (parts) => {
        warnings.push(parts);
      },
      log: (parts) => {
        logs.push(parts);
      },
    });
    const payload = runtime.noteDistributionStatus({
      distributionActive: true,
      consumerCount: 1,
      numberMessagesInQueue: 500,
      messagesPerSecond: 12,
      polledAt: 1,
    });
    assert.equal(payload.diagnostics.distributionActive, true);
    assert.equal(payload.diagnostics.consumerCount, 1);
    assert.equal(payload.diagnostics.numberMessagesInQueue, 500);
    assert.equal(payload.diagnostics.messagesPerSecond, 12);
    assert.equal(payload.diagnostics.queueWarning, true);
    assert.equal(warnings.some((row) => row.queue === 500 && row.threshold === 500), true);
    assert.equal(JSON.stringify({ payload, warnings, logs }).includes('shared-secret'), false);
    await runtime.stop();
  });

  it('locks LSports odds when distribution is disabled', async () => {
    resetLsportsShadowRuntimeForTests();
    const warnings: Array<Record<string, unknown>> = [];
    const runtime = await start({
      warn: (parts) => {
        warnings.push(parts);
      },
    });
    const payload = runtime.noteDistributionStatus({
      distributionActive: false,
      consumerCount: 0,
      numberMessagesInQueue: 0,
      messagesPerSecond: 0,
      polledAt: 1,
    });
    assert.equal(payload.health, 'STALE');
    assert.equal(payload.diagnostics.distributionActive, false);
    assert.equal(payload.diagnostics.health, 'STALE');
    assert.ok(payload.matches.every((row) => (row.markets[0]?.entries.length ?? 0) === 0));
    assert.equal(JSON.stringify(payload).includes('2.1'), false);
    assert.equal(warnings.some((row) => row.action === 'distribution-disabled'), true);
    await runtime.stop();
  });
});
