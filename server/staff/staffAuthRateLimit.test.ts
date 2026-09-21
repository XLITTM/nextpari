import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { handleCashierAuthRequest, CASHIER_AUTH_LOGIN_PATH } from './cashierAuthHttp.js';
import { handleManagerAuthRequest, MANAGER_AUTH_LOGIN_PATH } from './managerAuthHttp.js';
import { handleOwnerAuthRequest, OWNER_AUTH_LOGIN_PATH, OWNER_AUTH_LOGOUT_PATH, OWNER_AUTH_SESSION_PATH } from './ownerAuthHttp.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from './ownerCookies.js';
import { handleSecurityAuthRequest, SECURITY_AUTH_LOGIN_PATH } from './securityAuthHttp.js';
import type { OwnerAuthGatewayPorts } from './ownerAuthService.js';
import type { SecurityAuthGatewayPorts } from './securityAuthService.js';
import {
  STAFF_AUTH_IDENTIFIER_MAX_HITS,
  STAFF_AUTH_NETWORK_MAX_HITS,
  STAFF_AUTH_WINDOW_SECONDS,
  enforceStaffAuthLoginLimit,
  hashStaffAuthSignal,
  type StaffAuthRateLimitConsumeInput,
  type StaffAuthRateLimitConsumeResult,
  type StaffAuthRateLimitPorts,
} from './staffAuthRateLimit.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const limiterSource = readFileSync(join(here, 'staffAuthRateLimit.ts'), 'utf8');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260922010000_staff_auth_throttling_072.sql'),
  'utf8',
);
const payoutLimiter = readFileSync(join(root, 'server/cashier/cashierPayoutRateLimit.ts'), 'utf8');

const EMAIL = 'Owner.User@Example.com';
const NORMALIZED = 'owner.user@example.com';
const PASSWORD = 'correct-horse-battery';
const IP = '203.0.113.10';
const ACCESS = 'access-token-value';
const REFRESH = 'refresh-token-value';

function createSharedLimiter(now: () => number) {
  const rows = new Map<string, { windowStartedAt: number; hitCount: number }>();
  const tails = new Map<string, Promise<void>>();

  async function consume(input: StaffAuthRateLimitConsumeInput): Promise<StaffAuthRateLimitConsumeResult> {
    const key = `${input.scope}\n${input.keyHash}`;
    const prev = tails.get(key) ?? Promise.resolve();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    tails.set(key, prev.then(() => gate));
    await prev;
    try {
      const row = rows.get(key);
      const windowMs = input.windowSeconds * 1000;
      const t = now();
      if (!row || row.windowStartedAt + windowMs <= t) {
        rows.set(key, { windowStartedAt: t, hitCount: 1 });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      if (row.hitCount >= input.maxHits) {
        const retry = Math.max(1, Math.ceil((row.windowStartedAt + windowMs - t) / 1000));
        return { allowed: false, retryAfterSeconds: retry };
      }
      row.hitCount += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    } finally {
      release();
    }
  }

  return {
    ports(): StaffAuthRateLimitPorts {
      return { consume };
    },
  };
}

function recordingPorts(init?: {
  result?: StaffAuthRateLimitConsumeResult;
  fail?: boolean;
}): { ports: StaffAuthRateLimitPorts; calls: StaffAuthRateLimitConsumeInput[] } {
  const calls: StaffAuthRateLimitConsumeInput[] = [];
  return {
    calls,
    ports: {
      async consume(input) {
        calls.push(input);
        if (init?.fail) throw new Error('db unavailable');
        return init?.result ?? { allowed: true, retryAfterSeconds: 0 };
      },
    },
  };
}

function ownerPorts(
  rate: StaffAuthRateLimitPorts,
  signIns: string[] = [],
): OwnerAuthGatewayPorts {
  return {
    async signInWithPassword() {
      signIns.push('signin');
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async refreshSession() {
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async currentStaffContext() {
      return {
        role: 'owner',
        status: 'active',
        auth_user_id: 'owner-uid',
        display_name: 'Owner',
        network_id: null,
      };
    },
    async signOutCurrentSession() {},
    staffAuthRateLimit: rate,
  };
}

function rolePorts(role: 'manager' | 'cashier', rate: StaffAuthRateLimitPorts, signIns: string[]): OwnerAuthGatewayPorts {
  return {
    ...ownerPorts(rate, signIns),
    async currentStaffContext() {
      return {
        role,
        status: 'active',
        auth_user_id: `${role}-uid`,
        display_name: role,
        network_id: '11111111-1111-1111-1111-111111111111',
        legacy_manager_account_id: '22222222-2222-2222-2222-222222222222',
        legacy_cashier_id: '33333333-3333-3333-3333-333333333333',
      };
    },
  };
}

function securityPorts(rate: StaffAuthRateLimitPorts, signIns: string[]): SecurityAuthGatewayPorts {
  return {
    async lookupLoginEmail() {
      return 'hidden@example.com';
    },
    async signInWithPassword() {
      signIns.push('signin');
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async refreshSession() {
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async currentStaffContext() {
      return { role: 'security', status: 'active', auth_user_id: 'security-uid', display_name: 'Security' };
    },
    async signOutCurrentSession() {},
    staffAuthRateLimit: rate,
  };
}

describe('distributed staff auth throttling', () => {
  it('A. identifier limit is shared across independent limiter callers', async () => {
    let now = 1_700_000_000_000;
    const shared = createSharedLimiter(() => now);
    const first = shared.ports();
    const second = shared.ports();
    for (let i = 0; i < STAFF_AUTH_IDENTIFIER_MAX_HITS; i += 1) {
      const result = await enforceStaffAuthLoginLimit({
        role: 'owner',
        normalizedIdentifier: NORMALIZED,
        networkAddress: null,
        ports: i % 2 === 0 ? first : second,
      });
      assert.equal(result.ok, true);
    }
    const blocked = await enforceStaffAuthLoginLimit({
      role: 'owner',
      normalizedIdentifier: NORMALIZED,
      networkAddress: null,
      ports: second,
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.status, 429);
  });

  it('B. network limit is shared across independent limiter callers', async () => {
    let now = 1_700_000_000_000;
    const shared = createSharedLimiter(() => now);
    const first = shared.ports();
    const second = shared.ports();
    for (let i = 0; i < STAFF_AUTH_NETWORK_MAX_HITS; i += 1) {
      const result = await enforceStaffAuthLoginLimit({
        role: 'cashier',
        normalizedIdentifier: `cashier${i}@example.com`,
        networkAddress: IP,
        ports: i % 2 === 0 ? first : second,
      });
      assert.equal(result.ok, true);
    }
    const blocked = await enforceStaffAuthLoginLimit({
      role: 'cashier',
      normalizedIdentifier: 'another@example.com',
      networkAddress: IP,
      ports: first,
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.status, 429);
  });

  it('C. eight identifier attempts are allowed and the next is blocked', async () => {
    const shared = createSharedLimiter(() => 1_700_000_000_000);
    const ports = shared.ports();
    for (let i = 0; i < 8; i += 1) {
      const result = await enforceStaffAuthLoginLimit({
        role: 'manager',
        normalizedIdentifier: 'manager@example.com',
        networkAddress: null,
        ports,
      });
      assert.equal(result.ok, true);
    }
    const next = await enforceStaffAuthLoginLimit({
      role: 'manager',
      normalizedIdentifier: 'manager@example.com',
      networkAddress: null,
      ports,
    });
    assert.equal(next.ok, false);
    if (!next.ok) {
      assert.equal(next.status, 429);
      assert.equal(next.error, 'STAFF_AUTH_RATE_LIMITED');
    }
  });

  it('D. network threshold is 40 attempts', async () => {
    const shared = createSharedLimiter(() => 1_700_000_000_000);
    const ports = shared.ports();
    for (let i = 0; i < 40; i += 1) {
      const result = await enforceStaffAuthLoginLimit({
        role: 'security',
        normalizedIdentifier: `login${i}`,
        networkAddress: IP,
        ports,
      });
      assert.equal(result.ok, true);
    }
    const next = await enforceStaffAuthLoginLimit({
      role: 'security',
      normalizedIdentifier: 'login-next',
      networkAddress: IP,
      ports,
    });
    assert.equal(next.ok, false);
  });

  it('E. an expired window resets the bucket', async () => {
    let now = 1_700_000_000_000;
    const shared = createSharedLimiter(() => now);
    const ports = shared.ports();
    for (let i = 0; i < 8; i += 1) {
      await enforceStaffAuthLoginLimit({
        role: 'owner',
        normalizedIdentifier: NORMALIZED,
        networkAddress: null,
        ports,
      });
    }
    now += (STAFF_AUTH_WINDOW_SECONDS * 1000) + 1000;
    const reset = await enforceStaffAuthLoginLimit({
      role: 'owner',
      normalizedIdentifier: NORMALIZED,
      networkAddress: null,
      ports,
    });
    assert.equal(reset.ok, true);
  });

  it('F. concurrent attempts cannot oversubscribe the remaining slot', async () => {
    const rows = new Map<string, { windowStartedAt: number; hitCount: number }>();
    const tails = new Map<string, Promise<void>>();
    const ports: StaffAuthRateLimitPorts = {
      async consume(input) {
        const key = `${input.scope}\n${input.keyHash}`;
        const prev = tails.get(key) ?? Promise.resolve();
        let release: () => void = () => {};
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        tails.set(key, prev.then(() => gate));
        await prev;
        try {
          const row = rows.get(key) ?? { windowStartedAt: 1, hitCount: input.maxHits - 1 };
          rows.set(key, row);
          if (row.hitCount >= input.maxHits) {
            return { allowed: false, retryAfterSeconds: 30 };
          }
          row.hitCount += 1;
          return { allowed: true, retryAfterSeconds: 0 };
        } finally {
          release();
        }
      },
    };
    const [left, right] = await Promise.all([
      enforceStaffAuthLoginLimit({
        role: 'owner',
        normalizedIdentifier: NORMALIZED,
        networkAddress: null,
        ports,
      }),
      enforceStaffAuthLoginLimit({
        role: 'owner',
        normalizedIdentifier: NORMALIZED,
        networkAddress: null,
        ports,
      }),
    ]);
    const allowed = [left, right].filter((item) => item.ok).length;
    assert.equal(allowed, 1);
  });

  it('G-J. the database payload contains only hashes', async () => {
    const recorded = recordingPorts();
    await enforceStaffAuthLoginLimit({
      role: 'owner',
      normalizedIdentifier: NORMALIZED,
      networkAddress: IP,
      ports: recorded.ports,
    });
    assert.equal(recorded.calls.length, 2);
    const dumped = JSON.stringify(recorded.calls);
    for (const call of recorded.calls) {
      assert.match(call.keyHash, /^[0-9a-f]{64}$/);
      assert.equal(call.keyHash, hashStaffAuthSignal(`${call.scope}:${call.scope.endsWith(':network') ? IP : NORMALIZED}`));
    }
    assert.equal(dumped.includes(EMAIL), false);
    assert.equal(dumped.includes(NORMALIZED), false);
    assert.equal(dumped.includes(IP), false);
    assert.equal(dumped.includes(PASSWORD), false);
    assert.equal(dumped.includes(ACCESS), false);
    assert.equal(dumped.includes(REFRESH), false);
  });

  it('K-O. each staff login is throttled before password authentication', async () => {
    const cases = [
      {
        role: 'owner' as const,
        run: (ports: OwnerAuthGatewayPorts) => handleOwnerAuthRequest({
          method: 'POST',
          pathname: OWNER_AUTH_LOGIN_PATH,
          cookieSecure: true,
          forwardedFor: IP,
          body: { email: EMAIL, password: PASSWORD },
        }, ports),
      },
      {
        role: 'manager' as const,
        run: (ports: OwnerAuthGatewayPorts) => handleManagerAuthRequest({
          method: 'POST',
          pathname: MANAGER_AUTH_LOGIN_PATH,
          cookieSecure: true,
          forwardedFor: IP,
          body: { email: EMAIL, password: PASSWORD },
        }, ports),
      },
      {
        role: 'cashier' as const,
        run: (ports: OwnerAuthGatewayPorts) => handleCashierAuthRequest({
          method: 'POST',
          pathname: CASHIER_AUTH_LOGIN_PATH,
          cookieSecure: true,
          forwardedFor: IP,
          body: { email: EMAIL, password: PASSWORD },
        }, ports),
      },
    ];
    for (const item of cases) {
      const signIns: string[] = [];
      const recorded = recordingPorts({ result: { allowed: false, retryAfterSeconds: 90 } });
      const ports = item.role === 'owner'
        ? ownerPorts(recorded.ports, signIns)
        : rolePorts(item.role, recorded.ports, signIns);
      const result = await item.run(ports);
      assert.equal(result.status, 429);
      assert.equal(result.body.error, 'STAFF_AUTH_RATE_LIMITED');
      assert.equal(result.headers?.['Retry-After'], '90');
      assert.equal(signIns.length, 0);
      assert.equal(JSON.stringify(result.body).includes(EMAIL), false);
      assert.equal(JSON.stringify(result.body).includes('identifier'), false);
      assert.equal(JSON.stringify(result.body).includes('network'), false);
    }

    const securitySignIns: string[] = [];
    const securityRecorded = recordingPorts({ result: { allowed: false, retryAfterSeconds: 45 } });
    const security = await handleSecurityAuthRequest({
      method: 'POST',
      pathname: SECURITY_AUTH_LOGIN_PATH,
      cookieSecure: true,
      forwardedFor: `${IP}, 10.0.0.8`,
      body: { login: 'Security01', password: PASSWORD },
    }, securityPorts(securityRecorded.ports, securitySignIns));
    assert.equal(security.status, 429);
    assert.equal(securitySignIns.length, 0);
    assert.equal(securityRecorded.calls[0]?.keyHash, hashStaffAuthSignal('staff-auth:security:identifier:security01'));
    assert.equal(securityRecorded.calls[1]?.keyHash, hashStaffAuthSignal(`staff-auth:security:network:${IP}`));
    assert.equal(JSON.stringify(securityRecorded.calls).includes('Security01'), false);
    assert.equal(JSON.stringify(security.body).includes('Security01'), false);
  });

  it('P-Q. a limiter outage returns 503 and does not authenticate', async () => {
    const signIns: string[] = [];
    const recorded = recordingPorts({ fail: true });
    const result = await handleOwnerAuthRequest({
      method: 'POST',
      pathname: OWNER_AUTH_LOGIN_PATH,
      cookieSecure: true,
      body: { email: EMAIL, password: PASSWORD },
    }, ownerPorts(recorded.ports, signIns));
    assert.equal(result.status, 503);
    assert.equal(result.body.error, 'STAFF_AUTH_RATE_LIMIT_UNAVAILABLE');
    assert.equal(signIns.length, 0);
    assert.equal(JSON.stringify(result.body).includes(PASSWORD), false);
  });

  it('R. a blocked login does not reveal whether the account exists', async () => {
    const recorded = recordingPorts({ result: { allowed: false, retryAfterSeconds: 12 } });
    const missing = await handleOwnerAuthRequest({
      method: 'POST',
      pathname: OWNER_AUTH_LOGIN_PATH,
      body: { email: 'missing@example.com', password: PASSWORD },
    }, ownerPorts(recorded.ports));
    const present = await handleOwnerAuthRequest({
      method: 'POST',
      pathname: OWNER_AUTH_LOGIN_PATH,
      body: { email: EMAIL, password: PASSWORD },
    }, ownerPorts(recorded.ports));
    assert.equal(missing.status, 429);
    assert.equal(present.status, 429);
    assert.deepEqual(missing.body, present.body);
    assert.deepEqual(missing.body, { ok: false, error: 'STAFF_AUTH_RATE_LIMITED' });
  });

  it('S-T. session restore and logout do not consume a login attempt', async () => {
    const recorded = recordingPorts();
    const session = await handleOwnerAuthRequest({
      method: 'GET',
      pathname: OWNER_AUTH_SESSION_PATH,
      cookie: `${OWNER_ACCESS_COOKIE}=${ACCESS}; ${OWNER_REFRESH_COOKIE}=${REFRESH}`,
      cookieSecure: true,
    }, ownerPorts(recorded.ports));
    const logout = await handleOwnerAuthRequest({
      method: 'POST',
      pathname: OWNER_AUTH_LOGOUT_PATH,
      cookie: `${OWNER_ACCESS_COOKIE}=${ACCESS}; ${OWNER_REFRESH_COOKIE}=${REFRESH}`,
      cookieSecure: true,
    }, ownerPorts(recorded.ports));
    assert.equal(session.status, 200);
    assert.equal(logout.status, 200);
    assert.equal(recorded.calls.length, 0);
  });

  it('U-V. the limiter RPC is executable by service_role only', () => {
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.staff_auth_rate_limit_consume\(TEXT, TEXT, INTEGER, INTEGER\) TO service_role/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.staff_auth_rate_limit_consume\(TEXT, TEXT, INTEGER, INTEGER\) FROM PUBLIC/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.staff_auth_rate_limit_consume\(TEXT, TEXT, INTEGER, INTEGER\) FROM anon, authenticated/);
    assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.staff_auth_rate_limit_consume\(TEXT, TEXT, INTEGER, INTEGER\) TO anon/);
    assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.staff_auth_rate_limit_consume\(TEXT, TEXT, INTEGER, INTEGER\) TO authenticated/);
    assert.match(migration, /REVOKE ALL ON TABLE private\.staff_auth_rate_limit_buckets FROM anon, authenticated, service_role/);
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  });

  it('W. the new staff login limiter has no process-local Map', () => {
    assert.equal(limiterSource.includes('new Map'), false);
    assert.match(migration, /pg_advisory_xact_lock/);
    assert.match(migration, /FOR UPDATE/);
    assert.match(payoutLimiter, /new Map/);
    assert.equal(migration.toLowerCase().includes('mfa_factors'), false);
    assert.equal(/catch[\s\S]{0,240}allowed:\s*true/.test(limiterSource), false);
  });

  it('uses a 15 minute window and does not read a body IP', () => {
    assert.equal(STAFF_AUTH_WINDOW_SECONDS, 900);
    assert.equal(limiterSource.includes('body.ip'), false);
    assert.equal(limiterSource.includes('x-real-ip'), false);
    const ownerHttp = readFileSync(join(here, 'ownerAuthHttp.ts'), 'utf8');
    assert.match(ownerHttp, /x-forwarded-for/);
    assert.equal(ownerHttp.includes('body.ip'), false);
  });
});
