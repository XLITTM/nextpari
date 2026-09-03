import amqplib, { type Channel, type ChannelModel } from 'amqplib';
import type { LsportsRmqConfig } from './config.js';

export type LsportsRmqErrorCode =
  | 'DNS_ERROR'
  | 'CONNECTION_REFUSED'
  | 'AUTH_REFUSED'
  | 'VHOST_REFUSED'
  | 'QUEUE_NOT_FOUND'
  | 'TIMEOUT'
  | 'UNKNOWN';

export class LsportsRmqError extends Error {
  readonly code: LsportsRmqErrorCode;

  constructor(code: LsportsRmqErrorCode, message: string) {
    super(message);
    this.name = 'LsportsRmqError';
    this.code = code;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export function classifyRmqError(error: unknown): LsportsRmqErrorCode {
  const rec = asRecord(error);
  const code = String(rec.code ?? '');
  const message = String(rec.message ?? error ?? '');
  const combined = `${code} ${message}`.toLowerCase();

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || combined.includes('getaddrinfo')) {
    return 'DNS_ERROR';
  }
  if (code === 'ECONNREFUSED' || combined.includes('econnrefused')) {
    return 'CONNECTION_REFUSED';
  }
  if (code === 'ETIMEDOUT' || combined.includes('timeout') || combined.includes('timed out')) {
    return 'TIMEOUT';
  }
  if (combined.includes('vhost')) {
    return 'VHOST_REFUSED';
  }
  if (
    combined.includes('no queue')
    || combined.includes('not_found')
    || (combined.includes('404') && combined.includes('queue'))
  ) {
    return 'QUEUE_NOT_FOUND';
  }
  if (
    combined.includes('access-refused')
    || combined.includes('access_refused')
    || combined.includes('403')
    || combined.includes('invalid credentials')
    || combined.includes('plain login refused')
  ) {
    return 'AUTH_REFUSED';
  }
  return 'UNKNOWN';
}

export function wrapRmqError(error: unknown, fallback = 'RMQ connection failed'): LsportsRmqError {
  if (error instanceof LsportsRmqError) return error;
  const code = classifyRmqError(error);
  const rec = asRecord(error);
  const raw = String(rec.message ?? fallback);
  const safe = raw.replace(/:[^:@/]+@/g, ':[redacted]@');
  return new LsportsRmqError(code, safe);
}

export const LSPORTS_RMQ_STARTUP_RETRY_DELAYS_MS = [2_000, 5_000, 10_000] as const;

export interface LsportsRmqConnectDeps {
  connect?: (config: LsportsRmqConfig) => Promise<ChannelModel>;
  sleep?: (ms: number) => Promise<void>;
  log?: (parts: Record<string, string | number | boolean | null | undefined>) => void;
}

function logRmq(parts: Record<string, string | number | boolean | null | undefined>): void {
  const body = Object.entries(parts)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  console.log(`[lsports] ${body}`);
}

/**
 * Bounded startup connect. ACCESS_REFUSED stays classified as AUTH_REFUSED,
 * but the first refusal is not treated as permanently bad credentials.
 */
export async function connectLsportsRmqWithRetry(
  config: LsportsRmqConfig,
  deps: LsportsRmqConnectDeps = {},
): Promise<ChannelModel> {
  const connect = deps.connect ?? connectLsportsRmq;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  }));
  const log = deps.log ?? logRmq;
  const maxAttempts = LSPORTS_RMQ_STARTUP_RETRY_DELAYS_MS.length + 1;
  let lastError: LsportsRmqError | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const connection = await connect(config);
      if (attempt > 1) log({ action: 'rmq-connect-ok', attempt });
      return connection;
    } catch (error) {
      lastError = wrapRmqError(error);
      const waitMs = LSPORTS_RMQ_STARTUP_RETRY_DELAYS_MS[attempt - 1];
      log({
        action: 'rmq-connect-retry',
        attempt,
        code: lastError.code,
        waitMs: waitMs ?? 0,
      });
      if (waitMs == null) break;
      await sleep(waitMs);
    }
  }
  throw lastError ?? new LsportsRmqError('UNKNOWN', 'RMQ startup retries exhausted');
}

export async function connectLsportsRmq(config: LsportsRmqConfig): Promise<ChannelModel> {
  try {
    return await amqplib.connect(
      {
        protocol: 'amqp',
        hostname: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        vhost: config.vhost,
        heartbeat: config.heartbeat,
      },
      { timeout: config.connectionTimeoutMs },
    );
  } catch (error) {
    throw wrapRmqError(error);
  }
}

export async function openLsportsChannel(connection: ChannelModel, prefetch: number): Promise<Channel> {
  const channel = await connection.createChannel();
  await channel.prefetch(prefetch);
  return channel;
}

export async function closeLsportsRmq(channel: Channel | null, connection: ChannelModel | null): Promise<void> {
  if (channel) {
    try {
      await channel.close();
    } catch {
      // already closed
    }
  }
  if (connection) {
    try {
      await connection.close();
    } catch {
      // already closed
    }
  }
}
