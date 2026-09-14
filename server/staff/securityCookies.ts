import {
  accessCookieMaxAge,
  parseCookieHeader,
  requestIsSecure,
} from './ownerCookies.js';

export const SECURITY_ACCESS_COOKIE = 'nextpari_security_access';
export const SECURITY_REFRESH_COOKIE = 'nextpari_security_refresh';

const REFRESH_MAX_AGE_DEFAULT = 60 * 60 * 24 * 7;

export interface SecurityCookiePair {
  accessToken: string | null;
  refreshToken: string | null;
}

export { requestIsSecure };

export function readSecurityCookies(header: string | undefined): SecurityCookiePair {
  const parsed = parseCookieHeader(header);
  return {
    accessToken: parsed[SECURITY_ACCESS_COOKIE]?.trim() || null,
    refreshToken: parsed[SECURITY_REFRESH_COOKIE]?.trim() || null,
  };
}

function cookieFlags(maxAge: number, secure: boolean): string {
  const parts = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function serializeSecurityCookies(
  accessToken: string,
  refreshToken: string,
  secure: boolean,
): string[] {
  return [
    `${SECURITY_ACCESS_COOKIE}=${encodeURIComponent(accessToken)}; ${cookieFlags(accessCookieMaxAge(accessToken), secure)}`,
    `${SECURITY_REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; ${cookieFlags(REFRESH_MAX_AGE_DEFAULT, secure)}`,
  ];
}

export function clearSecurityCookies(secure: boolean): string[] {
  return [
    `${SECURITY_ACCESS_COOKIE}=; ${cookieFlags(0, secure)}`,
    `${SECURITY_REFRESH_COOKIE}=; ${cookieFlags(0, secure)}`,
  ];
}
