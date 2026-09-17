export const PLAYER_BETCONSTRUCT_SPORTSBOOK_LAUNCH_PATH =
  '/api/player/betconstruct/sportsbook-launch';
export const PLAYER_BETCONSTRUCT_CASINO_LAUNCH_PATH =
  '/api/player/betconstruct/casino-launch';

export type BetConstructLaunchProduct = 'sportsbook' | 'casino';

export class BetConstructLaunchError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = 'BetConstructLaunchError';
    this.code = code;
    this.status = status;
  }
}

export interface BetConstructLaunchSession {
  iframeUrl: string;
  providerOrigin: string;
  authToken: string;
  currency: string;
  product: BetConstructLaunchProduct;
  integrationMode: 1;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function originOf(urlOrOrigin: string): string | null {
  try {
    const value = String(urlOrOrigin ?? '').trim();
    if (!value) return null;
    return new URL(value.includes('://') ? value : `https://${value}`).origin;
  } catch {
    return null;
  }
}

/** Reject iframe URLs whose origin does not match the launch providerOrigin. */
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

function launchPath(product: BetConstructLaunchProduct): string {
  return product === 'casino'
    ? PLAYER_BETCONSTRUCT_CASINO_LAUNCH_PATH
    : PLAYER_BETCONSTRUCT_SPORTSBOOK_LAUNCH_PATH;
}

/**
 * Requests a BetConstruct iframe session. Native sportsStore / betslip
 * must never be used as a fallback.
 */
export async function requestBetConstructLaunchSession(input: {
  product: BetConstructLaunchProduct;
  gameId?: string;
}): Promise<BetConstructLaunchSession> {
  const res = await fetch(launchPath(input.product), {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
    body: JSON.stringify({
      product: input.product,
      gameId: input.gameId,
    }),
  });
  const body = asRecord(await res.json().catch(() => ({})));
  if (!res.ok || body.ok === false) {
    throw new BetConstructLaunchError(String(body.error ?? 'BETCONSTRUCT_NOT_CONFIGURED'), res.status);
  }
  const iframeUrl = String(body.iframeUrl ?? body.iframe_url ?? '');
  const providerOrigin = String(body.providerOrigin ?? body.provider_origin ?? '');
  const authToken = String(body.authToken ?? body.AuthToken ?? '');
  const currency = String(body.currency ?? '');
  if (!iframeUrl || !providerOrigin || !authToken || !currency) {
    throw new BetConstructLaunchError('BETCONSTRUCT_LAUNCH_INVALID', 500);
  }
  if (!isAllowedBetConstructIframeSrc(iframeUrl, providerOrigin)) {
    throw new BetConstructLaunchError('BETCONSTRUCT_IFRAME_ORIGIN_MISMATCH', 500);
  }
  return {
    iframeUrl,
    providerOrigin,
    authToken,
    currency,
    product: input.product,
    integrationMode: 1,
  };
}
