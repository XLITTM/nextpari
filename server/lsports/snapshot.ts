import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { publicLsportsConfig, resolveLsportsRmqConfig, type LsportsFlow } from './config.js';
import { containsSecret, serializeDiagnostic } from './redact.js';

export const LSPORTS_SNAPSHOT_BASE = 'https://stm-snapshot.lsports.eu';
export const LSPORTS_INPLAY_GET_FIXTURES_PATH = '/InPlay/GetFixtures';
export const LSPORTS_INPLAY_GET_SCORES_PATH = '/InPlay/GetScores';
export const LSPORTS_INPLAY_GET_FIXTURE_MARKETS_PATH = '/InPlay/GetFixtureMarkets';
export const LSPORTS_INPLAY_GET_FIXTURES_URL =
  `${LSPORTS_SNAPSHOT_BASE}${LSPORTS_INPLAY_GET_FIXTURES_PATH}`;
export const LSPORTS_INPLAY_GET_SCORES_URL =
  `${LSPORTS_SNAPSHOT_BASE}${LSPORTS_INPLAY_GET_SCORES_PATH}`;
export const LSPORTS_INPLAY_GET_FIXTURE_MARKETS_URL =
  `${LSPORTS_SNAPSHOT_BASE}${LSPORTS_INPLAY_GET_FIXTURE_MARKETS_PATH}`;
export const LSPORTS_FOOTBALL_SPORT_ID = 6046;
export const LSPORTS_SNAPSHOT_TIMEOUT_MS = 60_000;
export const LSPORTS_SNAPSHOT_MIN_INTERVAL_MS = 1_100;
export const LSPORTS_SNAPSHOT_FOOTBALL_SAMPLE = 'inplay-snapshot-football.json';
export const LSPORTS_SNAPSHOT_SCORES_SAMPLE = 'inplay-snapshot-scores.json';
export const LSPORTS_SNAPSHOT_MARKETS_SAMPLE = 'inplay-snapshot-markets.json';

export interface LsportsSnapshotHttpResult {
  url: string;
  action: string;
  packageId: number;
  sports: number[];
  timestamp: number | null;
  httpStatus: number;
  fixtureCount: number;
  samplePath: string | null;
  byteLength: number;
  topLevelKeys: string[];
  credentialsAccepted: boolean | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function buildSnapshotFilteredRequest(
  packageId: number,
  userName: string,
  password: string,
  sports: readonly number[],
  timestamp?: number | null,
) {
  const request: {
    packageId: number;
    userName: string;
    password: string;
    sports: number[];
    timestamp?: number;
  } = {
    packageId,
    userName,
    password,
    sports: [...sports],
  };
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    request.timestamp = timestamp;
  }
  return request;
}

export function buildGetFixturesRequest(
  packageId: number,
  userName: string,
  password: string,
  sports: readonly number[],
) {
  return buildSnapshotFilteredRequest(packageId, userName, password, sports);
}

export function snapshotWait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function snapshotSamplePath(name: string, cwd = process.cwd()): string {
  return join(cwd, '.tmp', 'lsports', name);
}

export function readSnapshotFixtures(body: unknown): unknown[] {
  const root = asRecord(body);
  const inner = root?.Body ?? root?.body;
  if (Array.isArray(inner)) return inner;
  const events = asRecord(inner)?.Events ?? asRecord(inner)?.events;
  return Array.isArray(events) ? events : [];
}

function inferCredentialsAccepted(httpStatus: number): boolean | null {
  if (httpStatus === 401 || httpStatus === 403) return false;
  if (httpStatus >= 200 && httpStatus < 300) return true;
  if (httpStatus >= 400) return false;
  return null;
}

function logLine(parts: Record<string, string | number | boolean | null | undefined>): void {
  const body = Object.entries(parts)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  console.log(`[lsports] ${body}`);
}

function writeSnapshotSample(path: string, json: unknown, secrets: readonly string[]): string {
  const pretty = `${JSON.stringify(json, null, 2)}\n`;
  if (containsSecret(pretty, secrets)) {
    throw new Error('LSPORTS_SAMPLE_LEAK');
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, pretty, 'utf8');
  return path;
}

async function postInPlaySnapshot(input: {
  action: string;
  url: string;
  sampleName: string;
  timestamp?: number | null;
  env?: NodeJS.ProcessEnv;
}): Promise<LsportsSnapshotHttpResult> {
  const flow: LsportsFlow = 'inplay';
  const env = input.env ?? process.env;
  const config = resolveLsportsRmqConfig(flow, env);
  const published = publicLsportsConfig(config);
  const secrets = [config.password, config.username];
  const sports = [LSPORTS_FOOTBALL_SPORT_ID];
  const request = buildSnapshotFilteredRequest(
    config.packageId,
    config.username,
    config.password,
    sports,
    input.timestamp,
  );

  if (containsSecret(serializeDiagnostic(request), secrets)) {
    throw new Error('LSPORTS_DIAGNOSTIC_LEAK');
  }

  logLine({ action: input.action });
  logLine({ url: input.url });
  logLine({ package: published.packageId });
  logLine({ sports: sports.join(',') });
  if (request.timestamp != null) {
    logLine({ timestamp: request.timestamp });
  }

  const response = await fetch(input.url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(LSPORTS_SNAPSHOT_TIMEOUT_MS),
  });

  const rawText = await response.text();
  let parsed: unknown = rawText;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsed = { text: rawText.slice(0, 400) };
  }

  const sanitized = serializeDiagnostic(parsed);
  if (containsSecret(sanitized, secrets) || containsSecret(rawText, secrets)) {
    throw new Error('LSPORTS_SAMPLE_LEAK');
  }

  const fixtures = readSnapshotFixtures(parsed);
  const root = asRecord(parsed);
  const samplePath = writeSnapshotSample(snapshotSamplePath(input.sampleName), parsed, secrets);

  const result: LsportsSnapshotHttpResult = {
    url: input.url,
    action: input.action,
    packageId: published.packageId,
    sports,
    timestamp: request.timestamp ?? null,
    httpStatus: response.status,
    fixtureCount: fixtures.length,
    samplePath,
    byteLength: rawText.length,
    topLevelKeys: root ? Object.keys(root) : [],
    credentialsAccepted: inferCredentialsAccepted(response.status),
  };

  logLine({ http: result.httpStatus });
  logLine({ fixtures: result.fixtureCount });
  logLine({ bytes: result.byteLength });
  logLine({ path: result.samplePath });
  logLine({ credentialsAccepted: result.credentialsAccepted });
  return result;
}

export async function fetchInPlayFootballFixtures(
  env: NodeJS.ProcessEnv = process.env,
): Promise<LsportsSnapshotHttpResult> {
  return postInPlaySnapshot({
    action: 'InPlay/GetFixtures',
    url: LSPORTS_INPLAY_GET_FIXTURES_URL,
    sampleName: LSPORTS_SNAPSHOT_FOOTBALL_SAMPLE,
    env,
  });
}

export async function fetchInPlayFootballScores(
  timestamp: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LsportsSnapshotHttpResult> {
  return postInPlaySnapshot({
    action: 'InPlay/GetScores',
    url: LSPORTS_INPLAY_GET_SCORES_URL,
    sampleName: LSPORTS_SNAPSHOT_SCORES_SAMPLE,
    timestamp,
    env,
  });
}

export async function fetchInPlayFootballFixtureMarkets(
  timestamp: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LsportsSnapshotHttpResult> {
  return postInPlaySnapshot({
    action: 'InPlay/GetFixtureMarkets',
    url: LSPORTS_INPLAY_GET_FIXTURE_MARKETS_URL,
    sampleName: LSPORTS_SNAPSHOT_MARKETS_SAMPLE,
    timestamp,
    env,
  });
}

const SNAPSHOT_URLS = {
  GetFixtures: LSPORTS_INPLAY_GET_FIXTURES_URL,
  GetScores: LSPORTS_INPLAY_GET_SCORES_URL,
  GetFixtureMarkets: LSPORTS_INPLAY_GET_FIXTURE_MARKETS_URL,
} as const;

export const LSPORTS_SNAPSHOT_MAX_ATTEMPTS = 4;
export const LSPORTS_SNAPSHOT_RETRY_DELAYS_MS = [2_000, 4_000, 8_000] as const;
export const LSPORTS_SNAPSHOT_RETRY_AFTER_MAX_MS = 30_000;

export class LsportsSnapshotHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`LSPORTS_SNAPSHOT_HTTP_${status}`);
    this.name = 'LsportsSnapshotHttpError';
    this.status = status;
  }
}

export function readRetryAfterMs(raw: string | null | undefined, now = Date.now()): number | null {
  if (!raw || !raw.trim()) return null;
  const seconds = Number(raw.trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(LSPORTS_SNAPSHOT_RETRY_AFTER_MAX_MS, Math.ceil(seconds * 1000));
  }
  const date = Date.parse(raw);
  if (Number.isFinite(date)) {
    return Math.min(LSPORTS_SNAPSHOT_RETRY_AFTER_MAX_MS, Math.max(0, date - now));
  }
  return null;
}

export function snapshot429WaitMs(
  retryIndex: number,
  retryAfterHeader?: string | null,
  now = Date.now(),
): number {
  const fromHeader = readRetryAfterMs(retryAfterHeader, now);
  if (fromHeader != null) return fromHeader;
  return LSPORTS_SNAPSHOT_RETRY_DELAYS_MS[Math.min(retryIndex, LSPORTS_SNAPSHOT_RETRY_DELAYS_MS.length - 1)] ?? 8_000;
}

export interface LsportsSnapshotFetchDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (parts: Record<string, string | number | boolean | null | undefined>) => void;
}

/**
 * Coordinator-facing snapshot POST. Returns the parsed LSports JSON body.
 * Cold start (unfiltered): omits timestamp and sports.
 * Recovery: includes last heartbeat timestamp only.
 * HTTP 429 retries with Retry-After or 2s/4s/8s, bounded attempts.
 */
export async function fetchInPlaySnapshotBody(
  item: { endpoint: keyof typeof SNAPSHOT_URLS; timestamp?: number; unfiltered: boolean },
  env: NodeJS.ProcessEnv = process.env,
  deps: LsportsSnapshotFetchDeps = {},
): Promise<unknown> {
  const config = resolveLsportsRmqConfig('inplay', env);
  const secrets = [config.password, config.username];
  const request: {
    packageId: number;
    userName: string;
    password: string;
    timestamp?: number;
  } = {
    packageId: config.packageId,
    userName: config.username,
    password: config.password,
  };
  if (!item.unfiltered && item.timestamp != null) {
    request.timestamp = item.timestamp;
  }
  const url = SNAPSHOT_URLS[item.endpoint];
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? snapshotWait;
  const log = deps.log ?? logLine;

  let lastStatus = 0;
  for (let attempt = 1; attempt <= LSPORTS_SNAPSHOT_MAX_ATTEMPTS; attempt += 1) {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(LSPORTS_SNAPSHOT_TIMEOUT_MS),
    });
    lastStatus = response.status;
    const rawText = await response.text();
    if (containsSecret(rawText, secrets)) {
      throw new Error('LSPORTS_SAMPLE_LEAK');
    }
    if (response.status === 429 && attempt < LSPORTS_SNAPSHOT_MAX_ATTEMPTS) {
      const waitMs = snapshot429WaitMs(attempt - 1, response.headers.get('retry-after'));
      log({
        action: 'snapshot-retry',
        endpoint: item.endpoint,
        attempt,
        waitMs,
        http: 429,
      });
      await sleep(waitMs);
      continue;
    }
    if (!response.ok) {
      throw new LsportsSnapshotHttpError(response.status);
    }
    const parsed: unknown = rawText ? JSON.parse(rawText) : null;
    if (containsSecret(serializeDiagnostic(parsed), secrets)) {
      throw new Error('LSPORTS_SAMPLE_LEAK');
    }
    if (attempt > 1) {
      log({ action: 'snapshot-ok', endpoint: item.endpoint, attempt, http: response.status });
    }
    return parsed;
  }
  throw new LsportsSnapshotHttpError(lastStatus || 429);
}
