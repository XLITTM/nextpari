import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import { publicLsportsConfig, resolveLsportsRmqConfig, type LsportsRmqConfig } from '../config.js';
import { startDistributionAcceptingActive } from '../distribution.js';
import { summarizeLsportsMessage } from '../probe.js';
import {
  closeLsportsRmq,
  connectLsportsRmqWithRetry,
  openLsportsChannel,
} from '../rmq.js';
import { createLsportsPrematchRecoveryIo } from '../bridge/io.js';
import { readHeader } from '../state/parse.js';
import { readSnapshotFixtures } from '../snapshot.js';
import {
  LSPORTS_DISTRIBUTION_STATUS_POLL_MS,
  LSPORTS_QUEUE_DEPTH_WARNING,
  pollPrematchDistributionStatus,
  shouldWarnQueueDepth,
  type LsportsDistributionSnapshot,
} from '../bridge/status.js';
import { LsportsRecoveryCoordinator } from '../state/coordinator.js';
import { planPrematchSnapshotRequests } from '../state/plan.js';
import { LsportsSnapshotRateLimiter } from '../state/rateLimit.js';
import { LsportsRecoveryBuffer } from '../state/recovery.js';
import { LsportsInPlayStore } from '../state/store.js';
import { lookupCanonicalQuoteRecord } from '../../sports/lsportsQuote.js';
import { dispatchSettlementNotices } from '../../sports/settlementDispatch.js';
import { startLsportsSdkFeed } from '../sdk/feed.js';
import { resolveLsportsTransport } from '../sdk/mode.js';
import { sdkShadowFor } from '../sdk/shadow.js';
import { claimCanonicalWriter, releaseCanonicalWriter } from '../sdk/writer.js';
import type { LsportsPrematchFeed, LsportsPrematchSnapshotDiag } from './payload.js';
import { LsportsPrematchDisplayBridge, LSPORTS_PREMATCH_HEALTH_POLL_MS } from './publisher.js';

/** Higher than InPlay (5) so Package 4352 can drain an accumulated queue without sharing that channel. */
const PREMATCH_PREFETCH = 50;

export class LsportsPrematchAlreadyRunningError extends Error {
  constructor() {
    super('LSPORTS_PREMATCH_ALREADY_RUNNING');
    this.name = 'LsportsPrematchAlreadyRunningError';
  }
}

export interface LsportsPrematchBridgeDeps {
  connect?: (config: LsportsRmqConfig) => Promise<ChannelModel>;
  openChannel?: (connection: ChannelModel, prefetch: number) => Promise<Channel>;
  checkQueue?: (channel: Channel, queue: string) => Promise<void>;
  consume?: (
    channel: Channel,
    queue: string,
    onMessage: (message: ConsumeMessage | null) => void,
  ) => Promise<{ consumerTag: string }>;
  createIo?: typeof createLsportsPrematchRecoveryIo;
  startDistribution?: () => Promise<void>;
  pollDistributionStatus?: () => Promise<LsportsDistributionSnapshot>;
  sleep?: (ms: number) => Promise<void>;
  limiter?: LsportsSnapshotRateLimiter;
  distributionPollMs?: number;
  onFatal?: (error: unknown) => void;
  log?: (parts: Record<string, string | number | boolean | null | undefined>) => void;
  warn?: (parts: Record<string, string | number | boolean | null | undefined>) => void;
  startSdkFeed?: (input: {
    onMessage: (payload: unknown) => void;
    onParseFailure: () => void;
  }) => Promise<{ stop: () => Promise<void> }>;
}

export interface LsportsPrematchRuntime {
  stop: () => Promise<void>;
  consumerCount: () => number;
  started: () => boolean;
  isBuffering: () => boolean;
  getPayload: () => LsportsPrematchFeed;
  lookupQuote: (query: Record<string, string>) => unknown;
  noteDistributionStatus: (snapshot: LsportsDistributionSnapshot) => LsportsPrematchFeed;
}

let activePrematchRuntime: LsportsPrematchRuntime | null = null;

export function isLsportsPrematchRunning(): boolean {
  return activePrematchRuntime != null;
}

export function resetLsportsPrematchRuntimeForTests(): void {
  activePrematchRuntime = null;
  releaseCanonicalWriter('prematch', 'direct');
  releaseCanonicalWriter('prematch', 'sdk');
}

function logPrematch(parts: Record<string, string | number | boolean | null | undefined>): void {
  const body = Object.entries(parts)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  console.log(`[lsports-prematch] ${body}`);
}

function warnPrematch(parts: Record<string, string | number | boolean | null | undefined>): void {
  const body = Object.entries(parts)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  console.warn(`[lsports-prematch] WARNING ${body}`);
}

export async function runLsportsPrematchBridge(
  env: NodeJS.ProcessEnv = process.env,
  deps: LsportsPrematchBridgeDeps = {},
): Promise<LsportsPrematchRuntime> {
  if (activePrematchRuntime) throw new LsportsPrematchAlreadyRunningError();

  const config = resolveLsportsRmqConfig('prematch', env);
  const published = publicLsportsConfig(config);
  const mode = resolveLsportsTransport(env);
  const store = new LsportsInPlayStore();
  const buffer = new LsportsRecoveryBuffer(store);
  const limiter = deps.limiter ?? new LsportsSnapshotRateLimiter();
  let lastSnapshot: LsportsPrematchSnapshotDiag | null = null;
  const innerIo = (deps.createIo ?? createLsportsPrematchRecoveryIo)(env);
  const coordinator = new LsportsRecoveryCoordinator({
    store,
    buffer,
    limiter,
    io: {
      sleep: innerIo.sleep,
      fetchSnapshot: async (item) => {
        const payload = await innerIo.fetchSnapshot(item);
        const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
        lastSnapshot = {
          endpoint: item.endpoint,
          headerType: readHeader(payload).type,
          fixtureCount: readSnapshotFixtures(payload).length,
          topLevelKeys: root ? Object.keys(root).slice(0, 8) : [],
        };
        logPrematch({
          action: 'prematch-snapshot-applied',
          endpoint: item.endpoint,
          fixtures: lastSnapshot.fixtureCount,
          headerType: lastSnapshot.headerType,
        });
        return payload;
      },
    },
    planSnapshots: planPrematchSnapshotRequests,
  });
  let lastMessageAt: number | null = null;
  let consumers = 0;
  const bridge = new LsportsPrematchDisplayBridge({
    store,
    coordinator,
    packageId: published.packageId,
    consumerConnected: () => consumers > 0,
    lastMessageAt: () => lastMessageAt,
    lastSnapshot: () => lastSnapshot,
  });
  const log = deps.log ?? logPrematch;
  const warn = deps.warn ?? warnPrematch;

  let connection: ChannelModel | null = null;
  let channel: Channel | null = null;
  let consumerTag: string | null = null;
  let healthTimer: ReturnType<typeof setInterval> | null = null;
  let statusTimer: ReturnType<typeof setInterval> | null = null;
  let started = false;
  let stopping = false;
  let sdkFeed: { stop: () => Promise<void> } | null = null;

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
    if (shouldWarnQueueDepth(snapshot.numberMessagesInQueue)) {
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
      ?? (() => pollPrematchDistributionStatus(env, { log, verbose: false }));
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
    await closeLsportsRmq(channel, connection);
    channel = null;
    connection = null;
    consumerTag = null;
    consumers = 0;
    started = false;
    if (sdkFeed) {
      try {
        await sdkFeed.stop();
      } catch {
        // already closed
      }
      sdkFeed = null;
    }
    releaseCanonicalWriter('prematch', mode.transport);
    if (activePrematchRuntime?.stop === stop) activePrematchRuntime = null;
  };

  const runtime: LsportsPrematchRuntime = {
    stop,
    consumerCount: () => consumers,
    started: () => started,
    isBuffering: () => buffer.isBuffering(),
    getPayload: () => bridge.getPayload(),
    lookupQuote: (query: Record<string, string>) => lookupCanonicalQuoteRecord(store, {
      ...query,
      feedType: query.feedType || 'prematch',
    }),
    noteDistributionStatus: applyStatus,
  };
  activePrematchRuntime = runtime;

  try {
    claimCanonicalWriter('prematch', mode.transport);
    await (deps.startDistribution ?? (() => startDistributionAcceptingActive('prematch', env)))();

    buffer.beginBuffering();
    const ingestJson = (json: unknown, parsed: boolean) => {
      lastMessageAt = Date.now();
      if (mode.shadow) {
        if (parsed && json && typeof json === 'object') sdkShadowFor('prematch').observe(json);
        else sdkShadowFor('prematch').noteParseFailure();
      }
      if (!parsed || !json || typeof json !== 'object') {
        store.noteRmqTransport('parse-failed');
        return;
      }
      store.noteRmqTransport('parsed');
      bridge.handleRmq(json);
      const notices = store.takeSettlementNotices();
      if (notices.length) {
        void dispatchSettlementNotices(notices, env, { log });
      }
    };
    const connect = deps.connect
      ?? ((cfg: LsportsRmqConfig) => connectLsportsRmqWithRetry(cfg, { sleep: deps.sleep }));
    const openChannel = deps.openChannel ?? openLsportsChannel;

    const onMessage = (message: ConsumeMessage | null) => {
      if (!message || !channel) return;
      try {
        const { json } = summarizeLsportsMessage('prematch', message);
        ingestJson(json, Boolean(json && typeof json === 'object'));
        channel.ack(message);
      } catch {
        ingestJson(null, false);
        channel.ack(message);
      }
    };

    const beginConsume = async (nextConnection: ChannelModel) => {
      connection = nextConnection;
      channel = await openChannel(connection, PREMATCH_PREFETCH);
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
      if (stopping || reconnecting || mode.transport === 'sdk') return;
      reconnecting = true;
      log({ action: 'rmq-reconnect' });
      sdkShadowFor('prematch').noteReconnect();
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

    if (mode.transport === 'sdk') {
      sdkShadowFor('prematch').markConnection('sdk-feed');
      const startFeed = deps.startSdkFeed ?? ((input) => startLsportsSdkFeed({
        flow: 'prematch',
        env,
        prefetch: PREMATCH_PREFETCH,
        onMessage: input.onMessage,
        onParseFailure: input.onParseFailure,
      }));
      sdkFeed = await startFeed({
        onMessage: (payload) => ingestJson(payload, true),
        onParseFailure: () => ingestJson(null, false),
      });
      consumers = 1;
      log({
        action: 'sdk-feed',
        flow: 'prematch',
        package: published.packageId,
        buffering: buffer.isBuffering(),
      });
    } else {
      if (mode.shadow) sdkShadowFor('prematch').markConnection('in-process-shadow');
      await beginConsume(await connect(config));
      log({
        action: 'prematch-rmq',
        host: published.host,
        vhost: published.vhost,
        package: published.packageId,
        queue: published.queue,
        buffering: buffer.isBuffering(),
      });
    }
    await coordinator.runColdStart();
    bridge.markRecoveryComplete();
    log({
      action: 'prematch-live',
      mode: coordinator.getMode(),
      health: store.feedHealth(),
      fixtures: store.metrics().fixtureCount,
    });

    healthTimer = setInterval(() => bridge.refreshHealth(), LSPORTS_PREMATCH_HEALTH_POLL_MS);
    healthTimer.unref();
    const pollMs = deps.distributionPollMs ?? LSPORTS_DISTRIBUTION_STATUS_POLL_MS;
    if (pollMs > 0) {
      void pollStatus();
      statusTimer = setInterval(() => {
        void pollStatus();
      }, pollMs);
      statusTimer.unref();
    }
    started = true;
    return runtime;
  } catch (error) {
    await stop();
    throw error;
  }
}
