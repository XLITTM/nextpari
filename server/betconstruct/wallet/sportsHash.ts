import { createHash, timingSafeEqual } from 'node:crypto';
import { BETCONSTRUCT_SPORTS_HASH_FIELDS } from './constants.js';

export type SportsHashMethod = keyof typeof BETCONSTRUCT_SPORTS_HASH_FIELDS;

function isPresent(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.length > 0;
  return true;
}

function asConcatValue(value: unknown): string {
  return String(value);
}

export function sportsbookHashPayload(
  method: SportsHashMethod,
  params: Record<string, unknown>,
  sharedKey: string,
): string {
  const key = String(sharedKey ?? '');
  let concat = '';
  for (const field of BETCONSTRUCT_SPORTS_HASH_FIELDS[method]) {
    const value = params[field];
    if (!isPresent(value)) continue;
    concat += field + asConcatValue(value);
  }
  concat += key;
  return concat;
}

export function sportsbookMd5Hash(
  method: SportsHashMethod,
  params: Record<string, unknown>,
  sharedKey: string,
): string {
  return createHash('md5').update(sportsbookHashPayload(method, params, sharedKey), 'utf8').digest('hex');
}

export function sportsbookHashIsValid(
  method: SportsHashMethod,
  params: Record<string, unknown>,
  sharedKey: string,
  providedHash: unknown,
): boolean {
  const incoming = String(providedHash ?? '');
  if (!incoming || !sharedKey) return false;
  const expected = sportsbookMd5Hash(method, params, sharedKey);
  const left = Buffer.from(incoming.toLowerCase());
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
