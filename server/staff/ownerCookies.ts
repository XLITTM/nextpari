export const OWNER_ACCESS_COOKIE = 'nextpari_owner_access';
export const OWNER_REFRESH_COOKIE = 'nextpari_owner_refresh';

const ACCESS_MAX_AGE_DEFAULT = 60 * 60;
const REFRESH_MAX_AGE_DEFAULT = 60 * 60 * 24 * 7;

export interface OwnerCookiePair {
  accessToken: string | null;
  refreshToken: string | null;
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      out[name] = part.slice(idx + 1).trim();
    }
  }
  return out;
}

export function readOwnerCookies(header: string | undefined): OwnerCookiePair {
  const parsed = parseCookieHeader(header);
  return {
    accessToken: parsed[OWNER_ACCESS_COOKIE]?.trim() || null,
    refreshToken: parsed[OWNER_REFRESH_COOKIE]?.trim() || null,
  };
}

export function requestIsSecure(headers?: Record<string, string | string[] | undefined>): boolean {
  const xf = headers?.['x-forwarded-proto'];
  const proto = Array.isArray(xf) ? xf[0] : xf;
  if ((proto ?? '').split(',')[0].trim() === 'https') return true;
  return process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
}

function jwtExpUnix(token: string): number | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

export function accessCookieMaxAge(accessToken: string, nowUnix = Math.floor(Date.now() / 1000)): number {
  const exp = jwtExpUnix(accessToken);
  if (exp == null) return ACCESS_MAX_AGE_DEFAULT;
  return Math.max(60, exp - nowUnix);
}

function cookieFlags(maxAge: number, secure: boolean): string {
  const parts = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function serializeOwnerCookies(
  accessToken: string,
  refreshToken: string,
  secure: boolean,
): string[] {
  return [
    `${OWNER_ACCESS_COOKIE}=${encodeURIComponent(accessToken)}; ${cookieFlags(accessCookieMaxAge(accessToken), secure)}`,
    `${OWNER_REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; ${cookieFlags(REFRESH_MAX_AGE_DEFAULT, secure)}`,
  ];
}

export function clearOwnerCookies(secure: boolean): string[] {
  return [
    `${OWNER_ACCESS_COOKIE}=; ${cookieFlags(0, secure)}`,
    `${OWNER_REFRESH_COOKIE}=; ${cookieFlags(0, secure)}`,
  ];
}
