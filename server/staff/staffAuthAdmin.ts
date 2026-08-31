import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient, createUserJwtClient } from '../supabase/admin.js';
import type { StaffOnboardingEnv } from './env.js';
import { extractErrorCode, rpcMessage, staffError } from './errors.js';
import type { AuthAdminPort, OwnerStaffPort, StaffBindingRow, StaffBindResult } from './types.js';

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function firstRow(data: unknown): Record<string, unknown> {
  if (Array.isArray(data)) return asRecord(data[0]);
  return asRecord(data);
}

function str(value: unknown): string {
  return value == null ? '' : String(value);
}

function nullableStr(value: unknown): string | null {
  if (value == null || value === '') return null;
  return String(value);
}

export function parseStaffBindingRow(raw: unknown): StaffBindingRow {
  const row = asRecord(raw);
  return {
    authUserId: str(row.auth_user_id ?? row.authUserId),
    role: str(row.role),
    status: str(row.status),
    displayName: nullableStr(row.display_name ?? row.displayName),
    networkId: nullableStr(row.network_id ?? row.networkId),
    legacyManagerAccountId: nullableStr(row.legacy_manager_account_id ?? row.legacyManagerAccountId),
    legacyCashierId: nullableStr(row.legacy_cashier_id ?? row.legacyCashierId),
  };
}

export function parseBindResult(raw: unknown): StaffBindResult {
  const row = asRecord(raw);
  return {
    ok: row.ok !== false,
    isDuplicate: row.is_duplicate === true || row.isDuplicate === true,
    authUserId: str(row.auth_user_id ?? row.authUserId),
    role: str(row.role),
    status: str(row.status),
    displayName: nullableStr(row.display_name ?? row.displayName),
    networkId: nullableStr(row.network_id ?? row.networkId),
    legacyManagerAccountId: nullableStr(row.legacy_manager_account_id ?? row.legacyManagerAccountId),
    legacyCashierId: nullableStr(row.legacy_cashier_id ?? row.legacyCashierId),
  };
}

function throwOwnerRpc(error: { message?: string; code?: string } | null): never {
  const text = rpcMessage(error);
  const lower = text.toLowerCase();
  if (
    lower.includes('jwt')
    || lower.includes('unauthorized')
    || error?.code === 'PGRST301'
  ) {
    throw staffError('JWT_INVALID', 401);
  }
  const code = extractErrorCode(text) ?? 'OWNER_RPC_FAILED';
  if (code === 'AUTH_REQUIRED' || code === 'JWT_REQUIRED' || code === 'JWT_INVALID') {
    throw staffError('AUTH_REQUIRED', 401);
  }
  if (
    code === 'OWNER_REQUIRED'
    || code === 'STAFF_ACCOUNT_NOT_FOUND'
    || code === 'STAFF_ACCOUNT_BLOCKED'
    || code === 'STAFF_ACCOUNT_DISABLED'
    || code === 'STAFF_ACCOUNT_NOT_ACTIVE'
  ) {
    throw staffError(code, 403);
  }
  const status =
    code.endsWith('_INVALID') || code.endsWith('_REQUIRED') || code.endsWith('_NOT_FOUND')
      ? 400
      : code.endsWith('_BOUND') || code === 'PLAYER_ACCOUNT_CANNOT_BECOME_STAFF'
        ? 409
        : 400;
  throw staffError(code, status);
}

export function createOwnerStaffPort(client: SupabaseClient): OwnerStaffPort {
  return {
    async currentStaffContext() {
      const { data, error } = await client.rpc('current_staff_context');
      if (error) throwOwnerRpc(error);
      return firstRow(data);
    },

    async listStaffAuthBindings(role, limit, offset) {
      const { data, error } = await client.rpc('owner_list_staff_auth_bindings', {
        p_role: role,
        p_limit: limit,
        p_offset: offset,
      });
      if (error) throwOwnerRpc(error);
      const raw = asRecord(data);
      const rows = Array.isArray(raw.rows) ? raw.rows : [];
      const total = Number(raw.total);
      return {
        rows: rows.map(parseStaffBindingRow),
        total: Number.isFinite(total) ? total : rows.length,
      };
    },

    async bindManager(authUserId, managerId) {
      const { data, error } = await client.rpc('owner_bind_manager_auth', {
        p_auth_user_id: authUserId,
        p_manager_id: managerId,
      });
      if (error) throwOwnerRpc(error);
      return parseBindResult(data);
    },

    async bindCashier(authUserId, cashierId) {
      const { data, error } = await client.rpc('owner_bind_cashier_auth', {
        p_auth_user_id: authUserId,
        p_cashier_id: cashierId,
      });
      if (error) throwOwnerRpc(error);
      return parseBindResult(data);
    },
  };
}

export function createAuthAdminPort(client: SupabaseClient): AuthAdminPort {
  return {
    async createUser(email, password) {
      const { data, error } = await client.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user?.id) {
        const code = extractErrorCode(error?.message ?? '') ?? 'AUTH_USER_CREATE_FAILED';
        throw staffError(code === 'AUTH_USER_CREATE_FAILED' ? code : 'AUTH_USER_CREATE_FAILED', 502);
      }
      return { id: data.user.id };
    },

    async deleteUser(id) {
      const { error } = await client.auth.admin.deleteUser(id);
      if (error) {
        throw staffError('AUTH_USER_DELETE_FAILED', 500);
      }
    },
  };
}

export function createLiveStaffPorts(
  env: StaffOnboardingEnv,
  accessToken: string,
): { owner: OwnerStaffPort; admin: AuthAdminPort } {
  const ownerClient = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, accessToken);
  const adminClient = createServiceRoleClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  return {
    owner: createOwnerStaffPort(ownerClient),
    admin: createAuthAdminPort(adminClient),
  };
}
