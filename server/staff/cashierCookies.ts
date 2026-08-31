import {
  accessCookieMaxAge,
  parseCookieHeader,
  requestIsSecure,
} from './ownerCookies.js';

export const CASHIER_ACCESS_COOKIE = 'nextpari_cashier_access';
export const CASHIER_REFRESH_COOKIE = 'nextpari_cashier_refresh';

const REFRESH_MAX_AGE_DEFAULT = 60 * 60 * 24 * 7;

export interface CashierCookiePair {
  accessToken: string | null;
  refreshToken: string | null;
}

export { requestIsSecure };

export function readCashierCookies(header: string | undefined): CashierCookiePair {
  const parsed = parseCookieHeader(header);
  return {
    accessToken: parsed[CASHIER_ACCESS_COOKIE]?.trim() || null,
    refreshToken: parsed[CASHIER_REFRESH_COOKIE]?.trim() || null,
  };
}

function cookieFlags(maxAge: number, secure: boolean): string {
  const parts = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function serializeCashierCookies(
  accessToken: string,
  refreshToken: string,
  secure: boolean,
): string[] {
  return [
    `${CASHIER_ACCESS_COOKIE}=${encodeURIComponent(accessToken)}; ${cookieFlags(accessCookieMaxAge(accessToken), secure)}`,
    `${CASHIER_REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; ${cookieFlags(REFRESH_MAX_AGE_DEFAULT, secure)}`,
  ];
}

export function clearCashierCookies(secure: boolean): string[] {
  return [
    `${CASHIER_ACCESS_COOKIE}=; ${cookieFlags(0, secure)}`,
    `${CASHIER_REFRESH_COOKIE}=; ${cookieFlags(0, secure)}`,
  ];
}
