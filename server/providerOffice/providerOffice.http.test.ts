import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GroupControlError } from '../group/errors.js';
import { handleGroupOwnerRequest, type GroupOwnerPorts } from '../group/ownerHttp.js';
import { readJwtClaims } from '../group/ownerReadModel.js';
import {
  handleGroupProviderRoute,
  handleProviderOfficeRequest,
  issueInvitation,
  PROVIDER_ACCESS_COOKIE,
  unconfiguredProviderPorts,
  type ProviderOfficePorts,
} from './http.js';
import { memoryReportingSource } from './reportingSource.js';
import { ODDSPAPI_PROVIDER_ID, SEED_DIRECTORY } from './terms.js';
import type { SportsBetFact } from './ggr.js';

const NOW = Date.parse('2026-11-24T12:00:00.000Z');
const OWNER = '00000000-0000-4000-8000-0000000000aa';

function fact(overrides: Partial<SportsBetFact> = {}): SportsBetFact {
  return {
    betId: 'bet-1',
    brandCode: '001',
    product: 'sports',
    currency: 'USD',
    stake: '100.00',
    payout: '0.00',
    settlement: 'loser',
    status: 'settled',
    mode: 'single',
    settledAt: '2026-11-24T12:00:00.000Z',
    testAccount: false,
    sports: [],
    ...overrides,
  };
}

function ports(overrides: Partial<ProviderOfficePorts> = {}): ProviderOfficePorts {
  const calls: string[] = [];
  const base = unconfiguredProviderPorts();
  return {
    ...base,
    now: () => NOW,
    async authenticate(email, password) {
      if (email === 'odds@provider.example' && password === 'correct-password') {
        return { status: 'ok', userId: 'user-1', providerId: ODDSPAPI_PROVIDER_ID, mfaEnrolled: true };
      }
      if (email === 'disabled@provider.example') return { status: 'disabled' };
      return { status: 'invalid' };
    },
    async verifyTotp(_userId, code) {
      return code === '123456';
    },
    reporting: {
      async load(brandCode, period) {
        calls.push(brandCode);
        return memoryReportingSource({
          facts: [fact(), fact({ betId: 'ryxo', brandCode: '002', stake: '900.00' }), Object.assign(fact({ betId: 'mail' }), { email: 'a@b.c' })],
          loadedAt: '2026-11-24T18:00:00.000Z',
        }).load(brandCode, period);
      },
    },
    ...overrides,
    sessions: overrides.sessions ?? new Map(),
    failures: overrides.failures ?? new Map(),
    directory: overrides.directory ?? SEED_DIRECTORY,
  };
}

function cookieFrom(result: { cookies?: string[] }): string {
  const header = result.cookies?.[0] ?? '';
  const match = new RegExp(`${PROVIDER_ACCESS_COOKIE}=([^;]+)`).exec(header);
  return `${PROVIDER_ACCESS_COOKIE}=${match?.[1] ?? ''}`;
}

describe('provider office http', () => {
  it('requires MFA, stays read-only, and refuses another brand before loading it', async () => {
    const office = ports();
    const calls: string[] = [];
    office.reporting = {
      async load(brandCode, period) {
        calls.push(brandCode);
        return memoryReportingSource({ facts: [fact()], loadedAt: '2026-11-24T18:00:00.000Z' }).load(brandCode, period);
      },
    };
    const login = await handleProviderOfficeRequest({
      method: 'POST',
      pathname: '/api/provider-office/auth/login',
      body: { email: 'odds@provider.example', password: 'correct-password' },
    }, office);
    assert.equal(login.status, 200);
    const session = cookieFrom(login);
    const early = await handleProviderOfficeRequest({
      method: 'GET',
      pathname: '/api/provider-office/report',
      cookie: session,
    }, office);
    assert.equal(early.status, 403);
    assert.equal(early.body && typeof early.body === 'object' && early.body.error, 'MFA_REQUIRED');
    assert.deepEqual(calls, []);
    const mfa = await handleProviderOfficeRequest({
      method: 'POST',
      pathname: '/api/provider-office/auth/mfa',
      cookie: session,
      body: { code: '123456' },
    }, office);
    assert.equal(mfa.status, 200);
    const denied = await handleProviderOfficeRequest({
      method: 'GET',
      pathname: '/api/provider-office/report',
      search: '?brand=002',
      cookie: session,
    }, office);
    assert.equal(denied.status, 403);
    assert.equal(calls.length === 0 || calls.every((brand) => brand !== '002'), true);
    const report = await handleProviderOfficeRequest({
      method: 'GET',
      pathname: '/api/provider-office/report',
      search: '?format=csv',
      cookie: session,
    }, office);
    assert.equal(report.status, 200);
    assert.equal(typeof report.body, 'string');
    assert.equal(String(report.body).includes('a@b.c'), false);
    assert.match(String(report.body), /100\.00/);
    const write = await handleProviderOfficeRequest({
      method: 'POST',
      pathname: '/api/provider-office/report',
      cookie: session,
      body: { ggr: '1.00' },
    }, office);
    assert.equal(write.status, 403);
    assert.equal(write.body && typeof write.body === 'object' && write.body.error, 'READ_ONLY');
    await handleProviderOfficeRequest({ method: 'POST', pathname: '/api/provider-office/auth/logout', cookie: session }, office);
    const revoked = await handleProviderOfficeRequest({
      method: 'GET',
      pathname: '/api/provider-office/report',
      cookie: session,
    }, office);
    assert.equal(revoked.status, 401);
    assert.equal(revoked.body && typeof revoked.body === 'object' && revoked.body.error, 'SESSION_REVOKED');
  });

  it('rate-limits password failures and does not configure a user by itself', async () => {
    const office = ports();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await handleProviderOfficeRequest({
        method: 'POST',
        pathname: '/api/provider-office/auth/login',
        clientIp: '203.0.113.8',
        body: { email: 'odds@provider.example', password: 'wrong-password' },
      }, office);
      assert.equal(failed.status, 401);
    }
    const limited = await handleProviderOfficeRequest({
      method: 'POST',
      pathname: '/api/provider-office/auth/login',
      clientIp: '203.0.113.8',
      body: { email: 'odds@provider.example', password: 'correct-password' },
    }, office);
    assert.equal(limited.status, 429);
    const closed = await handleProviderOfficeRequest({
      method: 'POST',
      pathname: '/api/provider-office/auth/login',
      body: { email: 'someone@provider.example', password: 'correct-password' },
    }, unconfiguredProviderPorts());
    assert.equal(closed.status, 503);
    assert.equal(closed.body && typeof closed.body === 'object' && closed.body.error, 'AUTH_NOT_CONFIGURED');
  });

  it('returns an explicit error instead of zeros when the ledger cannot be read', async () => {
    const office = ports();
    const login = await handleProviderOfficeRequest({
      method: 'POST',
      pathname: '/api/provider-office/auth/login',
      body: { email: 'odds@provider.example', password: 'correct-password' },
    }, office);
    await handleProviderOfficeRequest({
      method: 'POST',
      pathname: '/api/provider-office/auth/mfa',
      cookie: cookieFrom(login),
      body: { code: '123456' },
    }, office);
    office.reporting = {
      async load() {
        return { ok: false, error: 'REPORTING_SOURCE_UNAVAILABLE' };
      },
    };
    const report = await handleProviderOfficeRequest({
      method: 'GET',
      pathname: '/api/provider-office/report',
      cookie: cookieFrom(login),
    }, office);
    assert.equal(report.status, 503);
    assert.equal(JSON.stringify(report.body).includes('0.00'), false);
    assert.equal(JSON.stringify(report.body).includes('ggr'), false);
  });

  it('accepts an invitation without returning a password', async () => {
    const office = ports();
    const issued = issueInvitation(office, ODDSPAPI_PROVIDER_ID);
    const accepted = await handleProviderOfficeRequest({
      method: 'POST',
      pathname: '/api/provider-office/auth/accept',
      body: { invitationId: issued.invitationId, token: issued.token },
    }, office);
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body && typeof accepted.body === 'object' && accepted.body.passwordIssued, false);
    assert.equal(JSON.stringify(accepted.body).includes(issued.token), false);
  });
});

describe('group owner provider routes', () => {
  it('requires the owner session and does not invent sportsbook figures', async () => {
    const missing = await handleGroupOwnerRequest({
      method: 'GET',
      pathname: '/api/group-owner/sportsbook-ggr',
      search: '?asOf=2026-11-24',
    }, ownerPorts());
    assert.equal(missing.status, 401);

    const down = await handleGroupOwnerRequest({
      method: 'GET',
      pathname: '/api/group-owner/sportsbook-ggr',
      search: '?asOf=2026-11-24',
      cookie: ownerCookie(),
    }, ownerPorts());
    assert.equal(down.status, 503);
    assert.equal(JSON.stringify(down.body).includes('0.00'), false);

    const report = await handleGroupOwnerRequest({
      method: 'GET',
      pathname: '/api/group-owner/sportsbook-ggr',
      search: '?asOf=2026-11-24',
      cookie: ownerCookie(),
    }, ownerPorts(), {
      reporting: memoryReportingSource({ facts: [fact(), fact({ betId: 'ryxo', brandCode: '002', stake: '900.00' })], loadedAt: '2026-11-24T18:00:00.000Z' }),
    });
    assert.equal(report.status, 200);
    const body = report.body as { report?: { reporting?: { ggr?: string }; brandCode?: string } };
    assert.equal(body.report?.brandCode, '001');
    assert.equal(body.report?.reporting?.ggr, '100.00');

    const ryxo = await handleGroupOwnerRequest({
      method: 'GET',
      pathname: '/api/group-owner/sportsbook-ggr',
      search: '?asOf=2026-11-24&brand=002',
      cookie: ownerCookie(),
    }, ownerPorts());
    assert.equal(ryxo.status, 403);

    const casino = await handleGroupProviderRoute({ method: 'GET', pathname: '/api/group-owner/casino-ggr' });
    assert.equal(casino?.status, 200);
    assert.equal(JSON.stringify(casino?.body).includes('0.00'), false);
    assert.equal(JSON.stringify(casino?.body).includes('CASINO_SOURCE_UNAVAILABLE'), true);

    const write = await handleGroupOwnerRequest({
      method: 'POST',
      pathname: '/api/group-owner/provider-contracts/assign',
      cookie: ownerCookie(),
      body: { brandCode: '002' },
    }, ownerPorts());
    assert.equal(write.status, 409);
    assert.equal(write.body.applied, false);
  });
});

function ownerCookie(): string {
  const payload = Buffer.from(JSON.stringify({ sub: OWNER, aal: 'aal2' })).toString('base64url');
  return `np_group_access=${encodeURIComponent(`header.${payload}.sig`)}`;
}

function ownerPorts(): GroupOwnerPorts {
  return {
    async signInWithPassword() {
      return { accessToken: 'header.x.sig', refreshToken: 'refresh' };
    },
    async verifyAccessToken(value) {
      const claims = readJwtClaims(value);
      if (!claims) throw new GroupControlError('JWT_INVALID');
      return { userId: claims.sub, aal: claims.aal === 'aal2' ? 'aal2' : 'aal1' };
    },
    async listVerifiedTotpFactor() {
      return 'factor';
    },
    async verifyTotp() {
      return { accessToken: 'header.x.sig', refreshToken: 'refresh' };
    },
    async enrollTotp() {
      return { factorId: 'factor', uri: 'otpauth://totp/group' };
    },
    async loadOwner() {
      return { id: OWNER, status: 'active', permissions: ['reports.read'] };
    },
    async loadModel() {
      return { brands: [], brandOwners: [], grants: [], players: [], finance: [], audit: [] };
    },
    auditAuthFailure() {},
    async requestPasswordRecovery() {},
    async verifyRecoverySession() {
      return { userId: OWNER, aal: 'aal2' };
    },
    async updateRecoveredPassword() {},
  };
}
