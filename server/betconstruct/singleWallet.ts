import { staffError } from '../staff/errors.js';
import {
  BETCONSTRUCT_NOT_CONFIGURED,
  BETCONSTRUCT_SINGLE_WALLET_METHODS,
  BETCONSTRUCT_WALLET_NOT_WIRED,
  isBetConstructLive,
  type BetConstructSingleWalletMethod,
} from './config.js';

export const BETCONSTRUCT_WALLET_PATH = '/api/betconstruct/wallet';

export function isBetConstructSingleWalletMethod(
  value: unknown,
): value is BetConstructSingleWalletMethod {
  return (BETCONSTRUCT_SINGLE_WALLET_METHODS as readonly string[]).includes(String(value ?? ''));
}

/**
 * BetConstruct casino RGS Single Wallet.
 * Withdraw/Deposit/Rollback must later mutate Wallet Ledger only.
 * Do not implement a Nextpari casino game canvas for these calls.
 */
export function handleBetConstructSingleWalletMethod(input: {
  method: unknown;
  env?: NodeJS.ProcessEnv;
}): never {
  void isBetConstructLive(input.env);
  void BETCONSTRUCT_WALLET_NOT_WIRED;
  if (!isBetConstructSingleWalletMethod(input.method)) {
    throw staffError('BETCONSTRUCT_METHOD_UNSUPPORTED', 400);
  }
  throw staffError(BETCONSTRUCT_NOT_CONFIGURED, 409);
}
