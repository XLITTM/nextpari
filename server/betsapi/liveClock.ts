import type { LiveClock } from './types.js';

export const LIVE_CLOCK_STALE_MS = 90_000;
const MAX_MINUTE = 130;

function integer(value: unknown, max: number): number | null {
  if (typeof value === 'boolean' || value == null || value === '') return null;
  const text = String(value).trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed > max) return null;
  return parsed;
}

function ticking(value: unknown): boolean {
  return value === 1 || value === '1';
}

export function footballLiveClock(timer: unknown, observedAtMs?: number): LiveClock | null {
  if (!timer || typeof timer !== 'object' || Array.isArray(timer)) return null;
  const row = timer as Record<string, unknown>;
  const minute = integer(row.tm, MAX_MINUTE);
  const second = integer(row.ts, 59);
  if (minute == null || second == null || observedAtMs == null || !Number.isFinite(observedAtMs)) return null;
  const observedAt = new Date(observedAtMs).toISOString();
  if (Number.isNaN(Date.parse(observedAt))) return null;
  return {
    minute,
    second,
    running: ticking(row.tt),
    observedAt,
    stale: false,
  };
}

export function publishLiveClock(clock: LiveClock | null | undefined, now: number): LiveClock | null {
  if (!clock) return null;
  const observed = Date.parse(clock.observedAt);
  const age = now - observed;
  if (!Number.isFinite(observed) || age > LIVE_CLOCK_STALE_MS || age < -5_000) {
    return { ...clock, running: false, stale: true };
  }
  return { ...clock, stale: false };
}
