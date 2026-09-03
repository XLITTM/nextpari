import { publicLsportsConfig, resolveLsportsRmqConfig, type LsportsFlow } from './config.js';
import { containsSecret, serializeDiagnostic } from './redact.js';

export const LSPORTS_STM_API_BASE = 'https://stm-api.lsports.eu';
export const LSPORTS_GET_DISTRIBUTION_STATUS_PATH = '/Package/GetDistributionStatus';
export const LSPORTS_DISTRIBUTION_START_PATH = '/Distribution/Start';
export const LSPORTS_GET_DISTRIBUTION_STATUS_URL =
  `${LSPORTS_STM_API_BASE}${LSPORTS_GET_DISTRIBUTION_STATUS_PATH}`;
export const LSPORTS_DISTRIBUTION_START_URL =
  `${LSPORTS_STM_API_BASE}${LSPORTS_DISTRIBUTION_START_PATH}`;
export const LSPORTS_DISTRIBUTION_STATUS_TIMEOUT_MS = 10_000;

export interface LsportsDistributionHttpResult {
  url: string;
  packageId: number;
  httpStatus: number;
  body: unknown;
  credentialsAccepted: boolean | null;
  errors: string[];
}

export interface LsportsDistributionStatusResult extends LsportsDistributionHttpResult {
  isDistributionOn: boolean | null;
  consumers: unknown;
  numberMessagesInQueue: number | null;
  messagesPerSecond: number | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function pickBoolean(record: Record<string, unknown> | null, keys: readonly string[]): boolean | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
  }
  return null;
}

function pickNumber(record: Record<string, unknown> | null, keys: readonly string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function distributionBody(value: unknown): Record<string, unknown> | null {
  const root = asRecord(value);
  return asRecord(root?.body) ?? asRecord(root?.Body) ?? root;
}

function collectErrors(value: unknown): string[] {
  const root = asRecord(value);
  const header = asRecord(root?.header) ?? asRecord(root?.Header);
  const raw = header?.errors ?? header?.Errors ?? root?.errors ?? root?.Errors;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (typeof entry === 'string' && entry.trim()) return [entry];
    const rec = asRecord(entry);
    const message = rec?.message ?? rec?.Message;
    return typeof message === 'string' && message.trim() ? [message] : [];
  });
}

export function buildGetDistributionStatusRequest(packageId: number, userName: string, password: string) {
  return {
    packageId,
    userName,
    password,
  };
}

export function buildDistributionStartRequest(packageId: number, userName: string, password: string) {
  return {
    PackageId: packageId,
    UserName: userName,
    Password: password,
  };
}

export function readIsDistributionOn(body: unknown): boolean | null {
  return pickBoolean(distributionBody(body), ['isDistributionOn', 'IsDistributionOn']);
}

export function readDistributionConsumers(body: unknown): unknown {
  const inner = distributionBody(body);
  if (!inner) return null;
  return inner.consumers ?? inner.Consumers ?? null;
}

export function readNumberMessagesInQueue(body: unknown): number | null {
  return pickNumber(distributionBody(body), ['numberMessagesInQueue', 'NumberMessagesInQueue']);
}

export function readMessagesPerSecond(body: unknown): number | null {
  return pickNumber(distributionBody(body), ['messagesPerSecond', 'MessagesPerSecond']);
}

export function readDistributionConsumerCount(body: unknown): number | null {
  const raw = readDistributionConsumers(body);
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (Array.isArray(raw)) return raw.length;
  const rec = asRecord(raw);
  if (rec) {
    const nested = pickNumber(rec, ['count', 'Count', 'value', 'Value']);
    if (nested != null) return nested;
  }
  return pickNumber(distributionBody(body), [
    'consumerCount',
    'ConsumerCount',
    'numberOfConsumers',
    'NumberOfConsumers',
  ]);
}

export function readDistributionStartMessage(body: unknown): string | null {
  const root = asRecord(body);
  const inner = root?.Body ?? root?.body;
  if (typeof inner === 'string' && inner.trim()) return inner.trim();
  const rec = asRecord(inner);
  const fromBody = rec?.message ?? rec?.Message ?? rec?.status ?? rec?.Status;
  if (typeof fromBody === 'string' && fromBody.trim()) return fromBody.trim();
  const header = asRecord(root?.Header) ?? asRecord(root?.header);
  const fromHeader = header?.message ?? header?.Message ?? header?.description ?? header?.Description;
  return typeof fromHeader === 'string' && fromHeader.trim() ? fromHeader.trim() : null;
}

export function isDistributionAlreadyActiveMessage(body: unknown): boolean {
  const message = `${readDistributionStartMessage(body) ?? ''} ${collectErrors(body).join(' ')}`;
  return /already\s+(active|started|on)/i.test(message);
}

export function isDistributionStartSuccess(httpStatus: number, body: unknown): boolean {
  if (httpStatus < 200 || httpStatus >= 300) return false;
  return inferCredentialsAccepted(httpStatus, body) !== false;
}

export function inferCredentialsAccepted(httpStatus: number, body: unknown): boolean | null {
  if (httpStatus === 401 || httpStatus === 403) return false;
  const errors = collectErrors(body).join(' ').toLowerCase();
  if (/(invalid|unauthorized|unauthorised|wrong).*(user|password|credential)/.test(errors)) {
    return false;
  }
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

export interface LsportsDistributionCallDeps {
  fetchImpl?: typeof fetch;
  log?: (parts: Record<string, string | number | boolean | null | undefined>) => void;
  verbose?: boolean;
}

async function postDistributionJson(
  url: string,
  request: unknown,
  secrets: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<{ httpStatus: number; parsed: unknown; sanitized: string }> {
  if (containsSecret(serializeDiagnostic(request), secrets)) {
    throw new Error('LSPORTS_DIAGNOSTIC_LEAK');
  }
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(LSPORTS_DISTRIBUTION_STATUS_TIMEOUT_MS),
  });
  const rawText = await response.text();
  let parsed: unknown = rawText;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsed = { text: rawText.slice(0, 400) };
  }
  const sanitized = serializeDiagnostic(parsed);
  if (containsSecret(sanitized, secrets)) {
    throw new Error('LSPORTS_DIAGNOSTIC_LEAK');
  }
  return { httpStatus: response.status, parsed, sanitized };
}

/**
 * Start is optional when the package is already Active.
 * HTTP 200 / already-on is success, not an error.
 */
export async function ensureDistributionStarted(
  flow: LsportsFlow,
  env: NodeJS.ProcessEnv = process.env,
  deps: LsportsDistributionCallDeps = {},
): Promise<{ alreadyActive: boolean; httpStatus: number }> {
  return startDistributionAcceptingActive(flow, env, deps);
}

export async function startDistributionAcceptingActive(
  flow: LsportsFlow,
  env: NodeJS.ProcessEnv = process.env,
  deps: LsportsDistributionCallDeps = {},
): Promise<{ alreadyActive: boolean; httpStatus: number }> {
  const started = await startDistribution(flow, env, deps);
  if (isDistributionStartSuccess(started.httpStatus, started.body)) {
    const alreadyActive = isDistributionAlreadyActiveMessage(started.body);
    const log = deps.log ?? logLine;
    log({
      action: alreadyActive ? 'Distribution/already-active' : 'Distribution/started',
      package: started.packageId,
      http: started.httpStatus,
    });
    return { alreadyActive, httpStatus: started.httpStatus };
  }
  throw new Error('LSPORTS_DISTRIBUTION_START_FAILED');
}

export async function startDistribution(
  flow: LsportsFlow,
  env: NodeJS.ProcessEnv = process.env,
  deps: LsportsDistributionCallDeps = {},
): Promise<LsportsDistributionHttpResult> {
  const config = resolveLsportsRmqConfig(flow, env);
  const published = publicLsportsConfig(config);
  const secrets = [config.password, config.username];
  const request = buildDistributionStartRequest(config.packageId, config.username, config.password);
  const log = deps.log ?? logLine;
  const verbose = deps.verbose !== false;

  log({ action: 'Distribution/Start' });
  log({ url: LSPORTS_DISTRIBUTION_START_URL });
  log({ package: published.packageId });

  const posted = await postDistributionJson(
    LSPORTS_DISTRIBUTION_START_URL,
    request,
    secrets,
    deps.fetchImpl,
  );
  const result: LsportsDistributionHttpResult = {
    url: LSPORTS_DISTRIBUTION_START_URL,
    packageId: published.packageId,
    httpStatus: posted.httpStatus,
    body: JSON.parse(posted.sanitized) as unknown,
    credentialsAccepted: inferCredentialsAccepted(posted.httpStatus, posted.parsed),
    errors: collectErrors(posted.parsed),
  };
  log({ http: result.httpStatus });
  if (verbose) log({ body: posted.sanitized });
  log({ credentialsAccepted: result.credentialsAccepted });
  log({
    outcome: isDistributionAlreadyActiveMessage(posted.parsed)
      ? 'already-active'
      : isDistributionStartSuccess(result.httpStatus, posted.parsed) ? 'success' : 'failed',
  });
  if (result.errors.length) {
    log({ errors: result.errors.join('; ') });
  }
  return result;
}

export async function getDistributionStatus(
  flow: LsportsFlow,
  env: NodeJS.ProcessEnv = process.env,
  deps: LsportsDistributionCallDeps = {},
): Promise<LsportsDistributionStatusResult> {
  const config = resolveLsportsRmqConfig(flow, env);
  const published = publicLsportsConfig(config);
  const secrets = [config.password, config.username];
  const request = buildGetDistributionStatusRequest(config.packageId, config.username, config.password);
  const log = deps.log ?? logLine;
  const verbose = deps.verbose !== false;

  if (verbose) {
    log({ action: 'GetDistributionStatus' });
    log({ url: LSPORTS_GET_DISTRIBUTION_STATUS_URL });
    log({ package: published.packageId });
  }

  const posted = await postDistributionJson(
    LSPORTS_GET_DISTRIBUTION_STATUS_URL,
    request,
    secrets,
    deps.fetchImpl,
  );
  const result: LsportsDistributionStatusResult = {
    url: LSPORTS_GET_DISTRIBUTION_STATUS_URL,
    packageId: published.packageId,
    httpStatus: posted.httpStatus,
    body: JSON.parse(posted.sanitized) as unknown,
    isDistributionOn: readIsDistributionOn(posted.parsed),
    consumers: readDistributionConsumers(posted.parsed),
    numberMessagesInQueue: readNumberMessagesInQueue(posted.parsed),
    messagesPerSecond: readMessagesPerSecond(posted.parsed),
    credentialsAccepted: inferCredentialsAccepted(posted.httpStatus, posted.parsed),
    errors: collectErrors(posted.parsed),
  };

  log({
    action: 'distribution-status',
    package: published.packageId,
    http: result.httpStatus,
    active: result.isDistributionOn,
    consumers: readDistributionConsumerCount(posted.parsed),
    queue: result.numberMessagesInQueue,
    mps: result.messagesPerSecond,
  });
  if (verbose) {
    log({ body: posted.sanitized });
    log({ credentialsAccepted: result.credentialsAccepted });
  }
  if (result.errors.length) {
    log({ errors: result.errors.join('; ') });
  }
  return result;
}
