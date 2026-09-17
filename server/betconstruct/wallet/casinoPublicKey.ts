import { createHash, timingSafeEqual } from 'node:crypto';
import { ordinalKeySort } from './canonicalKeys.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const key of ordinalKeySort(Object.keys(value))) {
    if (key === 'PublicKey' || key === 'publicKey') continue;
    out[key] = sortJson(value[key]);
  }
  return out;
}

/** Canonical JSON: properties ordered by name, PublicKey excluded. */
export function casinoCanonicalJson(body: Record<string, unknown>): string {
  return JSON.stringify(sortJson(body));
}

export function casinoPublicKey(body: Record<string, unknown>, sharedKey: string): string {
  return createHash('sha256')
    .update(casinoCanonicalJson(body) + String(sharedKey ?? ''), 'utf8')
    .digest('hex');
}

export function casinoPublicKeyIsValid(
  body: Record<string, unknown>,
  sharedKey: string,
  provided: unknown,
): boolean {
  const incoming = String(provided ?? '');
  if (!incoming || !sharedKey) return false;
  const expected = casinoPublicKey(body, sharedKey);
  const left = Buffer.from(incoming.toLowerCase());
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
