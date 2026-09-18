import * as Sentry from '@sentry/react';
import type { Breadcrumb, BrowserOptions, ErrorEvent } from '@sentry/react';

export const SENTRY_TEST_QUERY = 'np_sentry_test';
export const SENTRY_TEST_VALUE = 'NEXTPARI_SENTRY_TEST';
export const SENTRY_TEST_ERROR = 'NEXTPARI_SENTRY_TEST_ERROR';

export type SentryEnvironment = 'production' | 'preview' | 'development';

export const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|set-cookie|password|passwd|token|access[_-]?token|refresh[_-]?token|authtoken|sessiontoken|secret|api[_-]?key|apikey|service_role|phone|email|document_number|document_series|passport|balance|iban|card|cvv|pin|wallet/i;

type EnvLike = {
  DEV?: boolean;
  MODE?: string;
  VITE_SENTRY_DSN?: string;
  VITE_SENTRY_ENVIRONMENT?: string;
  VITE_SENTRY_RELEASE?: string;
};

function readViteSentryEnv(): EnvLike {
  return {
    DEV: import.meta.env.DEV,
    MODE: import.meta.env.MODE,
    VITE_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN,
    VITE_SENTRY_ENVIRONMENT: import.meta.env.VITE_SENTRY_ENVIRONMENT,
    VITE_SENTRY_RELEASE: import.meta.env.VITE_SENTRY_RELEASE,
  };
}

export function resolveSentryEnvironment(env: EnvLike = readViteSentryEnv()): SentryEnvironment {
  const explicit = String(env.VITE_SENTRY_ENVIRONMENT ?? '').trim();
  if (explicit === 'production' || explicit === 'preview' || explicit === 'development') {
    return explicit;
  }
  return 'development';
}

export function resolveSentryDsn(env: EnvLike = readViteSentryEnv()): string {
  return String(env.VITE_SENTRY_DSN ?? '').trim();
}

export function resolveSentryRelease(env: EnvLike = readViteSentryEnv()): string {
  return String(env.VITE_SENTRY_RELEASE ?? '').trim();
}

export function buildSentryInitOptions(input: {
  dsn: string;
  environment: SentryEnvironment;
  release?: string;
}): BrowserOptions {
  const enabled = Boolean(input.dsn) && input.environment !== 'development';
  return {
    dsn: input.dsn,
    enabled,
    environment: input.environment,
    release: input.release || undefined,
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}

let sentryStarted = false;

export function initSentry(env: EnvLike = readViteSentryEnv()): { enabled: boolean; environment: SentryEnvironment } {
  const environment = resolveSentryEnvironment(env);
  const dsn = resolveSentryDsn(env);
  if (!dsn) {
    sentryStarted = false;
    return { enabled: false, environment };
  }
  const options = buildSentryInitOptions({
    dsn,
    environment,
    release: resolveSentryRelease(env),
  });
  Sentry.init(options);
  sentryStarted = options.enabled === true;
  return { enabled: sentryStarted, environment };
}

export function captureSentryException(error: unknown): void {
  if (!sentryStarted) return;
  Sentry.captureException(error);
}

export function isSentryTestRequest(search: string, environment: SentryEnvironment): boolean {
  if (environment === 'production') return false;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return params.get(SENTRY_TEST_QUERY) === SENTRY_TEST_VALUE;
}

export function maybeTriggerSentryTest(
  location: Pick<Location, 'search'> = window.location,
  env: EnvLike = readViteSentryEnv(),
): boolean {
  const environment = resolveSentryEnvironment(env);
  if (!isSentryTestRequest(location.search, environment)) return false;
  captureSentryException(new Error(SENTRY_TEST_ERROR));
  return true;
}

export function scrubSentryEvent(event: ErrorEvent): ErrorEvent | null {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.headers) {
      event.request.headers = scrubRecord(event.request.headers) as Record<string, string>;
    }
    event.request = scrubDeep(event.request) as ErrorEvent['request'];
  }
  delete event.user;
  if (event.extra) event.extra = scrubDeep(event.extra) as ErrorEvent['extra'];
  if (event.contexts) event.contexts = scrubDeep(event.contexts) as ErrorEvent['contexts'];
  if (event.tags) event.tags = scrubDeep(event.tags) as ErrorEvent['tags'];
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map((crumb) => scrubBreadcrumb(crumb))
      .filter((crumb): crumb is Breadcrumb => crumb != null);
  }
  return event;
}

function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  const next: Breadcrumb = { ...crumb };
  if (next.data) next.data = scrubDeep(next.data) as Breadcrumb['data'];
  if (typeof next.message === 'string' && SENSITIVE_KEY_PATTERN.test(next.message)) {
    next.message = '[Redacted]';
  }
  return next;
}

function scrubRecord(input: Record<string, unknown> | Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    out[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[Redacted]' : scrubDeep(value);
  }
  return out;
}

function scrubDeep(input: unknown, depth = 0): unknown {
  if (depth > 8) return '[Truncated]';
  if (Array.isArray(input)) return input.map((item) => scrubDeep(item, depth + 1));
  if (input && typeof input === 'object') {
    return scrubRecord(input as Record<string, unknown>);
  }
  return input;
}
