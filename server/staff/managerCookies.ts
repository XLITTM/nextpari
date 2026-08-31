import {
  accessCookieMaxAge,
  parseCookieHeader,
  requestIsSecure,
} from './ownerCookies.js';

export const MANAGER_ACCESS_COOKIE = 'nextpari_manager_access';
export const MANAGER_REFRESH_COOKIE = 'nextpari_manager_refresh';

const REFRESH_MAX_AGE_DEFAULT = 60 * 60 * 24 * 7;

export interface ManagerCookiePair {
  accessToken: string | null;
  refreshToken: string | null;
}

export { requestIsSecure };

export function readManagerCookies(header: string | undefined): ManagerCookiePair {
  const parsed = parseCookieHeader(header);
  return {
    accessToken: parsed[MANAGER_ACCESS_COOKIE]?.trim() || null,
    refreshToken: parsed[MANAGER_REFRESH_COOKIE]?.trim() || null,
  };
}

function cookieFlags(maxAge: number, secure: boolean): string {
  const parts = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function serializeManagerCookies(
  accessToken: string,
  refreshToken: string,
  secure: boolean,
): string[] {
  return [
    `${MANAGER_ACCESS_COOKIE}=${encodeURIComponent(accessToken)}; ${cookieFlags(accessCookieMaxAge(accessToken), secure)}`,
    `${MANAGER_REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; ${cookieFlags(REFRESH_MAX_AGE_DEFAULT, secure)}`,
  ];
}

export function clearManagerCookies(secure: boolean): string[] {
  return [
    `${MANAGER_ACCESS_COOKIE}=; ${cookieFlags(0, secure)}`,
    `${MANAGER_REFRESH_COOKIE}=; ${cookieFlags(0, secure)}`,
  ];
}
