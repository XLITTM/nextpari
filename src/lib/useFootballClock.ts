import { useEffect, useState } from 'react';
import type { FootballLiveClock } from './footballClock';

export function useFootballClockNow(clock: FootballLiveClock | null | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  const ticking = Boolean(clock?.running && !clock.stale);
  useEffect(() => {
    if (!ticking) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ticking, clock?.observedAt]);
  return now;
}
