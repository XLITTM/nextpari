import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import {
  PLAYER_AUTH_LOGIN_PATH,
  PLAYER_AUTH_REGISTER_PATH,
  handlePlayerAuthRequest,
} from './playerAuthHttp.js';
import type { PlayerAuthGatewayPorts } from './playerAuthService.js';
import { PLAYER_DEVICE_COOKIE } from './playerCookies.js';
import {
  buildPlayerSecurityHashes,
  type PlayerSecurityPorts,
  type PlayerSecurityRecordInput,
} from './playerSecurityService.js';
import {
  PLAYER_SECURITY_TRUSTED_PROXY_ENV,
  trustedClientAddressFromNode,
  trustedClientAddressFromVercel,
} from './playerSecurityNetwork.js';
import {
  hashPlayerSecuritySignal,
  normalizeNetworkAddress,
  resetPlayerSecurityConfigWarnings,
  sanitizePlayerSecurityMetadata,
  presentedLoginIdentifier,
} from './playerSecuritySignals.js';
import { loadPlayerSecuritySignalPepper } from '../staff/env.js';

const ACCESS = 'player-access-token';
const REFRESH = 'player-refresh-token';
const WALLET_UUID = '11111111-2222-3333-4444-555555555555';
const PLAYER_EMAIL = 'player@nextpari.test';
const PLAYER_PASSWORD = 'password1';
const PEPPER = 'player-security-signal-pepper-ok-32ch';
const OTP_PEPPER = 'email-otp-pepper-must-not-be-reused-xx';
const PLAYER_A = 'aaaaaaaa-1111-4111-8111-bbbbbbbbbbbb';
const PLAYER_B = 'bbbbbbbb-2222-4111-8111-cccccccccccc';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const SQL_048 = 'supabase/migrations/20260913234500_player_fraud_security_foundation_048.sql';

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

const sql = read(SQL_048);

const SILENT_LOG = { error() {} };

function createPlayerPorts(): PlayerAuthGatewayPorts & { signIns: Array<{ email: string; password: string }> } {
  const signIns: Array<{ email: string; password: string }> = [];
  return {
    signIns,
    async signInWithPassword(email, password) {
      signIns.push({ email, password });
      if (password !== PLAYER_PASSWORD) throw staffError('AUTH_FAILED', 401);
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async signUp() {
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async refreshSession() {
      return { accessToken: ACCESS, refreshToken: REFRESH };
    },
    async getAuthUser() {
      return { id: PLAYER_A, email: PLAYER_EMAIL };
    },
    async ensurePlayerAccount() {
      return { walletId: WALLET_UUID, publicId: '110790', legacyBalance: 0, migrationState: 'active' };
    },
    async loadOwnWallet() {
      return { balance: 0, currency: 'TMTM', status: 'active', publicId: '110790' };
    },
    async savePlayerProfile() {},
  };
}

type MemoryFlag = {
  playerUserId: string;
  flagType: string;
  status: string;
  signalCount: number;
  relatedPlayerCount: number;
};

type BucketKind = 'identifier' | 'device' | 'network';

const PRESSURE_LIMITS: Record<BucketKind, number> = {
  identifier: 8,
  device: 20,
  network: 40,
};
const PRESSURE_WINDOW_MS = 15 * 60 * 1000;
const PRESSURE_COOLDOWN_MS = 15 * 60 * 1000;

type PressureBucket = {
  failureCount: number;
  windowStartedAt: number;
  lastSuccessAt: number | null;
  lastBlockedAt: number | null;
};

function createMemorySecurityPorts(clock?: { now: number }): {
  events: PlayerSecurityRecordInput[];
  flags: MemoryFlag[];
  ports: PlayerSecurityPorts;
} {
  const events: PlayerSecurityRecordInput[] = [];
  const flags: MemoryFlag[] = [];
  const buckets = new Map<string, PressureBucket>();
  const now = () => clock?.now ?? Date.now();
  let chain = Promise.resolve();
  const locked = async <T>(fn: () => T | Promise<T>): Promise<T> => {
    const run = chain.then(fn);
    chain = run.then(() => undefined, () => undefined);
    return run;
  };

  const consume = (kind: BucketKind, hash: string | null): boolean => {
    if (!hash) return true;
    const key = `${kind}:${hash}`;
    const t = now();
    const row = buckets.get(key) ?? {
      failureCount: 0,
      windowStartedAt: t,
      lastSuccessAt: null,
      lastBlockedAt: null,
    };
    if (kind === 'identifier' && row.lastSuccessAt != null && row.lastSuccessAt >= row.windowStartedAt) {
      row.failureCount = 0;
      row.windowStartedAt = t;
    } else if (row.windowStartedAt <= t - PRESSURE_WINDOW_MS) {
      row.failureCount = 0;
      row.windowStartedAt = t;
    }
    if (
      row.lastBlockedAt != null
      && row.lastBlockedAt >= t - PRESSURE_COOLDOWN_MS
      && (kind !== 'identifier' || row.lastSuccessAt == null || row.lastBlockedAt > row.lastSuccessAt)
    ) {
      buckets.set(key, row);
      return false;
    }
    if (row.failureCount >= PRESSURE_LIMITS[kind]) {
      row.lastBlockedAt = t;
      buckets.set(key, row);
      return false;
    }
    row.failureCount += 1;
    row.lastBlockedAt = null;
    buckets.set(key, row);
    return true;
  };

  const clearIdentifierPressure = (hash: string | null) => {
    if (!hash) return;
    const key = `identifier:${hash}`;
    const t = now();
    buckets.set(key, {
      failureCount: 0,
      windowStartedAt: t,
      lastSuccessAt: t,
      lastBlockedAt: null,
    });
  };

  const upsertFlag = (playerUserId: string, flagType: string, relatedPlayerCount: number) => {
    const active = flags.find((row) => (
      row.playerUserId === playerUserId
      && row.flagType === flagType
      && (row.status === 'open' || row.status === 'reviewed')
    ));
    if (active) {
      active.signalCount += 1;
      active.relatedPlayerCount = Math.max(active.relatedPlayerCount, relatedPlayerCount);
      return;
    }
    flags.push({
      playerUserId,
      flagType,
      status: 'open',
      signalCount: 1,
      relatedPlayerCount,
    });
  };

  return {
    events,
    flags,
    ports: {
      async checkLoginRateLimit(hashes) {
        return locked(async () => {
          const identifierOk = consume('identifier', hashes.identifierHash);
          const deviceOk = consume('device', hashes.deviceHash);
          const networkOk = consume('network', hashes.networkHash);
          return { allowed: identifierOk && deviceOk && networkOk };
        });
      },
      async recordEvent(input) {
        return locked(async () => {
          events.push(input);
          if (input.eventType === 'LOGIN_SUCCESS') {
            clearIdentifierPressure(input.identifierHash);
          }
          if (
            (input.eventType === 'LOGIN_SUCCESS' || input.eventType === 'REGISTER_SUCCESS')
            && input.playerUserId
            && input.deviceHash
          ) {
            const related = new Set(
              events
                .filter((row) => row.deviceHash === input.deviceHash && row.playerUserId)
                .map((row) => String(row.playerUserId)),
            );
            if (related.size >= 2) {
              for (const playerUserId of related) {
                upsertFlag(playerUserId, 'SHARED_DEVICE', related.size);
              }
            }
          }
          if (
            (input.eventType === 'LOGIN_SUCCESS' || input.eventType === 'REGISTER_SUCCESS')
            && input.playerUserId
            && input.networkHash
          ) {
            const related = new Set(
              events
                .filter((row) => row.networkHash === input.networkHash && row.playerUserId)
                .map((row) => String(row.playerUserId)),
            );
            if (related.size >= 2) {
              for (const playerUserId of related) {
                upsertFlag(playerUserId, 'SHARED_NETWORK', related.size);
              }
            }
          }
        });
      },
    },
  };
}

function deviceTokenFromCookies(cookies: string[] | undefined): string {
  const line = (cookies ?? []).find((row) => row.startsWith(`${PLAYER_DEVICE_COOKIE}=`)) ?? '';
  const raw = decodeURIComponent(line.split(';')[0]?.split('=')[1] ?? '');
  return raw;
}

async function withPepper<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.PLAYER_SECURITY_SIGNAL_PEPPER;
  const previousOtp = process.env.PLAYER_EMAIL_OTP_PEPPER;
  process.env.PLAYER_SECURITY_SIGNAL_PEPPER = PEPPER;
  process.env.PLAYER_EMAIL_OTP_PEPPER = OTP_PEPPER;
  resetPlayerSecurityConfigWarnings();
  try {
    return await fn();
  } finally {
    if (previous == null) delete process.env.PLAYER_SECURITY_SIGNAL_PEPPER;
    else process.env.PLAYER_SECURITY_SIGNAL_PEPPER = previous;
    if (previousOtp == null) delete process.env.PLAYER_EMAIL_OTP_PEPPER;
    else process.env.PLAYER_EMAIL_OTP_PEPPER = previousOtp;
  }
}

describe('player fraud/security foundation SQL 048', () => {
  it('creates append-only ledger, settings, flags, and canonical service-role ingest', () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS private\.player_security_events/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS private\.player_security_settings/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS private\.player_risk_flags/);
    assert.match(sql, /PLAYER_SECURITY_EVENTS_APPEND_ONLY/);
    assert.match(sql, /GRANT SELECT ON TABLE private\.player_security_events TO service_role/);
    assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON TABLE private\.player_security_events FROM service_role/);
    assert.match(sql, /GRANT SELECT ON TABLE private\.player_security_login_pressure TO service_role/);
    assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON TABLE private\.player_security_login_pressure FROM service_role/);
    assert.match(sql, /GRANT SELECT ON TABLE private\.player_risk_flags TO service_role/);
    assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON TABLE private\.player_risk_flags FROM service_role/);
    assert.equal(sql.includes('GRANT SELECT, INSERT ON TABLE private.player_security_events TO service_role'), false);
    assert.equal(sql.includes('GRANT SELECT, INSERT, UPDATE ON TABLE private.player_security_login_pressure TO service_role'), false);
    assert.equal(sql.includes('GRANT SELECT, INSERT, UPDATE ON TABLE private.player_risk_flags TO service_role'), false);
    assert.equal(sql.includes('GRANT EXECUTE ON FUNCTION private.player_security_record_event'), false);
    assert.equal(sql.includes('GRANT EXECUTE ON FUNCTION private.player_security_consume_bucket'), false);
    assert.equal(sql.includes('GRANT EXECUTE ON FUNCTION private.player_security_upsert_flag'), false);
    assert.equal(sql.includes('GRANT EXECUTE ON FUNCTION private.player_security_check_login'), false);
    assert.match(sql, /REVOKE ALL ON TABLE private\.player_security_events FROM anon, authenticated/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.player_security_record_event/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.player_security_check_login\(TEXT, TEXT, TEXT\) TO service_role/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.player_security_record_event\(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB\) FROM anon, authenticated/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.player_security_check_login\(TEXT, TEXT, TEXT\) FROM anon, authenticated/);
    assert.match(sql, /pg_advisory_xact_lock/);
    assert.match(sql, /player_security_login_pressure/);
    assert.match(sql, /player_security_consume_bucket/);
    assert.match(sql, /AUTH_RATE_LIMITED/);
    assert.match(sql, /SHARED_DEVICE/);
    assert.match(sql, /SHARED_NETWORK/);
    assert.match(sql, /owner_only/);
    assert.match(sql, /private\.append_staff_audit/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.owner_security_overview\(\) TO authenticated/);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION private.apply_wallet_entry'), false);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION private.sports_engine_place_as'), false);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION public.owner_set_player_blocked'), false);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION private.ingest_provider_transaction'), false);
    assert.equal(/GRANT EXECUTE ON FUNCTION public\.player_security_record_event[\s\S]{0,200}TO authenticated/.test(sql), false);
    assert.match(sql, /IF p_event_type = 'LOGIN_SUCCESS' THEN/);
    assert.match(sql, /bucket_kind = 'identifier'/);
    assert.equal(/REGISTER_SUCCESS'\) THEN[\s\S]{0,400}UPDATE private\.player_security_login_pressure/.test(sql), false);
    assert.match(sql, /p_kind = 'identifier'\s+AND v_row\.last_success_at IS NOT NULL/);
  });
});

describe('player security signals', () => {
  it('hashes network signals consistently and ignores invalid spoofs', () => {
    assert.equal(normalizeNetworkAddress('8.8.4.4:443'), '8.8.4.4');
    assert.equal(normalizeNetworkAddress('::ffff:8.8.4.4'), '8.8.4.4');
    assert.equal(normalizeNetworkAddress('2001:db8::1'), normalizeNetworkAddress('2001:0db8:0000:0000:0000:0000:0000:0001'));
    assert.notEqual(
      hashPlayerSecuritySignal('net', '8.8.4.4', PEPPER),
      hashPlayerSecuritySignal('net', '1.1.1.1', PEPPER),
    );
    assert.equal(
      hashPlayerSecuritySignal('id', 'player@nextpari.test', PEPPER),
      hashPlayerSecuritySignal('id', 'player@nextpari.test', PEPPER),
    );
  });

  it('sanitizes secret material out of metadata', () => {
    const clean = sanitizePlayerSecurityMetadata({
      source: 'login',
      password: 'secret',
      ip: '8.8.8.8',
      accessToken: ACCESS,
      note: 'ok',
    });
    assert.deepEqual(clean, { source: 'login', note: 'ok' });
    assert.equal(JSON.stringify(clean).includes('secret'), false);
    assert.equal(JSON.stringify(clean).includes('8.8.8.8'), false);
  });

  it('does not reuse the email OTP pepper and rejects a VITE prefix', () => {
    const previous = process.env.PLAYER_SECURITY_SIGNAL_PEPPER;
    const previousOtp = process.env.PLAYER_EMAIL_OTP_PEPPER;
    const previousVite = process.env.VITE_PLAYER_SECURITY_SIGNAL_PEPPER;
    try {
      process.env.PLAYER_SECURITY_SIGNAL_PEPPER = OTP_PEPPER;
      process.env.PLAYER_EMAIL_OTP_PEPPER = OTP_PEPPER;
      delete process.env.VITE_PLAYER_SECURITY_SIGNAL_PEPPER;
      assert.equal(loadPlayerSecuritySignalPepper().ok, false);

      process.env.VITE_PLAYER_SECURITY_SIGNAL_PEPPER = PEPPER;
      process.env.PLAYER_SECURITY_SIGNAL_PEPPER = PEPPER;
      assert.equal(loadPlayerSecuritySignalPepper().ok, false);
    } finally {
      if (previous == null) delete process.env.PLAYER_SECURITY_SIGNAL_PEPPER;
      else process.env.PLAYER_SECURITY_SIGNAL_PEPPER = previous;
      if (previousOtp == null) delete process.env.PLAYER_EMAIL_OTP_PEPPER;
      else process.env.PLAYER_EMAIL_OTP_PEPPER = previousOtp;
      if (previousVite == null) delete process.env.VITE_PLAYER_SECURITY_SIGNAL_PEPPER;
      else process.env.VITE_PLAYER_SECURITY_SIGNAL_PEPPER = previousVite;
    }
  });
});

describe('player auth security telemetry', () => {
  it('records LOGIN_SUCCESS and issues a secure device cookie', async () => {
    await withPepper(async () => {
      const memory = createMemorySecurityPorts();
      const result = await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookieSecure: true,
          trustedNetworkAddress: '203.0.113.10',
          forwardedFor: '198.51.100.1',
          realIp: '198.51.100.2',
          userAgent: 'Mozilla/5.0 Test',
          body: { email: PLAYER_EMAIL, password: PLAYER_PASSWORD, ip: '1.2.3.4', deviceId: 'spoofed-device', network: '9.9.9.9' },
        },
        createPlayerPorts(),
        SILENT_LOG,
        undefined,
        memory.ports,
      );
      assert.equal(result.status, 200);
      assert.equal(result.body.error, undefined);
      const token = deviceTokenFromCookies(result.cookies);
      assert.equal(token.length >= 32, true);
      const deviceLine = (result.cookies ?? []).find((row) => row.startsWith(`${PLAYER_DEVICE_COOKIE}=`)) ?? '';
      assert.match(deviceLine, /HttpOnly/i);
      assert.match(deviceLine, /SameSite=Lax/i);
      assert.match(deviceLine, /Path=\//);
      assert.match(deviceLine, /(?:^|; )Secure(?:;|$)/i);
      assert.equal(JSON.stringify(result.body).includes(token), false);
      assert.equal(memory.events.some((row) => row.eventType === 'LOGIN_SUCCESS'), true);
      assert.equal(JSON.stringify(memory.events).includes(token), false);
      assert.equal(JSON.stringify(memory.events).includes('1.2.3.4'), false);
      assert.equal(JSON.stringify(memory.events).includes('198.51.100.1'), false);
      assert.equal(JSON.stringify(memory.events).includes('198.51.100.2'), false);
      assert.equal(JSON.stringify(memory.events).includes('9.9.9.9'), false);
      assert.equal(JSON.stringify(memory.events).includes('203.0.113.10'), false);
      assert.equal(JSON.stringify(memory.events).includes('spoofed-device'), false);
      assert.equal(JSON.stringify(memory.events).includes(PLAYER_PASSWORD), false);
      const expectedNet = hashPlayerSecuritySignal('net', '203.0.113.10', PEPPER);
      assert.equal(memory.events[0]?.networkHash, expectedNet);
    });
  });

  it('records LOGIN_FAILURE without revealing whether the account exists', async () => {
    await withPepper(async () => {
      const memory = createMemorySecurityPorts();
      const missing = await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookieSecure: true,
          body: { email: 'missing@nextpari.test', password: 'password9' },
        },
        createPlayerPorts(),
        SILENT_LOG,
        undefined,
        memory.ports,
      );
      const wrong = await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookieSecure: true,
          body: { email: PLAYER_EMAIL, password: 'password9' },
        },
        createPlayerPorts(),
        SILENT_LOG,
        undefined,
        memory.ports,
      );
      assert.equal(missing.status, 401);
      assert.equal(wrong.status, 401);
      assert.equal(missing.body.error, 'AUTH_FAILED');
      assert.equal(wrong.body.error, 'AUTH_FAILED');
      assert.equal(memory.events.filter((row) => row.eventType === 'LOGIN_FAILURE').length, 2);
    });
  });

  it('reuses the same device cookie hash and ignores body deviceId', async () => {
    await withPepper(async () => {
      const memory = createMemorySecurityPorts();
      const first = await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookieSecure: true,
          body: { email: PLAYER_EMAIL, password: PLAYER_PASSWORD, deviceId: 'client-fake' },
        },
        createPlayerPorts(),
        SILENT_LOG,
        undefined,
        memory.ports,
      );
      const token = deviceTokenFromCookies(first.cookies);
      const second = await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookie: `${PLAYER_DEVICE_COOKIE}=${token}`,
          cookieSecure: true,
          body: { email: PLAYER_EMAIL, password: PLAYER_PASSWORD, deviceId: 'other-fake' },
        },
        createPlayerPorts(),
        SILENT_LOG,
        undefined,
        memory.ports,
      );
      assert.equal(deviceTokenFromCookies(second.cookies), token);
      assert.equal(memory.events[0]?.deviceHash, memory.events[1]?.deviceHash);
      assert.equal(memory.events[0]?.deviceHash, hashPlayerSecuritySignal('device', token, PEPPER));
    });
  });

  it('rate-limits concurrent failures without calling password verification', async () => {
    await withPepper(async () => {
      const memory = createMemorySecurityPorts();
      const ports = createPlayerPorts();
      const attempts = Array.from({ length: 20 }, () => handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookieSecure: true,
          trustedNetworkAddress: '198.51.100.10',
          body: { email: PLAYER_EMAIL, password: 'password9' },
        },
        ports,
        SILENT_LOG,
        undefined,
        memory.ports,
      ));
      const results = await Promise.all(attempts);
      const limited = results.filter((row) => row.body.error === 'AUTH_RATE_LIMITED');
      const failed = results.filter((row) => row.body.error === 'AUTH_FAILED');
      assert.equal(failed.length, 8);
      assert.equal(limited.length, 12);
      assert.equal(ports.signIns.length, 8);
      assert.equal(limited.every((row) => row.status === 429), true);
      const stillLimited = await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookieSecure: true,
          trustedNetworkAddress: '198.51.100.10',
          body: { email: PLAYER_EMAIL, password: PLAYER_PASSWORD },
        },
        ports,
        SILENT_LOG,
        undefined,
        memory.ports,
      );
      assert.equal(stillLimited.body.error, 'AUTH_RATE_LIMITED');
      assert.equal(ports.signIns.length, 8);
      const last = memory.events.at(-1);
      await memory.ports.recordEvent({
        identifierHash: last?.identifierHash ?? null,
        deviceHash: last?.deviceHash ?? null,
        networkHash: last?.networkHash ?? null,
        userAgentHash: last?.userAgentHash ?? null,
        eventType: 'LOGIN_SUCCESS',
        playerUserId: PLAYER_A,
      });
      const success = await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookieSecure: true,
          trustedNetworkAddress: '198.51.100.10',
          body: { email: PLAYER_EMAIL, password: PLAYER_PASSWORD },
        },
        ports,
        SILENT_LOG,
        undefined,
        memory.ports,
      );
      assert.equal(success.status, 200);
      const afterSuccess = await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookieSecure: true,
          trustedNetworkAddress: '198.51.100.10',
          body: { email: PLAYER_EMAIL, password: 'password9' },
        },
        createPlayerPorts(),
        SILENT_LOG,
        undefined,
        memory.ports,
      );
      assert.equal(afterSuccess.body.error, 'AUTH_FAILED');
    });
  });

  it('creates shared device/network flags without auto-blocking or duplicating active flags', async () => {
    await withPepper(async () => {
      const memory = createMemorySecurityPorts();
      const token = 'd'.repeat(43);
      const cookie = `${PLAYER_DEVICE_COOKIE}=${token}`;
      const portsA = createPlayerPorts();
      portsA.getAuthUser = async () => ({ id: PLAYER_A, email: PLAYER_EMAIL });
      const portsB = createPlayerPorts();
      portsB.getAuthUser = async () => ({ id: PLAYER_B, email: 'second@nextpari.test' });

      await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookie,
          cookieSecure: true,
          trustedNetworkAddress: '192.0.2.8',
          body: { email: PLAYER_EMAIL, password: PLAYER_PASSWORD },
        },
        portsA,
        SILENT_LOG,
        undefined,
        memory.ports,
      );
      await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookie,
          cookieSecure: true,
          trustedNetworkAddress: '192.0.2.8',
          body: { email: 'second@nextpari.test', password: PLAYER_PASSWORD },
        },
        portsB,
        SILENT_LOG,
        undefined,
        memory.ports,
      );
      await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookie,
          cookieSecure: true,
          trustedNetworkAddress: '192.0.2.8',
          body: { email: PLAYER_EMAIL, password: PLAYER_PASSWORD },
        },
        portsA,
        SILENT_LOG,
        undefined,
        memory.ports,
      );

      const deviceFlags = memory.flags.filter((row) => row.flagType === 'SHARED_DEVICE' && row.status === 'open');
      const networkFlags = memory.flags.filter((row) => row.flagType === 'SHARED_NETWORK' && row.status === 'open');
      assert.equal(deviceFlags.length, 2);
      assert.equal(networkFlags.length, 2);
      assert.equal(deviceFlags.every((row) => row.relatedPlayerCount === 2), true);
      assert.equal(JSON.stringify(memory.events).includes('blocked'), false);
      const login = read('server/player/playerAuthService.ts');
      assert.equal(login.includes('owner_set_player_blocked'), false);
      assert.equal(login.includes('apply_wallet_entry'), false);
    });
  });

  it('does not break login when telemetry is unconfigured', async () => {
    const previous = process.env.PLAYER_SECURITY_SIGNAL_PEPPER;
    delete process.env.PLAYER_SECURITY_SIGNAL_PEPPER;
    resetPlayerSecurityConfigWarnings();
    try {
      const result = await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookieSecure: true,
          body: { email: PLAYER_EMAIL, password: PLAYER_PASSWORD },
        },
        createPlayerPorts(),
      );
      assert.equal(result.status, 200);
      assert.equal((result.cookies ?? []).some((row) => row.startsWith(`${PLAYER_DEVICE_COOKIE}=`)), true);
    } finally {
      if (previous != null) process.env.PLAYER_SECURITY_SIGNAL_PEPPER = previous;
    }
  });

  it('maps AUTH_RATE_LIMITED without account enumeration and keeps register working', async () => {
    const authUi = read('src/lib/playerAuth.ts');
    assert.match(authUi, /auth_rate_limited/);
    assert.match(authUi, /too many attempts/);
    const result = await handlePlayerAuthRequest(
      {
        method: 'POST',
        pathname: PLAYER_AUTH_REGISTER_PATH,
        cookieSecure: true,
        body: { method: 'email', email: 'new@nextpari.test', password: PLAYER_PASSWORD, ageConfirmed: true },
      },
      createPlayerPorts(),
    );
    assert.equal(result.status, 200);
    assert.equal(presentedLoginIdentifier({ mode: 'identifier', identifier: '110790' }), '110790');
  });
});

describe('player security privacy source contracts', () => {
  it('does not fingerprint canvas/fonts/audio and never stores raw secrets in TS ingest', () => {
    const signals = read('server/player/playerSecuritySignals.ts');
    const service = read('server/player/playerSecurityService.ts');
    const http = read('server/player/playerAuthHttp.ts');
    const network = read('server/player/playerSecurityNetwork.ts');
    const combined = `${signals}\n${service}\n${http}`;
    assert.equal(combined.includes('canvas'), false);
    assert.equal(combined.includes('audiofingerprint') || combined.includes('audio fingerprint'), false);
    assert.equal(combined.toLowerCase().includes('battery'), false);
    assert.match(service, /createServiceRoleClient/);
    assert.match(service, /player_security_record_event/);
    assert.match(service, /player_security_check_login/);
    assert.equal(service.includes('x-forwarded-for'), false);
    assert.equal(service.includes('x-real-ip'), false);
    assert.equal(service.includes('forwardedFor'), false);
    assert.match(http, /trustedClientAddressFromVercel/);
    assert.match(http, /trustedClientAddressFromNode/);
    assert.equal(http.includes("headerValue(req.headers, 'x-forwarded-for')"), false);
    assert.equal(http.includes('body.ip'), false);
    assert.equal(http.includes('body.deviceId'), false);
    assert.match(network, /ipAddress/);
    assert.match(network, /PLAYER_SECURITY_TRUSTED_PROXY/);
    assert.match(sql, /PLAYER_SECURITY_METADATA_FORBIDDEN/);
  });
});

describe('player security trusted network boundary', () => {
  it('hashes only a trusted platform address and ignores body/untrusted forwarded values', async () => {
    await withPepper(async () => {
      const trusted = '203.0.113.10';
      const expected = hashPlayerSecuritySignal('net', trusted, PEPPER);
      const hashes = buildPlayerSecurityHashes({
        identifier: PLAYER_EMAIL,
        trustedNetworkAddress: trusted,
        userAgent: 'Mozilla/5.0 Test',
      });
      const again = buildPlayerSecurityHashes({
        identifier: PLAYER_EMAIL,
        trustedNetworkAddress: trusted,
      });
      const missing = buildPlayerSecurityHashes({
        identifier: PLAYER_EMAIL,
        trustedNetworkAddress: null,
      });
      assert.equal(hashes.networkHash, expected);
      assert.equal(again.networkHash, expected);
      assert.equal(missing.networkHash, null);

      const memory = createMemorySecurityPorts();
      const result = await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookieSecure: true,
          trustedNetworkAddress: trusted,
          forwardedFor: '198.51.100.1, 10.0.0.1',
          realIp: '198.51.100.2',
          body: {
            email: PLAYER_EMAIL,
            password: PLAYER_PASSWORD,
            ip: '1.2.3.4',
            network: '9.9.9.9',
            deviceId: 'spoofed-device',
          },
        },
        createPlayerPorts(),
        SILENT_LOG,
        undefined,
        memory.ports,
      );
      assert.equal(result.status, 200);
      assert.equal(memory.events[0]?.networkHash, expected);
      const dumped = `${JSON.stringify(result.body)}\n${JSON.stringify(memory.events)}`;
      assert.equal(dumped.includes(trusted), false);
      assert.equal(dumped.includes('1.2.3.4'), false);
      assert.equal(dumped.includes('198.51.100.1'), false);
      assert.equal(dumped.includes('9.9.9.9'), false);
    });
  });

  it('uses Vercel platform IP and Node peer address; untrusted XFF cannot override', () => {
    assert.equal(
      trustedClientAddressFromVercel({
        'x-real-ip': '203.0.113.10',
        'x-forwarded-for': '198.51.100.1, 10.0.0.1',
        'x-vercel-forwarded-for': '198.51.100.1',
      }),
      '203.0.113.10',
    );
    assert.equal(
      trustedClientAddressFromVercel({
        'x-forwarded-for': '198.51.100.1',
      }),
      null,
    );
    assert.equal(
      trustedClientAddressFromNode({
        headers: {
          'x-forwarded-for': '198.51.100.1',
          'x-real-ip': '198.51.100.2',
        },
        socket: { remoteAddress: '203.0.113.10' } as never,
      }),
      '203.0.113.10',
    );
    assert.equal(
      trustedClientAddressFromNode({
        headers: { 'x-forwarded-for': '198.51.100.1' },
        socket: { remoteAddress: undefined } as never,
      }),
      null,
    );
    const previous = process.env[PLAYER_SECURITY_TRUSTED_PROXY_ENV];
    process.env[PLAYER_SECURITY_TRUSTED_PROXY_ENV] = '1';
    try {
      assert.equal(
        trustedClientAddressFromNode({
          headers: {
            'x-forwarded-for': '198.51.100.1, 10.0.0.1',
            'x-real-ip': '198.51.100.2',
          },
          socket: { remoteAddress: '203.0.113.10' } as never,
        }),
        '198.51.100.1',
      );
    } finally {
      if (previous == null) delete process.env[PLAYER_SECURITY_TRUSTED_PROXY_ENV];
      else process.env[PLAYER_SECURITY_TRUSTED_PROXY_ENV] = previous;
    }
  });
});

describe('player security shared-scope login pressure', () => {
  const deviceCookie = `${PLAYER_DEVICE_COOKIE}=${'d'.repeat(43)}`;

  it('clears identifier pressure on LOGIN_SUCCESS for the same identifier only', async () => {
    await withPepper(async () => {
      const memory = createMemorySecurityPorts();
      for (let i = 0; i < 8; i += 1) {
        const failed = await handlePlayerAuthRequest(
          {
            method: 'POST',
            pathname: PLAYER_AUTH_LOGIN_PATH,
            cookieSecure: true,
            trustedNetworkAddress: '203.0.113.80',
            body: { email: PLAYER_EMAIL, password: 'password9' },
          },
          createPlayerPorts(),
          SILENT_LOG,
          undefined,
          memory.ports,
        );
        assert.equal(failed.body.error, 'AUTH_FAILED');
      }
      const limited = await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookieSecure: true,
          trustedNetworkAddress: '203.0.113.80',
          body: { email: PLAYER_EMAIL, password: PLAYER_PASSWORD },
        },
        createPlayerPorts(),
        SILENT_LOG,
        undefined,
        memory.ports,
      );
      assert.equal(limited.body.error, 'AUTH_RATE_LIMITED');
      const last = memory.events.at(-1);
      await memory.ports.recordEvent({
        identifierHash: last?.identifierHash ?? null,
        deviceHash: last?.deviceHash ?? null,
        networkHash: last?.networkHash ?? null,
        userAgentHash: last?.userAgentHash ?? null,
        eventType: 'LOGIN_SUCCESS',
        playerUserId: PLAYER_A,
      });
      const unlocked = await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookieSecure: true,
          trustedNetworkAddress: '203.0.113.80',
          body: { email: PLAYER_EMAIL, password: 'password9' },
        },
        createPlayerPorts(),
        SILENT_LOG,
        undefined,
        memory.ports,
      );
      assert.equal(unlocked.body.error, 'AUTH_FAILED');
    });
  });

  it('does not reset device pressure when another account logs in on the same device', async () => {
    await withPepper(async () => {
      const memory = createMemorySecurityPorts();
      for (let i = 0; i < 20; i += 1) {
        const failed = await handlePlayerAuthRequest(
          {
            method: 'POST',
            pathname: PLAYER_AUTH_LOGIN_PATH,
            cookie: deviceCookie,
            cookieSecure: true,
            trustedNetworkAddress: `203.0.113.${i + 1}`,
            body: { email: `victim${i}@nextpari.test`, password: 'password9' },
          },
          createPlayerPorts(),
          SILENT_LOG,
          undefined,
          memory.ports,
        );
        assert.equal(failed.body.error, 'AUTH_FAILED');
      }
      const attackerSuccess = await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookie: deviceCookie,
          cookieSecure: true,
          trustedNetworkAddress: '192.0.2.50',
          body: { email: PLAYER_EMAIL, password: PLAYER_PASSWORD },
        },
        createPlayerPorts(),
        SILENT_LOG,
        undefined,
        memory.ports,
      );
      assert.equal(attackerSuccess.body.error, 'AUTH_RATE_LIMITED');
      const last = memory.events.at(-1);
      await memory.ports.recordEvent({
        identifierHash: hashPlayerSecuritySignal('id', PLAYER_EMAIL, PEPPER),
        deviceHash: last?.deviceHash ?? null,
        networkHash: last?.networkHash ?? null,
        userAgentHash: last?.userAgentHash ?? null,
        eventType: 'LOGIN_SUCCESS',
        playerUserId: PLAYER_A,
      });
      const stillLimited = await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookie: deviceCookie,
          cookieSecure: true,
          trustedNetworkAddress: '192.0.2.51',
          body: { email: 'another-victim@nextpari.test', password: 'password9' },
        },
        createPlayerPorts(),
        SILENT_LOG,
        undefined,
        memory.ports,
      );
      assert.equal(stillLimited.body.error, 'AUTH_RATE_LIMITED');
    });
  });

  it('does not reset network pressure when another account logs in on the same network', async () => {
    await withPepper(async () => {
      const memory = createMemorySecurityPorts();
      for (let i = 0; i < 40; i += 1) {
        const failed = await handlePlayerAuthRequest(
          {
            method: 'POST',
            pathname: PLAYER_AUTH_LOGIN_PATH,
            cookieSecure: true,
            trustedNetworkAddress: '198.51.100.40',
            body: { email: `spray${i}@nextpari.test`, password: 'password9' },
          },
          createPlayerPorts(),
          SILENT_LOG,
          undefined,
          memory.ports,
        );
        assert.equal(failed.body.error, 'AUTH_FAILED');
      }
      const attackerSuccess = await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookieSecure: true,
          trustedNetworkAddress: '198.51.100.40',
          body: { email: PLAYER_EMAIL, password: PLAYER_PASSWORD },
        },
        createPlayerPorts(),
        SILENT_LOG,
        undefined,
        memory.ports,
      );
      assert.equal(attackerSuccess.body.error, 'AUTH_RATE_LIMITED');
      await memory.ports.recordEvent({
        identifierHash: hashPlayerSecuritySignal('id', PLAYER_EMAIL, PEPPER),
        deviceHash: null,
        networkHash: hashPlayerSecuritySignal('net', '198.51.100.40', PEPPER),
        userAgentHash: null,
        eventType: 'LOGIN_SUCCESS',
        playerUserId: PLAYER_A,
      });
      const stillLimited = await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookieSecure: true,
          trustedNetworkAddress: '198.51.100.40',
          body: { email: 'more-spray@nextpari.test', password: 'password9' },
        },
        createPlayerPorts(),
        SILENT_LOG,
        undefined,
        memory.ports,
      );
      assert.equal(stillLimited.body.error, 'AUTH_RATE_LIMITED');
    });
  });

  it('does not reset device or network pressure on REGISTER_SUCCESS', async () => {
    await withPepper(async () => {
      const memory = createMemorySecurityPorts();
      for (let i = 0; i < 20; i += 1) {
        const failed = await handlePlayerAuthRequest(
          {
            method: 'POST',
            pathname: PLAYER_AUTH_LOGIN_PATH,
            cookie: deviceCookie,
            cookieSecure: true,
            trustedNetworkAddress: '203.0.113.90',
            body: { email: `reg${i}@nextpari.test`, password: 'password9' },
          },
          createPlayerPorts(),
          SILENT_LOG,
          undefined,
          memory.ports,
        );
        assert.equal(failed.body.error, 'AUTH_FAILED');
      }
      const registered = await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_REGISTER_PATH,
          cookie: deviceCookie,
          cookieSecure: true,
          trustedNetworkAddress: '203.0.113.90',
          body: { method: 'email', email: 'after-spray@nextpari.test', password: PLAYER_PASSWORD, ageConfirmed: true },
        },
        createPlayerPorts(),
        SILENT_LOG,
        undefined,
        memory.ports,
      );
      assert.equal(registered.status, 200);
      assert.equal(memory.events.some((row) => row.eventType === 'REGISTER_SUCCESS'), true);
      const stillLimited = await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookie: deviceCookie,
          cookieSecure: true,
          trustedNetworkAddress: '203.0.113.90',
          body: { email: 'after-register@nextpari.test', password: 'password9' },
        },
        createPlayerPorts(),
        SILENT_LOG,
        undefined,
        memory.ports,
      );
      assert.equal(stillLimited.body.error, 'AUTH_RATE_LIMITED');
    });
  });

  it('lets device and network pressure recover after the configured window and cooldown', async () => {
    await withPepper(async () => {
      const clock = { now: Date.now() };
      const memory = createMemorySecurityPorts(clock);
      for (let i = 0; i < 20; i += 1) {
        const failed = await handlePlayerAuthRequest(
          {
            method: 'POST',
            pathname: PLAYER_AUTH_LOGIN_PATH,
            cookie: deviceCookie,
            cookieSecure: true,
            trustedNetworkAddress: '192.0.2.90',
            body: { email: `window${i}@nextpari.test`, password: 'password9' },
          },
          createPlayerPorts(),
          SILENT_LOG,
          undefined,
          memory.ports,
        );
        assert.equal(failed.body.error, 'AUTH_FAILED');
      }
      const limited = await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookie: deviceCookie,
          cookieSecure: true,
          trustedNetworkAddress: '192.0.2.90',
          body: { email: 'window-blocked@nextpari.test', password: 'password9' },
        },
        createPlayerPorts(),
        SILENT_LOG,
        undefined,
        memory.ports,
      );
      assert.equal(limited.body.error, 'AUTH_RATE_LIMITED');
      clock.now += PRESSURE_WINDOW_MS + PRESSURE_COOLDOWN_MS + 1000;
      const recovered = await handlePlayerAuthRequest(
        {
          method: 'POST',
          pathname: PLAYER_AUTH_LOGIN_PATH,
          cookie: deviceCookie,
          cookieSecure: true,
          trustedNetworkAddress: '192.0.2.90',
          body: { email: 'window-recovered@nextpari.test', password: 'password9' },
        },
        createPlayerPorts(),
        SILENT_LOG,
        undefined,
        memory.ports,
      );
      assert.equal(recovered.body.error, 'AUTH_FAILED');
    });
  });
});
