import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROLE_CEILING } from '../src/access/model';
import { parseSession } from '../src/access/session';
import { parseMfaChallenge } from '../src/api/parsers';
import { OPERATIONAL_FLAGS, REQUIRED_TABLE_COUNT, assessCatalog, type CatalogTable } from './catalog';
import { createMfaSecret, hashPassword, hashSecret, totpCode } from './crypto';
import { DENIED_DATABASE_ROLES, OFFICE_DATABASE_ROLE, OFFICE_POOLER_DATABASE, OFFICE_POOLER_HOST, OFFICE_POOLER_PORT, OFFICE_POOLER_USER, readOfficeConfig } from './env';
import { handleOffice, officeFor, type OfficeRequest } from './handler';
import { createMemoryOffice, testingPatchStaff } from './memory';
import { createProductionHandler } from './production';
import type { FlagRecord, OfficeRepository, StaffRecord } from './repository';

const PEPPER = 'rixo-office-session-pepper-32bytes';
const NOW = Date.parse('2026-11-07T12:00:00.000Z');
const PASSWORD = 'correct-horse-1';

function flags(enabledKey?: string): FlagRecord[] {
  return OPERATIONAL_FLAGS.map((key) => ({ key, brandCode: '002', enabled: key === enabledKey }));
}

function staff(overrides: Partial<StaffRecord> = {}): StaffRecord {
  return {
    id: 'staff-cashier-001',
    email: 'cashier@office.rixobet.com',
    role: 'cashier',
    status: 'active',
    brandCode: '002',
    displayName: 'Cashier',
    authUserId: null,
    passwordHash: hashPassword(PASSWORD),
    mfaSecret: createMfaSecret(),
    mfaLastStep: null,
    identityVerifiedAt: '2026-11-01T00:00:00.000Z',
    invitationTokenHash: null,
    invitationExpiresAt: null,
    invitationConsumedAt: null,
    ...overrides,
  };
}

function pendingOwner(): StaffRecord {
  return staff({
    id: 'owner-invited-002',
    email: 'guwanch@owner.com',
    role: 'owner',
    status: 'invited',
    displayName: 'Guwanch',
    passwordHash: null,
    mfaSecret: null,
    identityVerifiedAt: null,
    invitationTokenHash: null,
    invitationExpiresAt: null,
    invitationConsumedAt: null,
  });
}

function reasonOf(env: Record<string, string>): string {
  const result = readOfficeConfig(env);
  if (result.ok) throw new Error('credentials were accepted');
  return result.reason;
}

function poolerUrl(user = OFFICE_POOLER_USER, password = 'pw', host = OFFICE_POOLER_HOST, port = OFFICE_POOLER_PORT, database = OFFICE_POOLER_DATABASE) {
  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

function office(repository: OfficeRepository, now = NOW) {
  return officeFor(repository, PEPPER, () => now, true);
}

function request(partial: Partial<OfficeRequest> & Pick<OfficeRequest, 'method' | 'path'>): OfficeRequest {
  return {
    body: {},
    ...partial,
    headers: { origin: 'https://office.rixobet.com', ...partial.headers },
  };
}

function cookieOf(response: { setCookie: string[] }): string {
  const header = response.setCookie[0];
  if (!header) throw new Error('missing cookie');
  return header.split(';')[0]?.split('=').slice(1).join('=') ?? '';
}

function catalog(options?: { count?: number; rls?: boolean; forceRls?: boolean; staff?: boolean; challengeName?: string }): CatalogTable[] {
  const count = options?.count ?? REQUIRED_TABLE_COUNT;
  const tables: CatalogTable[] = [
    {
      name: 'staff_accounts',
      rls: options?.rls ?? true,
      forceRls: options?.forceRls ?? true,
      columns: options?.staff === false
        ? ['id']
        : [
            'id',
            'email',
            'role',
            'status',
            'brand_code',
            'display_name',
            'auth_user_id',
            'password_hash',
            'mfa_secret',
            'mfa_last_step',
            'identity_verified_at',
            'invitation_token_hash',
            'invitation_expires_at',
            'invitation_consumed_at',
          ],
    },
    {
      name: 'staff_sessions',
      rls: true,
      forceRls: true,
      columns: ['id', 'staff_id', 'brand_code', 'secret_hash', 'expires_at', 'revoked_at', 'mfa_satisfied'],
    },
    {
      name: options?.challengeName ?? 'staff_mfa_challenges',
      rls: true,
      forceRls: true,
      columns: ['id', 'staff_id', 'brand_code', 'expires_at', 'consumed_at', 'attempt_count'],
    },
    {
      name: 'feature_flags',
      rls: true,
      forceRls: true,
      columns: ['flag_key', 'brand_code', 'enabled'],
    },
  ];
  for (let index = tables.length; index < count; index += 1) {
    tables.push({ name: `foundation_${index}`, rls: true, forceRls: true, columns: ['id'] });
  }
  return tables;
}

describe('office authentication', () => {
  it('rejects a catalog that is not the private brand schema', () => {
    expect(assessCatalog({ schema: 'public', tables: catalog() })).toEqual({ ok: false, reason: 'schema' });
    expect(assessCatalog({ schema: 'ryxobet', tables: catalog({ count: 16 }) })).toEqual({ ok: false, reason: 'table_count' });
    expect(assessCatalog({ schema: 'ryxobet', tables: catalog({ rls: false }) })).toEqual({ ok: false, reason: 'rls' });
    expect(assessCatalog({ schema: 'ryxobet', tables: catalog({ forceRls: false }) })).toEqual({ ok: false, reason: 'rls' });
    expect(assessCatalog({ schema: 'ryxobet', tables: catalog({ staff: false }) })).toEqual({ ok: false, reason: 'staff' });
    expect(assessCatalog({ schema: 'ryxobet', tables: catalog({ challengeName: 'mfa_challenges' }) })).toEqual({
      ok: false,
      reason: 'challenges',
    });
    const bound = assessCatalog({ schema: 'ryxobet', tables: catalog() });
    expect(bound).toEqual({
      ok: true,
      bound: {
        staff: 'staff_accounts',
        sessions: 'staff_sessions',
        challenges: 'staff_mfa_challenges',
        flags: 'feature_flags',
      },
    });
  });

  it('rejects missing, shared, and frontend database credentials', async () => {
    expect(reasonOf({})).toBe('missing_database');
    const deniedRole = DENIED_DATABASE_ROLES.find((role) => role.includes('_'));
    expect(deniedRole).toBeTruthy();
    expect(
      reasonOf({
        RYXOBET_OFFICE_DATABASE_URL: `postgresql://${deniedRole}:pw@127.0.0.1/ryxobet`,
        RYXOBET_OFFICE_SESSION_PEPPER: PEPPER,
      }),
    ).toBe('forbidden_role');
    expect(readOfficeConfig({
      RYXOBET_OFFICE_DATABASE_URL: `${poolerUrl()}?sslmode=require`,
      RYXOBET_OFFICE_SESSION_PEPPER: PEPPER,
    }).ok).toBe(true);
    expect(reasonOf({
      RYXOBET_OFFICE_DATABASE_URL: `${poolerUrl()}?sslmode=disable`,
      RYXOBET_OFFICE_SESSION_PEPPER: PEPPER,
    })).toBe('forbidden_role');
    expect(reasonOf({
      RYXOBET_OFFICE_DATABASE_URL: poolerUrl('ryxobet_office_api.otherproject'),
      RYXOBET_OFFICE_SESSION_PEPPER: PEPPER,
    })).toBe('forbidden_role');
    expect(reasonOf({
      RYXOBET_OFFICE_DATABASE_URL: poolerUrl('ryxobet_office_api'),
      RYXOBET_OFFICE_SESSION_PEPPER: PEPPER,
    })).toBe('forbidden_role');
    expect(reasonOf({
      RYXOBET_OFFICE_DATABASE_URL: poolerUrl(OFFICE_POOLER_USER, 'pw', 'db.lsmfdhenmceiammyptzu.supabase.co', '5432'),
      RYXOBET_OFFICE_SESSION_PEPPER: PEPPER,
    })).toBe('forbidden_role');
    expect(reasonOf({
      RYXOBET_OFFICE_DATABASE_URL: poolerUrl(OFFICE_POOLER_USER, 'pw', OFFICE_POOLER_HOST, '5432', 'ryxobet'),
      RYXOBET_OFFICE_SESSION_PEPPER: PEPPER,
    })).toBe('forbidden_role');
    expect(
      reasonOf({
        RYXOBET_OFFICE_DATABASE_URL: poolerUrl(OFFICE_POOLER_USER, 'shared-value'),
        RYXOBET_OFFICE_SESSION_PEPPER: PEPPER,
        SUPABASE_SERVICE_ROLE_KEY: 'shared-value',
      }),
    ).toBe('shared_credential');
    expect(
      reasonOf({
        VITE_RYXOBET_OFFICE_DATABASE_URL: `postgresql://${OFFICE_DATABASE_ROLE}:pw@127.0.0.1/ryxobet`,
        RYXOBET_OFFICE_DATABASE_URL: `postgresql://${OFFICE_DATABASE_ROLE}:pw@127.0.0.1/ryxobet`,
        RYXOBET_OFFICE_SESSION_PEPPER: PEPPER,
      }),
    ).toBe('frontend_secret');

    const handler = createProductionHandler({});
    const response = await handler(request({ method: 'POST', path: '/auth/login', body: { brandCode: '002' } }));
    expect(response.status).toBe(503);
    expect(response.setCookie).toEqual([]);
    expect(parseSession(response.body).ok).toBe(false);
  });

  it('does not activate the invited owner or accept a password as a session', async () => {
    const owner = pendingOwner();
    const repository = createMemoryOffice({ staff: [owner], flags: flags() });
    const response = await handleOffice(
      request({
        method: 'POST',
        path: '/api/rixobet/office/v1/auth/login?role=owner',
        headers: { 'x-rixo-brand': '001', 'x-user-role': 'owner' },
        body: { brandCode: '002', email: owner.email, password: PASSWORD, role: 'owner', permissions: ['owner.overview'] },
      }),
      office(repository),
    );
    expect(response.status).toBe(401);
    expect(response.setCookie).toEqual([]);
    expect(parseMfaChallenge(response.body)).toBeNull();
    const stored = await repository.findStaffById(owner.id);
    expect(stored?.status).toBe('invited');
    expect(stored?.authUserId).toBeNull();
    expect(stored?.passwordHash).toBeNull();
    expect(stored?.identityVerifiedAt).toBeNull();
  });

  it('keeps a verified password behind MFA and the database role ceiling', async () => {
    const cashier = staff();
    const repository = createMemoryOffice({ staff: [cashier, pendingOwner()], flags: flags() });
    const login = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/login',
        headers: { 'x-rixo-brand': '001' },
        body: { brandCode: '002', email: cashier.email, password: PASSWORD, role: 'owner' },
      }),
      office(repository),
    );
    expect(login.status).toBe(200);
    expect(login.setCookie).toEqual([]);
    expect(parseMfaChallenge(login.body)?.challengeId).toBeTruthy();
    const challenge = parseMfaChallenge(login.body);
    const code = totpCode(cashier.mfaSecret ?? '', NOW);
    const confirmed = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/mfa',
        body: { brandCode: '002', challengeId: challenge?.challengeId, code: code?.code, role: 'owner' },
      }),
      office(repository),
    );
    expect(confirmed.status).toBe(200);
    expect(confirmed.setCookie[0]).toContain('HttpOnly');
    expect(confirmed.setCookie[0]).toContain('SameSite=Strict');
    expect(confirmed.setCookie[0]).toContain('Secure');
    const parsed = parseSession(confirmed.body, NOW);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.session.role).toBe('cashier');
      expect(parsed.session.permissions).toEqual([...ROLE_CEILING.cashier]);
    }
    const restored = await handleOffice(
      request({
        method: 'GET',
        path: '/owner?role=owner&brand=001',
        headers: { cookie: `rxo_office_session=${cookieOf(confirmed)}`, 'x-rixo-role': 'owner' },
      }),
      office(repository),
    );
    expect(restored.status).toBe(403);
  });

  it('issues a password session for every office role when MFA is not enrolled', async () => {
    for (const role of ['owner', 'manager', 'cashier', 'security'] as const) {
      const member = staff({
        id: `staff-${role}-plain`,
        email: `${role}@office.rixobet.com`,
        role,
        displayName: 'Office User',
        mfaSecret: null,
        mfaLastStep: null,
      });
      const repository = createMemoryOffice({ staff: [member], flags: flags() });
      const login = await handleOffice(
        request({
          method: 'POST',
          path: '/auth/login',
          body: { brandCode: '002', email: member.email, password: PASSWORD, role: 'owner' },
        }),
        office(repository),
      );
      expect(login.status).toBe(200);
      expect(login.setCookie[0]).toContain('HttpOnly');
      expect(login.setCookie[0]).toContain('Secure');
      expect(login.setCookie[0]).toContain('SameSite=Strict');
      expect(parseMfaChallenge(login.body)).toBeNull();
      expect(JSON.stringify(login.body)).not.toContain(cookieOf(login));
      const parsed = parseSession(login.body, NOW);
      expect(parsed.ok && parsed.session.role).toBe(role);
      const enrolled = staff({
        id: `staff-${role}-mfa`,
        email: `mfa-${role}@office.rixobet.com`,
        role,
        displayName: 'Office User',
      });
      const protectedRepo = createMemoryOffice({ staff: [enrolled], flags: flags() });
      const challenged = await handleOffice(
        request({
          method: 'POST',
          path: '/auth/login',
          body: { brandCode: '002', email: enrolled.email, password: PASSWORD },
        }),
        office(protectedRepo),
      );
      expect(challenged.status).toBe(200);
      expect(challenged.setCookie).toEqual([]);
      expect(parseMfaChallenge(challenged.body)?.challengeId).toBeTruthy();
      expect(parseSession(challenged.body, NOW).ok).toBe(false);
    }
  });

  it('rejects the wrong brand, wrong role, missing MFA, and an expired session', async () => {
    const cashier = staff();
    const repository = createMemoryOffice({ staff: [cashier], flags: flags() });
    const wrongBrand = await handleOffice(
      request({ method: 'POST', path: '/auth/login', body: { brandCode: '001', email: cashier.email, password: PASSWORD } }),
      office(repository),
    );
    expect(wrongBrand.status).toBe(403);
    expect(wrongBrand.setCookie).toEqual([]);

    const intruder = staff({ id: 'staff-intruder-001', email: 'intruder@office.rixobet.com', role: 'agent' });
    const intruderRepo = createMemoryOffice({ staff: [intruder], flags: flags() });
    const wrongRole = await handleOffice(
      request({ method: 'POST', path: '/auth/login', body: { brandCode: '002', email: intruder.email, password: PASSWORD } }),
      office(intruderRepo),
    );
    expect(wrongRole.status).toBe(403);
    expect(wrongRole.setCookie).toEqual([]);

    const login = await handleOffice(
      request({ method: 'POST', path: '/auth/login', body: { brandCode: '002', email: cashier.email, password: PASSWORD } }),
      office(repository),
    );
    const challenge = parseMfaChallenge(login.body);
    const code = totpCode(cashier.mfaSecret ?? '', NOW);
    const confirmed = await handleOffice(
      request({ method: 'POST', path: '/auth/mfa', body: { brandCode: '002', challengeId: challenge?.challengeId, code: code?.code } }),
      office(repository),
    );
    const token = cookieOf(confirmed);
    const missingMfa = {
      ...repository,
      async readSession(secretHash: string) {
        const row = await repository.readSession(secretHash);
        return row ? { ...row, mfaSatisfied: false } : null;
      },
    };
    const mfa = await handleOffice(
      request({ method: 'GET', path: '/auth/session', headers: { cookie: `rxo_office_session=${token}` } }),
      office(missingMfa),
    );
    expect(mfa.status).toBe(401);

    const expired = await handleOffice(
      request({ method: 'GET', path: '/auth/session', headers: { cookie: `rxo_office_session=${token}` } }),
      office(repository, NOW + 12 * 60 * 60 * 1000 + 1),
    );
    expect(expired.status).toBe(401);
    expect(parseSession(expired.body, NOW).ok).toBe(false);
  });

  it('rejects cross-brand staff, another role route, and disabled money movement', async () => {
    const foreign = staff({ id: 'staff-foreign-001', email: 'foreign@example.com', brandCode: '001', role: 'owner' });
    const foreignRepo = createMemoryOffice({ staff: [foreign], flags: flags() });
    const crossBrand = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/login',
        headers: { 'x-rixo-brand': '002' },
        body: { brandCode: '002', email: foreign.email, password: PASSWORD },
      }),
      office(foreignRepo),
    );
    expect(crossBrand.status).toBe(401);
    expect(crossBrand.setCookie).toEqual([]);
    expect((await foreignRepo.findStaffById(foreign.id))?.brandCode).toBe('001');

    const cashier = staff();
    const repository = createMemoryOffice({ staff: [cashier], flags: flags() });
    const login = await handleOffice(
      request({ method: 'POST', path: '/auth/login', body: { brandCode: '002', email: cashier.email, password: PASSWORD } }),
      office(repository),
    );
    const code = totpCode(cashier.mfaSecret ?? '', NOW);
    const confirmed = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/mfa',
        body: { brandCode: '002', challengeId: parseMfaChallenge(login.body)?.challengeId, code: code?.code },
      }),
      office(repository),
    );
    const headers = { cookie: `rxo_office_session=${cookieOf(confirmed)}` };
    const route = await handleOffice(request({ method: 'GET', path: '/owner', headers }), office(repository));
    expect(route.status).toBe(403);
    const registration = await handleOffice(request({ method: 'POST', path: '/players/register', headers, body: {} }), office(repository));
    expect(registration.status).toBe(403);
    expect(registration.body).toMatchObject({ accepted: false });
    const transfer = await handleOffice(
      request({ method: 'POST', path: '/owner/treasury/transfers', headers, body: { amount: '10.00' } }),
      office(repository),
    );
    expect(transfer.status).toBe(403);
    const sportsbook = await handleOffice(request({ method: 'GET', path: '/cashier/deposits', headers }), office(repository));
    expect(sportsbook.status).toBe(503);

    const enabled = createMemoryOffice({ staff: [staff({ id: 'staff-enabled-001', email: 'enabled@office.rixobet.com' })], flags: flags('betting') });
    const blocked = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/login',
        body: { brandCode: '002', email: 'enabled@office.rixobet.com', password: PASSWORD },
      }),
      office(enabled),
    );
    expect(blocked.status).toBe(503);
    expect(blocked.setCookie).toEqual([]);
  });

  it('prepares invitation verification without issuing a session or linking an auth user', async () => {
    const token = 'invitation-token-not-a-password';
    const owner = pendingOwner();
    owner.invitationTokenHash = hashSecret(PEPPER, token);
    const repository = createMemoryOffice({ staff: [owner], flags: flags() });
    const started = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/activation',
        body: { brandCode: '001', email: owner.email, invitationToken: token, password: 'a-new-office-password' },
      }),
      office(repository),
    );
    expect(started.status).toBe(403);
    expect((await repository.findStaffById(owner.id))?.passwordHash).toBeNull();

    const prepared = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/activation',
        body: { brandCode: '002', email: owner.email, invitationToken: token, password: 'a-new-office-password', role: 'owner' },
      }),
      office(repository),
    );
    expect(prepared.status).toBe(401);
    expect(prepared.setCookie).toEqual([]);
    expect((await repository.findStaffById(owner.id))?.status).toBe('invited');
    expect((await repository.findStaffById(owner.id))?.passwordHash).toBeNull();
    expect((await repository.findStaffById(owner.id))?.invitationConsumedAt).toBeNull();

    const expired = pendingOwner();
    expired.id = 'owner-expired-002';
    expired.invitationTokenHash = hashSecret(PEPPER, token);
    expired.invitationExpiresAt = new Date(NOW - 1000).toISOString();
    const expiredRepo = createMemoryOffice({ staff: [expired], flags: flags() });
    const expiredResponse = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/activation',
        body: { brandCode: '002', email: expired.email, invitationToken: token, password: 'a-new-office-password' },
      }),
      office(expiredRepo),
    );
    expect(expiredResponse.status).toBe(401);
    expect((await expiredRepo.findStaffById(expired.id))?.invitationConsumedAt).toBeNull();

    const delivered = pendingOwner();
    delivered.invitationTokenHash = hashSecret(PEPPER, token);
    delivered.invitationExpiresAt = new Date(NOW + 60 * 60 * 1000).toISOString();
    const ready = createMemoryOffice({ staff: [delivered], flags: flags() });
    const enrolled = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/activation',
        body: { brandCode: '002', email: delivered.email, invitationToken: token, password: 'a-new-office-password', role: 'owner' },
      }),
      office(ready),
    );
    expect(enrolled.status).toBe(200);
    expect(enrolled.setCookie).toEqual([]);
    expect(enrolled.body).toMatchObject({ status: 'activated' });
    expect(JSON.stringify(enrolled.body)).not.toContain(token);
    expect(JSON.stringify(enrolled.body)).not.toContain('sessionId');
    expect(JSON.stringify(enrolled.body)).not.toContain('otpauth');
    const storedDigest = (await ready.findStaffById(delivered.id))?.invitationTokenHash ?? '';
    expect(storedDigest).not.toContain(token);
    expect((await ready.findStaffById(delivered.id))?.invitationConsumedAt).toBeTruthy();
    expect((await ready.findStaffById(delivered.id))?.status).toBe('active');
    expect((await ready.findStaffById(delivered.id))?.mfaSecret).toBeNull();
    expect((await ready.findStaffById(delivered.id))?.authUserId).toBeNull();
    const replay = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/activation',
        body: { brandCode: '002', email: delivered.email, invitationToken: token, password: 'another-office-password' },
      }),
      office(ready),
    );
    expect(replay.status).toBe(401);
    const signedIn = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/login',
        body: { brandCode: '002', email: delivered.email, password: 'a-new-office-password', role: 'cashier' },
      }),
      office(ready),
    );
    expect(signedIn.status).toBe(200);
    expect(signedIn.setCookie[0]).toContain('HttpOnly');
    expect(parseMfaChallenge(signedIn.body)).toBeNull();
    const ownerSession = parseSession(signedIn.body, NOW);
    expect(ownerSession.ok && ownerSession.session.role).toBe('owner');

    const optional = pendingOwner();
    optional.id = 'owner-mfa-002';
    optional.email = 'mfa-owner@office.rixobet.com';
    optional.invitationTokenHash = hashSecret(PEPPER, token);
    optional.invitationExpiresAt = new Date(NOW + 60 * 60 * 1000).toISOString();
    const optionalRepo = createMemoryOffice({ staff: [optional], flags: flags() });
    const withMfa = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/activation',
        body: { brandCode: '002', email: optional.email, invitationToken: token, password: 'a-new-office-password', enrollMfa: true },
      }),
      office(optionalRepo),
    );
    expect(withMfa.status).toBe(200);
    expect(withMfa.setCookie).toEqual([]);
    expect(withMfa.body).toMatchObject({ status: 'verification_required' });
    expect((await optionalRepo.findStaffById(optional.id))?.status).toBe('invited');
    const secret = new URL(String((withMfa.body as { otpauthUri: string }).otpauthUri)).searchParams.get('secret');
    const step = totpCode(secret ?? '', NOW);
    const verified = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/activation/confirm',
        body: { email: optional.email, code: step?.code },
      }),
      office(optionalRepo),
    );
    expect(verified.status).toBe(200);
    expect(verified.setCookie).toEqual([]);
    const stored = await optionalRepo.findStaffById(optional.id);
    expect(stored?.status).toBe('active');
    expect(stored?.mfaSecret).toBeTruthy();
    expect(stored?.authUserId).toBeNull();
    expect(stored?.identityVerifiedAt).toBeTruthy();
    const premature = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/login',
        body: { brandCode: '002', email: owner.email, password: 'a-new-office-password' },
      }),
      office(repository),
    );
    expect(premature.status).toBe(401);
  });

  it('keeps database credentials and the server implementation out of the browser bundle', () => {
    const root = join(import.meta.dirname, '..');
    const vite = readFileSync(join(root, 'vite.config.ts'), 'utf8');
    expect(vite.includes('proxy')).toBe(false);
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) files.push(path);
      }
    };
    walk(join(root, 'src'));
    const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(source.includes('RYXOBET_OFFICE_DATABASE_URL')).toBe(false);
    expect(source.includes("from '../server")).toBe(false);
    expect(source.includes("from './server")).toBe(false);
  });

  it('rejects a suspended account, a replayed MFA challenge, and a revoked session', async () => {
    const suspended = staff({ id: 'staff-suspended-001', email: 'suspended@office.rixobet.com', status: 'suspended' });
    const suspendedRepo = createMemoryOffice({ staff: [suspended], flags: flags() });
    const blocked = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/login',
        body: { brandCode: '002', email: suspended.email, password: PASSWORD, role: 'owner' },
      }),
      office(suspendedRepo),
    );
    expect(blocked.status).toBe(401);
    expect(blocked.setCookie).toEqual([]);

    const cashier = staff();
    const repository = createMemoryOffice({ staff: [cashier], flags: flags() });
    const login = await handleOffice(
      request({ method: 'POST', path: '/auth/login', body: { brandCode: '002', email: cashier.email, password: PASSWORD } }),
      office(repository),
    );
    const challengeId = parseMfaChallenge(login.body)?.challengeId;
    const code = totpCode(cashier.mfaSecret ?? '', NOW)?.code;
    const confirmed = await handleOffice(
      request({ method: 'POST', path: '/auth/mfa', body: { brandCode: '002', challengeId, code } }),
      office(repository),
    );
    const replay = await handleOffice(
      request({ method: 'POST', path: '/auth/mfa', body: { brandCode: '002', challengeId, code } }),
      office(repository),
    );
    expect(replay.status).toBe(401);
    expect(replay.setCookie).toEqual([]);

    const again = await handleOffice(
      request({ method: 'POST', path: '/auth/login', body: { brandCode: '002', email: cashier.email, password: PASSWORD } }),
      office(repository),
    );
    const reused = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/mfa',
        body: { brandCode: '002', challengeId: parseMfaChallenge(again.body)?.challengeId, code },
      }),
      office(repository),
    );
    expect(reused.status).toBe(401);

    const cookie = cookieOf(confirmed);
    expect(JSON.stringify(confirmed.body)).not.toContain(cookie);
    expect(confirmed.setCookie[0]).toContain('Path=/api/rixobet/office/v1');
    expect(confirmed.setCookie[0]).toContain('SameSite=Strict');
    testingPatchStaff(repository, cashier.id, { status: 'suspended' });
    const suspendedSession = await handleOffice(
      request({ method: 'GET', path: '/auth/session', headers: { cookie: `rxo_office_session=${cookie}` } }),
      office(repository),
    );
    expect(suspendedSession.status).toBe(401);
    testingPatchStaff(repository, cashier.id, { status: 'active', role: 'security' });
    const refreshed = await handleOffice(
      request({ method: 'GET', path: '/cashier/deposits', headers: { cookie: `rxo_office_session=${cookie}` } }),
      office(repository),
    );
    expect(refreshed.status).toBe(403);

    const signedOut = await handleOffice(
      request({ method: 'POST', path: '/auth/logout', headers: { cookie: `rxo_office_session=${cookie}` } }),
      office(repository),
    );
    expect(signedOut.setCookie[0]).toContain('Max-Age=0');
    const afterLogout = await handleOffice(
      request({ method: 'GET', path: '/auth/session', headers: { cookie: `rxo_office_session=${cookie}` } }),
      office(repository),
    );
    expect(afterLogout.status).toBe(401);
  });

  it('limits repeated sign-in attempts and rejects a foreign origin', async () => {
    const cashier = staff({ id: 'staff-limit-001', email: 'limit@office.rixobet.com' });
    const repository = createMemoryOffice({ staff: [cashier], flags: flags() });
    for (let index = 0; index < 8; index += 1) {
      const attempt = await handleOffice(
        request({
          method: 'POST',
          path: '/auth/login',
          body: { brandCode: '002', email: cashier.email, password: 'wrong-password-1' },
        }),
        office(repository),
      );
      expect(attempt.status).toBe(401);
    }
    const limited = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/login',
        body: { brandCode: '002', email: cashier.email, password: PASSWORD },
      }),
      office(repository),
    );
    expect(limited.status).toBe(429);
    expect(limited.setCookie).toEqual([]);

    const foreign = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/login',
        headers: { origin: 'https://evil.example' },
        body: { brandCode: '002', email: cashier.email, password: PASSWORD },
      }),
      office(createMemoryOffice({ staff: [cashier], flags: flags() })),
    );
    expect(foreign.status).toBe(403);

    const crossSite = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/mfa',
        headers: { origin: 'https://office.ryxobet.com', 'sec-fetch-site': 'cross-site' },
        body: { brandCode: '002', challengeId: 'challenge-not-real', code: '000000' },
      }),
      office(createMemoryOffice({ staff: [cashier], flags: flags() })),
    );
    expect(crossSite.status).toBe(403);

    const owner = pendingOwner();
    const activationRepo = createMemoryOffice({ staff: [owner], flags: flags() });
    const missingOrigin = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/activation',
        headers: { origin: '' },
        body: {
          brandCode: '002',
          email: owner.email,
          invitationToken: 'invitation-token-not-a-password',
          password: 'a-new-office-password',
        },
      }),
      office(activationRepo),
    );
    expect(missingOrigin.status).toBe(403);
    for (let index = 0; index < 5; index += 1) {
      const attempt = await handleOffice(
        request({
          method: 'POST',
          path: '/auth/activation',
          body: {
            brandCode: '002',
            email: owner.email,
            invitationToken: 'invitation-token-not-a-password',
            password: 'a-new-office-password',
          },
        }),
        office(activationRepo),
      );
      expect(attempt.status).toBe(401);
    }
    const activationLimited = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/activation',
        body: {
          brandCode: '002',
          email: owner.email,
          invitationToken: 'invitation-token-not-a-password',
          password: 'a-new-office-password',
        },
      }),
      office(activationRepo),
    );
    expect(activationLimited.status).toBe(429);
    expect(activationLimited.setCookie).toEqual([]);
  });
});
