import { createAnonAuthClient, createServiceRoleClient, createUserJwtClient } from '../supabase/admin.js';
import { loadStaffOnboardingEnv } from '../staff/env.js';
import { GroupControlError } from './errors.js';
import {
  mapGroupRows,
  type GroupOwnerPorts,
  type VerifiedGroupAccess,
} from './ownerHttp.js';
import type { GroupOwnerRecord, GroupReadModel } from './ownerReadModel.js';

function schemaError(error: { code?: string; message?: string } | null): void {
  if (!error) return;
  const text = `${error.code ?? ''} ${error.message ?? ''}`;
  if (text.includes('PGRST106') || text.includes('Invalid schema')) {
    throw new GroupControlError('GROUP_SCHEMA_NOT_EXPOSED');
  }
  if (text.includes('PGRST204') || text.includes('PGRST205') || /column|schema cache/i.test(text)) {
    throw new GroupControlError('GROUP_COLUMN_MISMATCH');
  }
  throw new GroupControlError('GROUP_SCHEMA_UNAVAILABLE');
}

function columnMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const text = `${error.code ?? ''} ${error.message ?? ''}`;
  return text.includes('PGRST204') || /column/i.test(text);
}

function verifiedClaims(accessToken: string, userId: string): VerifiedGroupAccess {
  const parts = accessToken.split('.');
  const payload = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString('utf8')) as { aal?: unknown };
  return { userId, aal: payload.aal === 'aal2' ? 'aal2' : 'aal1' };
}

export function liveGroupOwnerPorts(): GroupOwnerPorts {
  const env = loadStaffOnboardingEnv();
  const service = createServiceRoleClient(env.supabaseUrl, env.supabaseServiceRoleKey).schema('group_control');
  const anon = () => createAnonAuthClient(env.supabaseUrl, env.supabaseAnonKey);

  return {
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
      let identity = await service.from('owner_identities').select('*').eq('id', userId).maybeSingle();
      if (columnMissing(identity.error)) {
        identity = await service.from('owner_identities').select('*').eq('auth_user_id', userId).maybeSingle();
      }
      schemaError(identity.error);
      if (!identity.data) return null;
      const record = identity.data as Record<string, unknown>;
      const ownerId = String(record.id ?? userId);
      let permissions = await service.from('owner_permissions').select('*').eq('owner_id', ownerId);
      if (columnMissing(permissions.error)) {
        permissions = await service.from('owner_permissions').select('*').eq('identity_id', ownerId);
      }
      schemaError(permissions.error);
      const names = (permissions.data ?? []).map((row) => String((row as { permission?: unknown }).permission ?? '')).filter(Boolean);
      const status = record.status === 'disabled' ? 'disabled' : 'active';
      const owner: GroupOwnerRecord = { id: ownerId, status, permissions: names };
      return owner;
    },
    async loadModel(): Promise<GroupReadModel> {
      const [brands, brandOwners, grants, players, finance, audit] = await Promise.all([
        service.from('brands').select('*'),
        service.from('brand_owners').select('*'),
        service.from('brand_staff_grants').select('*'),
        service.from('player_id_reservations').select('*'),
        service.from('brand_report_snapshots').select('*'),
        service.from('audit_events').select('*'),
      ]);
      for (const result of [brands, brandOwners, grants, players, finance, audit]) schemaError(result.error);
      return mapGroupRows({
        brands: brands.data ?? [],
        brandOwners: brandOwners.data ?? [],
        grants: grants.data ?? [],
        players: players.data ?? [],
        finance: finance.data ?? [],
        audit: audit.data ?? [],
      });
    },
    async readNextpariStats(accessToken) {
      const client = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, accessToken);
      const { error } = await client.rpc('owner_dashboard_stats');
      if (error) return 'unavailable';
      return 'no-currency';
    },
  };
}
