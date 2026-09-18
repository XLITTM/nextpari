import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { ErrorEvent } from '@sentry/core';
import {
  SENTRY_TEST_ERROR,
  SENTRY_TEST_QUERY,
  SENTRY_TEST_VALUE,
  buildSentryInitOptions,
  initSentry,
  isSentryTestRequest,
  resolveSentryDsn,
  resolveSentryEnvironment,
  scrubSentryEvent,
} from './sentry.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Sentry frontend monitoring', () => {
  it('stays disabled when DSN is absent and does not enable Replay or Tracing', () => {
    assert.equal(resolveSentryDsn({}), '');
    assert.equal(resolveSentryEnvironment({ DEV: true }), 'development');
    assert.deepEqual(initSentry({}), { enabled: false, environment: 'development' });
    const disabled = buildSentryInitOptions({
      dsn: 'https://example.ingest.sentry.io/0',
      environment: 'development',
      release: 'abc123',
    });
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.sendDefaultPii, false);
    assert.equal('tracesSampleRate' in disabled, false);
    assert.equal('profilesSampleRate' in disabled, false);
    assert.equal('replaysSessionSampleRate' in disabled, false);
    assert.equal('replaysOnErrorSampleRate' in disabled, false);
    assert.equal(disabled.integrations, undefined);

    const preview = buildSentryInitOptions({
      dsn: 'https://example.ingest.sentry.io/0',
      environment: 'preview',
      release: 'abc123',
    });
    assert.equal(preview.enabled, true);
    assert.equal(preview.environment, 'preview');
    assert.equal(preview.release, 'abc123');
    assert.equal(preview.sendDefaultPii, false);
  });

  it('redacts sensitive keys, bodies, cookies, and user identity', () => {
    const event = {
      request: {
        url: 'https://nextpari.example/api/player/me',
        data: { password: 'secret-pass', amount: 100 },
        cookies: { session: 'abc' },
        headers: {
          authorization: 'Bearer abc',
          cookie: 'player=1',
          'content-type': 'application/json',
        },
      },
      user: { email: 'player@example.com', username: 'player' },
      extra: {
        token: 'abc',
        phone: '+99361111111',
        document_number: 'A123',
        passport: 'P1',
        balance: 50,
        safe: 'ok',
      },
      breadcrumbs: [
        { message: 'clicked save', data: { authToken: 'xyz', label: 'save' } },
      ],
    } as unknown as ErrorEvent;

    const scrubbed = scrubSentryEvent(event);
    assert.equal(scrubbed?.request?.data, undefined);
    assert.equal(scrubbed?.request?.cookies, undefined);
    assert.equal(scrubbed?.user, undefined);
    const headers = scrubbed?.request?.headers as Record<string, string> | undefined;
    assert.equal(headers?.authorization, '[Redacted]');
    assert.equal(headers?.cookie, '[Redacted]');
    assert.equal(headers?.['content-type'], 'application/json');
    const extra = scrubbed?.extra as Record<string, unknown>;
    assert.equal(extra.token, '[Redacted]');
    assert.equal(extra.phone, '[Redacted]');
    assert.equal(extra.document_number, '[Redacted]');
    assert.equal(extra.passport, '[Redacted]');
    assert.equal(extra.balance, '[Redacted]');
    assert.equal(extra.safe, 'ok');
    assert.equal((scrubbed?.breadcrumbs?.[0]?.data as { authToken?: string }).authToken, '[Redacted]');
  });

  it('exposes a preview-only test hook and does not commit secrets', () => {
    assert.equal(isSentryTestRequest(`?${SENTRY_TEST_QUERY}=${SENTRY_TEST_VALUE}`, 'preview'), true);
    assert.equal(isSentryTestRequest(`?${SENTRY_TEST_QUERY}=${SENTRY_TEST_VALUE}`, 'production'), false);
    assert.equal(isSentryTestRequest('', 'preview'), false);
    assert.equal(SENTRY_TEST_ERROR, 'NEXTPARI_SENTRY_TEST_ERROR');

    const envExample = read('.env.example');
    assert.match(envExample, /VITE_SENTRY_DSN=/);
    assert.equal(/VITE_SENTRY_DSN=.+/.test(envExample.split('\n').find((line) => line.startsWith('VITE_SENTRY_DSN=')) ?? ''), false);

    const sources = [
      read('src/lib/sentry.ts'),
      read('src/main.tsx'),
      read('src/components/SentryRootFallback.tsx'),
      read('src/components/ErrorBoundary.tsx'),
      read('vite.config.ts'),
      envExample,
    ].join('\n');
    assert.equal(/SENTRY_AUTH_TOKEN\s*=/.test(sources), false);
    assert.equal(/https:\/\/[a-z0-9]+@o\d+\.ingest/.test(sources), false);
    assert.equal(sources.includes('replayIntegration'), false);
    assert.equal(sources.includes('browserTracingIntegration'), false);
    assert.equal(sources.includes('tracesSampleRate'), false);

    const fallback = read('src/components/SentryRootFallback.tsx');
    assert.match(fallback, /Произошла ошибка/);
    assert.match(fallback, /Обновите страницу и попробуйте снова\./);
    assert.match(fallback, /Обновить страницу/);
    assert.equal(fallback.includes('eventId'), false);
    assert.equal(fallback.includes('componentStack'), false);

    const main = read('src/main.tsx');
    assert.match(main, /initSentry/);
    assert.match(main, /Sentry\.ErrorBoundary/);
    assert.match(main, /SentryRootFallback/);

    const viteConfig = read('vite.config.ts');
    assert.match(viteConfig, /VERCEL_ENV/);
    assert.match(viteConfig, /VERCEL_GIT_COMMIT_SHA/);
  });
});
