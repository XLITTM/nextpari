import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROLE_CEILING } from '../src/access/model';
import { parseSession } from '../src/access/session';
import { parseMfaChallenge } from '../src/api/parsers';
import { OPERATIONAL_FLAGS, REQUIRED_TABLE_COUNT, assessCatalog, type CatalogTable } from './catalog';
import { createMfaSecret, hashPassword, hashSecret, totpCode } from './crypto';
import { DENIED_DATABASE_ROLES, readOfficeConfig } from './env';
import { handleOffice, officeFor, type OfficeRequest } from './handler';
import { createMemoryOffice } from './memory';
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
  });
}

function reasonOf(env: Record<string, string>): string {
  const result = readOfficeConfig(env);
  if (result.ok) throw new Error('credentials were accepted');
  return result.reason;
}

function office(repository: OfficeRepository, now = NOW) {
  return officeFor(repository, PEPPER, () => now, true);
}

function request(partial: Partial<OfficeRequest> & Pick<OfficeRequest, 'method' | 'path'>): OfficeRequest {
  return { headers: {}, body: {}, ...partial };
}

function cookieOf(response: { setCookie: string[] }): string {
  const header = response.setCookie[0];
  if (!header) throw new Error('missing cookie');
  return header.split(';')[0]?.split('=').slice(1).join('=') ?? '';
}

function catalog(options?: { count?: number; rls?: boolean; staff?: boolean }): CatalogTable[] {
  const count = options?.count ?? REQUIRED_TABLE_COUNT;
  const tables: CatalogTable[] = [
    {
      name: 'staff_accounts',
      rls: options?.rls ?? true,
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
          ],
    },
    {
      name: 'staff_sessions',
      rls: true,
      columns: ['id', 'staff_id', 'brand_code', 'secret_hash', 'expires_at', 'revoked_at', 'mfa_satisfied'],
    },
    {
      name: 'mfa_challenges',
      rls: true,
      columns: ['id', 'staff_id', 'brand_code', 'expires_at', 'consumed_at', 'attempt_count'],
    },
    {
      name: 'feature_flags',
      rls: true,
      columns: ['flag_key', 'brand_code', 'enabled'],
    },
  ];
  for (let index = tables.length; index < count; index += 1) {
    tables.push({ name: `foundation_${index}`, rls: true, columns: ['id'] });
  }
  return tables;
}

describe('office authentication', () => {
  it('rejects a catalog that is not the private brand schema', () => {
    expect(assessCatalog({ schema: 'public', tables: catalog() })).toEqual({ ok: false, reason: 'schema' });
    expect(assessCatalog({ schema: 'ryxobet', tables: catalog({ count: 15 }) })).toEqual({ ok: false, reason: 'table_count' });
    expect(assessCatalog({ schema: 'ryxobet', tables: catalog({ rls: false }) })).toEqual({ ok: false, reason: 'rls' });
    expect(assessCatalog({ schema: 'ryxobet', tables: catalog({ staff: false }) })).toEqual({ ok: false, reason: 'staff' });
    expect(assessCatalog({ schema: 'ryxobet', tables: catalog() }).ok).toBe(true);
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
    expect(
      reasonOf({
        RYXOBET_OFFICE_DATABASE_URL: 'postgresql://rixobet_office:shared-value@127.0.0.1/ryxobet',
        RYXOBET_OFFICE_SESSION_PEPPER: PEPPER,
        SUPABASE_SERVICE_ROLE_KEY: 'shared-value',
      }),
    ).toBe('shared_credential');
    expect(
      reasonOf({
        VITE_RYXOBET_OFFICE_DATABASE_URL: 'postgresql://rixobet_office:pw@127.0.0.1/ryxobet',
        RYXOBET_OFFICE_DATABASE_URL: 'postgresql://rixobet_office:pw@127.0.0.1/ryxobet',
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
    expect(prepared.status).toBe(200);
    expect(prepared.setCookie).toEqual([]);
    expect(prepared.body).toMatchObject({ status: 'verification_required' });
    expect(JSON.stringify(prepared.body)).not.toContain('sessionId');
    const secret = new URL(String((prepared.body as { otpauthUri: string }).otpauthUri)).searchParams.get('secret');
    const step = totpCode(secret ?? '', NOW);
    const verified = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/activation/confirm',
        body: { email: owner.email, code: step?.code },
      }),
      office(repository),
    );
    expect(verified.status).toBe(200);
    expect(verified.setCookie).toEqual([]);
    const stored = await repository.findStaffById(owner.id);
    expect(stored?.status).toBe('active');
    expect(stored?.authUserId).toBeNull();
    expect(stored?.identityVerifiedAt).toBeTruthy();
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
});
