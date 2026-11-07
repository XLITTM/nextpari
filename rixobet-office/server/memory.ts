import { randomToken, secretsMatch } from './crypto';
import type { ChallengeRecord, FlagRecord, OfficeRepository, SessionRecord, StaffRecord } from './repository';

export interface MemorySeed {
  staff: StaffRecord[];
  flags: FlagRecord[];
}

const staffRows = new WeakMap<OfficeRepository, StaffRecord[]>();

export function testingPatchStaff(repository: OfficeRepository, id: string, patch: Partial<StaffRecord>): void {
  const rows = staffRows.get(repository);
  const row = rows?.find((entry) => entry.id === id);
  if (!row) throw new Error('STAFF_NOT_FOUND');
  Object.assign(row, patch);
}

export function createMemoryOffice(seed: MemorySeed): OfficeRepository {
  const staff = seed.staff.map((row) => ({ ...row }));
  const flags = seed.flags.map((row) => ({ ...row }));
  const challenges: ChallengeRecord[] = [];
  const sessions: SessionRecord[] = [];

  const repository: OfficeRepository = {
    async findStaffByEmail(email) {
      const found = staff.find((row) => row.email.toLowerCase() === email.toLowerCase());
      return found ? { ...found } : null;
    },
    async findStaffById(id) {
      const found = staff.find((row) => row.id === id);
      return found ? { ...found } : null;
    },
    async listInvitedOwners() {
      return staff
        .filter((row) => row.role === 'owner' && row.status === 'invited' && row.authUserId === null)
        .map((row) => ({ ...row }));
    },
    async claimInvitation(email, digest, nowIso) {
      const now = Date.parse(nowIso);
      const row = staff.find((entry) => entry.email.toLowerCase() === email.toLowerCase());
      if (!row || row.role !== 'owner' || row.status !== 'invited' || row.brandCode !== '002') return null;
      if (row.authUserId !== null || row.identityVerifiedAt || row.invitationConsumedAt) return null;
      if (!row.invitationTokenHash || !row.invitationExpiresAt) return null;
      if (!secretsMatch(row.invitationTokenHash, digest)) return null;
      if (Date.parse(row.invitationExpiresAt) <= now) return null;
      row.invitationConsumedAt = nowIso;
      return { ...row };
    },
    async issueOwnerInvitation(login, digest, expiresAt) {
      const row = staff.find((entry) => entry.email.toLowerCase() === login.toLowerCase());
      if (!row || row.role !== 'owner' || row.status !== 'invited' || row.brandCode !== '002') return null;
      if (row.authUserId !== null || row.identityVerifiedAt) return null;
      row.invitationTokenHash = digest;
      row.invitationExpiresAt = expiresAt;
      row.invitationConsumedAt = null;
      row.passwordHash = null;
      row.mfaSecret = null;
      row.mfaLastStep = null;
      return { ...row };
    },
    async enrollInvitedOwner(id, passwordHash, mfaSecret) {
      const row = staff.find((entry) => entry.id === id);
      if (!row || row.role !== 'owner' || row.status !== 'invited' || row.authUserId !== null) return false;
      if (!row.invitationConsumedAt || !row.invitationTokenHash || row.identityVerifiedAt) return false;
      row.passwordHash = passwordHash;
      row.mfaSecret = mfaSecret;
      return true;
    },
    async verifyInvitedOwner(id, identityVerifiedAt, mfaLastStep) {
      const row = staff.find((entry) => entry.id === id);
      if (!row || row.role !== 'owner' || row.status !== 'invited' || row.authUserId !== null) return false;
      if (!row.invitationConsumedAt || !row.passwordHash || row.identityVerifiedAt) return false;
      if (mfaLastStep === null ? row.mfaSecret !== null : !row.mfaSecret) return false;
      row.status = 'active';
      row.identityVerifiedAt = identityVerifiedAt;
      row.mfaLastStep = mfaLastStep;
      return true;
    },
    async recordMfaStep(id, step) {
      const row = staff.find((entry) => entry.id === id && entry.status === 'active');
      if (row) row.mfaLastStep = step;
    },
    async createChallenge(staffId, expiresAt) {
      const challenge: ChallengeRecord = {
        id: randomToken(18),
        staffId,
        brandCode: '002',
        expiresAt,
        consumedAt: null,
        attemptCount: 0,
      };
      challenges.push(challenge);
      return { ...challenge };
    },
    async readChallenge(id) {
      const found = challenges.find((row) => row.id === id);
      return found ? { ...found } : null;
    },
    async failChallenge(id) {
      const found = challenges.find((row) => row.id === id && row.consumedAt === null && row.attemptCount < 5);
      if (!found) return null;
      found.attemptCount += 1;
      return found.attemptCount;
    },
    async claimChallenge(id, consumedAt) {
      const found = challenges.find((row) => row.id === id && row.consumedAt === null);
      if (!found) return false;
      found.consumedAt = consumedAt;
      return true;
    },
    async createSession(input) {
      const row = staff.find((entry) => entry.id === input.staffId);
      if (!row || row.status !== 'active' || row.brandCode !== '002') throw new Error('STAFF_NOT_FOUND');
      for (const existing of sessions) {
        if (existing.staffId === row.id && existing.revokedAt === null) existing.revokedAt = input.issuedAt;
      }
      const session: SessionRecord = {
        publicId: randomToken(18),
        staffId: row.id,
        brandCode: row.brandCode,
        secretHash: input.secretHash,
        expiresAt: input.expiresAt,
        revokedAt: null,
        mfaSatisfied: true,
        role: row.role,
        displayName: row.displayName,
        status: row.status,
      };
      sessions.push(session);
      return { ...session };
    },
    async readSession(secretHash) {
      const found = sessions.find((row) => row.secretHash === secretHash && row.revokedAt === null);
      if (!found) return null;
      const row = staff.find((entry) => entry.id === found.staffId);
      if (!row || row.status !== 'active' || row.brandCode !== '002') return null;
      return {
        ...found,
        role: row.role,
        displayName: row.displayName,
        brandCode: row.brandCode,
        status: row.status,
      };
    },
    async revokeSession(secretHash, revokedAt) {
      const found = sessions.find((row) => row.secretHash === secretHash && row.revokedAt === null);
      if (found) found.revokedAt = revokedAt;
    },
    async flags() {
      return flags.map((row) => ({ ...row }));
    },
    async end() {},
  };
  staffRows.set(repository, staff);
  return repository;
}
