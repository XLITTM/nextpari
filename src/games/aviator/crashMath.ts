/** House edge 4% → numerator 96 in the 99/(1-e) family of crash formulas. */
export const HOUSE_EDGE = 0.04;
export const EDGE_NUMERATOR = Math.round(100 * (1 - HOUSE_EDGE));
export const MIN_MULTIPLIER = 1;
export const GROWTH_COEFF = 0.06;
export const GROWTH_EXP = 1.7;

export interface FairSeeds {
  serverSeed: string;
  clientSeed: string;
  nonce: number;
}

export interface CrashRound {
  crashPoint: number;
  hash: string;
  seeds: FairSeeds;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomHex(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

export async function hmacSha256Hex(serverSeed: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(serverSeed),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return bytesToHex(new Uint8Array(sig));
}

/**
 * Provably fair crash point.
 * HMAC_SHA256(serverSeed, clientSeed:nonce) → first 52 bits as e ∈ [0, 1).
 * X = max(1.00, floor(96 / (1 - e)) / 100)
 */
export function crashPointFromHash(hash: string): number {
  const slice = hash.replace(/^0x/i, '').slice(0, 13);
  const bits = Number.parseInt(slice, 16);
  if (!Number.isFinite(bits)) return MIN_MULTIPLIER;
  const e = Math.min(bits / 2 ** 52, 0.999999999999);
  const raw = Math.floor(EDGE_NUMERATOR / (1 - e)) / 100;
  return Math.max(MIN_MULTIPLIER, Number(raw.toFixed(2)));
}

export async function resolveCrashRound(seeds: FairSeeds): Promise<CrashRound> {
  const message = `${seeds.clientSeed}:${seeds.nonce}`;
  const hash = await hmacSha256Hex(seeds.serverSeed, message);
  return {
    crashPoint: crashPointFromHash(hash),
    hash,
    seeds,
  };
}

/** Multiplier(t) = 1.00 + 0.06 · t^1.7 */
export function multiplierAt(seconds: number): number {
  const t = Math.max(0, seconds);
  return Number((MIN_MULTIPLIER + GROWTH_COEFF * t ** GROWTH_EXP).toFixed(4));
}

export function timeToReach(multiplier: number): number {
  const target = Math.max(MIN_MULTIPLIER, multiplier);
  const delta = target - MIN_MULTIPLIER;
  if (delta <= 0) return 0;
  return (delta / GROWTH_COEFF) ** (1 / GROWTH_EXP);
}

export function formatMultiplier(value: number): string {
  return `${value.toFixed(2)}x`;
}

export function historyTone(value: number): 'blue' | 'purple' | 'gold' {
  if (value >= 10) return 'gold';
  if (value >= 2) return 'purple';
  return 'blue';
}
