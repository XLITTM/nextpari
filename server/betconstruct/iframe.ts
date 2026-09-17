const TOKEN_TTL_MS = 5 * 60 * 1000;

export interface BetConstructLaunchToken {
  token: string;
  playerUserId: string;
  walletId: string;
  currency: string;
  issuedAtMs: number;
  expiresAtMs: number;
}

function trimOrigin(origin: string): string {
  return String(origin ?? '').trim().replace(/\/+$/, '');
}

/** Sportsbook iframe: BetConstruct UI + betslip, not Nextpari markets. */
export function buildBetConstructSportsbookIframeUrl(input: {
  origin: string;
  authToken: string;
  lang?: string;
}): string {
  const url = new URL(`${trimOrigin(input.origin)}/`);
  url.searchParams.set('integrationMode', '1');
  url.searchParams.set('AuthToken', input.authToken);
  if (input.lang) url.searchParams.set('lang', input.lang);
  return url.toString();
}

/** Casino/game iframe: provider-hosted game UI, not a Nextpari game canvas. */
export function buildBetConstructCasinoIframeUrl(input: {
  origin: string;
  authToken: string;
  gameId?: string;
}): string {
  const url = new URL(`${trimOrigin(input.origin)}/`);
  url.searchParams.set('integrationMode', '1');
  url.searchParams.set('AuthToken', input.authToken);
  if (input.gameId) url.searchParams.set('gameId', input.gameId);
  return url.toString();
}

export function bindCurrencyLaunchToken(input: {
  playerUserId: string;
  walletId: string;
  currency: string;
  issuedAtMs: number;
  ttlMs?: number;
}): BetConstructLaunchToken {
  const currency = String(input.currency ?? '').trim().toUpperCase();
  const playerUserId = String(input.playerUserId ?? '').trim();
  const walletId = String(input.walletId ?? '').trim();
  if (!playerUserId || !walletId || !currency) {
    throw new Error('BETCONSTRUCT_LAUNCH_TOKEN_INVALID');
  }
  const ttlMs = input.ttlMs ?? TOKEN_TTL_MS;
  const expiresAtMs = input.issuedAtMs + ttlMs;
  const token = [
    'bc',
    playerUserId,
    walletId,
    currency,
    String(input.issuedAtMs),
    String(expiresAtMs),
  ].join('.');
  return {
    token,
    playerUserId,
    walletId,
    currency,
    issuedAtMs: input.issuedAtMs,
    expiresAtMs,
  };
}

export function launchTokenCurrency(token: string): string | null {
  const parts = String(token ?? '').split('.');
  return parts[3] ? parts[3] : null;
}
