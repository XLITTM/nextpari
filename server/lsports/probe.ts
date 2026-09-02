import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Message } from 'amqplib';
import {
  type LsportsFlow,
  publicLsportsConfig,
  resolveLsportsRmqConfig,
} from './config.js';
import { containsSecret, serializeDiagnostic } from './redact.js';
import {
  closeLsportsRmq,
  connectLsportsRmq,
  openLsportsChannel,
  wrapRmqError,
} from './rmq.js';

export const LSPORTS_PROBE_TIMEOUT_MS = 60_000;
export const LSPORTS_PROBE_PREFETCH = 5;
export const LSPORTS_PROBE_POLL_MS = 500;
export const LSPORTS_OBSERVE_TIMEOUT_MS = 120_000;
export const LSPORTS_OBSERVE_MAX_MESSAGES = 100;
export const LSPORTS_TYPE_CAPTURE_TIMEOUT_MS = 60_000;
export const LSPORTS_TYPE_CAPTURE_MAX_MESSAGES = 100;

export type ProbeBudget = 'continue' | 'samples-captured' | 'timeout';
export type ObserveBudget = 'continue' | 'samples-captured' | 'timeout' | 'max-messages';
export type LsportsSampleKind = 'livescore' | 'markets' | 'fixture';
export type LsportsObserveSampleName =
  | 'inplay-fixture-sample.json'
  | 'inplay-market-update-1.json'
  | 'inplay-market-update-2.json'
  | 'inplay-same-fixture-livescore.json'
  | 'inplay-type31-sample.json'
  | 'inplay-type35-sample.json';

export interface LsportsMessageSummary {
  flow: LsportsFlow;
  receivedAt: string;
  byteLength: number;
  contentType: string | null;
  routingKey: string | null;
  headerKeys: string[];
  topLevelKeys: string[];
  messageType: string | number | null;
  fixtureId: string | number | null;
  packageId: string | number | null;
  jsonParsed: boolean;
}

export interface LsportsProbeResult {
  flow: LsportsFlow;
  host: string;
  vhost: string;
  packageId: number;
  queue: string;
  received: number;
  summaries: LsportsMessageSummary[];
  samplePaths: Partial<Record<LsportsSampleKind, string>>;
  stopped: Exclude<ProbeBudget, 'continue'>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function probeBudget(
  requiredSamplesCaptured: boolean,
  startedAt: number,
  now: number,
  timeoutMs = LSPORTS_PROBE_TIMEOUT_MS,
): ProbeBudget {
  if (requiredSamplesCaptured) return 'samples-captured';
  if (now - startedAt >= timeoutMs) return 'timeout';
  return 'continue';
}

export function sampleKindForMessageType(messageType: string | number | null): LsportsSampleKind | null {
  const type = typeof messageType === 'number' ? messageType : Number(messageType);
  if (type === 1) return 'fixture';
  if (type === 2) return 'livescore';
  if (type === 3) return 'markets';
  return null;
}

export function observeBudget(input: {
  received: number;
  startedAt: number;
  now: number;
  hasFixture: boolean;
  hasMarketPair: boolean;
  hasSameFixtureLivescore: boolean;
  timeoutMs?: number;
  maxMessages?: number;
}): ObserveBudget {
  if (input.hasFixture && input.hasMarketPair && input.hasSameFixtureLivescore) {
    return 'samples-captured';
  }
  if (input.received >= (input.maxMessages ?? LSPORTS_OBSERVE_MAX_MESSAGES)) return 'max-messages';
  if (input.now - input.startedAt >= (input.timeoutMs ?? LSPORTS_OBSERVE_TIMEOUT_MS)) return 'timeout';
  return 'continue';
}

export function typeCaptureBudget(input: {
  requiredCaptured: boolean;
  received: number;
  startedAt: number;
  now: number;
  timeoutMs?: number;
  maxMessages?: number;
}): ObserveBudget {
  if (input.requiredCaptured) return 'samples-captured';
  if (input.received >= (input.maxMessages ?? LSPORTS_TYPE_CAPTURE_MAX_MESSAGES)) return 'max-messages';
  if (input.now - input.startedAt >= (input.timeoutMs ?? LSPORTS_TYPE_CAPTURE_TIMEOUT_MS)) return 'timeout';
  return 'continue';
}

export function typeSampleName(messageType: string | number | null): LsportsObserveSampleName | null {
  const type = typeof messageType === 'number' ? messageType : Number(messageType);
  if (type === 31) return 'inplay-type31-sample.json';
  if (type === 35) return 'inplay-type35-sample.json';
  return null;
}

export function readHeaderServerTimestamp(json: unknown): number | null {
  const root = asRecord(json);
  const header = asRecord(root?.Header) ?? asRecord(root?.header);
  const value = header?.ServerTimestamp ?? header?.serverTimestamp;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function scalar(value: unknown): string | number | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function pickField(record: Record<string, unknown> | null, keys: readonly string[]): string | number | null {
  if (!record) return null;
  for (const key of keys) {
    const found = scalar(record[key]);
    if (found != null) return found;
  }
  return null;
}

export function summarizeLsportsMessage(flow: LsportsFlow, message: Message): {
  summary: LsportsMessageSummary;
  json: unknown;
  raw: Buffer;
} {
  const raw = message.content;
  let json: unknown = null;
  let parsed = false;
  try {
    json = JSON.parse(raw.toString('utf8'));
    parsed = json != null && typeof json === 'object';
  } catch {
    json = null;
  }

  const root = asRecord(json);
  const header = asRecord(root?.Header) ?? asRecord(root?.header);
  const body = asRecord(root?.Body) ?? asRecord(root?.body);
  const firstEvent = Array.isArray(body?.Events) ? asRecord(body.Events[0]) : null;

  return {
    summary: {
      flow,
      receivedAt: new Date().toISOString(),
      byteLength: raw.byteLength,
      contentType: message.properties.contentType ?? null,
      routingKey: message.fields.routingKey || null,
      headerKeys: Object.keys(message.properties.headers ?? {}),
      topLevelKeys: root ? Object.keys(root) : [],
      messageType: pickField(header, ['Type', 'type', 'MessageType'])
        ?? pickField(root, ['Type', 'type', 'MessageType']),
      fixtureId: pickField(root, ['FixtureId', 'fixtureId', 'FixtureID', 'fixture_id'])
        ?? pickField(header, ['FixtureId', 'fixtureId', 'FixtureID'])
        ?? pickField(firstEvent, ['FixtureId', 'fixtureId']),
      packageId: pickField(root, ['PackageId', 'packageId'])
        ?? pickField(header, ['PackageId', 'packageId']),
      jsonParsed: parsed,
    },
    json,
    raw,
  };
}

export function samplePayloadPath(
  flow: LsportsFlow,
  kind: LsportsSampleKind,
  cwd = process.cwd(),
): string {
  return join(cwd, '.tmp', 'lsports', `${flow}-${kind}-sample.json`);
}

export function formatSampleJson(json: unknown): string {
  return `${JSON.stringify(json, null, 2)}\n`;
}

function writeTypedSample(
  flow: LsportsFlow,
  kind: LsportsSampleKind,
  json: unknown,
  secrets: readonly string[],
): string {
  return writeSampleFile(samplePayloadPath(flow, kind), json, secrets);
}

export function observationSamplePath(name: LsportsObserveSampleName, cwd = process.cwd()): string {
  return join(cwd, '.tmp', 'lsports', name);
}

function writeSampleFile(path: string, json: unknown, secrets: readonly string[]): string {
  const pretty = formatSampleJson(json);
  if (containsSecret(pretty, secrets)) {
    throw new Error('LSPORTS_SAMPLE_LEAK');
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, pretty, 'utf8');
  return path;
}

export interface ObservedMarket {
  id: string | number | null;
  name: string | number | null;
  betIds: Array<string | number>;
}

export function readObservedMarkets(json: unknown): {
  fixtureId: string | number | null;
  markets: ObservedMarket[];
} {
  const root = asRecord(json);
  const body = asRecord(root?.Body) ?? asRecord(root?.body);
  const firstEvent = Array.isArray(body?.Events) ? asRecord(body.Events[0]) : null;
  const fixtureId = pickField(firstEvent, ['FixtureId', 'fixtureId']);
  const rawMarkets = firstEvent?.Markets;
  const markets: ObservedMarket[] = [];
  if (Array.isArray(rawMarkets)) {
    for (const entry of rawMarkets) {
      const market = asRecord(entry);
      if (!market) continue;
      const bets = Array.isArray(market.Bets) ? market.Bets : [];
      markets.push({
        id: pickField(market, ['Id', 'id']),
        name: pickField(market, ['Name', 'name']),
        betIds: bets
          .map((bet) => pickField(asRecord(bet), ['Id', 'id']))
          .filter((id): id is string | number => id != null),
      });
    }
  }
  return { fixtureId, markets };
}

export function type3MatchesTrackedMarket(
  json: unknown,
  fixtureId: string | number,
  marketId: string | number,
): boolean {
  const observed = readObservedMarkets(json);
  return String(observed.fixtureId) === String(fixtureId)
    && observed.markets.some((market) => String(market.id) === String(marketId));
}

function logLine(parts: Record<string, string | number | null | undefined>): void {
  const body = Object.entries(parts)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  console.log(`[lsports] ${body}`);
}

export async function runLsportsProbe(flow: LsportsFlow, env: NodeJS.ProcessEnv = process.env): Promise<LsportsProbeResult> {
  const config = resolveLsportsRmqConfig(flow, env);
  const published = publicLsportsConfig(config);
  const secrets = [config.password, config.username];
  const banner = serializeDiagnostic(published);
  if (containsSecret(banner, secrets)) {
    throw new Error('LSPORTS_DIAGNOSTIC_LEAK');
  }

  logLine({ flow: published.flow });
  logLine({ host: published.host });
  logLine({ vhost: published.vhost });
  logLine({ package: published.packageId });
  logLine({ queue: published.queue });

  let connection = null;
  let channel = null;
  const summaries: LsportsMessageSummary[] = [];
  const samplePaths: Partial<Record<LsportsSampleKind, string>> = {};
  let stopped: Exclude<ProbeBudget, 'continue'> = 'timeout';

  try {
    connection = await connectLsportsRmq(config);
    channel = await openLsportsChannel(connection, LSPORTS_PROBE_PREFETCH);
    try {
      await channel.checkQueue(config.queue);
    } catch (error) {
      throw wrapRmqError(error, 'queue check failed');
    }
    logLine({ connected: 'yes' });

    const startedAt = Date.now();
    while (true) {
      const budget = probeBudget(
        Boolean(samplePaths.livescore && samplePaths.markets),
        startedAt,
        Date.now(),
      );
      if (budget !== 'continue') {
        stopped = budget;
        break;
      }
      const message = await channel.get(config.queue, { noAck: false });
      if (!message) {
        await sleep(LSPORTS_PROBE_POLL_MS);
        continue;
      }
      try {
        const { summary, json } = summarizeLsportsMessage(flow, message);
        summaries.push(summary);
        const kind = sampleKindForMessageType(summary.messageType);
        if (kind && !samplePaths[kind] && json != null && summary.jsonParsed) {
          samplePaths[kind] = writeTypedSample(flow, kind, json, secrets);
          logLine({
            captured: kind,
            type: summary.messageType,
            fixture: summary.fixtureId,
            path: samplePaths[kind],
          });
        }
        channel.ack(message);
        logLine({
          received: summaries.length,
          bytes: summary.byteLength,
          type: summary.messageType,
          fixture: summary.fixtureId,
        });
      } catch {
        // leave unacked so the broker can redeliver; probe will close shortly
      }
    }
  } catch (error) {
    const wrapped = wrapRmqError(error);
    logLine({ error: wrapped.code });
    throw wrapped;
  } finally {
    await closeLsportsRmq(channel, connection);
  }

  logLine({ received: summaries.length });
  logLine({ 'probe complete': stopped });
  return {
    flow,
    host: published.host,
    vhost: published.vhost,
    packageId: published.packageId,
    queue: published.queue,
    received: summaries.length,
    summaries,
    samplePaths,
    stopped,
  };
}

export interface LsportsObserveResult {
  flow: LsportsFlow;
  host: string;
  vhost: string;
  packageId: number;
  queue: string;
  received: number;
  summaries: LsportsMessageSummary[];
  samplePaths: Partial<Record<LsportsObserveSampleName, string>>;
  trackedFixtureId: string | number | null;
  trackedMarketId: string | number | null;
  stopped: Exclude<ObserveBudget, 'continue'>;
}

export async function runLsportsDeltaObserve(
  flow: LsportsFlow,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LsportsObserveResult> {
  if (flow !== 'inplay') {
    throw new Error('LSPORTS_OBSERVE_INPLAY_ONLY');
  }

  const config = resolveLsportsRmqConfig(flow, env);
  const published = publicLsportsConfig(config);
  const secrets = [config.password, config.username];
  const banner = serializeDiagnostic(published);
  if (containsSecret(banner, secrets)) {
    throw new Error('LSPORTS_DIAGNOSTIC_LEAK');
  }

  logLine({ action: 'delta-observe' });
  logLine({ flow: published.flow });
  logLine({ host: published.host });
  logLine({ vhost: published.vhost });
  logLine({ package: published.packageId });
  logLine({ queue: published.queue });

  let connection = null;
  let channel = null;
  const summaries: LsportsMessageSummary[] = [];
  const samplePaths: Partial<Record<LsportsObserveSampleName, string>> = {};
  let trackedFixtureId: string | number | null = null;
  let trackedMarketId: string | number | null = null;
  let stopped: Exclude<ObserveBudget, 'continue'> = 'timeout';

  try {
    connection = await connectLsportsRmq(config);
    channel = await openLsportsChannel(connection, LSPORTS_PROBE_PREFETCH);
    try {
      await channel.checkQueue(config.queue);
    } catch (error) {
      throw wrapRmqError(error, 'queue check failed');
    }
    logLine({ connected: 'yes' });

    const startedAt = Date.now();
    while (true) {
      const budget = observeBudget({
        received: summaries.length,
        startedAt,
        now: Date.now(),
        hasFixture: Boolean(samplePaths['inplay-fixture-sample.json']),
        hasMarketPair: Boolean(
          samplePaths['inplay-market-update-1.json'] && samplePaths['inplay-market-update-2.json'],
        ),
        hasSameFixtureLivescore: Boolean(samplePaths['inplay-same-fixture-livescore.json']),
      });
      if (budget !== 'continue') {
        stopped = budget;
        break;
      }

      const message = await channel.get(config.queue, { noAck: false });
      if (!message) {
        await sleep(LSPORTS_PROBE_POLL_MS);
        continue;
      }

      try {
        const { summary, json } = summarizeLsportsMessage(flow, message);
        summaries.push(summary);
        const kind = sampleKindForMessageType(summary.messageType);

        if (kind === 'fixture' && json != null && summary.jsonParsed && !samplePaths['inplay-fixture-sample.json']) {
          const path = writeSampleFile(observationSamplePath('inplay-fixture-sample.json'), json, secrets);
          samplePaths['inplay-fixture-sample.json'] = path;
          logLine({ captured: 'fixture', type: 1, fixture: summary.fixtureId, path });
        }

        if (kind === 'markets' && json != null && summary.jsonParsed) {
          const observed = readObservedMarkets(json);
          const firstMarket = observed.markets[0];
          if (!samplePaths['inplay-market-update-1.json'] && firstMarket?.id != null && observed.fixtureId != null) {
            const path = writeSampleFile(observationSamplePath('inplay-market-update-1.json'), json, secrets);
            samplePaths['inplay-market-update-1.json'] = path;
            trackedFixtureId = observed.fixtureId;
            trackedMarketId = firstMarket.id;
            logLine({
              captured: 'market-update-1',
              type: 3,
              fixture: trackedFixtureId,
              market: trackedMarketId,
              path,
            });
          } else if (
            !samplePaths['inplay-market-update-2.json']
            && trackedFixtureId != null
            && trackedMarketId != null
            && type3MatchesTrackedMarket(json, trackedFixtureId, trackedMarketId)
          ) {
            const path = writeSampleFile(observationSamplePath('inplay-market-update-2.json'), json, secrets);
            samplePaths['inplay-market-update-2.json'] = path;
            logLine({
              captured: 'market-update-2',
              type: 3,
              fixture: trackedFixtureId,
              market: trackedMarketId,
              path,
            });
          }
        }

        if (
          kind === 'livescore'
          && json != null
          && summary.jsonParsed
          && trackedFixtureId != null
          && String(summary.fixtureId) === String(trackedFixtureId)
          && !samplePaths['inplay-same-fixture-livescore.json']
        ) {
          const path = writeSampleFile(observationSamplePath('inplay-same-fixture-livescore.json'), json, secrets);
          samplePaths['inplay-same-fixture-livescore.json'] = path;
          logLine({ captured: 'same-fixture-livescore', type: 2, fixture: trackedFixtureId, path });
        }

        channel.ack(message);
        logLine({
          received: summaries.length,
          bytes: summary.byteLength,
          type: summary.messageType,
          fixture: summary.fixtureId,
        });
      } catch {
        // leave unacked so the broker can redeliver; observe will close shortly
      }
    }
  } catch (error) {
    const wrapped = wrapRmqError(error);
    logLine({ error: wrapped.code });
    throw wrapped;
  } finally {
    await closeLsportsRmq(channel, connection);
  }

  logLine({ received: summaries.length });
  logLine({ fixture: samplePaths['inplay-fixture-sample.json'] ? 'yes' : 'no' });
  logLine({ marketPair: samplePaths['inplay-market-update-2.json'] ? 'yes' : 'no' });
  logLine({ sameFixtureLivescore: samplePaths['inplay-same-fixture-livescore.json'] ? 'yes' : 'no' });
  logLine({ 'observe complete': stopped });

  return {
    flow,
    host: published.host,
    vhost: published.vhost,
    packageId: published.packageId,
    queue: published.queue,
    received: summaries.length,
    summaries,
    samplePaths,
    trackedFixtureId,
    trackedMarketId,
    stopped,
  };
}

export async function runLsportsType31Type35Capture(
  flow: LsportsFlow,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LsportsObserveResult> {
  if (flow !== 'inplay') {
    throw new Error('LSPORTS_OBSERVE_INPLAY_ONLY');
  }

  const config = resolveLsportsRmqConfig(flow, env);
  const published = publicLsportsConfig(config);
  const secrets = [config.password, config.username];
  const banner = serializeDiagnostic(published);
  if (containsSecret(banner, secrets)) {
    throw new Error('LSPORTS_DIAGNOSTIC_LEAK');
  }

  logLine({ action: 'type-31-35-capture' });
  logLine({ flow: published.flow });
  logLine({ host: published.host });
  logLine({ vhost: published.vhost });
  logLine({ package: published.packageId });
  logLine({ queue: published.queue });

  let connection = null;
  let channel = null;
  const summaries: LsportsMessageSummary[] = [];
  const samplePaths: Partial<Record<LsportsObserveSampleName, string>> = {};
  let stopped: Exclude<ObserveBudget, 'continue'> = 'timeout';

  try {
    connection = await connectLsportsRmq(config);
    channel = await openLsportsChannel(connection, LSPORTS_PROBE_PREFETCH);
    try {
      await channel.checkQueue(config.queue);
    } catch (error) {
      throw wrapRmqError(error, 'queue check failed');
    }
    logLine({ connected: 'yes' });

    const startedAt = Date.now();
    while (true) {
      const budget = typeCaptureBudget({
        requiredCaptured: Boolean(
          samplePaths['inplay-type31-sample.json'] && samplePaths['inplay-type35-sample.json'],
        ),
        received: summaries.length,
        startedAt,
        now: Date.now(),
      });
      if (budget !== 'continue') {
        stopped = budget;
        break;
      }

      const message = await channel.get(config.queue, { noAck: false });
      if (!message) {
        await sleep(LSPORTS_PROBE_POLL_MS);
        continue;
      }

      try {
        const { summary, json } = summarizeLsportsMessage(flow, message);
        summaries.push(summary);
        const name = typeSampleName(summary.messageType);
        if (name && !samplePaths[name] && json != null && summary.jsonParsed) {
          const path = writeSampleFile(observationSamplePath(name), json, secrets);
          samplePaths[name] = path;
          logLine({ captured: name, type: summary.messageType, fixture: summary.fixtureId, path });
        }
        channel.ack(message);
        logLine({
          received: summaries.length,
          bytes: summary.byteLength,
          type: summary.messageType,
          fixture: summary.fixtureId,
        });
      } catch {
        // leave unacked so the broker can redeliver; capture will close shortly
      }
    }
  } catch (error) {
    const wrapped = wrapRmqError(error);
    logLine({ error: wrapped.code });
    throw wrapped;
  } finally {
    await closeLsportsRmq(channel, connection);
  }

  logLine({ received: summaries.length });
  logLine({ type31: samplePaths['inplay-type31-sample.json'] ? 'yes' : 'no' });
  logLine({ type35: samplePaths['inplay-type35-sample.json'] ? 'yes' : 'no' });
  logLine({ 'capture complete': stopped });

  return {
    flow,
    host: published.host,
    vhost: published.vhost,
    packageId: published.packageId,
    queue: published.queue,
    received: summaries.length,
    summaries,
    samplePaths,
    trackedFixtureId: null,
    trackedMarketId: null,
    stopped,
  };
}

export async function captureInPlayHeartbeatTimestamp(
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const flow: LsportsFlow = 'inplay';
  const config = resolveLsportsRmqConfig(flow, env);
  const published = publicLsportsConfig(config);
  const secrets = [config.password, config.username];
  const banner = serializeDiagnostic(published);
  if (containsSecret(banner, secrets)) {
    throw new Error('LSPORTS_DIAGNOSTIC_LEAK');
  }

  logLine({ action: 'heartbeat-timestamp' });
  logLine({ flow: published.flow });
  logLine({ host: published.host });
  logLine({ queue: published.queue });

  let connection = null;
  let channel = null;
  let received = 0;
  let timestamp: number | null = null;

  try {
    connection = await connectLsportsRmq(config);
    channel = await openLsportsChannel(connection, LSPORTS_PROBE_PREFETCH);
    await channel.checkQueue(config.queue);
    logLine({ connected: 'yes' });

    const startedAt = Date.now();
    while (timestamp == null) {
      if (received >= 40 || Date.now() - startedAt >= 30_000) break;
      const message = await channel.get(config.queue, { noAck: false });
      if (!message) {
        await sleep(LSPORTS_PROBE_POLL_MS);
        continue;
      }
      received += 1;
      try {
        const { summary, json } = summarizeLsportsMessage(flow, message);
        if (Number(summary.messageType) === 32 && json != null) {
          timestamp = readHeaderServerTimestamp(json);
        }
        channel.ack(message);
        logLine({
          received,
          type: summary.messageType,
          bytes: summary.byteLength,
        });
      } catch {
        // leave unacked so the broker can redeliver
      }
    }
  } catch (error) {
    const wrapped = wrapRmqError(error);
    logLine({ error: wrapped.code });
    throw wrapped;
  } finally {
    await closeLsportsRmq(channel, connection);
  }

  if (timestamp == null) {
    throw new Error('LSPORTS_HEARTBEAT_TIMESTAMP_MISSING');
  }
  logLine({ heartbeatTimestamp: timestamp });
  return timestamp;
}
