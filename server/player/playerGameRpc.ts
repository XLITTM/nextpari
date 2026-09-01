import { createUserJwtClient } from '../supabase/admin.js';
import { loadOwnerAuthEnv } from '../staff/env.js';
import { extractErrorCode, rpcMessage, staffError, StaffOnboardingError } from '../staff/errors.js';

export interface PlayerGameRpcPort {
  invoke: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
}

export function mapPlayerGameRpcError(error: { message?: string; code?: string }): StaffOnboardingError {
  const text = rpcMessage(error);
  if (error.code === 'PGRST301' || /jwt|expired|unauthorized/i.test(text)) {
    return staffError('JWT_INVALID', 401);
  }
  const code = extractErrorCode(text);
  if (!code) {
    return staffError('GAME_RPC_FAILED', 500);
  }
  if (code === 'AUTH_REQUIRED' || code === 'JWT_REQUIRED' || code === 'JWT_INVALID') {
    return staffError(code, 401);
  }
  if (
    code === 'STAFF_CANNOT_PLAY'
    || code === 'STAFF_ACCOUNT_CANNOT_PROVISION_PLAYER'
    || code === 'GAME_ROUND_NOT_OWNED'
  ) {
    return staffError(code, 403);
  }
  if (
    code === 'INSUFFICIENT_AVAILABLE_BALANCE'
    || code === 'IDEMPOTENCY_KEY_CONFLICT'
    || code === 'GAME_DISABLED'
    || code === 'GAME_MAINTENANCE'
    || code === 'GAME_ROUND_NOT_OPEN'
    || code === 'WALLET_BLOCKED'
    || code === 'WALLET_CLOSED'
    || code === 'PLAYER_WALLET_NOT_ACTIVE'
  ) {
    return staffError(code, 409);
  }
  if (code === 'GAME_NOT_FOUND' || code === 'GAME_ROUND_NOT_FOUND' || code === 'WALLET_ACCOUNT_NOT_FOUND' || code === 'PLAYER_WALLET_MISSING') {
    return staffError(code, 404);
  }
  if (
    code.endsWith('_REQUIRED')
    || code.endsWith('_INVALID')
    || code.endsWith('_TOO_LONG')
    || code === 'STAKE_NOT_POSITIVE'
    || code === 'STAKE_BELOW_MIN'
    || code === 'STAKE_ABOVE_MAX'
    || code === 'STAKE_SCALE_INVALID'
    || code === 'ACTION_NOT_ALLOWED'
    || code === 'GAME_ADAPTER_NOT_IMPLEMENTED'
  ) {
    return staffError(code, 400);
  }
  return staffError(code, 500);
}

export function createPlayerJwtGameRpc(accessToken: string): PlayerGameRpcPort {
  const env = loadOwnerAuthEnv();
  const client = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, accessToken);
  return {
    async invoke(name, args) {
      const { data, error } = await client.rpc(name, args);
      if (error) throw mapPlayerGameRpcError(error);
      return data;
    },
  };
}
