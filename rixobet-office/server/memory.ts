import { randomToken } from './crypto';
import type { ChallengeRecord, FlagRecord, OfficeRepository, SessionRecord, StaffRecord } from './repository';

export interface MemorySeed {
  staff: StaffRecord[];
  flags: FlagRecord[];
}

export function createMemoryOffice(seed: MemorySeed): OfficeRepository {
  const staff = seed.staff.map((row) => ({ ...row }));
  const flags = seed.flags.map((row) => ({ ...row }));
  const challenges: ChallengeRecord[] = [];
  const sessions: SessionRecord[] = [];

  return {
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
    async saveStaff(next) {
      const index = staff.findIndex((row) => row.id === next.id);
      if (index < 0) throw new Error('STAFF_NOT_FOUND');
      staff[index] = { ...next };
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
    async saveChallenge(next) {
      const index = challenges.findIndex((row) => row.id === next.id);
      if (index < 0) throw new Error('CHALLENGE_NOT_FOUND');
      challenges[index] = { ...next };
    },
    async createSession(input) {
      const row = staff.find((entry) => entry.id === input.staffId);
      if (!row) throw new Error('STAFF_NOT_FOUND');
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
      };
      sessions.push(session);
      return { ...session };
    },
    async readSession(secretHash) {
      const found = sessions.find((row) => row.secretHash === secretHash && row.revokedAt === null);
      return found ? { ...found } : null;
    },
    async revokeSession(secretHash, revokedAt) {
      const found = sessions.find((row) => row.secretHash === secretHash);
      if (found) found.revokedAt = revokedAt;
    },
    async flags() {
      return flags.map((row) => ({ ...row }));
    },
  };
}
