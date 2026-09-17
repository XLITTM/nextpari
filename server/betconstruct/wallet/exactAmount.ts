export const DISPLAY_SCALE: Record<string, number> = {
  TMT: 2,
  USD: 2,
  TRY: 2,
  UZS: 0,
  RUB: 2,
  KZT: 2,
};

const EXACT_NONNEGATIVE_RE = /^(0|[1-9]\d*)(\.\d+)?$/;

export function fractionScale(exact: string): number {
  const dot = exact.indexOf('.');
  return dot < 0 ? 0 : exact.length - dot - 1;
}

export function displayScaleOf(displayCurrency: string): number {
  const scale = DISPLAY_SCALE[displayCurrency];
  if (scale == null) throw new Error('CURRENCY_UNSUPPORTED');
  return scale;
}

/**
 * Canonical provider amount. No trim, no rounding, no scientific notation.
 * JSON numbers are accepted only when String(n) is already a canonical decimal.
 */
export function parseExactNonNegativeAmount(value: unknown): string {
  if (typeof value === 'string') {
    if (!EXACT_NONNEGATIVE_RE.test(value)) throw new Error('AMOUNT_INVALID');
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || Object.is(value, -0)) {
      throw new Error('AMOUNT_INVALID');
    }
    const raw = Number.isInteger(value) ? String(value) : String(value);
    if (!EXACT_NONNEGATIVE_RE.test(raw)) throw new Error('AMOUNT_INVALID');
    return raw;
  }
  throw new Error('AMOUNT_INVALID');
}

export function assertExactScale(exact: string, displayCurrency: string): string {
  if (fractionScale(exact) > displayScaleOf(displayCurrency)) {
    throw new Error('AMOUNT_SCALE_INVALID');
  }
  return exact;
}

export function isExactZero(exact: string): boolean {
  return exact === '0' || /^0\.0+$/.test(exact);
}

export function requirePositiveExactAmount(value: unknown, displayCurrency: string): string {
  if (value === undefined || value === null) throw new Error('AMOUNT_INVALID');
  const exact = parseExactNonNegativeAmount(value);
  if (isExactZero(exact)) throw new Error('AMOUNT_INVALID');
  return assertExactScale(exact, displayCurrency);
}

export function requireMandatoryAmount(body: Record<string, unknown>, field: string, displayCurrency: string): string {
  if (!Object.prototype.hasOwnProperty.call(body, field)) throw new Error('AMOUNT_INVALID');
  return requirePositiveExactAmount(body[field], displayCurrency);
}

export function requireMandatoryNonNegativeAmount(
  body: Record<string, unknown>,
  field: string,
  displayCurrency: string,
): string {
  if (!Object.prototype.hasOwnProperty.call(body, field)) throw new Error('AMOUNT_INVALID');
  const exact = parseExactNonNegativeAmount(body[field]);
  return assertExactScale(exact, displayCurrency);
}

export function toMinorUnits(exact: string, scale: number): bigint {
  const negative = exact.startsWith('-');
  const raw = negative ? exact.slice(1) : exact;
  if (!EXACT_NONNEGATIVE_RE.test(raw)) throw new Error('AMOUNT_INVALID');
  if (fractionScale(raw) > scale) throw new Error('AMOUNT_SCALE_INVALID');
  const [whole, fraction = ''] = raw.split('.');
  const minor = BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0') || '0');
  return negative ? -minor : minor;
}

export function fromMinorUnits(minor: bigint, scale: number): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  if (scale === 0) return `${negative ? '-' : ''}${abs.toString()}`;
  const base = 10n ** BigInt(scale);
  const whole = abs / base;
  const fraction = abs % base;
  return `${negative ? '-' : ''}${whole.toString()}.${fraction.toString().padStart(scale, '0')}`;
}

export function negateExact(exact: string): string {
  if (isExactZero(exact)) return exact;
  return exact.startsWith('-') ? exact.slice(1) : `-${exact}`;
}

export function exactToNumber(exact: string): number {
  const n = Number(exact);
  if (!Number.isFinite(n)) throw new Error('AMOUNT_INVALID');
  return n;
}
