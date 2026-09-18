import { timingSafeEqual } from 'node:crypto';
import * as Sentry from '@sentry/node';
import type { Breadcrumb, ErrorEvent, NodeOptions } from '@sentry/node';

export const SERVER_SENTRY_TEST_ERROR = 'NEXTPARI_SERVER_SENTRY_TEST_ERROR';
export const SERVER_SENTRY_TEST_HEADER = 'x-nextpari-sentry-test';
export const SERVER_SENTRY_FLUSH_MS = 2000;

export type SentryEnvironment = 'production' | 'preview' | 'development';

export const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|set-cookie|password|passwd|token|access[_-]?token|refresh[_-]?token|auth[_-]?token|session[_-]?token|authtoken|sessiontoken|secret|api[_-]?key|apikey|shared[_-]?key|public[_-]?key|service_role|sentry_test_token|otp|recovery|phone|email|document_number|document_series|passport|iban|card|cvv|pin|wallet|balance|amount|stake|payout|withdraw|deposit|forwarded|x-forwarded-for|x-real-ip|ip_address|remote[_-]?addr|player[_-]?id|public[_-]?id|auth[_-]?user|transaction|rgs/i;

export type ServerSentryEnv = {
  SENTRY_DSN?: string;
  VERCEL_ENV?: string;
  VERCEL_GIT_COMMIT_SHA?: string;
  SENTRY_TEST_TOKEN?: string;
};

export type ServerSentryReportContext = {
  subsystem: string;
  route?: string;
  method?: string;
  eventName?: string;
};

export type ServerSentryPorts = {
  captureException: (error: unknown, captureContext?: Record<string, unknown>) => void;
  flush?: (timeoutMs?: number) => Promise<boolean>;
  init?: (options: NodeOptions) => void;
};

type ServerSentryTestHook = {
  ports?: ServerSentryPorts | null;
  env?: NodeJS.ProcessEnv | null;
};

const URL_DATA_KEY_PATTERN = /^(url|from|to|href)$/i;
const ASSIGNMENT_PATTERN =
  /\b(password|passwd|token|access[_-]?token|refresh[_-]?token|auth[_-]?token|session[_-]?token|email|phone|api[_-]?key|secret|shared[_-]?key|amount|balance|stake|payout|withdrawAmount|depositAmount|withdraw_amount|deposit_amount)\s*([=:])\s*[^\s&;,"']+/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

let sentryStarted = false;
let testHook: ServerSentryTestHook = {};

export function configureServerSentryForTests(hook: ServerSentryTestHook = {}): void {
  testHook = hook;
  sentryStarted = false;
}

function activeEnv(override?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return override ?? testHook.env ?? process.env;
}

function activePorts(override?: ServerSentryPorts): ServerSentryPorts | null {
  return override ?? testHook.ports ?? null;
}

export function resolveServerSentryEnvironment(
  env: ServerSentryEnv = activeEnv(),
): SentryEnvironment {
  const value = String(env.VERCEL_ENV ?? '').trim();
  if (value === 'production') return 'production';
  if (value === 'preview') return 'preview';
  return 'development';
}

export function resolveServerSentryDsn(env: ServerSentryEnv = activeEnv()): string {
  return String(env.SENTRY_DSN ?? '').trim();
}

export function resolveServerSentryRelease(env: ServerSentryEnv = activeEnv()): string {
  return String(env.VERCEL_GIT_COMMIT_SHA ?? '').trim();
}

export function isServerSentryEnabled(env: ServerSentryEnv = activeEnv()): boolean {
  const environment = resolveServerSentryEnvironment(env);
  return Boolean(resolveServerSentryDsn(env))
    && (environment === 'production' || environment === 'preview');
}

export function buildServerSentryInitOptions(input: {
  dsn: string;
  environment: SentryEnvironment;
  release?: string;
}): NodeOptions {
  const enabled = Boolean(input.dsn) && (input.environment === 'production' || input.environment === 'preview');
  return {
    dsn: input.dsn,
    enabled,
    environment: input.environment,
    release: input.release || undefined,
    sendDefaultPii: false,
    defaultIntegrations: false,
    registerEsmLoaderHooks: false,
    includeLocalVariables: false,
    beforeSend: scrubServerSentryEvent,
    beforeBreadcrumb: scrubServerBreadcrumb,
  };
}

export function initServerSentry(env: ServerSentryEnv = activeEnv()): {
  enabled: boolean;
  environment: SentryEnvironment;
} {
  const environment = resolveServerSentryEnvironment(env);
  const dsn = resolveServerSentryDsn(env);
  if (!dsn) {
    sentryStarted = false;
    return { enabled: false, environment };
  }
  const options = buildServerSentryInitOptions({
    dsn,
    environment,
    release: resolveServerSentryRelease(env),
  });
  const ports = activePorts();
  if (ports?.init) {
    ports.init(options);
  } else {
    Sentry.init(options);
  }
  sentryStarted = options.enabled === true;
  return { enabled: sentryStarted, environment };
}

function ensureServerSentry(env: ServerSentryEnv): boolean {
  if (!isServerSentryEnabled(env)) {
    sentryStarted = false;
    return false;
  }
  if (!sentryStarted) initServerSentry(env);
  return sentryStarted;
}

export function sentryRouteTag(pathname: string | undefined): string | undefined {
  if (!pathname) return undefined;
  return sanitizeCapturedUrl(pathname)
    .replace(UUID_PATTERN, ':id')
    .replace(/\/\d{4,}(?=\/|$)/g, '/:id');
}

function captureContextFrom(context: ServerSentryReportContext): Record<string, unknown> {
  const tags: Record<string, string> = { subsystem: context.subsystem };
  const route = sentryRouteTag(context.route);
  if (route) tags.route = route;
  if (context.method) tags.method = context.method.toUpperCase();
  if (context.eventName) tags.event_name = context.eventName;
  return { tags };
}

export async function reportServerException(
  error: unknown,
  context: ServerSentryReportContext,
  options: {
    env?: NodeJS.ProcessEnv;
    ports?: ServerSentryPorts;
    flushMs?: number;
  } = {},
): Promise<void> {
  try {
    const env = activeEnv(options.env);
    if (!isServerSentryEnabled(env)) return;
    const ports = activePorts(options.ports);
    const captureContext = captureContextFrom(context);
    if (ports) {
      ports.captureException(error, captureContext);
      if (ports.flush) await ports.flush(options.flushMs ?? SERVER_SENTRY_FLUSH_MS);
      return;
    }
    if (!ensureServerSentry(env)) return;
    Sentry.captureException(error, captureContext as Parameters<typeof Sentry.captureException>[1]);
    await Sentry.flush(options.flushMs ?? SERVER_SENTRY_FLUSH_MS);
  } catch {
    /* Sentry must never break the API */
  }
}

export function sentryTestTokensEqual(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (!expected || left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function scrubServerSentryEvent(event: ErrorEvent): ErrorEvent | null {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    delete (event.request as { env?: unknown }).env;
    if (event.request.headers) {
      event.request.headers = scrubHeaders(event.request.headers);
    }
    event.request = scrubDeep(event.request) as ErrorEvent['request'];
  }
  delete event.user;
  if (typeof event.message === 'string') event.message = sanitizeSensitiveText(event.message);
  if (event.exception) event.exception = scrubDeep(event.exception) as ErrorEvent['exception'];
  if (event.extra) event.extra = scrubDeep(event.extra) as ErrorEvent['extra'];
  if (event.contexts) event.contexts = scrubDeep(event.contexts) as ErrorEvent['contexts'];
  if (event.tags) event.tags = scrubDeep(event.tags) as ErrorEvent['tags'];
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map((crumb) => scrubServerBreadcrumb(crumb))
      .filter((crumb): crumb is Breadcrumb => crumb != null);
  }
  return event;
}

export function sanitizeCapturedUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return value;
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    const cut = value.search(/[?#]/);
    return cut === -1 ? value : value.slice(0, cut);
  }
}

function isUrlLike(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^(?:https?:)?\/\//i.test(trimmed)) return true;
  if (trimmed.startsWith('/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizeSensitiveText(value: string): string {
  BEARER_PATTERN.lastIndex = 0;
  JWT_PATTERN.lastIndex = 0;
  EMAIL_PATTERN.lastIndex = 0;
  ASSIGNMENT_PATTERN.lastIndex = 0;
  return value
    .replace(BEARER_PATTERN, 'Bearer [Redacted]')
    .replace(JWT_PATTERN, '[Redacted]')
    .replace(EMAIL_PATTERN, '[Redacted]')
    .replace(ASSIGNMENT_PATTERN, (_full, key: string, sep: string) => `${key}${sep}[Redacted]`);
}

function scrubServerBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  const next: Breadcrumb = { ...crumb };
  if (next.data) next.data = scrubDeep(next.data) as Breadcrumb['data'];
  if (typeof next.message === 'string') next.message = sanitizeSensitiveText(next.message);
  return next;
}

function scrubHeaders(input: Record<string, unknown> | Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key.toLowerCase() === 'content-type' && typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}

function scrubRecord(input: Record<string, unknown> | Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = '[Redacted]';
      continue;
    }
    if (typeof value === 'string' && URL_DATA_KEY_PATTERN.test(key) && isUrlLike(value)) {
      out[key] = sanitizeSensitiveText(sanitizeCapturedUrl(value));
      continue;
    }
    out[key] = scrubDeep(value);
  }
  return out;
}

function scrubDeep(input: unknown, depth = 0): unknown {
  if (depth > 8) return '[Truncated]';
  if (typeof input === 'string') return sanitizeSensitiveText(input);
  if (Array.isArray(input)) return input.map((item) => scrubDeep(item, depth + 1));
  if (input && typeof input === 'object') {
    return scrubRecord(input as Record<string, unknown>);
  }
  return input;
}
