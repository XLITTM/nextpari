import { staffError } from '../staff/errors.js';

const WINDOW_MS = 60_000;
const MAX_LOOKUP = 20;
const MAX_CONFIRM = 10;

const hits = new Map<string, number[]>();

function prune(key: string, now: number): number[] {
  const windowStart = now - WINDOW_MS;
  const next = (hits.get(key) ?? []).filter((ts) => ts > windowStart);
  hits.set(key, next);
  return next;
}

export function assertCashierPayoutRateLimit(
  authUserId: string,
  kind: 'lookup' | 'confirm',
): void {
  const id = String(authUserId ?? '').trim();
  if (!id) throw staffError('AUTH_REQUIRED', 401);
  const key = `${kind}:${id}`;
  const now = Date.now();
  const prev = prune(key, now);
  const max = kind === 'lookup' ? MAX_LOOKUP : MAX_CONFIRM;
  if (prev.length >= max) {
    throw staffError('PAYOUT_RATE_LIMITED', 429);
  }
  prev.push(now);
  hits.set(key, prev);
}
