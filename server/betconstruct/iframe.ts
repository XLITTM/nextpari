import { randomBytes } from 'node:crypto';

const TOKEN_TTL_MS = 5 * 60 * 1000;
const TOKEN_BYTES = 32;

export interface BetConstructLaunchBinding {
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

export function originOf(urlOrOrigin: string): string | null {
  try {
    const value = String(urlOrOrigin ?? '').trim();
    if (!value) return null;
    return new URL(value.includes('://') ? value : `https://${value}`).origin;
  } catch {
    return null;
  }
}

export function isAllowedBetConstructIframeSrc(iframeUrl: string, providerOrigin: string): boolean {
  try {
    const url = new URL(iframeUrl);
    const allowed = originOf(providerOrigin);
    return url.protocol === 'https:'
      && allowed != null
      && url.origin === allowed
      && url.searchParams.get('integrationMode') === '1'
      && Boolean(url.searchParams.get('AuthToken'));
  } catch {
    return false;
  }
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

/** Opaque AuthToken. Metadata stays beside the token, never encoded into it. */
export function bindCurrencyLaunchToken(input: {
  playerUserId: string;
  walletId: string;
  currency: string;
  issuedAtMs: number;
  ttlMs?: number;
}): BetConstructLaunchBinding {
  const currency = String(input.currency ?? '').trim().toUpperCase();
  const playerUserId = String(input.playerUserId ?? '').trim();
  const walletId = String(input.walletId ?? '').trim();
  if (!playerUserId || !walletId || !currency) {
    throw new Error('BETCONSTRUCT_LAUNCH_TOKEN_INVALID');
  }
  const ttlMs = input.ttlMs ?? TOKEN_TTL_MS;
  return {
    token: randomBytes(TOKEN_BYTES).toString('base64url'),
    playerUserId,
    walletId,
    currency,
    issuedAtMs: input.issuedAtMs,
    expiresAtMs: input.issuedAtMs + ttlMs,
  };
}
