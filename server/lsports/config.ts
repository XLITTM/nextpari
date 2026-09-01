export type LsportsFlow = 'inplay' | 'prematch';

export class LsportsConfigError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'LsportsConfigError';
    this.code = code;
  }
}

export interface LsportsRmqConfig {
  flow: LsportsFlow;
  host: string;
  port: number;
  vhost: string;
  packageId: number;
  queue: string;
  heartbeat: number;
  connectionTimeoutMs: number;
  username: string;
  password: string;
  ssl: false;
}

export interface LsportsPublicConfig {
  flow: LsportsFlow;
  host: string;
  port: number;
  vhost: string;
  packageId: number;
  queue: string;
  heartbeat: number;
  connectionTimeoutMs: number;
  ssl: false;
}

const DEFAULTS = {
  inplay: {
    host: 'stm-inplay.lsports.eu',
    port: 5672,
    vhost: 'StmInPlay',
    packageId: 4351,
  },
  prematch: {
    host: 'stm-prematch.lsports.eu',
    port: 5672,
    vhost: 'StmPreMatch',
    packageId: 4352,
  },
} as const;

export const LSPORTS_RMQ_CONNECTION_TIMEOUT_MS = 10_000;
export const LSPORTS_RMQ_DEFAULT_HEARTBEAT = 30;

type EnvMap = Record<string, string | undefined>;

function readTrim(env: EnvMap, key: string): string {
  return String(env[key] ?? '').trim();
}

export function packageQueueName(packageId: number): string {
  return `_${packageId}_`;
}

function readPositiveInt(env: EnvMap, key: string, fallback: number, code: string): number {
  const raw = readTrim(env, key);
  const value = raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new LsportsConfigError(code, `${key} must be a positive integer`);
  }
  return value;
}

function readPort(env: EnvMap, key: string, fallback: number): number {
  const raw = readTrim(env, key);
  const value = raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new LsportsConfigError('CONFIG_PORT_INVALID', `${key} must be a valid TCP port`);
  }
  return value;
}

function readRequired(env: EnvMap, key: string, fallback: string, code: string): string {
  const value = readTrim(env, key) || fallback;
  if (!value) {
    throw new LsportsConfigError(code, `${key} is required`);
  }
  return value;
}

function readCredential(env: EnvMap, specificKey: string, sharedKey: string, code: string): string {
  const value = readTrim(env, specificKey) || readTrim(env, sharedKey);
  if (!value) {
    throw new LsportsConfigError(code, `${specificKey} or ${sharedKey} is required`);
  }
  return value;
}

export function resolveLsportsRmqConfig(flow: LsportsFlow, env: EnvMap = process.env): LsportsRmqConfig {
  const defaults = DEFAULTS[flow];
  const prefix = flow === 'inplay' ? 'LSPORTS_INPLAY' : 'LSPORTS_PREMATCH';
  const host = readRequired(env, `${prefix}_HOST`, defaults.host, 'CONFIG_HOST_MISSING');
  const vhost = readRequired(env, `${prefix}_VHOST`, defaults.vhost, 'CONFIG_VHOST_MISSING');
  const port = readPort(env, `${prefix}_PORT`, defaults.port);
  const packageId = readPositiveInt(env, `${prefix}_PACKAGE_ID`, defaults.packageId, 'CONFIG_PACKAGE_INVALID');
  const heartbeat = readPositiveInt(env, 'LSPORTS_RMQ_HEARTBEAT', LSPORTS_RMQ_DEFAULT_HEARTBEAT, 'CONFIG_HEARTBEAT_INVALID');
  const username = readCredential(env, `${prefix}_USERNAME`, 'LSPORTS_RMQ_USERNAME', 'CONFIG_USERNAME_MISSING');
  const password = readCredential(env, `${prefix}_PASSWORD`, 'LSPORTS_RMQ_PASSWORD', 'CONFIG_PASSWORD_MISSING');

  return {
    flow,
    host,
    port,
    vhost,
    packageId,
    queue: packageQueueName(packageId),
    heartbeat,
    connectionTimeoutMs: LSPORTS_RMQ_CONNECTION_TIMEOUT_MS,
    username,
    password,
    ssl: false,
  };
}

export function publicLsportsConfig(config: LsportsRmqConfig): LsportsPublicConfig {
  return {
    flow: config.flow,
    host: config.host,
    port: config.port,
    vhost: config.vhost,
    packageId: config.packageId,
    queue: config.queue,
    heartbeat: config.heartbeat,
    connectionTimeoutMs: config.connectionTimeoutMs,
    ssl: false,
  };
}
