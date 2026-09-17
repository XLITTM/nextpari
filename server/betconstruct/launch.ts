import { staffError } from '../staff/errors.js';
import { readPlayerCookies } from '../player/playerCookies.js';
import { PLAYER_EXTERNAL_CASINO_GATE_RPC } from '../player/playerSecurityRestrictionGate.js';
import { BETCONSTRUCT_NOT_CONFIGURED, isBetConstructLive } from './config.js';

export const PLAYER_BETCONSTRUCT_SPORTSBOOK_LAUNCH_PATH =
  '/api/player/betconstruct/sportsbook-launch';
export const PLAYER_BETCONSTRUCT_CASINO_LAUNCH_PATH =
  '/api/player/betconstruct/casino-launch';

export const BETCONSTRUCT_CASINO_SECURITY_GATE = PLAYER_EXTERNAL_CASINO_GATE_RPC;

export type BetConstructLaunchProduct = 'sportsbook' | 'casino';

function requirePlayerCookie(cookieHeader: string | undefined): void {
  const cookies = readPlayerCookies(cookieHeader);
  if (!cookies.accessToken && !cookies.refreshToken) {
    throw staffError('JWT_REQUIRED', 401);
  }
}

/**
 * Player-facing launch. Auth is required, then the provider stays fail-closed
 * until real credentials and Wallet Ledger adapters exist.
 * Casino launch must later call require_player_external_casino_allowed.
 * Sportsbook launch must not call the native odds engine.
 */
export function requestBetConstructLaunch(input: {
  product: BetConstructLaunchProduct;
  cookieHeader?: string;
  env?: NodeJS.ProcessEnv;
}): never {
  requirePlayerCookie(input.cookieHeader);
  void isBetConstructLive(input.env);
  if (input.product === 'casino') {
    void BETCONSTRUCT_CASINO_SECURITY_GATE;
  }
  throw staffError(BETCONSTRUCT_NOT_CONFIGURED, 409);
}
