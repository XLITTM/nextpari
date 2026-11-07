import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { GroupControlError } from './errors.js';
import { handleGroupOwnerRequest, type GroupOwnerPorts, type VerifiedGroupAccess } from './ownerHttp.js';
import { readJwtClaims, scopeReadModel, stripPrivateFields, type GroupReadModel } from './ownerReadModel.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OWNER = '00000000-0000-4000-8000-0000000000aa';
const STAFF = '00000000-0000-4000-8000-0000000000b1';

function token(sub: string, aal: 'aal1' | 'aal2'): string {
  const payload = Buffer.from(JSON.stringify({ sub, aal })).toString('base64url');
  return `header.${payload}.sig`;
}

function model(): GroupReadModel {
  return {
    brands: [
      { code: '001', slug: 'nextpari', displayName: 'NextPari', status: 'active', domain: null },
      { code: '002', slug: 'ryxo', displayName: 'RYXO', status: 'registered', domain: null },
    ],
    brandOwners: [
      { ownerId: OWNER, brandCode: '001' },
    ],
    grants: [
      { brandCode: '001', role: 'manager', staffSubject: STAFF },
      { brandCode: '002', role: 'cashier', staffSubject: STAFF },
    ],
    players: [
      { brandCode: '001', publicId: '100001', source: 'legacy' },
      { brandCode: '002', publicId: '200001', source: 'legacy' },
    ],
    finance: [
      { brandCode: '001', currency: 'TMT', playerCount: 1, operationalStatus: 'active', deposits: '5.00', withdrawals: '1.00', ggr: '0.50' },
      { brandCode: '002', currency: 'USD', playerCount: 1, operationalStatus: 'registered', deposits: '9.00', withdrawals: '2.00', ggr: '1.00' },
    ],
    audit: [
      { id: '1', brandCode: '001', actor: 'owner', action: 'read', at: '2026-11-07T00:00:00Z' },
      { id: '2', brandCode: '002', actor: 'owner', action: 'read', at: '2026-11-07T00:00:00Z' },
    ],
  };
}

function ports(overrides: Partial<GroupOwnerPorts> = {}): GroupOwnerPorts {
  const access = token(OWNER, 'aal2');
  const base: GroupOwnerPorts = {
    async signInWithPassword() {
      return { accessToken: access, refreshToken: 'refresh' };
    },
    async verifyAccessToken(value): Promise<VerifiedGroupAccess> {
      const claims = readJwtClaims(value);
      if (!claims) throw new GroupControlError('JWT_INVALID');
      return { userId: claims.sub, aal: claims.aal === 'aal2' ? 'aal2' : 'aal1' };
    },
    async listVerifiedTotpFactor() {
      return 'factor-1';
    },
    async verifyTotp() {
      return { accessToken: access, refreshToken: 'refresh-2' };
    },
    async enrollTotp() {
      return { factorId: 'factor-1', uri: 'otpauth://totp/group-owner' };
    },
    async loadOwner(userId) {
      if (userId !== OWNER) return null;
      return { id: OWNER, status: 'active', permissions: ['brands.read', 'reports.read', 'staff.map'] };
    },
    async loadModel() {
      return model();
    },
    auditAuthFailure() {},
    async requestPasswordRecovery() {},
    async verifyRecoverySession(value) {
      const claims = readJwtClaims(value);
      if (!claims) throw new GroupControlError('RECOVERY_LINK_INVALID');
      return { userId: claims.sub, aal: claims.aal === 'aal2' ? 'aal2' : 'aal1' };
    },
    async updateRecoveredPassword() {},
  };
  return { ...base, ...overrides };
}

function cookie(value: string): string {
  return `np_group_access=${encodeURIComponent(value)}`;
}

describe('group owner authentication', () => {
  it('rejects a display-name subject and a brand staff uuid', async () => {
    assert.equal(readJwtClaims(token('group-owner', 'aal2')), null);
    const staffToken = token(STAFF, 'aal2');
    const result = await handleGroupOwnerRequest({
      method: 'GET',
      pathname: '/api/group-owner/overview',
      cookie: cookie(staffToken),
    }, ports());
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'OWNER_UNKNOWN');
  });

  it('does not open reads before MFA', async () => {
    const pending = token(OWNER, 'aal1');
    const login = await handleGroupOwnerRequest({
      method: 'POST',
      pathname: '/api/group-owner/auth/login',
      body: { email: 'owner@example.invalid', password: 'secret' },
      secure: true,
    }, ports({
      async signInWithPassword() {
        return { accessToken: pending, refreshToken: 'refresh' };
      },
    }));
    assert.equal(login.status, 200);
    assert.equal(login.body.mfaRequired, true);
    assert.equal(login.body.factorId, 'factor-1');
    assert.equal(JSON.stringify(login.body).includes('header.'), false);
    const overview = await handleGroupOwnerRequest({
      method: 'GET',
      pathname: '/api/group-owner/overview',
      cookie: cookie(pending),
    }, ports());
    assert.equal(overview.status, 403);
    assert.equal(overview.body.error, 'MFA_REQUIRED');
  });

  it('rejects a non-owner and a disabled owner before MFA enrollment', async () => {
    let enrolled = 0;
    let verified = 0;
    const events: string[] = [];
    const gate = ports({
      async enrollTotp() {
        enrolled += 1;
        return { factorId: 'factor-1', uri: 'otpauth://totp/secret-value' };
      },
      async verifyTotp() {
        verified += 1;
        return { accessToken: token(OWNER, 'aal2'), refreshToken: 'refresh-2' };
      },
      auditAuthFailure(event) {
        events.push(JSON.stringify(event));
      },
    });
    const stranger = await handleGroupOwnerRequest({
      method: 'POST',
      pathname: '/api/group-owner/auth/login',
      body: { email: 'stranger@example.invalid', password: 'secret' },
      secure: true,
    }, ports({
      ...gate,
      async loadOwner() {
        return null;
      },
      async signInWithPassword() {
        return { accessToken: token(STAFF, 'aal1'), refreshToken: 'refresh' };
      },
    }));
    assert.equal(stranger.status, 403);
    assert.equal(stranger.body.error, 'OWNER_UNKNOWN');
    assert.equal(JSON.stringify(stranger.cookies ?? []).includes('header.'), false);
    const enroll = await handleGroupOwnerRequest({
      method: 'POST',
      pathname: '/api/group-owner/auth/enroll',
      cookie: cookie(token(STAFF, 'aal1')),
    }, ports({
      ...gate,
      async loadOwner() {
        return null;
      },
    }));
    assert.equal(enroll.status, 403);
    const disabled = await handleGroupOwnerRequest({
      method: 'POST',
      pathname: '/api/group-owner/auth/mfa',
      cookie: cookie(token(OWNER, 'aal1')),
      body: { factorId: 'factor-1', code: '123456' },
    }, ports({
      ...gate,
      async loadOwner() {
        return { id: OWNER, status: 'disabled', permissions: ['brands.read'] };
      },
    }));
    assert.equal(disabled.status, 403);
    assert.equal(disabled.body.error, 'OWNER_DISABLED');
    assert.equal(enrolled, 0);
    assert.equal(verified, 0);
    const auditText = events.join('\n');
    assert.match(auditText, /OWNER_UNKNOWN/);
    assert.match(auditText, /OWNER_DISABLED/);
    assert.equal(auditText.includes('secret'), false);
    assert.equal(auditText.includes('otpauth'), false);
    assert.equal(auditText.includes('header.'), false);
  });

  it('isolates brands and keeps money split and read-only', async () => {
    const result = await handleGroupOwnerRequest({
      method: 'GET',
      pathname: '/api/group-owner/overview',
      cookie: cookie(token(OWNER, 'aal2')),
    }, ports());
    assert.equal(result.status, 200);
    assert.equal(result.body.synthetic, false);
    const data = result.body.data as { players: Array<{ publicId: string }>; finance: Array<{ currency: string }> };
    assert.deepEqual(data.players.map((player) => player.publicId), ['100001']);
    assert.deepEqual(data.finance.map((line) => line.currency), ['TMT']);
    assert.equal(JSON.stringify(result.body).includes('turnover'), false);
    assert.equal(JSON.stringify(result.body).includes('email'), false);
    const nextpari = result.body.nextpari as { available: boolean; reason: string };
    assert.equal(nextpari.available, false);
    assert.equal(nextpari.reason, 'NEXTPARI_REPORT_ADAPTER_REQUIRED');

    const denied = await handleGroupOwnerRequest({
      method: 'GET',
      pathname: '/api/group-owner/finance',
      cookie: cookie(token(OWNER, 'aal2')),
    }, ports({
      async loadOwner() {
        return { id: OWNER, status: 'active', permissions: ['brands.read'] };
      },
    }));
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error, 'OWNER_PERMISSION_DENIED');

    const treasury = await handleGroupOwnerRequest({
      method: 'POST',
      pathname: '/api/group-owner/treasury',
      cookie: cookie(token(OWNER, 'aal2')),
      body: { amount: '10.00' },
    }, ports());
    assert.equal(treasury.status, 403);
    assert.equal(treasury.body.error, 'TREASURY_WRITES_DISABLED');

    const staffWrite = await handleGroupOwnerRequest({
      method: 'POST',
      pathname: '/api/group-owner/staff',
      body: { role: 'cashier' },
    }, ports());
    assert.equal(staffWrite.status, 403);
    assert.equal(staffWrite.body.error, 'STAFF_WRITES_DISABLED');
  });

  it('fails closed when the schema is not exposed and strips private fields', async () => {
    const result = await handleGroupOwnerRequest({
      method: 'GET',
      pathname: '/api/group-owner/players',
      cookie: cookie(token(OWNER, 'aal2')),
    }, ports({
      async loadModel() {
        throw new GroupControlError('GROUP_SCHEMA_NOT_EXPOSED');
      },
    }));
    assert.equal(result.status, 503);
    assert.equal(result.body.error, 'GROUP_SCHEMA_NOT_EXPOSED');
    const stripped = stripPrivateFields({ publicId: '100001', email: 'a@b.c', balance: '1' });
    assert.deepEqual(stripped, { publicId: '100001' });
    const scoped = scopeReadModel(model(), OWNER);
    assert.equal(scoped.players.some((player) => player.brandCode === '002'), false);
  });

  it('leaves NextPari production routing and player registration untouched', () => {
    const vercel = readFileSync(join(root, 'vercel.json'), 'utf8');
    const playerIds = readFileSync(join(root, 'server', 'player', 'playerPublicId.ts'), 'utf8');
    const live = readFileSync(join(root, 'server', 'group', 'ownerLive.ts'), 'utf8');
    const ui = readFileSync(join(root, 'src', 'group-owner', 'GroupOwnerApp.tsx'), 'utf8');
    assert.equal(vercel.includes('group-owner'), false);
    assert.equal(playerIds.includes('group_control'), false);
    assert.equal(live.includes('allocate_player_id'), false);
    assert.equal(live.includes('createServiceRoleClient'), false);
    assert.equal(live.includes('owner_dashboard_stats'), false);
    assert.equal(live.includes(".schema('group_control')"), false);
    assert.equal(ui.includes('SUPABASE_SERVICE_ROLE_KEY'), false);
    assert.equal(ui.includes('createServiceRoleClient'), false);
    assert.equal(live.includes('admin.updateUserById'), false);
    assert.equal(live.includes('unenroll'), false);
    assert.match(live, /resetPasswordForEmail/);
    assert.match(live, /redirectTo: GROUP_OWNER_RECOVERY_REDIRECT/);
    assert.match(live, /https:\/\/group-owner-xlit\.vercel\.app/);
    assert.equal(live.includes('https://group-owner-xlit.vercel.app/'), false);
  });

  it('sends recovery mail without returning a token and updates the password only for an active owner', async () => {
    const recovery = token(OWNER, 'aal1');
    let mailed = '';
    let updated = false;
    let enrolled = 0;
    const events: string[] = [];
    const recoveryPorts = ports({
      async requestPasswordRecovery(email) {
        mailed = email;
      },
      async enrollTotp() {
        enrolled += 1;
        return { factorId: 'factor-1', uri: 'otpauth://totp/secret' };
      },
      async updateRecoveredPassword(accessToken, refreshToken, password) {
        updated = accessToken === recovery && refreshToken === 'refresh-secret' && password === 'new-password-1';
      },
      auditAuthFailure(event) {
        events.push(JSON.stringify(event));
      },
    });
    const sent = await handleGroupOwnerRequest({
      method: 'POST',
      pathname: '/api/group-owner/auth/recover',
      body: { email: 'Owner@Example.invalid' },
    }, recoveryPorts);
    assert.equal(sent.status, 200);
    assert.equal(sent.body.ok, true);
    assert.equal(mailed, 'owner@example.invalid');
    assert.equal(JSON.stringify(sent.body).includes('access_token'), false);

    const verified = await handleGroupOwnerRequest({
      method: 'POST',
      pathname: '/api/group-owner/auth/recover/verify',
      secure: true,
      body: { accessToken: recovery, refreshToken: 'refresh-secret' },
    }, recoveryPorts);
    assert.equal(verified.status, 200);
    assert.equal(JSON.stringify(verified.body).includes(recovery), false);
    assert.equal(JSON.stringify(verified.body).includes('refresh-secret'), false);
    assert.match((verified.cookies ?? []).join('\n'), /np_group_recovery=/);
    assert.doesNotMatch((verified.cookies ?? []).join('\n'), /np_group_access=[^;]/);

    const cookieHeader = (verified.cookies ?? [])
      .filter((item) => item.startsWith('np_group_recovery'))
      .map((item) => item.split(';')[0])
      .join('; ');
    const completed = await handleGroupOwnerRequest({
      method: 'POST',
      pathname: '/api/group-owner/auth/recover/complete',
      cookie: cookieHeader,
      secure: true,
      body: { password: 'new-password-1', confirm: 'new-password-1' },
    }, recoveryPorts);
    assert.equal(completed.status, 200);
    assert.equal(completed.body.ok, true);
    assert.equal(updated, true);
    assert.equal(enrolled, 0);
    assert.equal(JSON.stringify(completed.body).includes('new-password-1'), false);
    assert.equal(JSON.stringify(completed.body).includes(recovery), false);
    assert.match((completed.cookies ?? []).join('\n'), /np_group_recovery=;/);

    const mismatch = await handleGroupOwnerRequest({
      method: 'POST',
      pathname: '/api/group-owner/auth/recover/complete',
      cookie: cookieHeader,
      body: { password: 'new-password-1', confirm: 'other-password' },
    }, recoveryPorts);
    assert.equal(mismatch.status, 400);
    assert.equal(mismatch.body.error, 'PASSWORD_MISMATCH');
  });

  it('rejects an expired recovery link and a non-owner before any password change', async () => {
    let updated = 0;
    const expired = await handleGroupOwnerRequest({
      method: 'POST',
      pathname: '/api/group-owner/auth/recover/verify',
      body: { accessToken: 'not-a-token', refreshToken: 'refresh-secret' },
    }, ports({
      async updateRecoveredPassword() {
        updated += 1;
      },
    }));
    assert.equal(expired.status, 400);
    assert.equal(expired.body.error, 'RECOVERY_LINK_INVALID');
    assert.equal(JSON.stringify(expired.body).includes('not-a-token'), false);
    assert.equal(JSON.stringify(expired).includes('error_description'), false);

    const stranger = token(STAFF, 'aal1');
    const denied = await handleGroupOwnerRequest({
      method: 'POST',
      pathname: '/api/group-owner/auth/recover/verify',
      body: { accessToken: stranger, refreshToken: 'refresh-secret' },
    }, ports({
      async updateRecoveredPassword() {
        updated += 1;
      },
    }));
    assert.equal(denied.status, 400);
    assert.equal(denied.body.error, 'RECOVERY_LINK_INVALID');
    assert.equal(updated, 0);
    assert.equal((denied.cookies ?? []).some((item) => item.startsWith('np_group_recovery=') && !item.startsWith('np_group_recovery=;')), false);
  });
});
