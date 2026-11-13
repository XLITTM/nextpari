import { isCanonicalSportsBetEnabled } from './enabled.js';
import { normalizeSportsProviderId } from './quoteProviderRegistry.js';

export const SPORTSBOOK_EMERGENCY_STOP = 'SPORTSBOOK_EMERGENCY_STOP';
export const SPORTSBOOK_ACCOUNT_NOT_AUTHORIZED = 'SPORTSBOOK_ACCOUNT_NOT_AUTHORIZED';

function token(env: NodeJS.ProcessEnv): string {
  return String(env.BETSAPI_TOKEN || env.BETSAPI_KEY || '').trim();
}

export function isSportsbookEmergencyStop(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return String(env.SPORTSBOOK_EMERGENCY_STOP ?? '1').trim() !== '0';
}

export function authorizedSportsbookPlayerIds(env: NodeJS.ProcessEnv = process.env): string[] {
  return String(env.SPORTSBOOK_AUTHORIZED_PLAYER_IDS ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function isAuthorizedSportsbookPlayer(
  playerId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const id = playerId.trim().toLowerCase();
  if (!id) return false;
  return authorizedSportsbookPlayerIds(env).includes(id);
}

export function isBetsapiQuoteEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isSportsbookEmergencyStop(env)) return false;
  if (!token(env)) return false;
  return String(env.BETSAPI_SPORTSBOOK_QUOTE ?? '').trim() === '1';
}

export function canPlaceBetsapiBet(
  playerId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isCanonicalSportsBetEnabled(env)
    && isBetsapiQuoteEnabled(env)
    && isAuthorizedSportsbookPlayer(playerId, env);
}

export function betsapiStakeAllowed(
  stake: number,
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; code: 'SPORTS_STAKE_LIMIT' } {
  const raw = String(env.SPORTSBOOK_MAX_STAKE ?? '').trim();
  const max = Number(raw);
  if (!raw || !Number.isFinite(max) || max <= 0 || !Number.isFinite(stake) || stake <= 0 || stake > max) {
    return { ok: false, code: 'SPORTS_STAKE_LIMIT' };
  }
  return { ok: true };
}

export function retiredProviderStillBlocks(
  provider: unknown,
  playerId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const id = normalizeSportsProviderId(provider);
  if (id !== 'lsports' && id !== 'betsapi' && id !== 'b365api' && id !== 'b365') return false;
  if (id === 'betsapi' && canPlaceBetsapiBet(playerId, env)) return false;
  return true;
}
