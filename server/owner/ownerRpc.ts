import { createUserJwtClient } from '../supabase/admin.js';
import { loadOwnerAuthEnv } from '../staff/env.js';
import { extractErrorCode, rpcMessage, staffError, StaffOnboardingError } from '../staff/errors.js';

export interface OwnerRpcPort {
  invoke: (name: string, args?: Record<string, unknown> | undefined) => Promise<unknown>;
}

export function mapOwnerRpcError(error: { message?: string; code?: string }): StaffOnboardingError {
  const text = rpcMessage(error);
  if (error.code === 'PGRST301' || /jwt|expired|unauthorized/i.test(text)) {
    return staffError('JWT_INVALID', 401);
  }
  const code = extractErrorCode(text);
  if (
    code === 'OWNER_REQUIRED'
    || code === 'STAFF_ACCOUNT_NOT_FOUND'
    || code === 'STAFF_ACCOUNT_BLOCKED'
    || code === 'STAFF_ACCOUNT_DISABLED'
  ) {
    return staffError(code, 403);
  }
  if (code === 'JWT_REQUIRED' || code === 'JWT_INVALID' || code === 'AUTH_REQUIRED') {
    return staffError(code, 401);
  }
  if (
    code === 'LOGIN_TAKEN'
    || code === 'STAFF_AUTH_ALREADY_BOUND'
    || code === 'PLAYER_ACCOUNT_CANNOT_BECOME_STAFF'
    || (code && code.endsWith('_BOUND'))
  ) {
    return staffError(code, 409);
  }
  if (code && (code.endsWith('_INVALID') || code.endsWith('_REQUIRED'))) {
    return staffError(code, 400);
  }
  if (code && code.endsWith('_NOT_FOUND')) {
    return staffError(code, 404);
  }
  return staffError('OWNER_RPC_FAILED', 500);
}

export function createOwnerJwtRpc(accessToken: string): OwnerRpcPort {
  const env = loadOwnerAuthEnv();
  const client = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, accessToken);
  return {
    async invoke(name, args) {
      const { data, error } = await client.rpc(name, args);
      if (error) throw mapOwnerRpcError(error);
      return data;
    },
  };
}
