import { describe, expect, it } from 'vitest';
import { ROLE_CEILING } from '../src/access/model';
import { parseSession } from '../src/access/session';
import { OPERATIONAL_FLAGS } from './catalog';
import { hashPassword, hashSecret } from './crypto';
import { handleOffice, officeFor, type OfficeRequest } from './handler';
import {
  BOOTSTRAP_CONFIRM,
  BOOTSTRAP_PROCEDURE,
  FIRST_OWNER_LOGIN,
  issueFirstOwnerInvitation,
  parseBootstrapArgs,
  runIssueFirstOwner,
} from './issueOwnerInvitation';
import { createMemoryOffice } from './memory';
import type { FlagRecord, StaffRecord } from './repository';

const PEPPER = 'rixo-office-session-pepper-32bytes';
const NOW = Date.parse('2026-11-07T12:00:00.000Z');
const PASSWORD = 'owner-chooses-this-password';

function flags(): FlagRecord[] {
  return OPERATIONAL_FLAGS.map((key) => ({ key, brandCode: '002', enabled: false }));
}

function owner(overrides: Partial<StaffRecord> = {}): StaffRecord {
  return {
    id: 'owner-invited-002',
    email: FIRST_OWNER_LOGIN,
    role: 'owner',
    status: 'invited',
    brandCode: '002',
    displayName: 'Guwanch',
    authUserId: null,
    passwordHash: hashPassword('previously-shared-password'),
    mfaSecret: 'OLDSECRET234567',
    mfaLastStep: 4,
    identityVerifiedAt: null,
    invitationTokenHash: hashSecret(PEPPER, 'previous-invitation-token-aaa'),
    invitationExpiresAt: new Date(NOW + 60_000).toISOString(),
    invitationConsumedAt: null,
    ...overrides,
  };
}

function request(partial: Partial<OfficeRequest> & Pick<OfficeRequest, 'method' | 'path'>): OfficeRequest {
  return { body: {}, ...partial, headers: { origin: 'https://office.rixobet.com', ...partial.headers } };
}

function capture() {
  return { text: '', write(chunk: string) { this.text += chunk; } };
}

describe('first owner invitation', () => {
  it('prints the administrator procedure and refuses to run without confirmation', async () => {
    expect(parseBootstrapArgs(['--help'])).toEqual({ ok: false, reason: 'help' });
    expect(parseBootstrapArgs(['--confirm', BOOTSTRAP_CONFIRM])).toEqual({ ok: true });
    expect(parseBootstrapArgs(['--confirm', 'issue-anyone'])).toEqual({ ok: false, reason: 'confirm' });
    expect(BOOTSTRAP_PROCEDURE).toContain(FIRST_OWNER_LOGIN);
    expect(BOOTSTRAP_PROCEDURE).toContain('does not send email');
    expect(BOOTSTRAP_PROCEDURE).toContain('does not activate');
    expect(BOOTSTRAP_PROCEDURE.includes('postgresql://')).toBe(false);
    expect(BOOTSTRAP_PROCEDURE.includes('previously-shared-password')).toBe(false);

    const stdout = capture();
    const stderr = capture();
    const code = await runIssueFirstOwner({}, ['--confirm', BOOTSTRAP_CONFIRM], stdout, stderr);
    expect(code).toBe(1);
    expect(stdout.text).toBe('');
    expect(stderr.text).toContain('not available');
    expect(stderr.text.includes('postgresql://')).toBe(false);
  });

  it('issues one expiring token for the invited owner and leaves activation to that owner', async () => {
    const row = owner();
    const repository = createMemoryOffice({ staff: [row], flags: flags() });
    const issued = await issueFirstOwnerInvitation(repository, PEPPER, NOW);
    if (!issued) throw new Error('token was not issued');
    expect(issued.login).toBe(FIRST_OWNER_LOGIN);
    expect(issued.expiresAt).toBe(new Date(NOW + 60 * 60 * 1000).toISOString());
    const stored = await repository.findStaffById(row.id);
    expect(stored?.status).toBe('invited');
    expect(stored?.passwordHash).toBeNull();
    expect(stored?.mfaSecret).toBeNull();
    expect(stored?.identityVerifiedAt).toBeNull();
    expect(stored?.authUserId).toBeNull();
    expect(stored?.invitationConsumedAt).toBeNull();
    expect(stored?.invitationTokenHash).toBe(hashSecret(PEPPER, issued.token));
    expect(stored?.invitationTokenHash?.includes(issued.token)).toBe(false);

    const office = officeFor(repository, PEPPER, () => NOW, true);
    for (const path of ['/auth/invitation', '/auth/bootstrap', '/auth/register', '/auth/recovery']) {
      const response = await handleOffice(
        request({ method: 'POST', path, body: { login: FIRST_OWNER_LOGIN, password: PASSWORD } }),
        office,
      );
      expect(response.status).toBe(401);
      expect(JSON.stringify(response.body).includes(issued.token)).toBe(false);
    }
    expect((await repository.findStaffById(row.id))?.invitationTokenHash).toBe(hashSecret(PEPPER, issued.token));

    const invalid = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/activation',
        body: { login: FIRST_OWNER_LOGIN, invitationToken: 'previous-invitation-token-aaa', password: PASSWORD },
      }),
      office,
    );
    expect(invalid.status).toBe(401);
    expect((await repository.findStaffById(row.id))?.invitationConsumedAt).toBeNull();

    const expiredOwner = owner({ id: 'owner-expired-002', invitationExpiresAt: new Date(NOW - 1000).toISOString() });
    const expiredRepo = createMemoryOffice({ staff: [expiredOwner], flags: flags() });
    const expiredIssued = await issueFirstOwnerInvitation(expiredRepo, PEPPER, NOW - 2 * 60 * 60 * 1000);
    if (!expiredIssued) throw new Error('expired fixture was not issued');
    const expired = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/activation',
        body: { login: FIRST_OWNER_LOGIN, invitationToken: expiredIssued.token, password: PASSWORD },
      }),
      officeFor(expiredRepo, PEPPER, () => NOW, true),
    );
    expect(expired.status).toBe(401);
    expect((await expiredRepo.findStaffById(expiredOwner.id))?.status).toBe('invited');

    const activated = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/activation',
        body: { login: FIRST_OWNER_LOGIN, email: 'other@office.rixobet.com', invitationToken: issued.token, password: PASSWORD },
      }),
      office,
    );
    expect(activated.status).toBe(401);

    const ready = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/activation',
        body: { login: FIRST_OWNER_LOGIN, invitationToken: issued.token, password: PASSWORD, role: 'cashier' },
      }),
      office,
    );
    expect(ready.status).toBe(200);
    expect(ready.setCookie).toEqual([]);
    expect(ready.body).toMatchObject({ status: 'activated' });
    const passwordHash = (await repository.findStaffById(row.id))?.passwordHash;
    const replay = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/activation',
        body: { login: FIRST_OWNER_LOGIN, invitationToken: issued.token, password: 'another-owner-password' },
      }),
      office,
    );
    expect(replay.status).toBe(401);
    expect((await repository.findStaffById(row.id))?.passwordHash).toBe(passwordHash);

    const signedIn = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/login',
        body: { brandCode: '002', login: FIRST_OWNER_LOGIN, password: PASSWORD, role: 'security' },
      }),
      office,
    );
    expect(signedIn.setCookie[0]).toContain('HttpOnly');
    const session = parseSession(signedIn.body, NOW);
    expect(session.ok && session.session.role).toBe('owner');
    if (session.ok) expect(session.session.permissions).toEqual([...ROLE_CEILING.owner]);

    const replaced = await issueFirstOwnerInvitation(repository, PEPPER, NOW);
    expect(replaced).toBeNull();
    expect((await repository.findStaffById(row.id))?.status).toBe('active');
  });

  it('does not issue a token for another brand or expose recovery on the public API', async () => {
    const foreign = owner({ id: 'owner-brand-001', brandCode: '001' });
    const repository = createMemoryOffice({ staff: [foreign], flags: flags() });
    expect(await issueFirstOwnerInvitation(repository, PEPPER, NOW)).toBeNull();
    expect((await repository.findStaffById(foreign.id))?.passwordHash).toBeTruthy();

    const active = owner({
      status: 'active',
      identityVerifiedAt: new Date(NOW).toISOString(),
      passwordHash: hashPassword(PASSWORD),
      mfaSecret: null,
    });
    const activeRepo = createMemoryOffice({ staff: [active], flags: flags() });
    expect(await issueFirstOwnerInvitation(activeRepo, PEPPER, NOW)).toBeNull();
    const office = officeFor(activeRepo, PEPPER, () => NOW, true);
    const login = await handleOffice(
      request({ method: 'POST', path: '/auth/login', body: { brandCode: '002', login: FIRST_OWNER_LOGIN, password: PASSWORD } }),
      office,
    );
    const recovery = await handleOffice(
      request({
        method: 'POST',
        path: '/auth/recovery',
        headers: { cookie: `rxo_office_session=${login.setCookie[0]?.split(';')[0]?.split('=').slice(1).join('=') ?? ''}` },
        body: { login: FIRST_OWNER_LOGIN, password: 'replacement-password' },
      }),
      office,
    );
    expect(recovery.status).toBe(503);
    expect((await activeRepo.findStaffById(active.id))?.passwordHash).toBe(active.passwordHash);
  });

  it('keeps login closed when the office database fails', async () => {
    const repository = createMemoryOffice({ staff: [owner({ status: 'active', identityVerifiedAt: new Date(NOW).toISOString(), mfaSecret: null })], flags: flags() });
    const broken = {
      ...repository,
      async findStaffByEmail(): Promise<StaffRecord | null> {
        throw new Error('database unavailable');
      },
    };
    const response = await handleOffice(
      request({ method: 'POST', path: '/auth/login', body: { brandCode: '002', login: FIRST_OWNER_LOGIN, password: PASSWORD } }),
      officeFor(broken, PEPPER, () => NOW, true),
    );
    expect(response.status).toBe(503);
    expect(response.setCookie).toEqual([]);
  });
});
