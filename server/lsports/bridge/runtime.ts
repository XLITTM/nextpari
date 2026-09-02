import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import { publicLsportsConfig, resolveLsportsRmqConfig, type LsportsRmqConfig } from '../config.js';
import { startDistributionAcceptingActive } from '../distribution.js';
import { summarizeLsportsMessage } from '../probe.js';
import {
  closeLsportsRmq,
  connectLsportsRmqWithRetry,
  openLsportsChannel,
} from '../rmq.js';
import { LsportsRecoveryCoordinator } from '../state/coordinator.js';
import { LsportsSnapshotRateLimiter } from '../state/rateLimit.js';
import { LsportsRecoveryBuffer } from '../state/recovery.js';
import { LsportsInPlayStore } from '../state/store.js';
import {
  createLsportsShadowHttpServer,
  resolveLsportsHttpOptions,
  type LsportsHttpOptions,
} from './http.js';
import { createLsportsRecoveryIo } from './io.js';
import type { LsportsBrowserFeed } from './payload.js';
import { LsportsDisplayBridge, LSPORTS_SHADOW_HEALTH_POLL_MS } from './publisher.js';
import {
  LSPORTS_DISTRIBUTION_STATUS_POLL_MS,
  LSPORTS_QUEUE_DEPTH_WARNING,
  pollInPlayDistributionStatus,
  shouldWarnQueueDepth,
  type LsportsDistributionSnapshot,
} from './status.js';

const PREFETCH = 5;

export class LsportsShadowAlreadyRunningError extends Error {
  constructor() {
    super('LSPORTS_SHADOW_ALREADY_RUNNING');
    this.name = 'LsportsShadowAlreadyRunningError';
  }
}

export interface LsportsShadowBridgeDeps {
  connect?: (config: LsportsRmqConfig) => Promise<ChannelModel>;
  openChannel?: (connection: ChannelModel, prefetch: number) => Promise<Channel>;
  checkQueue?: (channel: Channel, queue: string) => Promise<void>;
  consume?: (
    channel: Channel,
    queue: string,
    onMessage: (message: ConsumeMessage | null) => void,
  ) => Promise<{ consumerTag: string }>;
  createIo?: typeof createLsportsRecoveryIo;
  startDistribution?: () => Promise<void>;
  pollDistributionStatus?: () => Promise<LsportsDistributionSnapshot>;
  listenHttp?: boolean;
  sleep?: (ms: number) => Promise<void>;
  limiter?: LsportsSnapshotRateLimiter;
  distributionPollMs?: number;
  httpOptions?: LsportsHttpOptions;
  onFatal?: (error: unknown) => void;
  log?: (parts: Record<string, string | number | boolean | null | undefined>) => void;
  warn?: (parts: Record<string, string | number | boolean | null | undefined>) => void;
}

export interface LsportsShadowRuntime {
  stop: () => Promise<void>;
  consumerCount: () => number;
  started: () => boolean;
  isBuffering: () => boolean;
  getPayload: () => LsportsBrowserFeed;
  noteDistributionStatus: (snapshot: LsportsDistributionSnapshot) => LsportsBrowserFeed;
}

let activeRuntime: LsportsShadowRuntime | null = null;

export function isLsportsShadowRunning(): boolean {
  return activeRuntime != null;
}

export function resetLsportsShadowRuntimeForTests(): void {
  activeRuntime = null;
}

function logShadow(parts: Record<string, string | number | boolean | null | undefined>): void {
  const body = Object.entries(parts)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  console.log(`[lsports] ${body}`);
}

function warnShadow(parts: Record<string, string | number | boolean | null | undefined>): void {
  const body = Object.entries(parts)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  console.warn(`[lsports] WARNING ${body}`);
}

export async function runLsportsShadowBridge(
  env: NodeJS.ProcessEnv = process.env,
  deps: LsportsShadowBridgeDeps = {},
): Promise<LsportsShadowRuntime> {
  if (activeRuntime) throw new LsportsShadowAlreadyRunningError();

  const config = resolveLsportsRmqConfig('inplay', env);
  const published = publicLsportsConfig(config);
  const store = new LsportsInPlayStore();
  const buffer = new LsportsRecoveryBuffer(store);
  const limiter = deps.limiter ?? new LsportsSnapshotRateLimiter();
  const coordinator = new LsportsRecoveryCoordinator({
    store,
    buffer,
    limiter,
    io: (deps.createIo ?? createLsportsRecoveryIo)(env),
  });
  const bridge = new LsportsDisplayBridge({ store, coordinator });
  const log = deps.log ?? logShadow;
  const warn = deps.warn ?? warnShadow;

  let connection: ChannelModel | null = null;
  let channel: Channel | null = null;
  let consumerTag: string | null = null;
  let consumers = 0;
  let healthTimer: ReturnType<typeof setInterval> | null = null;
  let statusTimer: ReturnType<typeof setInterval> | null = null;
  let server: ReturnType<typeof createLsportsShadowHttpServer> | null = null;
  let started = false;
  let stopping = false;

  const applyStatus = (snapshot: LsportsDistributionSnapshot) => {
    const payload = bridge.noteDistributionStatus(snapshot);
    log({
      action: 'distribution-status',
      active: snapshot.distributionActive,
      consumers: snapshot.consumerCount,
      queue: snapshot.numberMessagesInQueue,
      mps: snapshot.messagesPerSecond,
      health: payload.health,
      heartbeat: payload.diagnostics.lastHeartbeatAt,
    });
    const queueWarn = shouldWarnQueueDepth(snapshot.numberMessagesInQueue);
    if (queueWarn) {
      warn({
        queue: snapshot.numberMessagesInQueue,
        threshold: LSPORTS_QUEUE_DEPTH_WARNING,
      });
    }
    if (snapshot.distributionActive === false) {
      warn({
        action: 'distribution-disabled',
        package: published.packageId,
        health: payload.health,
      });
    }
    return payload;
  };

  const pollStatus = async () => {
    const poll = deps.pollDistributionStatus
      ?? (() => pollInPlayDistributionStatus(env, { log, verbose: false }));
    try {
      applyStatus(await poll());
    } catch {
      log({ action: 'distribution-status-error' });
    }
  };

  const stop = async () => {
    if (stopping) return;
    stopping = true;
    if (healthTimer) {
      clearInterval(healthTimer);
      healthTimer = null;
    }
    if (statusTimer) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
    if (channel && consumerTag) {
      try {
        await channel.cancel(consumerTag);
      } catch {
        // already closed
      }
    }
    if (server) {
      await new Promise<void>((resolve) => {
        server?.close(() => resolve());
      });
      server = null;
    }
    await closeLsportsRmq(channel, connection);
    channel = null;
    connection = null;
    consumerTag = null;
    consumers = 0;
    started = false;
    if (activeRuntime?.stop === stop) activeRuntime = null;
  };

  const runtime: LsportsShadowRuntime = {
    stop,
    consumerCount: () => consumers,
    started: () => started,
    isBuffering: () => buffer.isBuffering(),
    getPayload: () => bridge.getPayload(),
    noteDistributionStatus: applyStatus,
  };
  activeRuntime = runtime;

  try {
    await (deps.startDistribution ?? (() => startDistributionAcceptingActive('inplay', env)))();

    buffer.beginBuffering();
    const connect = deps.connect
      ?? ((cfg: LsportsRmqConfig) => connectLsportsRmqWithRetry(cfg, { sleep: deps.sleep }));
    const openChannel = deps.openChannel ?? openLsportsChannel;

    const onMessage = (message: ConsumeMessage | null) => {
      if (!message || !channel) return;
      try {
        const { json } = summarizeLsportsMessage('inplay', message);
        if (json && typeof json === 'object') {
          store.noteRmqTransport('parsed');
          bridge.handleRmq(json);
        } else {
          store.noteRmqTransport('parse-failed');
        }
        channel.ack(message);
      } catch {
        store.noteRmqTransport('parse-failed');
        channel.ack(message);
      }
    };

    const beginConsume = async (nextConnection: ChannelModel) => {
      connection = nextConnection;
      channel = await openChannel(connection, PREFETCH);
      if (deps.checkQueue) await deps.checkQueue(channel, config.queue);
      else await channel.checkQueue(config.queue);
      const consumed = deps.consume
        ? await deps.consume(channel, config.queue, onMessage)
        : await channel.consume(config.queue, onMessage);
      consumerTag = consumed.consumerTag;
      consumers = 1;
      const emitter = connection as unknown as { on?: (event: string, handler: () => void) => void };
      emitter.on?.('close', () => {
        if (stopping) return;
        void reconnectRmq();
      });
    };

    let reconnecting = false;
    const reconnectRmq = async () => {
      if (stopping || reconnecting) return;
      reconnecting = true;
      log({ action: 'rmq-reconnect' });
      try {
        if (channel && consumerTag) {
          try {
            await channel.cancel(consumerTag);
          } catch {
            // already closed
          }
        }
        await closeLsportsRmq(channel, connection);
        channel = null;
        connection = null;
        consumerTag = null;
        consumers = 0;
        await beginConsume(await connect(config));
        log({ action: 'rmq-reconnect-ok', consumers });
      } catch (error) {
        log({ action: 'rmq-reconnect-failed' });
        await stop();
        deps.onFatal?.(error);
      } finally {
        reconnecting = false;
      }
    };

    await beginConsume(await connect(config));

    log({
      action: 'shadow-rmq',
      host: published.host,
      vhost: published.vhost,
      package: published.packageId,
      queue: published.queue,
      buffering: buffer.isBuffering(),
    });
    await coordinator.runColdStart();
    bridge.markRecoveryComplete();
    log({
      action: 'shadow-live',
      mode: coordinator.getMode(),
      health: store.feedHealth(),
      fixtures: store.metrics().fixtureCount,
    });

    healthTimer = setInterval(() => bridge.refreshHealth(), LSPORTS_SHADOW_HEALTH_POLL_MS);
    const pollMs = deps.distributionPollMs ?? LSPORTS_DISTRIBUTION_STATUS_POLL_MS;
    if (pollMs > 0) {
      void pollStatus();
      statusTimer = setInterval(() => {
        void pollStatus();
      }, pollMs);
    }
    if (deps.listenHttp !== false) {
      const httpOptions = deps.httpOptions ?? resolveLsportsHttpOptions(env);
      server = createLsportsShadowHttpServer(
        () => bridge.getPayload(),
        (listener) => bridge.subscribe(listener),
        httpOptions,
      );
      await new Promise<void>((resolve, reject) => {
        server?.once('error', reject);
        server?.listen(httpOptions.port, httpOptions.host, resolve);
      });
      log({
        action: 'shadow-http',
        http: `${httpOptions.host}:${httpOptions.port}`,
        mode: httpOptions.mode,
      });
    }
    started = true;
    return runtime;
  } catch (error) {
    await stop();
    throw error;
  }
}
