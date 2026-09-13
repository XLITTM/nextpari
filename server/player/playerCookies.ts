import {
  accessCookieMaxAge,
  parseCookieHeader,
  requestIsSecure,
} from '../staff/ownerCookies.js';
import {
  generatePlayerDeviceToken,
  isPlayerDeviceToken,
} from './playerSecuritySignals.js';

export const PLAYER_ACCESS_COOKIE = 'nextpari_player_access';
export const PLAYER_REFRESH_COOKIE = 'nextpari_player_refresh';
export const PLAYER_DEVICE_COOKIE = 'nextpari_player_device';

const REFRESH_MAX_AGE_DEFAULT = 60 * 60 * 24 * 7;
const DEVICE_MAX_AGE_DEFAULT = 60 * 60 * 24 * 400;

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

export function readPlayerDeviceToken(header: string | undefined): string | null {
  const parsed = parseCookieHeader(header);
  const token = parsed[PLAYER_DEVICE_COOKIE]?.trim() || null;
  return isPlayerDeviceToken(token) ? token : null;
}

export interface PlayerDeviceCookieResult {
  token: string;
  setCookie: string;
  created: boolean;
}

export function serializePlayerDeviceCookie(token: string, secure: boolean): string {
  return `${PLAYER_DEVICE_COOKIE}=${encodeURIComponent(token)}; ${cookieFlags(DEVICE_MAX_AGE_DEFAULT, secure)}`;
}

export function ensurePlayerDeviceCookie(
  header: string | undefined,
  secure: boolean,
): PlayerDeviceCookieResult {
  const existing = readPlayerDeviceToken(header);
  if (existing) {
    return {
      token: existing,
      setCookie: serializePlayerDeviceCookie(existing, secure),
      created: false,
    };
  }
  const token = generatePlayerDeviceToken();
  return {
    token,
    setCookie: serializePlayerDeviceCookie(token, secure),
    created: true,
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

export function attachPlayerDeviceCookie(
  cookies: string[] | undefined,
  header: string | undefined,
  secure: boolean,
): { token: string; cookies: string[] } {
  const device = ensurePlayerDeviceCookie(header, secure);
  return {
    token: device.token,
    cookies: [...(cookies ?? []), device.setCookie],
  };
}
