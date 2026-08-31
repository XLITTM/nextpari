import { createUserJwtClient } from '../supabase/admin.js';
import { loadOwnerAuthEnv } from '../staff/env.js';
import { extractErrorCode, rpcMessage, staffError, StaffOnboardingError } from '../staff/errors.js';

export interface ManagerRpcPort {
  invoke: (name: string, args?: Record<string, unknown> | undefined) => Promise<unknown>;
}

export function mapManagerRpcError(error: { message?: string; code?: string }): StaffOnboardingError {
  const text = rpcMessage(error);
  if (error.code === 'PGRST301' || /jwt|expired|unauthorized/i.test(text)) {
    return staffError('JWT_INVALID', 401);
  }
  const code = extractErrorCode(text);
  if (
    code === 'MANAGER_REQUIRED'
    || code === 'OWNER_REQUIRED'
    || code === 'STAFF_ACCOUNT_NOT_FOUND'
    || code === 'STAFF_ACCOUNT_BLOCKED'
    || code === 'STAFF_ACCOUNT_DISABLED'
  ) {
    return staffError(code, 403);
  }
  if (code === 'JWT_REQUIRED' || code === 'JWT_INVALID' || code === 'AUTH_REQUIRED') {
    return staffError(code, 401);
  }
  if (/не входит в вашу сеть/i.test(text)) {
    return staffError('CASHIER_NOT_FOUND', 404);
  }
  if (code && (code.endsWith('_INVALID') || code.endsWith('_REQUIRED'))) {
    return staffError(code, 400);
  }
  if (code && code.endsWith('_NOT_FOUND')) {
    return staffError(code, 404);
  }
  return staffError('MANAGER_RPC_FAILED', 500);
}

export function createManagerJwtRpc(accessToken: string): ManagerRpcPort {
  const env = loadOwnerAuthEnv();
  const client = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, accessToken);
  return {
    async invoke(name, args) {
      const { data, error } = await client.rpc(name, args);
      if (error) throw mapManagerRpcError(error);
      return data;
    },
  };
}
