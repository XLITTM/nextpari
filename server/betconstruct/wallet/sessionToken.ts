import { randomBytes } from 'node:crypto';

export const CASINO_SESSION_TOKEN_MAX_LEN = 50;

/** Cryptographically random Operator session token. Returned once; never stored raw. */
export function createCasinoSessionToken(): string {
  const token = randomBytes(24).toString('base64url');
  if (!token || token.length > CASINO_SESSION_TOKEN_MAX_LEN) {
    throw new Error('SESSION_TOKEN_INVALID');
  }
  return token;
}
