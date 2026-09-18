import type { IncomingMessage } from 'node:http';
import {
  staffHttpLog,
  writeStaffJson,
  type StaffHttpResult,
  type StaffJsonResponse,
} from '../staff/httpHandler.js';
import type { StaffLog } from '../staff/types.js';
import {
  SERVER_SENTRY_FLUSH_MS,
  SERVER_SENTRY_TEST_ERROR,
  SERVER_SENTRY_TEST_HEADER,
  reportServerException,
  resolveServerSentryEnvironment,
  sentryTestTokensEqual,
  type ServerSentryPorts,
} from './sentry.js';

export const INTERNAL_SENTRY_TEST_PATH = '/api/internal/sentry-test';

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

export function isInternalSentryTestPath(pathname: string): boolean {
  return normalizePath(pathname) === INTERNAL_SENTRY_TEST_PATH;
}

function headerValue(
  headers: IncomingMessage['headers'] | Record<string, string | string[] | undefined>,
  name: string,
): string {
  const want = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== want) continue;
    if (Array.isArray(value)) return String(value[0] ?? '');
    return String(value ?? '');
  }
  return '';
}

function notFound(): StaffHttpResult {
  return { status: 404, body: { ok: false, error: 'NOT_FOUND' } };
}

export async function handleSentryTestRequest(
  input: {
    method: string;
    pathname: string;
    headers?: IncomingMessage['headers'] | Record<string, string | string[] | undefined>;
  },
  env: NodeJS.ProcessEnv = process.env,
  log: StaffLog = staffHttpLog,
  ports?: ServerSentryPorts,
): Promise<StaffHttpResult> {
  void log;
  const path = normalizePath(input.pathname);
  if (path !== INTERNAL_SENTRY_TEST_PATH) return notFound();
  if (input.method.toUpperCase() !== 'POST') return notFound();
  if (resolveServerSentryEnvironment(env) !== 'preview') return notFound();

  const expected = String(env.SENTRY_TEST_TOKEN ?? '').trim();
  const provided = headerValue(input.headers ?? {}, SERVER_SENTRY_TEST_HEADER).trim();
  if (!sentryTestTokensEqual(provided, expected)) return notFound();

  const error = new Error(SERVER_SENTRY_TEST_ERROR);
  await reportServerException(
    error,
    {
      subsystem: 'internal',
      route: INTERNAL_SENTRY_TEST_PATH,
      method: 'POST',
      eventName: 'server_sentry_test',
    },
    { env, ports, flushMs: SERVER_SENTRY_FLUSH_MS },
  );
  return { status: 200, body: { ok: true, sent: true } };
}

export async function handleVercelSentryTest(
  req: {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
  },
  res: StaffJsonResponse,
  pathname: string = INTERNAL_SENTRY_TEST_PATH,
  env: NodeJS.ProcessEnv = process.env,
  log: StaffLog = staffHttpLog,
): Promise<void> {
  const result = await handleSentryTestRequest(
    {
      method: req.method ?? 'GET',
      pathname,
      headers: req.headers,
    },
    env,
    log,
  );
  writeStaffJson(res, result);
}
