import {
  BETCONSTRUCT_SPORTS_TS_FUTURE_SKEW_SEC,
  BETCONSTRUCT_SPORTS_TS_MAX_AGE_SEC,
} from './constants.js';

export function parseSportsTs(value: unknown): number {
  const ts = typeof value === 'number' ? value : Number(String(value ?? ''));
  if (!Number.isInteger(ts) || ts <= 0) {
    throw new Error('TS_INVALID');
  }
  return ts;
}

/** TS is Unix seconds UTC. Stale >20s is rejected. Future skew is capped at 2s. */
export function assertSportsTsFresh(
  ts: unknown,
  nowMs: number = Date.now(),
): number {
  const unix = parseSportsTs(ts);
  const nowSec = Math.floor(nowMs / 1000);
  if (nowSec - unix > BETCONSTRUCT_SPORTS_TS_MAX_AGE_SEC) {
    throw new Error('TS_STALE');
  }
  if (unix - nowSec > BETCONSTRUCT_SPORTS_TS_FUTURE_SKEW_SEC) {
    throw new Error('TS_FUTURE');
  }
  return unix;
}
