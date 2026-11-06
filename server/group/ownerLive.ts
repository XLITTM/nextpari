import { createAnonAuthClient, createUserJwtClient } from '../supabase/admin.js';
import { loadOwnerAuthEnv } from '../staff/env.js';
import { GroupControlError } from './errors.js';
import { logAuthAudit } from './ownerAudit.js';
import { prepareGroupRead, readerQueryFromEnv, type PreparedGroupRead } from './ownerDb.js';
import type { GroupOwnerPorts, VerifiedGroupAccess } from './ownerHttp.js';

function verifiedClaims(accessToken: string, userId: string): VerifiedGroupAccess {
  const parts = accessToken.split('.');
  const payload = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString('utf8')) as { aal?: unknown };
  return { userId, aal: payload.aal === 'aal2' ? 'aal2' : 'aal1' };
}

let prepared: Promise<PreparedGroupRead> | null = null;

function reader(): Promise<PreparedGroupRead> {
  if (!prepared) {
    prepared = prepareGroupRead(readerQueryFromEnv()).catch((error: unknown) => {
      prepared = null;
      if (error instanceof GroupControlError) throw error;
      throw new GroupControlError('GROUP_SCHEMA_UNAVAILABLE');
    });
  }
  return prepared;
}

export function liveGroupOwnerPorts(): GroupOwnerPorts {
  const env = loadOwnerAuthEnv();
  const anon = () => createAnonAuthClient(env.supabaseUrl, env.supabaseAnonKey);

  return {
    auditAuthFailure(event) {
      logAuthAudit(event);
    },
    async signInWithPassword(email, password) {
      const { data, error } = await anon().auth.signInWithPassword({ email, password });
      const accessToken = data.session?.access_token ?? '';
      const refreshToken = data.session?.refresh_token ?? '';
      if (error || !accessToken || !refreshToken) throw new GroupControlError('AUTH_FAILED');
      return { accessToken, refreshToken };
    },
    async verifyAccessToken(accessToken) {
      const { data, error } = await anon().auth.getUser(accessToken);
      const userId = data.user?.id ?? '';
      if (error || !userId) throw new GroupControlError('JWT_INVALID');
      return verifiedClaims(accessToken, userId);
    },
    async listVerifiedTotpFactor(accessToken) {
      const client = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, accessToken);
      const { data, error } = await client.auth.mfa.listFactors();
      if (error) throw new GroupControlError('MFA_REQUIRED');
      const factor = data.totp.find((item) => item.status === 'verified');
      return factor?.id ?? null;
    },
    async verifyTotp(accessToken, factorId, code) {
      const client = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, accessToken);
      const challenge = await client.auth.mfa.challenge({ factorId });
      if (challenge.error || !challenge.data?.id) throw new GroupControlError('MFA_REQUIRED');
      const verified = await client.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code,
      });
      const nextAccess = verified.data?.access_token ?? '';
      const nextRefresh = verified.data?.refresh_token ?? '';
      if (verified.error || !nextAccess || !nextRefresh) throw new GroupControlError('MFA_REQUIRED');
      return { accessToken: nextAccess, refreshToken: nextRefresh };
    },
    async enrollTotp(accessToken) {
      const client = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, accessToken);
      const enrolled = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Group Owner' });
      const factorId = enrolled.data?.id ?? '';
      const uri = enrolled.data?.totp?.uri ?? '';
      if (enrolled.error || !factorId || !uri) throw new GroupControlError('MFA_REQUIRED');
      return { factorId, uri };
    },
    async loadOwner(userId) {
      const read = await reader();
      return read.loadOwner(userId);
    },
    async loadModel(ownerId) {
      const read = await reader();
      return read.loadModel(ownerId);
    },
  };
}
