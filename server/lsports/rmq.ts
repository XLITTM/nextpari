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
