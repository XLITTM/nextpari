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
import type { PlayerSecurityPorts, PlayerSecurityRecordInput } from './playerSecurityService.js';
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

function createMemorySecurityPorts(): {
  events: PlayerSecurityRecordInput[];
  flags: MemoryFlag[];
  ports: PlayerSecurityPorts;
} {
  const events: PlayerSecurityRecordInput[] = [];
  const flags: MemoryFlag[] = [];
  const pending = { identifier: 0, device: 0, network: 0 };
  let chain = Promise.resolve();
  const locked = async <T>(fn: () => T | Promise<T>): Promise<T> => {
    const run = chain.then(fn);
    chain = run.then(() => undefined, () => undefined);
    return run;
  };

  const failureCount = (key: 'identifierHash' | 'deviceHash' | 'networkHash', value: string | null) => {
    if (!value) return 0;
    const lastSuccess = events
      .filter((row) => row.eventType === 'LOGIN_SUCCESS' && row[key] === value)
      .at(-1);
    return events.filter((row) => (
      row.eventType === 'LOGIN_FAILURE'
      && row[key] === value
      && (!lastSuccess || events.indexOf(row) > events.indexOf(lastSuccess))
    )).length;
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
          const lastSuccess = (key: 'identifierHash' | 'deviceHash' | 'networkHash', value: string | null) => {
            if (!value) return -1;
            for (let i = events.length - 1; i >= 0; i -= 1) {
              if (events[i]?.eventType === 'LOGIN_SUCCESS' && events[i]?.[key] === value) return i;
            }
            return -1;
          };
          const lastSuccessIdx = Math.max(
            lastSuccess('identifierHash', hashes.identifierHash),
            lastSuccess('deviceHash', hashes.deviceHash),
            lastSuccess('networkHash', hashes.networkHash),
          );
          const blocked = failureCount('identifierHash', hashes.identifierHash) + pending.identifier >= 8
            || failureCount('deviceHash', hashes.deviceHash) + pending.device >= 20
            || failureCount('networkHash', hashes.networkHash) + pending.network >= 40
            || events.some((row, index) => (
              row.eventType === 'AUTH_RATE_LIMITED'
              && index > lastSuccessIdx
              && (
                (hashes.identifierHash && row.identifierHash === hashes.identifierHash)
                || (hashes.deviceHash && row.deviceHash === hashes.deviceHash)
                || (hashes.networkHash && row.networkHash === hashes.networkHash)
              )
            ));
          if (!blocked) {
            if (hashes.identifierHash) pending.identifier += 1;
            if (hashes.deviceHash) pending.device += 1;
            if (hashes.networkHash) pending.network += 1;
          }
          return { allowed: !blocked };
        });
      },
      async recordEvent(input) {
        return locked(async () => {
          events.push(input);
          if (input.eventType === 'LOGIN_FAILURE' || input.eventType === 'AUTH_RATE_LIMITED' || input.eventType === 'LOGIN_SUCCESS') {
            if (input.identifierHash) pending.identifier = Math.max(0, pending.identifier - 1);
            if (input.deviceHash) pending.device = Math.max(0, pending.device - 1);
            if (input.networkHash) pending.network = Math.max(0, pending.network - 1);
          }
          if (input.eventType === 'LOGIN_SUCCESS') {
            pending.identifier = 0;
            pending.device = 0;
            pending.network = 0;
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
    assert.match(sql, /GRANT SELECT, INSERT ON TABLE private\.player_security_events TO service_role/);
    assert.match(sql, /REVOKE ALL ON TABLE private\.player_security_events FROM anon, authenticated/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.player_security_record_event/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.player_security_check_login\(TEXT, TEXT, TEXT\) TO service_role/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.player_security_record_event\(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB\) FROM anon, authenticated/);
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
          forwardedFor: '203.0.113.10',
          userAgent: 'Mozilla/5.0 Test',
          body: { email: PLAYER_EMAIL, password: PLAYER_PASSWORD, ip: '1.2.3.4', deviceId: 'spoofed-device' },
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
          forwardedFor: '198.51.100.10',
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
          forwardedFor: '198.51.100.10',
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
          forwardedFor: '198.51.100.10',
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
          forwardedFor: '198.51.100.10',
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
          forwardedFor: '192.0.2.8',
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
          forwardedFor: '192.0.2.8',
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
          forwardedFor: '192.0.2.8',
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
    const combined = `${signals}\n${service}\n${http}`;
    assert.equal(combined.includes('canvas'), false);
    assert.equal(combined.includes('audiofingerprint') || combined.includes('audio fingerprint'), false);
    assert.equal(combined.toLowerCase().includes('battery'), false);
    assert.match(service, /createServiceRoleClient/);
    assert.match(http, /x-forwarded-for/);
    assert.equal(http.includes('body.ip'), false);
    assert.equal(http.includes('body.deviceId'), false);
    assert.match(sql, /PLAYER_SECURITY_METADATA_FORBIDDEN/);
  });
});
