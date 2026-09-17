import { StaffOnboardingError, staffError } from '../staff/errors.js';
import { readPlayerCookies } from '../player/playerCookies.js';
import {
  livePlayerAuthPorts,
  resolvePlayerSession,
  type PlayerAuthGatewayPorts,
} from '../player/playerAuthService.js';
import { PLAYER_EXTERNAL_CASINO_GATE_RPC } from '../player/playerSecurityRestrictionGate.js';
import type { StaffHttpResult } from '../staff/httpHandler.js';
import { BETCONSTRUCT_NOT_CONFIGURED, isBetConstructLive } from './config.js';

function portsForLaunch(input: {
  cookieHeader?: string;
  ports?: PlayerAuthGatewayPorts;
}): PlayerAuthGatewayPorts {
  if (input.ports) return input.ports;
  const cookies = readPlayerCookies(input.cookieHeader);
  if (!cookies.accessToken && !cookies.refreshToken) {
    throw staffError('JWT_REQUIRED', 401);
  }
  return livePlayerAuthPorts();
}

export const PLAYER_BETCONSTRUCT_SPORTSBOOK_LAUNCH_PATH =
  '/api/player/betconstruct/sportsbook-launch';
export const PLAYER_BETCONSTRUCT_CASINO_LAUNCH_PATH =
  '/api/player/betconstruct/casino-launch';

export const BETCONSTRUCT_CASINO_SECURITY_GATE = PLAYER_EXTERNAL_CASINO_GATE_RPC;

export type BetConstructLaunchProduct = 'sportsbook' | 'casino';

/**
 * Player-facing launch. Canonical session validation first, then fail-closed.
 * Casino launch must later call require_player_external_casino_allowed.
 * Sportsbook launch must not call the native Nextpari sports engine.
 */
export async function requestBetConstructLaunch(input: {
  product: BetConstructLaunchProduct;
  cookieHeader?: string;
  cookieSecure?: boolean;
  env?: NodeJS.ProcessEnv;
  ports?: PlayerAuthGatewayPorts;
}): Promise<StaffHttpResult> {
  try {
    await resolvePlayerSession(
      portsForLaunch(input),
      input.cookieHeader,
      input.cookieSecure === true,
    );
  } catch (error) {
    if (error instanceof StaffOnboardingError) {
      return { status: error.httpStatus, body: { ok: false, error: error.code, ...error.payload } };
    }
    throw error;
  }
  void isBetConstructLive(input.env);
  if (input.product === 'casino') {
    void BETCONSTRUCT_CASINO_SECURITY_GATE;
  }
  return {
    status: 409,
    body: { ok: false, error: BETCONSTRUCT_NOT_CONFIGURED },
  };
}
