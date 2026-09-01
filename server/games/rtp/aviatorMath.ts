import { createHash, createHmac } from 'node:crypto';

export const AVIATOR_MATH_VERSION = 'aviator-v2-rtp875';
export const AVIATOR_RTP_TARGET = 0.875;
export const AVIATOR_MIN_CRASH = 1;
export const AVIATOR_MAX_CRASH = 1_000_000;
export const AVIATOR_GROWTH_COEFF = 0.06;
export const AVIATOR_GROWTH_EXP = 1.7;
export const AVIATOR_FIXED_CASHOUTS = [1.1, 1.2, 1.5, 2, 3, 5, 10] as const;

export function aviatorCrashFromUnit(unit: number): number {
  const u = Math.min(Math.max(unit, 1e-12), 0.999999999999);
  const raw = Math.floor((AVIATOR_RTP_TARGET / u) * 100) / 100;
  return Math.min(AVIATOR_MAX_CRASH, Math.max(AVIATOR_MIN_CRASH, raw));
}

export function aviatorCrashFromSessionSeed(serverSeed: string): number {
  const hex = createHmac('sha256', serverSeed).update('session:crash:1').digest('hex').slice(0, 13);
  const bits = Number.parseInt(hex, 16);
  const e = Math.min(bits / 2 ** 52, 0.999999999999);
  return aviatorCrashFromUnit(Math.max(e, 1e-12));
}

export function aviatorServerSeedHash(serverSeed: string): string {
  return createHash('sha256').update(serverSeed, 'utf8').digest('hex');
}

export const AVIATOR_PUBLIC_LIVE_KEYS = [
  'ok',
  'sessionId',
  'gameCode',
  'state',
  'serverNow',
  'bettingClosesAt',
  'startsAt',
  'serverSeedHash',
  'mathVersion',
  'currentMultiplier',
] as const;

export const AVIATOR_REVEAL_ONLY_KEYS = ['crashAt', 'crashPoint', 'serverSeed'] as const;

export type AviatorSessionState = 'betting' | 'flying' | 'crashed';

export interface AviatorSessionPublicInput {
  sessionId: string;
  state: AviatorSessionState;
  serverNow: string;
  bettingClosesAt: string;
  startsAt: string;
  crashAt: string | null;
  serverSeedHash: string;
  mathVersion: string;
  currentMultiplier: number;
  crashPoint: number | null;
  serverSeed: string | null;
}

export function aviatorSessionPublic(input: AviatorSessionPublicInput): Record<string, unknown> {
  const reveal = input.state === 'crashed';
  return {
    ok: true,
    sessionId: input.sessionId,
    gameCode: 'aviator',
    state: input.state,
    serverNow: input.serverNow,
    bettingClosesAt: input.bettingClosesAt,
    startsAt: input.startsAt,
    crashAt: reveal ? input.crashAt : null,
    serverSeedHash: input.serverSeedHash,
    mathVersion: input.mathVersion,
    currentMultiplier: input.currentMultiplier,
    crashPoint: reveal ? input.crashPoint : null,
    serverSeed: reveal ? input.serverSeed : null,
  };
}

export function aviatorPublicLeaksCrashBeforeReveal(body: Record<string, unknown>): boolean {
  if (body.state === 'crashed') return false;
  if (body.crashAt != null) return true;
  if (body.crashPoint != null) return true;
  if (body.serverSeed != null) return true;
  if (body.timeToCrash != null) return true;
  if (body.crash_at != null) return true;
  return false;
}

export function aviatorSurvivalExact(cashout: number): number {
  if (cashout <= 1) return 1;
  return Math.min(1, AVIATOR_RTP_TARGET / cashout);
}

export function aviatorFixedCashoutExactRtp(cashout: number): number {
  return aviatorSurvivalExact(cashout) * cashout;
}

export function aviatorMultiplierAt(seconds: number): number {
  const t = Math.max(0, seconds);
  return Number((1 + AVIATOR_GROWTH_COEFF * t ** AVIATOR_GROWTH_EXP).toFixed(4));
}

export function aviatorTimeToReach(multiplier: number): number {
  const delta = Math.max(0, multiplier - 1);
  if (delta <= 0) return 0;
  return (delta / AVIATOR_GROWTH_COEFF) ** (1 / AVIATOR_GROWTH_EXP);
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rounding-aware RTP for floor-to-2-decimals crash points. */
export function aviatorSimulatedFixedRtp(cashout: number, rounds = 200_000, seed = 31_031): number {
  const rand = mulberry32(seed + Math.round(cashout * 100));
  let payout = 0;
  for (let i = 0; i < rounds; i += 1) {
    const crash = aviatorCrashFromUnit(Math.max(rand(), 1e-12));
    if (crash >= cashout) payout += cashout;
  }
  return payout / rounds;
}
