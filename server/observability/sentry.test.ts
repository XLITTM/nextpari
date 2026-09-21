import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { ErrorEvent } from '@sentry/core';
import { staffError } from '../staff/errors.js';
import { handleOwnerControlRequest } from '../owner/ownerControlHttp.js';
import { handleCashierControlRequest } from '../cashier/cashierControlHttp.js';
import { handlePlayerAuthRequest, PLAYER_AUTH_LOGIN_PATH } from '../player/playerAuthHttp.js';
import { handleBetConstructRequest } from '../betconstruct/http.js';
import { BETCONSTRUCT_NOT_CONFIGURED } from '../betconstruct/config.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from '../staff/ownerCookies.js';
import { CASHIER_ACCESS_COOKIE, CASHIER_REFRESH_COOKIE } from '../staff/cashierCookies.js';
import type { OwnerAuthGatewayPorts } from '../staff/ownerAuthService.js';
import type { CashierAuthGatewayPorts } from '../staff/cashierAuthService.js';
import {
  INTERNAL_SENTRY_TEST_PATH,
  handleSentryTestRequest,
} from './sentryTestHttp.js';
import {
  SERVER_SENTRY_TEST_ERROR,
  SERVER_SENTRY_TEST_HEADER,
  buildServerSentryInitOptions,
  configureServerSentryForTests,
  isServerSentryEnabled,
  reportServerException,
  resolveServerSentryDsn,
  resolveServerSentryEnvironment,
  resolveServerSentryRelease,
  scrubServerSentryEvent,
  sentryRouteTag,
  type ServerSentryPorts,
} from './sentry.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DSN = 'https://example.ingest.sentry.io/0';
const PREVIEW_TOKEN = 'preview-test-token';

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function previewEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    SENTRY_DSN: DSN,
    VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_SHA: 'abc123',
    SENTRY_TEST_TOKEN: PREVIEW_TOKEN,
    ...extra,
  };
}

function mockPorts(init?: { throwOnCapture?: boolean }): ServerSentryPorts & {
  captured: Array<{ error: unknown; context?: Record<string, unknown> }>;
  flushed: number[];
} {
  const captured: Array<{ error: unknown; context?: Record<string, unknown> }> = [];
  const flushed: number[] = [];
  return {
    captured,
    flushed,
    captureException(error, context) {
      if (init?.throwOnCapture) throw new Error('sentry-down');
      captured.push({ error, context });
    },
    async flush(timeoutMs) {
      flushed.push(timeoutMs ?? 0);
      return true;
    },
  };
}

function ownerSession(): OwnerAuthGatewayPorts {
  return {
    async signInWithPassword() {
      return { accessToken: 'owner-access', refreshToken: 'owner-refresh' };
    },
    async refreshSession() {
      return { accessToken: 'owner-access', refreshToken: 'owner-refresh' };
    },
    async signOutCurrentSession() {},
    async currentStaffContext() {
      return {
        role: 'owner',
        status: 'active',
        auth_user_id: 'owner-uid',
        display_name: 'Owner',
        network_id: null,
      };
    },
  };
}

function cashierSession(): CashierAuthGatewayPorts {
  return {
    async signInWithPassword() {
      return { accessToken: 'cashier-access', refreshToken: 'cashier-refresh' };
    },
    async refreshSession() {
      return { accessToken: 'cashier-access', refreshToken: 'cashier-refresh' };
    },
    async signOutCurrentSession() {},
    async currentStaffContext() {
      return {
        role: 'cashier',
        status: 'active',
        auth_user_id: 'cashier-sentry-uid',
        display_name: 'agent02',
        network_id: '11111111-1111-1111-1111-111111111111',
        legacy_cashier_id: '0393d651-e13a-4f04-ba7d-352f63bc62a5',
      };
    },
  };
}

afterEach(() => {
  configureServerSentryForTests({});
});

describe('server Sentry monitoring', () => {
  it('stays disabled without DSN or in development', () => {
    assert.equal(resolveServerSentryDsn({}), '');
    assert.equal(resolveServerSentryEnvironment({}), 'development');
    assert.equal(isServerSentryEnabled({ SENTRY_DSN: DSN, VERCEL_ENV: 'development' }), false);
    assert.equal(isServerSentryEnabled({ SENTRY_DSN: DSN }), false);
    assert.equal(isServerSentryEnabled({ VERCEL_ENV: 'preview' }), false);
    assert.equal(isServerSentryEnabled({ SENTRY_DSN: DSN, VERCEL_ENV: 'preview' }), true);
    assert.equal(isServerSentryEnabled({ SENTRY_DSN: DSN, VERCEL_ENV: 'production' }), true);
    assert.equal(resolveServerSentryRelease({ VERCEL_GIT_COMMIT_SHA: 'abc123' }), 'abc123');

    const disabled = buildServerSentryInitOptions({
      dsn: DSN,
      environment: 'development',
      release: 'abc123',
    });
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.sendDefaultPii, false);
    assert.equal(disabled.defaultIntegrations, false);
    assert.equal('tracesSampleRate' in disabled, false);
    assert.equal('profilesSampleRate' in disabled, false);
    assert.equal('enableLogs' in disabled, false);

    const preview = buildServerSentryInitOptions({
      dsn: DSN,
      environment: 'preview',
      release: 'abc123',
    });
    assert.equal(preview.enabled, true);
    assert.equal(preview.environment, 'preview');
    assert.equal(preview.release, 'abc123');

    const production = buildServerSentryInitOptions({
      dsn: DSN,
      environment: 'production',
      release: 'abc123',
    });
    assert.equal(production.enabled, true);
    assert.equal(production.environment, 'production');
  });

  it('does not fall back from SENTRY_DSN to VITE_SENTRY_DSN', () => {
    assert.equal(resolveServerSentryDsn({
      VITE_SENTRY_DSN: DSN,
    } as NodeJS.ProcessEnv), '');
    const source = read('server/observability/sentry.ts');
    assert.equal(source.includes('VITE_SENTRY_DSN'), false);
    assert.equal(source.includes('src/lib/sentry'), false);
  });

  it('scrubs bodies, cookies, authorization, query, user identity, and money assignments', () => {
    const event = {
      request: {
        url: 'https://nextpari.net/api/player/me?token=SECRET&email=x@example.com#frag',
        data: { password: 'secret-pass', amount: 100, AuthToken: 'abc', SharedKey: 'sk' },
        cookies: { session: 'abc' },
        query_string: 'token=SECRET',
        env: { SENTRY_DSN: 'secret', SUPABASE_SERVICE_ROLE_KEY: 'role' },
        headers: {
          authorization: 'Bearer abc',
          cookie: 'player=1',
          'set-cookie': 'a=b',
          'x-forwarded-for': '1.2.3.4',
          'content-type': 'application/json',
        },
      },
      user: { id: 'auth-user-1', email: 'player@example.com', ip_address: '1.2.3.4' },
      extra: {
        token: 'abc',
        password: 'x',
        phone: '+99361111111',
        balance: 50,
        amount: 12,
        stake: 3,
        payout: 9,
        walletId: 'wid',
        AuthToken: 'tok',
        SharedKey: 'sk',
        safe: 'INSUFFICIENT_BALANCE',
      },
      message: 'Auth failed Bearer SECRET for player@example.com password=SECRET token=SECRET amount=99 balance=12 stake=3 payout=8 api_key=K secret=S',
      exception: {
        values: [{ type: 'Error', value: 'Bearer SECRET player@example.com password=SECRET' }],
      },
      breadcrumbs: [
        {
          message: 'open Bearer SECRET player@example.com',
          data: { url: 'https://nextpari.net/page?access_token=SECRET', label: 'ok' },
        },
      ],
    } as unknown as ErrorEvent;

    const scrubbed = scrubServerSentryEvent(event);
    assert.equal(scrubbed?.request?.data, undefined);
    assert.equal(scrubbed?.request?.cookies, undefined);
    assert.equal(scrubbed?.request?.query_string, undefined);
    assert.equal((scrubbed?.request as { env?: unknown } | undefined)?.env, undefined);
    assert.equal(scrubbed?.user, undefined);
    assert.equal(scrubbed?.request?.url, 'https://nextpari.net/api/player/me');
    const headers = scrubbed?.request?.headers as Record<string, string> | undefined;
    assert.equal(headers?.authorization, undefined);
    assert.equal(headers?.cookie, undefined);
    assert.equal(headers?.['x-forwarded-for'], undefined);
    assert.equal(headers?.['content-type'], 'application/json');
    const extra = scrubbed?.extra as Record<string, unknown>;
    assert.equal(extra.token, '[Redacted]');
    assert.equal(extra.password, '[Redacted]');
    assert.equal(extra.phone, '[Redacted]');
    assert.equal(extra.balance, '[Redacted]');
    assert.equal(extra.amount, '[Redacted]');
    assert.equal(extra.stake, '[Redacted]');
    assert.equal(extra.payout, '[Redacted]');
    assert.equal(extra.walletId, '[Redacted]');
    assert.equal(extra.AuthToken, '[Redacted]');
    assert.equal(extra.SharedKey, '[Redacted]');
    assert.equal(extra.safe, 'INSUFFICIENT_BALANCE');

    const serialized = JSON.stringify(scrubbed);
    assert.equal(serialized.includes('SECRET'), false);
    assert.equal(serialized.includes('player@example.com'), false);
    assert.equal(serialized.includes('x@example.com'), false);
    assert.equal(serialized.includes('secret-pass'), false);
    assert.equal(serialized.includes('1.2.3.4'), false);
    assert.match(serialized, /INSUFFICIENT_BALANCE/);
    assert.match(serialized, /AUTH_REQUIRED|INSUFFICIENT_BALANCE/);
    assert.equal(sentryRouteTag('/api/player/games/11111111-2222-4333-8444-555555555555/action?x=1'), '/api/player/games/:id/action');
  });

  it('masks high-cardinality route identifiers without destroying static routes', () => {
    assert.equal(
      sentryRouteTag('/api/cashier/payouts/abcdef0123456789'),
      '/api/cashier/payouts/:id',
    );
    assert.equal(
      sentryRouteTag('/api/cashier/payouts/abcdef0123456789/confirm'),
      '/api/cashier/payouts/:id/confirm',
    );
    assert.equal(
      sentryRouteTag('/api/player/games/11111111-2222-4333-8444-555555555555/action'),
      '/api/player/games/:id/action',
    );
    assert.equal(
      sentryRouteTag('/api/owner/players/110790'),
      '/api/owner/players/:id',
    );
    assert.equal(sentryRouteTag('/api/player/password-recovery/start'), '/api/player/password-recovery/start');
    assert.equal(sentryRouteTag('/api/betconstruct/wallet'), '/api/betconstruct/wallet');
    assert.equal(sentryRouteTag('/api/owner/cashiers'), '/api/owner/cashiers');
  });

  it('strips query strings and hashes from free-text URLs', () => {
    const event = {
      message: 'request failed https://example.com/path?foo=bar&token=secret#x',
      exception: {
        values: [{
          type: 'Error',
          value: 'boom https://example.com/api/player/me?foo=bar&token=secret#x',
        }],
      },
      breadcrumbs: [
        { message: 'retry https://example.com/path?foo=bar#x' },
      ],
    } as unknown as ErrorEvent;
    const scrubbed = scrubServerSentryEvent(event);
    const serialized = JSON.stringify(scrubbed);
    assert.equal(serialized.includes('foo=bar'), false);
    assert.equal(serialized.includes('token=secret'), false);
    assert.equal(serialized.includes('#x'), false);
    assert.match(String(scrubbed?.message), /https:\/\/example\.com\/path/);
    assert.equal(String(scrubbed?.message).includes('?'), false);
  });

  it('redacts obvious identifiers in unexpected exception text without breaking diagnostic codes', () => {
    const event = {
      message: [
        'INSUFFICIENT_BALANCE AUTH_REQUIRED BETCONSTRUCT_NOT_CONFIGURED',
        'uuid=11111111-2222-4333-8444-555555555555',
        'hex abcdef0123456789',
        'token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      ].join(' '),
    } as unknown as ErrorEvent;
    const scrubbed = scrubServerSentryEvent(event);
    const serialized = JSON.stringify(scrubbed);
    assert.match(serialized, /INSUFFICIENT_BALANCE/);
    assert.match(serialized, /AUTH_REQUIRED/);
    assert.match(serialized, /BETCONSTRUCT_NOT_CONFIGURED/);
    assert.equal(serialized.includes('11111111-2222-4333-8444-555555555555'), false);
    assert.equal(serialized.includes('abcdef0123456789'), false);
    assert.equal(serialized.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), false);
  });

  it('does not leak a cashier payout code in the Sentry route tag or scrubbed event', async () => {
    const payoutCode = 'abcdef0123456789';
    const payoutPath = `/api/cashier/payouts/${payoutCode}`;
    assert.equal(sentryRouteTag(payoutPath), '/api/cashier/payouts/:id');
    assert.equal(sentryRouteTag(`${payoutPath}/confirm`), '/api/cashier/payouts/:id/confirm');

    const ports = mockPorts();
    configureServerSentryForTests({ env: previewEnv(), ports });
    const boom = new Error(`payout lookup failed ${payoutPath}?foo=bar#x`);
    const failed = await handleCashierControlRequest(
      {
        method: 'GET',
        pathname: payoutPath,
        cookie: `${CASHIER_ACCESS_COOKIE}=cashier-access; ${CASHIER_REFRESH_COOKIE}=cashier-refresh`,
        cookieSecure: true,
      },
      {
        sessionPorts: cashierSession(),
        rpcFactory: () => ({
          async invoke() {
            throw boom;
          },
        }),
      },
    );
    assert.equal(failed.status, 500);
    assert.equal(failed.body.error, 'INTERNAL_ERROR');
    assert.equal(ports.captured.length, 1);
    const tags = (ports.captured[0]?.context?.tags ?? {}) as Record<string, string>;
    assert.equal(tags.route, '/api/cashier/payouts/:id');
    assert.equal(tags.subsystem, 'cashier');
    assert.equal(JSON.stringify(ports.captured[0]?.context).includes(payoutCode), false);

    const scrubbed = scrubServerSentryEvent({
      message: boom.message,
      tags: { route: payoutPath },
      exception: { values: [{ type: 'Error', value: boom.message }] },
    } as unknown as ErrorEvent);
    const serialized = JSON.stringify(scrubbed);
    assert.equal(serialized.includes(payoutCode), false);
    assert.equal(serialized.includes('foo=bar'), false);
    assert.equal(scrubbed?.tags?.route, '/api/cashier/payouts/:id');
  });

  it('keeps ordinary diagnostic codes useful', () => {
    const event = {
      message: 'INSUFFICIENT_BALANCE AUTH_REQUIRED BETCONSTRUCT_NOT_CONFIGURED',
      extra: { code: 'INSUFFICIENT_BALANCE', reason: 'AUTH_REQUIRED' },
    } as unknown as ErrorEvent;
    const scrubbed = scrubServerSentryEvent(event);
    const serialized = JSON.stringify(scrubbed);
    assert.match(serialized, /INSUFFICIENT_BALANCE/);
    assert.match(serialized, /AUTH_REQUIRED/);
    assert.match(serialized, /BETCONSTRUCT_NOT_CONFIGURED/);
  });

  it('does not report expected 4xx typed errors and does report unexpected 500 exceptions', async () => {
    const ports = mockPorts();
    configureServerSentryForTests({ env: previewEnv(), ports });

    const denied = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_LOGIN_PATH,
        cookieSecure: true,
        body: { email: 'a', password: 'a' },
      },
      {
        async signInWithPassword() { throw staffError('AUTH_FAILED', 401); },
        async signUp() { throw staffError('AUTH_FAILED', 401); },
        async refreshSession() { throw staffError('JWT_INVALID', 401); },
        async getAuthUser() { throw staffError('AUTH_REQUIRED', 401); },
        async ensurePlayerAccount() { throw staffError('AUTH_REQUIRED', 401); },
        async loadOwnWallet() { throw staffError('AUTH_REQUIRED', 401); },
        async savePlayerProfile() {},
      },
    );
    assert.equal(denied.status, 400);
    assert.equal(ports.captured.length, 0);

    const boom = new Error('owner dashboard exploded');
    const failed = await handleOwnerControlRequest(
      {
        method: 'GET',
        pathname: '/api/owner/dashboard',
        cookie: `${OWNER_ACCESS_COOKIE}=owner-access; ${OWNER_REFRESH_COOKIE}=owner-refresh`,
        cookieSecure: true,
      },
      {
        sessionPorts: ownerSession(),
        rpcFactory: () => ({
          async invoke() {
            throw boom;
          },
        }),
      },
    );
    assert.equal(failed.status, 500);
    assert.equal(failed.body.error, 'INTERNAL_ERROR');
    assert.equal(ports.captured.length, 1);
    assert.equal(ports.captured[0]?.error, boom);
    assert.ok(ports.captured[0]?.error instanceof Error);
    assert.match(String((ports.captured[0]?.error as Error).stack), /owner dashboard exploded/);
    const tags = (ports.captured[0]?.context?.tags ?? {}) as Record<string, string>;
    assert.equal(tags.subsystem, 'owner');
    assert.equal(tags.event_name, 'owner_control_unhandled');
    assert.equal(tags.method, 'GET');
    assert.equal(tags.route, '/api/owner/dashboard');
    assert.equal('user' in (ports.captured[0]?.context ?? {}), false);
    assert.ok(ports.flushed.length >= 1);
  });

  it('never lets Sentry reporting failure break the API response', async () => {
    const ports = mockPorts({ throwOnCapture: true });
    configureServerSentryForTests({ env: previewEnv(), ports });
    const boom = new Error('still-a-500');
    const failed = await handleOwnerControlRequest(
      {
        method: 'GET',
        pathname: '/api/owner/dashboard',
        cookie: `${OWNER_ACCESS_COOKIE}=owner-access; ${OWNER_REFRESH_COOKIE}=owner-refresh`,
        cookieSecure: true,
      },
      {
        sessionPorts: ownerSession(),
        rpcFactory: () => ({
          async invoke() {
            throw boom;
          },
        }),
      },
    );
    assert.equal(failed.status, 500);
    assert.equal(failed.body.error, 'INTERNAL_ERROR');
  });

  it('does not send when disabled even if reportServerException is called', async () => {
    const ports = mockPorts();
    await reportServerException(new Error('nope'), { subsystem: 'player_auth' }, {
      env: { SENTRY_DSN: DSN, VERCEL_ENV: 'development' },
      ports,
    });
    await reportServerException(new Error('nope'), { subsystem: 'player_auth' }, {
      env: { VERCEL_ENV: 'preview' },
      ports,
    });
    assert.equal(ports.captured.length, 0);
  });

  it('requires a Preview header token and reports NEXTPARI_SERVER_SENTRY_TEST_ERROR', async () => {
    const ports = mockPorts();
    const silentLog = { error() { /* never log the test token */ } };
    const ok = await handleSentryTestRequest(
      {
        method: 'POST',
        pathname: INTERNAL_SENTRY_TEST_PATH,
        headers: { [SERVER_SENTRY_TEST_HEADER]: PREVIEW_TOKEN },
      },
      previewEnv(),
      silentLog,
      ports,
    );
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, { ok: true, sent: true });
    assert.equal(ports.captured.length, 1);
    assert.equal((ports.captured[0]?.error as Error).message, SERVER_SENTRY_TEST_ERROR);

    const missing = await handleSentryTestRequest(
      {
        method: 'POST',
        pathname: INTERNAL_SENTRY_TEST_PATH,
        headers: {},
      },
      previewEnv(),
      silentLog,
      ports,
    );
    assert.equal(missing.status, 404);
    assert.equal(ports.captured.length, 1);

    const queryOnly = await handleSentryTestRequest(
      {
        method: 'POST',
        pathname: `${INTERNAL_SENTRY_TEST_PATH}?${SERVER_SENTRY_TEST_HEADER}=${PREVIEW_TOKEN}`,
        headers: { [SERVER_SENTRY_TEST_HEADER]: 'wrong' },
      },
      previewEnv(),
      silentLog,
      ports,
    );
    assert.equal(queryOnly.status, 404);
  });

  it('returns 404 and never reports from the Production test endpoint', async () => {
    const ports = mockPorts();
    const silentLog = { error() { /* never log the test token */ } };
    const result = await handleSentryTestRequest(
      {
        method: 'POST',
        pathname: INTERNAL_SENTRY_TEST_PATH,
        headers: { [SERVER_SENTRY_TEST_HEADER]: PREVIEW_TOKEN },
      },
      previewEnv({ VERCEL_ENV: 'production' }),
      silentLog,
      ports,
    );
    assert.equal(result.status, 404);
    assert.equal(ports.captured.length, 0);

    const development = await handleSentryTestRequest(
      {
        method: 'POST',
        pathname: INTERNAL_SENTRY_TEST_PATH,
        headers: { [SERVER_SENTRY_TEST_HEADER]: PREVIEW_TOKEN },
      },
      previewEnv({ VERCEL_ENV: 'development' }),
      silentLog,
      ports,
    );
    assert.equal(development.status, 404);
    assert.equal(ports.captured.length, 0);
  });

  it('does not attach raw BetConstruct bodies or report fail-closed configuration', async () => {
    const ports = mockPorts();
    configureServerSentryForTests({ env: previewEnv(), ports });
    const result = await handleBetConstructRequest({
      method: 'POST',
      pathname: '/api/betconstruct/operator/GetClientDetails',
      body: {
        AuthToken: 'secret-auth',
        SharedKey: 'shared',
        amount: 50,
        playerId: 'p1',
      },
    });
    assert.equal(result.status, 409);
    assert.equal(result.body.error, BETCONSTRUCT_NOT_CONFIGURED);
    assert.equal(ports.captured.length, 0);

    const http = read('server/betconstruct/http.ts');
    assert.match(http, /subsystem: 'betconstruct'/);
    assert.equal(http.includes('input.body'), true);
    assert.match(http, /void input\.body/);
    assert.equal(/reportServerException\([\s\S]*input\.body/.test(http), false);
  });

  it('instruments inner unexpected 500 catches without reporting StaffOnboardingError branches', () => {
    const files = [
      'server/player/playerAuthHttp.ts',
      'server/player/playerWithdrawalHttp.ts',
      'server/player/playerGamesHttp.ts',
      'server/player/sportsPlaceHttp.ts',
      'server/owner/ownerControlHttp.ts',
      'server/manager/managerControlHttp.ts',
      'server/cashier/cashierControlHttp.ts',
      'server/security/securityControlHttp.ts',
      'server/staff/httpHandler.ts',
      'server/betconstruct/http.ts',
    ];
    for (const rel of files) {
      const source = read(rel);
      assert.match(source, /await reportServerException/, rel);
      assert.match(source, /if \(error instanceof StaffOnboardingError\)/, rel);
      const staffIdx = source.indexOf('if (error instanceof StaffOnboardingError)');
      const reportIdx = source.indexOf('await reportServerException');
      assert.ok(staffIdx >= 0 && reportIdx > staffIdx, rel);
      assert.equal(source.includes('src/lib/sentry'), false, rel);
    }
    const frontend = read('src/lib/sentry.ts');
    assert.match(frontend, /@sentry\/react/);
    assert.equal(frontend.includes('@sentry/node'), false);
  });

  it('does not commit Sentry secrets, tracing, or source-map upload', () => {
    const envExample = read('.env.example');
    assert.match(envExample, /^SENTRY_DSN=$/m);
    assert.match(envExample, /^SENTRY_TEST_TOKEN=$/m);
    assert.match(envExample, /^VITE_SENTRY_DSN=$/m);
    assert.match(envExample, /Server-side Sentry DSN/);
    assert.match(envExample, /Preview-only controlled verification token/);
    assert.equal(/SENTRY_DSN=.+/.test(envExample.split('\n').find((line) => line.startsWith('SENTRY_DSN=')) ?? ''), false);
    assert.equal(/SENTRY_TEST_TOKEN=.+/.test(envExample.split('\n').find((line) => line.startsWith('SENTRY_TEST_TOKEN=')) ?? ''), false);

    const sources = [
      read('server/observability/sentry.ts'),
      read('server/observability/sentryTestHttp.ts'),
      read('api/internal/sentry-test.ts'),
      envExample,
      read('package.json'),
    ].join('\n');
    assert.equal(/SENTRY_AUTH_TOKEN\s*=/.test(sources), false);
    assert.equal(/https:\/\/[a-z0-9]+@o\d+\.ingest/.test(sources), false);
    assert.equal(sources.includes('replayIntegration'), false);
    assert.equal(sources.includes('tracesSampleRate'), false);
    assert.equal(sources.includes('@sentry/profiling-node'), false);
    assert.match(read('package.json'), /"@sentry\/node": "\^10\.75\.0"/);
    assert.match(read('package.json'), /"@sentry\/react": "\^10\.75\.0"/);
  });
});
