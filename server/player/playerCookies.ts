import {
  accessCookieMaxAge,
  parseCookieHeader,
  requestIsSecure,
} from '../staff/ownerCookies.js';

export const PLAYER_ACCESS_COOKIE = 'nextpari_player_access';
export const PLAYER_REFRESH_COOKIE = 'nextpari_player_refresh';

const REFRESH_MAX_AGE_DEFAULT = 60 * 60 * 24 * 7;

export interface PlayerCookiePair {
  accessToken: string | null;
  refreshToken: string | null;
}

export { requestIsSecure };

export function readPlayerCookies(header: string | undefined): PlayerCookiePair {
  const parsed = parseCookieHeader(header);
  return {
    accessToken: parsed[PLAYER_ACCESS_COOKIE]?.trim() || null,
    refreshToken: parsed[PLAYER_REFRESH_COOKIE]?.trim() || null,
  };
}

function cookieFlags(maxAge: number, secure: boolean): string {
  const parts = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function serializePlayerCookies(
  accessToken: string,
  refreshToken: string,
  secure: boolean,
): string[] {
  return [
    `${PLAYER_ACCESS_COOKIE}=${encodeURIComponent(accessToken)}; ${cookieFlags(accessCookieMaxAge(accessToken), secure)}`,
    `${PLAYER_REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; ${cookieFlags(REFRESH_MAX_AGE_DEFAULT, secure)}`,
  ];
}

export function clearPlayerCookies(secure: boolean): string[] {
  return [
    `${PLAYER_ACCESS_COOKIE}=; ${cookieFlags(0, secure)}`,
    `${PLAYER_REFRESH_COOKIE}=; ${cookieFlags(0, secure)}`,
  ];
}
