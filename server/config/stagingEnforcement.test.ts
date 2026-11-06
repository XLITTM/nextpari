import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { handlePlayerGamesRequest } from '../player/playerGamesHttp.js';
import { handleVercelPlayerAuth } from '../player/playerAuthHttp.js';
import { registerPlayerWithPassword } from '../player/playerAuthService.js';
import type { PlayerAuthGatewayPorts } from '../player/playerAuthService.js';
import type { PlayerGameGatewayPorts } from '../player/playerGamesService.js';
import { StaffOnboardingError } from '../staff/errors.js';
import { staffHttpLog } from '../staff/httpHandler.js';
import { provisionAuthThenBind } from '../staff/staffHierarchyService.js';
import type { AuthAdminPort } from '../staff/types.js';
import { EnvironmentIsolationError } from './environmentIsolation.js';
import {
  STAGING_SYNTHETIC_WALLET_VERIFIED,
  assertStagingClientBuild,
  assertSupabaseTarget,
  guardStagingMonetaryRpc,
  isMonetaryHttpPath,
  isMonetaryRpc,
  stagingHttpDenial,
  syntheticAccountEmailFailure,
  syntheticRegistrationFailure,
} from './stagingEnforcement.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

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

const ISOLATION_KEY = /^(NEXTPARI_|VERCEL|RAILWAY_|SUPABASE_|VITE_|BETCONSTRUCT_|LSPORTS_|STRIPE_|NOWPAYMENTS_|COINBASE_|PAYPAL_|PAYBOX_|CASHFREE_|SENTRY_|RESEND_|PLAYER_|DATABASE_|POSTGRES_|DIRECT_|CANONICAL_|PAYMENT)/;

async function withProcessEnv(env: NodeJS.ProcessEnv, run: () => Promise<void>): Promise<void> {
  const snapshot = { ...process.env };
  for (const key of Object.keys(process.env)) {
    if (ISOLATION_KEY.test(key)) delete process.env[key];
  }
  Object.assign(process.env, env);
  try {
    await run();
  } finally {
    for (const key of Object.keys(process.env)) {
      if (ISOLATION_KEY.test(key)) delete process.env[key];
    }
    Object.assign(process.env, snapshot);
  }
}

function captureResponse(): {
  status?: number;
  body?: { error?: string };
    res: {
      status: (code: number) => unknown;
      setHeader: (name: string, value: string | string[]) => unknown;
      json: (body: unknown) => unknown;
    };
} {
  const out: { status?: number; body?: { error?: string } } = {};
  return {
    get status() { return out.status; },
    get body() { return out.body; },
    res: {
      status(code: number) {
        out.status = code;
        return this;
      },
      setHeader(name: string, value: string | string[]) {
        void name;
        void value;
        return this;
      },
      json(body: unknown) {
        out.body = body as { error?: string };
        return this;
      },
    },
  };
}

describe('staging enforcement', () => {
  it('keeps monetary side effects closed', () => {
    assert.equal(STAGING_SYNTHETIC_WALLET_VERIFIED, false);
    assert.throws(
      () => guardStagingMonetaryRpc('sports_place_for_player', validStaging()),
      (error: unknown) => error instanceof EnvironmentIsolationError
        && error.code === 'STAGING_MONEY_SIDE_EFFECT_FORBIDDEN',
    );
    assert.doesNotThrow(() => guardStagingMonetaryRpc('ensure_player_account', validStaging()));
    assert.doesNotThrow(() => guardStagingMonetaryRpc('sports_place_for_player', {}));
  });

  it('classifies money routes and RPCs', () => {
    assert.equal(isMonetaryHttpPath('/api/player/games/start', 'POST'), true);
    assert.equal(isMonetaryHttpPath('/api/player/me', 'GET'), false);
    assert.equal(isMonetaryHttpPath('/api/player/wallet', 'GET'), false);
    assert.equal(isMonetaryHttpPath('/api/owner/players/1/debit', 'POST'), true);
    assert.equal(isMonetaryHttpPath('/api/manager/cashiers/1/currencies', 'POST'), true);
    assert.equal(isMonetaryRpc('sports_place_for_player'), true);
    assert.equal(isMonetaryRpc('ensure_player_account'), false);
    assert.equal(isMonetaryRpc('current_staff_binding_context'), false);
    assert.equal(isMonetaryRpc('owner_list_withdrawals'), false);
    assert.equal(isMonetaryRpc('owner_approve_withdrawal'), true);
    assert.equal(isMonetaryRpc('owner_debit_player'), true);
    assert.equal(isMonetaryRpc('cashier_lookup_player_payout'), false);
    assert.equal(isMonetaryRpc('cashier_deposit_player'), true);
  });

  it('refuses an unsafe request host and ignores host when the role is unset', () => {
    const staging = validStaging();
    const productionHost = stagingHttpDenial({ host: 'nextpari.net' }, staging);
    assert.equal(productionHost?.status, 503);
    assert.equal(productionHost?.body.error, 'STAGING_REQUEST_HOST_IS_PRODUCTION');
    const untrusted = stagingHttpDenial({ host: 'evil-staging.example' }, staging);
    assert.equal(untrusted?.body.error, 'STAGING_REQUEST_HOST_UNTRUSTED');
    assert.equal(
      stagingHttpDenial({ host: 'nextpari-staging.vercel.app' }, staging),
      null,
    );
    assert.equal(stagingHttpDenial({ host: 'nextpari.net' }, {}), null);
  });

  it('rejects a staging Vite build pointed at production Supabase', () => {
    const staging = validStaging();
    const productionRef = String(staging.NEXTPARI_PRODUCTION_SUPABASE_PROJECT_REF);
    const productionUrl = `https://${productionRef}.supabase.co`;
    assert.throws(
      () => assertStagingClientBuild({
        ...staging,
        VITE_SUPABASE_URL: productionUrl,
        SUPABASE_URL: productionUrl,
      }),
      (error: unknown) => error instanceof EnvironmentIsolationError,
    );
    assert.doesNotThrow(() => assertStagingClientBuild(staging));
    assert.doesNotThrow(() => assertStagingClientBuild({
      VITE_SUPABASE_URL: productionUrl,
      SUPABASE_URL: productionUrl,
    }));
    assert.throws(
      () => assertSupabaseTarget(productionUrl, staging),
      (error: unknown) => error instanceof EnvironmentIsolationError
        && error.code === 'STAGING_SUPABASE_URL_MISMATCH',
    );
    assert.doesNotThrow(() => assertSupabaseTarget(productionUrl, {}));
  });

  it('restricts staging registration and staff emails', () => {
    const staging = validStaging();
    assert.equal(
      syntheticRegistrationFailure({ method: 'email', email: 'user@gmail.com' }, staging),
      'STAGING_SYNTHETIC_EMAIL_REQUIRED',
    );
    assert.equal(
      syntheticRegistrationFailure({ method: 'email', email: 'user@nextpari.net' }, staging),
      'STAGING_SYNTHETIC_EMAIL_REQUIRED',
    );
    assert.equal(
      syntheticRegistrationFailure({ method: 'email', email: 'player.one@staging.nextpari.test' }, staging),
      null,
    );
    assert.equal(
      syntheticRegistrationFailure({ method: 'phone', phone: '+10000000000' }, staging),
      'STAGING_PHONE_REGISTRATION_FORBIDDEN',
    );
    assert.equal(syntheticRegistrationFailure({ method: 'one_click' }, staging), null);
    assert.equal(syntheticRegistrationFailure({ method: 'email', email: 'user@gmail.com' }, {}), null);
    assert.equal(syntheticAccountEmailFailure('owner.one@staging.nextpari.test', staging), null);
    assert.equal(
      syntheticAccountEmailFailure('owner@gmail.com', staging),
      'STAGING_SYNTHETIC_EMAIL_REQUIRED',
    );
  });

  it('blocks staging game start before the game ports run', async () => {
    let called = false;
    const ports = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') return undefined;
        called = true;
        return () => {
          called = true;
          throw new Error('ports called');
        };
      },
    }) as PlayerGameGatewayPorts;
    await withProcessEnv(validStaging(), async () => {
      const blocked = await handlePlayerGamesRequest(
        { method: 'POST', pathname: '/api/player/games/start', body: {} },
        ports,
        staffHttpLog,
      );
      assert.equal(blocked.status, 503);
      assert.equal(blocked.body.error, 'STAGING_MONEY_SIDE_EFFECT_FORBIDDEN');
      assert.equal(called, false);
    });
    await withProcessEnv({}, async () => {
      const allowed = await handlePlayerGamesRequest(
        { method: 'POST', pathname: '/api/player/games/start', body: {} },
        ports,
        staffHttpLog,
      );
      assert.notEqual(allowed.status, 503);
      assert.notEqual(allowed.body.error, 'STAGING_MONEY_SIDE_EFFECT_FORBIDDEN');
    });
  });

  it('blocks a production host on the player auth entry before ports run', async () => {
    let called = false;
    const ports = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') return undefined;
        called = true;
        return () => {
          called = true;
          throw new Error('ports called');
        };
      },
    }) as PlayerAuthGatewayPorts;
    await withProcessEnv(validStaging(), async () => {
      const captured = captureResponse();
      await handleVercelPlayerAuth(
        { method: 'POST', headers: { host: 'nextpari.net' }, body: {} },
        captured.res,
        '/api/player/auth/register',
        ports,
      );
      assert.equal(captured.status, 503);
      assert.equal(captured.body?.error, 'STAGING_REQUEST_HOST_IS_PRODUCTION');
      assert.equal(called, false);
    });
  });

  it('rejects a real email on staging registration before sign-up', async () => {
    let called = false;
    const ports = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') return undefined;
        called = true;
        return () => {
          called = true;
          throw new Error('ports called');
        };
      },
    }) as PlayerAuthGatewayPorts;
    await withProcessEnv(validStaging(), async () => {
      const result = await registerPlayerWithPassword(ports, {
        method: 'email',
        email: 'user@gmail.com',
        password: 'temporary-password-value',
        ageConfirmed: true,
        currency: 'USD',
      }, false);
      assert.equal(result.status, 403);
      assert.equal(result.body.error, 'STAGING_SYNTHETIC_EMAIL_REQUIRED');
      assert.equal(called, false);
      await assert.rejects(
        () => provisionAuthThenBind(
          {
            email: 'owner@gmail.com',
            temporaryPassword: 'temporary-password-value',
            bind: async () => ({}),
          },
          {
            admin: {
              async createUser() {
                called = true;
                throw new Error('createUser');
              },
              async deleteUser() {},
            } as AuthAdminPort,
          },
          staffHttpLog,
        ),
        (error: unknown) => error instanceof StaffOnboardingError
          && error.code === 'STAGING_SYNTHETIC_EMAIL_REQUIRED',
      );
      assert.equal(called, false);
    });
  });

  it('guards every audited HTTP entry and the Vite build', () => {
    const httpFiles = [
      'server/player/playerAuthHttp.ts',
      'server/player/playerGamesHttp.ts',
      'server/player/sportsPlaceHttp.ts',
      'server/player/playerWithdrawalHttp.ts',
      'server/staff/ownerAuthHttp.ts',
      'server/staff/managerAuthHttp.ts',
      'server/staff/cashierAuthHttp.ts',
      'server/staff/securityAuthHttp.ts',
      'server/staff/httpHandler.ts',
      'server/staff/vercelHandler.ts',
      'server/owner/ownerControlHttp.ts',
      'server/manager/managerControlHttp.ts',
      'server/cashier/cashierControlHttp.ts',
      'server/security/securityControlHttp.ts',
      'server/sports/settleHttp.ts',
      'server/betconstruct/http.ts',
      'server/observability/sentryTestHttp.ts',
    ];
    for (const rel of httpFiles) {
      assert.match(readFileSync(join(root, rel), 'utf8'), /stagingHttpDenial\(/, rel);
    }
    const rpcFiles = [
      'server/player/playerGameRpc.ts',
      'server/owner/ownerRpc.ts',
      'server/cashier/cashierRpc.ts',
      'server/manager/managerRpc.ts',
      'server/security/securityRpc.ts',
      'server/sports/placeRpc.ts',
      'server/sports/settleHttp.ts',
      'server/providerAccounting/serviceRoleIngest.ts',
      'server/player/playerWalletsService.ts',
    ];
    for (const rel of rpcFiles) {
      assert.match(readFileSync(join(root, rel), 'utf8'), /guardStagingMonetaryRpc\(/, rel);
    }
    assert.match(readFileSync(join(root, 'vite.config.ts'), 'utf8'), /assertStagingClientBuild/);
    assert.match(readFileSync(join(root, 'server/supabase/admin.ts'), 'utf8'), /assertSupabaseTarget/);
    assert.match(readFileSync(join(root, 'docs/staging/STAGING.md'), 'utf8'), /STAGING_MONEY_SIDE_EFFECT_FORBIDDEN/);
  });
});
