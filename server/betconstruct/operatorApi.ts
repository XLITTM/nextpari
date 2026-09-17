import { staffError } from '../staff/errors.js';
import {
  BETCONSTRUCT_NOT_CONFIGURED,
  BETCONSTRUCT_SPORTSBOOK_OPERATOR_METHODS,
  BETCONSTRUCT_WALLET_NOT_WIRED,
  isBetConstructLive,
  type BetConstructSportsbookOperatorMethod,
} from './config.js';

export const BETCONSTRUCT_OPERATOR_PATH = '/api/betconstruct/operator';

export function isBetConstructSportsbookOperatorMethod(
  value: unknown,
): value is BetConstructSportsbookOperatorMethod {
  return (BETCONSTRUCT_SPORTSBOOK_OPERATOR_METHODS as readonly string[]).includes(String(value ?? ''));
}

/**
 * BetConstruct sportsbook Operator API.
 * Money must later go through Wallet Ledger. Never call the native Nextpari sports place engine.
 */
export function handleBetConstructOperatorMethod(input: {
  method: unknown;
  env?: NodeJS.ProcessEnv;
}): never {
  void isBetConstructLive(input.env);
  void BETCONSTRUCT_WALLET_NOT_WIRED;
  if (!isBetConstructSportsbookOperatorMethod(input.method)) {
    throw staffError('BETCONSTRUCT_METHOD_UNSUPPORTED', 400);
  }
  throw staffError(BETCONSTRUCT_NOT_CONFIGURED, 409);
}
