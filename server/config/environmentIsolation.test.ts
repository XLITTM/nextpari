import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { handleBetConstructRequest } from '../betconstruct/http.js';
import { resolveLsportsRmqConfig } from '../lsports/config.js';
import { loadOwnerAuthEnv } from '../staff/env.js';
import { staffHttpLog } from '../staff/httpHandler.js';
import {
  assertEnvironmentIsolation,
  collectEnvironmentIsolationFailures,
  EnvironmentIsolationError,
  PRODUCTION_LSPORTS_PACKAGE_IDS,
  resolveRuntimeRole,
  STAGING_REQUIRED_KEYS,
} from './environmentIsolation.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function projectRef(prefix: string): string {
  const value = `${prefix}${'a'.repeat(20)}`.slice(0, 20);
  if (!/^[a-z0-9]{20}$/.test(value)) throw new Error(`bad ref ${value}`);
  return value;
}

function validStaging(): NodeJS.ProcessEnv {
  const productionRef = projectRef('prodref');
  const stagingRef = projectRef('stagingref');
  const anon = `anon${'a'.repeat(20)}`;
  const service = `service${'b'.repeat(20)}`;
  const url = `https://${stagingRef}.supabase.co`;
  return {
    NEXTPARI_ENV: 'staging',
    VERCEL_ENV: 'production',
    NEXTPARI_SYNTHETIC_USERS_ONLY: 'true',
    NEXTPARI_REAL_MONEY_ENABLED: 'false',
    NEXTPARI_PAYMENTS_ENABLED: 'false',
    NEXTPARI_WALLET_MODE: 'synthetic',
    NEXTPARI_ALLOW_PRODUCTION_PLAYER_IMPORT: 'false',
    NEXTPARI_STAGING_CREDENTIALS_ARE_DISTINCT: 'true',
    NEXTPARI_PLAYER_EMAIL_DOMAIN: 'staging.nextpari.test',
    NEXTPARI_COOKIE_DOMAIN: '',
    NEXTPARI_PUBLIC_ORIGIN: 'https://nextpari-staging.vercel.app',
    VERCEL_URL: 'nextpari-staging.vercel.app',
    NEXTPARI_PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
    NEXTPARI_STAGING_SUPABASE_PROJECT_REF: stagingRef,
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: anon,
    SUPABASE_SERVICE_ROLE_KEY: service,
    VITE_SUPABASE_URL: url,
    VITE_SUPABASE_ANON_KEY: anon,
    PLAYER_EMAIL_OTP_PEPPER: `otp-${'p'.repeat(32)}`,
    PLAYER_SECURITY_SIGNAL_PEPPER: `sig-${'s'.repeat(32)}`,
    BETCONSTRUCT_ENABLED: '0',
    CANONICAL_SPORTS_BET_ENABLED: '0',
    LSPORTS_DISPLAY_FEED: '0',
    VITE_LSPORTS_DISPLAY_FEED: '0',
    VITE_SENTRY_ENVIRONMENT: 'staging',
    SENTRY_ENVIRONMENT: 'staging',
  };
}

function failuresOf(patch: NodeJS.ProcessEnv): string[] {
  return collectEnvironmentIsolationFailures({ ...validStaging(), ...patch });
}

function assignments(text: string): Array<{ key: string; value: string }> {
  return text.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return [];
    const eq = trimmed.indexOf('=');
    assert.ok(eq > 0, trimmed);
    return [{ key: trimmed.slice(0, eq).trim(), value: trimmed.slice(eq + 1).trim() }];
  });
}

const ALLOWED_VALUES = new Set([
  '',
  '0',
  'false',
  'true',
  'staging',
  'synthetic',
  'staging.nextpari.test',
]);

describe('staging environment isolation', () => {
  it('accepts a complete staging configuration on a Vercel project', () => {
    const env = validStaging();
    assert.equal(resolveRuntimeRole(env), 'staging');
    assert.deepEqual(collectEnvironmentIsolationFailures(env), []);
    assert.equal(assertEnvironmentIsolation(env), 'staging');
  });

  it('leaves an unset production-shaped environment alone', () => {
    const env = {
      VERCEL_ENV: 'production',
      SUPABASE_URL: 'https://prodrefaaaaaaaaaaaa.supabase.co',
      SUPABASE_ANON_KEY: 'production-anon-key-value',
    };
    assert.equal(resolveRuntimeRole(env), 'unspecified');
    assert.deepEqual(collectEnvironmentIsolationFailures(env), []);
    assert.equal(assertEnvironmentIsolation(env), 'unspecified');
  });

  it('requires an explicit staging role when Railway is named staging', () => {
    assert.deepEqual(
      collectEnvironmentIsolationFailures({ RAILWAY_ENVIRONMENT_NAME: 'staging' }),
      ['NEXTPARI_ENV_REQUIRED'],
    );
    assert.deepEqual(
      collectEnvironmentIsolationFailures({ NEXTPARI_ENV: 'production', RAILWAY_ENVIRONMENT_NAME: 'staging' }),
      ['STAGING_MISLABELED_AS_PRODUCTION'],
    );
  });

  it('rejects a deployed process that tries to use the local test role', () => {
    assert.deepEqual(
      collectEnvironmentIsolationFailures({ NEXTPARI_ENV: 'test', VERCEL_ENV: 'preview' }),
      ['DEPLOYED_RUNTIME_ROLE_FORBIDDEN'],
    );
    assert.equal(assertEnvironmentIsolation({ NEXTPARI_ENV: 'test' }), 'test');
    assert.deepEqual(collectEnvironmentIsolationFailures({ NEXTPARI_ENV: 'stage' }), ['NEXTPARI_ENV_INVALID']);
  });

  it('rejects the production database, shared cookies, and production hosts', () => {
    const productionRef = String(validStaging().NEXTPARI_PRODUCTION_SUPABASE_PROJECT_REF);
    const productionUrl = `https://${productionRef}.supabase.co`;
    assert.ok(failuresOf({
      SUPABASE_URL: productionUrl,
      VITE_SUPABASE_URL: productionUrl,
    }).includes('STAGING_SUPABASE_URL_MISMATCH'));
    assert.ok(failuresOf({
      SUPABASE_URL: productionUrl,
      VITE_SUPABASE_URL: productionUrl,
    }).includes('STAGING_VALUE_CONTAINS_PRODUCTION_REF'));
    assert.ok(failuresOf({ NEXTPARI_PUBLIC_ORIGIN: 'https://nextpari.net' }).includes('STAGING_PUBLIC_ORIGIN_IS_PRODUCTION'));
    assert.ok(failuresOf({ NEXTPARI_PUBLIC_ORIGIN: 'https://staging.nextpari.net' }).includes('STAGING_PUBLIC_ORIGIN_IS_PRODUCTION'));
    assert.ok(failuresOf({ NEXTPARI_PUBLIC_ORIGIN: 'https://example.com' }).includes('STAGING_PUBLIC_ORIGIN_INVALID'));
    assert.ok(failuresOf({ NEXTPARI_COOKIE_DOMAIN: '.nextpari.net' }).includes('STAGING_COOKIE_DOMAIN_MUST_BE_HOST_ONLY'));
    assert.ok(failuresOf({ DATABASE_URL: productionUrl }).includes('STAGING_DATABASE_URL_FORBIDDEN'));
    const stagingRef = String(validStaging().NEXTPARI_STAGING_SUPABASE_PROJECT_REF);
    assert.ok(collectEnvironmentIsolationFailures({
      NEXTPARI_ENV: 'production',
      NEXTPARI_STAGING_SUPABASE_PROJECT_REF: stagingRef,
      SUPABASE_URL: `https://${stagingRef}.supabase.co`,
    }).includes('PRODUCTION_POINTS_AT_STAGING_DATABASE'));
  });

  it('rejects real-money providers, payments, live sports, and production player import', () => {
    assert.ok(failuresOf({ NEXTPARI_REAL_MONEY_ENABLED: 'true' }).includes('STAGING_REAL_MONEY_FORBIDDEN'));
    assert.ok(failuresOf({ NEXTPARI_PAYMENTS_ENABLED: 'true' }).includes('STAGING_PAYMENTS_FORBIDDEN'));
    assert.ok(failuresOf({ NEXTPARI_WALLET_MODE: 'production' }).includes('STAGING_WALLET_MODE_INVALID'));
    assert.ok(failuresOf({ NEXTPARI_SYNTHETIC_USERS_ONLY: 'false' }).includes('STAGING_SYNTHETIC_USERS_REQUIRED'));
    assert.ok(failuresOf({ NEXTPARI_ALLOW_PRODUCTION_PLAYER_IMPORT: 'true' }).includes('STAGING_PLAYER_IMPORT_FORBIDDEN'));
    assert.ok(failuresOf({ NEXTPARI_STAGING_CREDENTIALS_ARE_DISTINCT: 'false' }).includes('STAGING_CREDENTIALS_MUST_BE_DISTINCT'));
    assert.ok(failuresOf({ NEXTPARI_PLAYER_EMAIL_DOMAIN: 'gmail.com' }).includes('STAGING_EMAIL_DOMAIN_INVALID'));
    assert.ok(failuresOf({ STRIPE_SECRET_KEY: 'stripe-test-value' }).includes('STAGING_PAYMENT_PROVIDER_FORBIDDEN'));
    assert.ok(failuresOf({ RESEND_API_KEY: 'resend-test-value' }).includes('STAGING_EMAIL_PROVIDER_FORBIDDEN'));
    assert.ok(failuresOf({ BETCONSTRUCT_ENABLED: '1' }).includes('STAGING_BETCONSTRUCT_FORBIDDEN'));
    assert.ok(failuresOf({ BETCONSTRUCT_SPORTS_SHARED_KEY: 'sports-shared-key-value' }).includes('STAGING_BETCONSTRUCT_FORBIDDEN'));
    assert.ok(failuresOf({ CANONICAL_SPORTS_BET_ENABLED: '1' }).includes('STAGING_SPORTS_BETTING_FORBIDDEN'));
    assert.ok(failuresOf({ LSPORTS_FEED_BASE_URL: 'https://nextpari-production.up.railway.app' }).includes('STAGING_LSPORTS_FORBIDDEN'));
    assert.ok(failuresOf({ SENTRY_ENVIRONMENT: 'production' }).includes('STAGING_SENTRY_ENVIRONMENT_INVALID'));
    for (const packageId of PRODUCTION_LSPORTS_PACKAGE_IDS) {
      assert.ok(failuresOf({ LSPORTS_INPLAY_PACKAGE_ID: packageId }).includes('STAGING_LSPORTS_FORBIDDEN'), packageId);
    }
    assert.ok(failuresOf({ LSPORTS_INPLAY_PACKAGE_ID: '9999' }).includes('STAGING_LSPORTS_FORBIDDEN'));
  });

  it('checks the platform host, not only the configured origin', () => {
    assert.ok(failuresOf({ VERCEL_URL: 'nextpari.net' }).includes('STAGING_DEPLOYMENT_HOST_IS_PRODUCTION'));
    assert.ok(failuresOf({
      VERCEL_URL: 'nextpari-production.up.railway.app',
    }).includes('STAGING_DEPLOYMENT_HOST_IS_PRODUCTION'));
    assert.ok(failuresOf({ VERCEL_URL: '' }).includes('STAGING_DEPLOYMENT_HOST_REQUIRED'));
    assert.ok(failuresOf({
      VERCEL_URL: 'other-staging.vercel.app',
    }).includes('STAGING_DEPLOYMENT_HOST_MISMATCH'));
  });

  it('keeps production LSports defaults and blocks them on staging', () => {
    const production = resolveLsportsRmqConfig('inplay', {
      LSPORTS_RMQ_USERNAME: 'shared-user',
      LSPORTS_RMQ_PASSWORD: 'shared-secret',
    });
    assert.equal(production.packageId, 4351);
    assert.throws(
      () => resolveLsportsRmqConfig('inplay', {
        ...validStaging(),
        LSPORTS_RMQ_USERNAME: 'staging-user',
        LSPORTS_RMQ_PASSWORD: 'staging-secret',
      }),
      (error: unknown) => error instanceof EnvironmentIsolationError && error.code === 'STAGING_LSPORTS_FORBIDDEN',
    );
  });

  it('fail-closes BetConstruct launch and still loads ordinary owner auth', async () => {
    const blocked = await handleBetConstructRequest(
      { method: 'POST', pathname: '/api/player/betconstruct/sportsbook-launch' },
      staffHttpLog,
      { ...validStaging(), BETCONSTRUCT_ENABLED: '1' },
    );
    assert.equal(blocked.status, 503);
    assert.equal((blocked.body as { error?: string }).error, 'STAGING_BETCONSTRUCT_FORBIDDEN');

    const previous = {
      NEXTPARI_ENV: process.env.NEXTPARI_ENV,
      RAILWAY_ENVIRONMENT_NAME: process.env.RAILWAY_ENVIRONMENT_NAME,
      NEXTPARI_PUBLIC_ORIGIN: process.env.NEXTPARI_PUBLIC_ORIGIN,
      NEXTPARI_STAGING_SUPABASE_PROJECT_REF: process.env.NEXTPARI_STAGING_SUPABASE_PROJECT_REF,
      VITE_SUPABASE_SERVICE_ROLE_KEY: process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_URL: process.env.SUPABASE_URL,
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
    };
    process.env.NEXTPARI_ENV = '';
    delete process.env.RAILWAY_ENVIRONMENT_NAME;
    delete process.env.NEXTPARI_PUBLIC_ORIGIN;
    delete process.env.NEXTPARI_STAGING_SUPABASE_PROJECT_REF;
    delete process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    delete process.env.VITE_SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = 'anon-key-for-test-only';
    delete process.env.VITE_SUPABASE_ANON_KEY;
    try {
      assert.deepEqual(loadOwnerAuthEnv(), {
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'anon-key-for-test-only',
      });
      process.env.NEXTPARI_ENV = 'staging';
      process.env.SUPABASE_URL = `https://${projectRef('prodref')}.supabase.co`;
      assert.throws(
        () => loadOwnerAuthEnv(),
        (error: unknown) => error instanceof EnvironmentIsolationError,
      );
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value == null) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

describe('staging templates and contracts', () => {
  const templatePaths = [
    '.env.staging.example',
    'deploy/staging/vercel.env.example',
    'deploy/staging/railway.env.example',
  ];

  it('keeps templates to variable names and non-secret switches', () => {
    const parsed = templatePaths.map((path) => assignments(read(path)));
    for (const rows of parsed) {
      for (const row of rows) {
        assert.match(row.key, /^[A-Z][A-Z0-9_]*$/);
        assert.ok(ALLOWED_VALUES.has(row.value), `${row.key}=${row.value}`);
        assert.equal(/eyJ|sk_live|sk_test|supabase\.co|nextpari\.net|railway\.app|4351|4352/.test(row.value), false);
      }
    }
    const masterKeys = parsed[0].map((row) => row.key);
    for (const key of STAGING_REQUIRED_KEYS) assert.ok(masterKeys.includes(key), key);
    assert.deepEqual(parsed[1].map((row) => `${row.key}=${row.value}`), parsed[0].map((row) => `${row.key}=${row.value}`));
    assert.deepEqual(parsed[2].map((row) => `${row.key}=${row.value}`), parsed[0].map((row) => `${row.key}=${row.value}`));
  });

  it('preserves player, staff, and Android player API paths and host-only cookies', () => {
    const contracts: Array<[string, string]> = [
      ['server/player/playerAuthHttp.ts', "export const PLAYER_AUTH_LOGIN_PATH = '/api/player/auth/login';"],
      ['server/player/playerAuthHttp.ts', "export const PLAYER_AUTH_REGISTER_PATH = '/api/player/auth/register';"],
      ['server/player/playerAuthHttp.ts', "export const PLAYER_ME_PATH = '/api/player/me';"],
      ['server/player/playerAuthHttp.ts', "export const PLAYER_WALLET_PATH = '/api/player/wallet';"],
      ['server/player/playerWalletsService.ts', "export const PLAYER_WALLETS_PATH = '/api/player/wallets';"],
      ['server/player/playerWalletsService.ts', "export const PLAYER_WALLETS_ADD_PATH = '/api/player/wallets/add';"],
      ['server/player/playerWalletsService.ts', "export const PLAYER_WALLETS_ACTIVE_PATH = '/api/player/wallets/active';"],
      ['server/staff/ownerAuthHttp.ts', "export const OWNER_AUTH_LOGIN_PATH = '/api/owner/auth/login';"],
      ['server/staff/managerAuthHttp.ts', "export const MANAGER_AUTH_LOGIN_PATH = '/api/manager/auth/login';"],
      ['server/staff/cashierAuthHttp.ts', "export const CASHIER_AUTH_LOGIN_PATH = '/api/cashier/auth/login';"],
      ['server/staff/securityAuthHttp.ts', "export const SECURITY_AUTH_LOGIN_PATH = '/api/security/auth/login';"],
    ];
    for (const [file, line] of contracts) assert.equal(read(file).includes(line), true, line);

    for (const file of [
      'server/player/playerCookies.ts',
      'server/staff/ownerCookies.ts',
      'server/staff/managerCookies.ts',
      'server/staff/cashierCookies.ts',
      'server/staff/securityCookies.ts',
    ]) {
      const source = read(file);
      assert.equal(source.includes('Domain='), false, file);
      assert.match(source, /nextpari_(player|owner|manager|cashier|security)_(access|refresh|device)/);
    }
    assert.equal(read('server/config/environmentIsolation.ts').includes('tenant_id'), false);
    assert.equal(read('server/config/checkStagingEnv.ts').includes('db push'), false);
    assert.equal(read('server/config/checkStagingEnv.ts').includes('supabase link'), false);
  });

  it('documents provisioning without changing Vercel or Railway deploy files', () => {
    const doc = read('docs/staging/STAGING.md');
    for (const phrase of [
      'supabase link --project-ref',
      'supabase db push',
      'supabase db dump',
      'staging.nextpari.test',
      'NEXTPARI_SYNTHETIC_USERS_ONLY',
      'Do not run `supabase db dump`',
      'Owner approval is required',
    ]) {
      assert.equal(doc.includes(phrase), true, phrase);
    }
    assert.match(read('vercel.json'), /\/index\.html/);
    assert.match(read('railway.toml'), /npm start/);
    assert.match(read('railway.toml'), /healthcheckPath = "\/health"/);
    assert.equal(read('railway.toml').includes('staging'), false);
    assert.equal(existsSync(join(root, 'supabase/migrations')), true);
  });
});
