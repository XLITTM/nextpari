import type { OfficeRole } from '../src/access/model';

export interface StaffRecord {
  id: string;
  email: string;
  role: string;
  status: string;
  brandCode: string;
  displayName: string;
  authUserId: string | null;
  passwordHash: string | null;
  mfaSecret: string | null;
  mfaLastStep: number | null;
  identityVerifiedAt: string | null;
  invitationTokenHash: string | null;
}

export interface ChallengeRecord {
  id: string;
  staffId: string;
  brandCode: string;
  expiresAt: string;
  consumedAt: string | null;
  attemptCount: number;
}

export interface SessionRecord {
  publicId: string;
  staffId: string;
  brandCode: string;
  secretHash: string;
  expiresAt: string;
  revokedAt: string | null;
  mfaSatisfied: boolean;
  role: string;
  displayName: string;
}

export interface FlagRecord {
  key: string;
  brandCode: string;
  enabled: boolean;
}

export interface OfficeRepository {
  findStaffByEmail(email: string): Promise<StaffRecord | null>;
  findStaffById(id: string): Promise<StaffRecord | null>;
  listInvitedOwners(): Promise<StaffRecord[]>;
  saveStaff(staff: StaffRecord): Promise<void>;
  createChallenge(staffId: string, expiresAt: string): Promise<ChallengeRecord>;
  readChallenge(id: string): Promise<ChallengeRecord | null>;
  saveChallenge(challenge: ChallengeRecord): Promise<void>;
  createSession(input: {
    staffId: string;
    secretHash: string;
    expiresAt: string;
    mfaSatisfied: true;
  }): Promise<SessionRecord>;
  readSession(secretHash: string): Promise<SessionRecord | null>;
  revokeSession(secretHash: string, revokedAt: string): Promise<void>;
  flags(): Promise<FlagRecord[]>;
}

export function isVerifiedRole(role: string): role is OfficeRole {
  return role === 'owner' || role === 'manager' || role === 'cashier' || role === 'security';
}
