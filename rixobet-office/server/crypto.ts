import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_KEY = 32;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashSecret(pepper: string, secret: string): string {
  return createHmac('sha256', pepper).update(secret).digest('base64url');
}

export function secretsMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEY, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = parts[1];
  const expected = parts[2];
  if (!salt || !expected) return false;
  const hash = scryptSync(password, Buffer.from(salt, 'base64url'), SCRYPT_KEY, { N: 16384, r: 8, p: 1 });
  return secretsMatch(hash.toString('base64url'), expected);
}

export function dummyPasswordHash(): string {
  return hashPassword(randomToken(24));
}

function encodeBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(input: string): Buffer | null {
  const normalized = input.replace(/=+$/g, '').toUpperCase();
  if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) return null;
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = BASE32.indexOf(char);
    if (index < 0) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function createMfaSecret(): string {
  return encodeBase32(randomBytes(20));
}

function hotp(secret: Buffer, counter: number): string {
  const payload = Buffer.alloc(8);
  payload.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(payload).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

export function totpCode(secret: string, now: number, stepSeconds = 30): { code: string; step: number } | null {
  const decoded = decodeBase32(secret);
  if (!decoded) return null;
  const step = Math.floor(now / 1000 / stepSeconds);
  return { code: hotp(decoded, step), step };
}

export function totpMatches(secret: string, code: string, now: number, lastStep: number | null): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const decoded = decodeBase32(secret);
  if (!decoded) return null;
  const step = Math.floor(now / 1000 / 30);
  for (const candidate of [step - 1, step, step + 1]) {
    if (candidate < 0 || (lastStep !== null && candidate <= lastStep)) continue;
    if (secretsMatch(hotp(decoded, candidate), code)) return candidate;
  }
  return null;
}

export function passwordAccepted(password: string): boolean {
  return password.length >= 12 && password.length <= 128 && !/[\u0000-\u001F]/.test(password);
}

export function emailAccepted(email: string): boolean {
  return email.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
