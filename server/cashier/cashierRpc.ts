import { createUserJwtClient } from '../supabase/admin.js';
import { loadOwnerAuthEnv } from '../staff/env.js';
import { extractErrorCode, rpcMessage, staffError, StaffOnboardingError } from '../staff/errors.js';

export interface CashierRpcPort {
  invoke: (name: string, args?: Record<string, unknown> | undefined) => Promise<unknown>;
}

export function mapCashierRpcError(error: { message?: string; code?: string }): StaffOnboardingError {
  const text = rpcMessage(error);
  if (error.code === 'PGRST301' || /jwt|expired|unauthorized/i.test(text)) {
    return staffError('JWT_INVALID', 401);
  }
  const code = extractErrorCode(text);
  if (
    code === 'CASHIER_REQUIRED'
    || code === 'OWNER_REQUIRED'
    || code === 'MANAGER_REQUIRED'
    || code === 'STAFF_ACCOUNT_NOT_FOUND'
    || code === 'STAFF_ACCOUNT_BLOCKED'
    || code === 'STAFF_ACCOUNT_DISABLED'
    || code === 'STAFF_ACCOUNT_NOT_ACTIVE'
    || code === 'NETWORK_ID_REQUIRED'
    || code === 'LEGACY_CASHIER_ID_REQUIRED'
  ) {
    return staffError(code === 'OWNER_REQUIRED' || code === 'MANAGER_REQUIRED' ? 'CASHIER_REQUIRED' : code, 403);
  }
  if (code === 'JWT_REQUIRED' || code === 'JWT_INVALID' || code === 'AUTH_REQUIRED') {
    return staffError(code, 401);
  }
  if (/Could not find the function|schema cache|PGRST202/i.test(text)) {
    return staffError('FINANCE_RPC_UNAVAILABLE', 503);
  }
  if (code && (code.endsWith('_INVALID') || code.endsWith('_REQUIRED'))) {
    return staffError(code, 400);
  }
  if (code && code.endsWith('_NOT_FOUND')) {
    return staffError(code, 404);
  }
  return staffError('CASHIER_RPC_FAILED', 500);
}

export function createCashierJwtRpc(accessToken: string): CashierRpcPort {
  const env = loadOwnerAuthEnv();
  const client = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, accessToken);
  return {
    async invoke(name, args) {
      const { data, error } = await client.rpc(name, args);
      if (error) throw mapCashierRpcError(error);
      return data;
    },
  };
}
