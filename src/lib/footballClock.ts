import type { MatchEvent } from '../types';

export const FOOTBALL_CLOCK_STALE_MS = 90_000;

export type FootballLiveClock = NonNullable<MatchEvent['liveClock']>;

export function presentedFootballClock(
  clock: FootballLiveClock | null | undefined,
  now = Date.now(),
): FootballLiveClock | null {
  if (!clock) return null;
  if (!Number.isInteger(clock.minute) || clock.minute < 0 || clock.minute > 130) return null;
  if (!Number.isInteger(clock.second) || clock.second < 0 || clock.second > 59) return null;
  const observed = Date.parse(clock.observedAt);
  const age = now - observed;
  if (!Number.isFinite(observed) || clock.stale || age > FOOTBALL_CLOCK_STALE_MS || age < -5_000) {
    return { ...clock, running: false, stale: true };
  }
  if (!clock.running) return { ...clock, running: false, stale: false };
  const advanced = clock.minute * 60 + clock.second + Math.floor(age / 1000);
  if (advanced < 0 || advanced > 130 * 60 + 59) return { ...clock, running: false, stale: true };
  return {
    ...clock,
    minute: Math.floor(advanced / 60),
    second: advanced % 60,
    running: true,
    stale: false,
  };
}

export function footballClockLabel(clock: FootballLiveClock | null | undefined, now = Date.now()): string | null {
  const shown = presentedFootballClock(clock, now);
  if (!shown) return null;
  return `${shown.minute}:${String(shown.second).padStart(2, '0')}`;
}
