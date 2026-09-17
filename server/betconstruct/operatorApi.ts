import type { StaffHttpResult } from '../staff/httpHandler.js';
import {
  BETCONSTRUCT_METHOD_UNSUPPORTED,
  BETCONSTRUCT_NOT_CONFIGURED,
  BETCONSTRUCT_SPORTSBOOK_OPERATOR_METHODS,
  BETCONSTRUCT_WALLET_NOT_WIRED,
  isBetConstructLive,
  type BetConstructSportsbookOperatorMethod,
} from './config.js';

export const BETCONSTRUCT_OPERATOR_BASE = '/api/betconstruct/operator';

export function betConstructOperatorCallbackPath(method: string): string {
  return `${BETCONSTRUCT_OPERATOR_BASE}/${method}`;
}

export function isBetConstructSportsbookOperatorMethod(
  value: unknown,
): value is BetConstructSportsbookOperatorMethod {
  return (BETCONSTRUCT_SPORTSBOOK_OPERATOR_METHODS as readonly string[]).includes(String(value ?? ''));
}

/**
 * BetConstruct sportsbook Operator API.
 * Money must later go through Wallet Ledger. Never call the native Nextpari sports engine.
 * The public URL path identifies the method. Request JSON must not be required to carry "method".
 */
export function handleBetConstructOperatorMethod(input: {
  method: unknown;
  env?: NodeJS.ProcessEnv;
}): StaffHttpResult {
  void isBetConstructLive(input.env);
  void BETCONSTRUCT_WALLET_NOT_WIRED;
  if (!isBetConstructSportsbookOperatorMethod(input.method)) {
    return { status: 404, body: { ok: false, error: BETCONSTRUCT_METHOD_UNSUPPORTED } };
  }
  return { status: 409, body: { ok: false, error: BETCONSTRUCT_NOT_CONFIGURED } };
}
