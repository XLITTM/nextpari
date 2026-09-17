import type { StaffHttpResult } from '../staff/httpHandler.js';
import {
  BETCONSTRUCT_METHOD_UNSUPPORTED,
  BETCONSTRUCT_NOT_CONFIGURED,
  BETCONSTRUCT_SINGLE_WALLET_METHODS,
  BETCONSTRUCT_WALLET_NOT_WIRED,
  isBetConstructLive,
  type BetConstructSingleWalletMethod,
} from './config.js';

export const BETCONSTRUCT_WALLET_BASE = '/api/betconstruct/wallet';

export function betConstructWalletCallbackPath(method: string): string {
  return `${BETCONSTRUCT_WALLET_BASE}/${method}`;
}

export function isBetConstructSingleWalletMethod(
  value: unknown,
): value is BetConstructSingleWalletMethod {
  return (BETCONSTRUCT_SINGLE_WALLET_METHODS as readonly string[]).includes(String(value ?? ''));
}

/**
 * BetConstruct casino RGS Single Wallet.
 * Withdraw/Deposit/Rollback must later mutate Wallet Ledger only.
 * The public URL path identifies the method. Request JSON must not be required to carry "method".
 */
export function handleBetConstructSingleWalletMethod(input: {
  method: unknown;
  env?: NodeJS.ProcessEnv;
}): StaffHttpResult {
  void isBetConstructLive(input.env);
  void BETCONSTRUCT_WALLET_NOT_WIRED;
  if (!isBetConstructSingleWalletMethod(input.method)) {
    return { status: 404, body: { ok: false, error: BETCONSTRUCT_METHOD_UNSUPPORTED } };
  }
  return { status: 409, body: { ok: false, error: BETCONSTRUCT_NOT_CONFIGURED } };
}
