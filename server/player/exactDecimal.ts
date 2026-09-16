import { staffError } from '../staff/errors.js';

const MAX_EXACT_DECIMAL_CHARS = 40;
const EXACT_POSITIVE_DECIMAL_RE = /^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/;

export function parseExactPositiveDecimal(value: unknown, invalidCode: string): string {
  if (typeof value !== 'string') {
    throw staffError(invalidCode, 400);
  }
  const raw = value.trim();
  if (!raw) throw staffError(invalidCode, 400);
  if (raw.length > MAX_EXACT_DECIMAL_CHARS) throw staffError(invalidCode, 400);
  if (/[eE+]/.test(raw) || raw.includes('Infinity') || raw.includes('NaN')) {
    throw staffError(invalidCode, 400);
  }
  if (raw.startsWith('-')) throw staffError(invalidCode, 400);
  if (!EXACT_POSITIVE_DECIMAL_RE.test(raw)) throw staffError(invalidCode, 400);
  if (!/[1-9]/.test(raw)) throw staffError(invalidCode, 400);
  return raw;
}

export const parseExactPositiveDecimalString = parseExactPositiveDecimal;
