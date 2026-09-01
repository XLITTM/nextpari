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

export const LSPORTS_PROBE_MAX_MESSAGES = 5;
export const LSPORTS_PROBE_TIMEOUT_MS = 60_000;
export const LSPORTS_PROBE_PREFETCH = 5;
export const LSPORTS_PROBE_POLL_MS = 500;

export type ProbeBudget = 'continue' | 'max-messages' | 'timeout';

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
  samplePath: string | null;
  stopped: Exclude<ProbeBudget, 'continue'>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function probeBudget(
  received: number,
  startedAt: number,
  now: number,
  maxMessages = LSPORTS_PROBE_MAX_MESSAGES,
  timeoutMs = LSPORTS_PROBE_TIMEOUT_MS,
): ProbeBudget {
  if (received >= maxMessages) return 'max-messages';
  if (now - startedAt >= timeoutMs) return 'timeout';
  return 'continue';
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

export function samplePayloadPath(flow: LsportsFlow, cwd = process.cwd()): string {
  return join(cwd, '.tmp', 'lsports', `${flow}-sample.json`);
}

function writeFirstSample(flow: LsportsFlow, raw: Buffer): string {
  const path = samplePayloadPath(flow);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, raw);
  return path;
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
  let samplePath: string | null = null;
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
      const budget = probeBudget(summaries.length, startedAt, Date.now());
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
        const { summary, json, raw } = summarizeLsportsMessage(flow, message);
        summaries.push(summary);
        if (!samplePath && json != null && summary.jsonParsed) {
          samplePath = writeFirstSample(flow, raw);
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
    samplePath,
    stopped,
  };
}
