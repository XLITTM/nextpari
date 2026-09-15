import { createUserJwtClient } from '../supabase/admin.js';
import { loadOwnerAuthEnv } from '../staff/env.js';
import { extractErrorCode, rpcMessage, staffError, StaffOnboardingError } from '../staff/errors.js';

export interface SecurityRpcPort {
  invoke: (name: string, args?: Record<string, unknown> | undefined) => Promise<unknown>;
}

export const SECURITY_ALLOWED_RPCS = [
  'security_current_staff',
  'security_security_overview',
  'security_list_security_flags',
  'security_player_security',
  'security_resolve_security_flag',
  'security_player_security_restriction',
  'security_set_player_security_restriction',
  'security_player_manual_verification',
  'security_request_player_manual_verification',
  'security_complete_player_manual_verification',
  'security_activity_feed',
  'security_player_sports_bets',
  'security_player_sports_bet',
  'security_player_sports_summary',
  'security_win_pattern_settings',
  'security_evaluate_player_win_pattern',
] as const;

export const SECURITY_DENIED_RPCS = [
  'owner_set_player_blocked',
  'owner_debit_player',
  'owner_fund_player',
  'owner_fund_manager',
  'owner_fund_cashier',
  'owner_capital_in',
  'owner_approve_withdrawal',
  'owner_reject_withdrawal',
  'owner_mark_withdrawal_paid',
  'owner_provision_manager',
  'owner_provision_security_staff',
  'manager_provision_cashier',
  'cashier_deposit_player',
  'apply_operational_transfer',
  'apply_wallet_entry',
  'sports_settle_bet',
  'sports_cancel_bet',
  'owner_list_provider_settlements',
  'owner_set_win_pattern_settings',
] as const;

export function mapSecurityRpcError(error: { message?: string; code?: string }): StaffOnboardingError {
  const text = rpcMessage(error);
  if (error.code === 'PGRST301' || /jwt|expired|unauthorized/i.test(text)) {
    return staffError('JWT_INVALID', 401);
  }
  const code = extractErrorCode(text);
  if (
    code === 'SECURITY_REQUIRED'
    || code === 'OWNER_REQUIRED'
    || code === 'MANAGER_REQUIRED'
    || code === 'CASHIER_REQUIRED'
    || code === 'STAFF_ACCOUNT_NOT_FOUND'
    || code === 'STAFF_ACCOUNT_BLOCKED'
    || code === 'STAFF_ACCOUNT_DISABLED'
    || code === 'SECURITY_RESTRICTION_ACTOR_DENIED'
  ) {
    return staffError(code === 'OWNER_REQUIRED' || code === 'MANAGER_REQUIRED' || code === 'CASHIER_REQUIRED'
      ? 'SECURITY_REQUIRED'
      : code, 403);
  }
  if (code === 'JWT_REQUIRED' || code === 'JWT_INVALID' || code === 'AUTH_REQUIRED') {
    return staffError(code, 401);
  }
  if (
    code === 'SECURITY_RESTRICTION_ALREADY_ACTIVE'
    || code === 'SECURITY_RESTRICTION_NOT_ACTIVE'
    || (code != null && code.endsWith('_RESTRICTED'))
  ) {
    return staffError(code, 409);
  }
  if (code && (code.endsWith('_INVALID') || code.endsWith('_REQUIRED'))) {
    return staffError(code, 400);
  }
  if (code && code.endsWith('_NOT_FOUND')) {
    return staffError(code, 404);
  }
  return staffError('SECURITY_RPC_FAILED', 500);
}

export function createSecurityJwtRpc(accessToken: string): SecurityRpcPort {
  const env = loadOwnerAuthEnv();
  const client = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, accessToken);
  return {
    async invoke(name, args) {
      if ((SECURITY_DENIED_RPCS as readonly string[]).includes(name)) {
        throw staffError('SECURITY_ACTION_DENIED', 403);
      }
      if (!(SECURITY_ALLOWED_RPCS as readonly string[]).includes(name)) {
        throw staffError('SECURITY_ACTION_DENIED', 403);
      }
      const { data, error } = await client.rpc(name, args);
      if (error) throw mapSecurityRpcError(error);
      return data;
    },
  };
}
