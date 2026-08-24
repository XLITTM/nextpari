import { useCallback, useEffect, useRef } from 'react';
import { fetchEventOdds, pickClockFromOdds } from '@/lib/betsapi';
import { parseDelta, parseOdds } from '@/lib/odds-parser';
import { enrichProviderMarkets } from '@/lib/matchOdds';
import { useSportsStore } from '@/stores/sportsStore';

function toSinceTime(value: number): number | undefined {
  if (!value) return undefined;
  const unix = value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  return unix > 0 ? unix : undefined;
}

function marketCount(eventId: string): number {
  return Object.keys(useSportsStore.getState().getEvent(eventId)?.markets ?? {}).length;
}

export function useLiveOdds(eventId: string | undefined, isLive = true) {
  const intervalRef = useRef<number | null>(null);
  const retryRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fullLoadDoneRef = useRef(false);
  const setOdds = useSportsStore((s) => s.setOdds);
  const setScore = useSportsStore((s) => s.setScore);
  const lastFetchAt = useSportsStore((s) => (eventId ? s.events[eventId]?.lastFetchAt ?? 0 : 0));

  const tick = useCallback(async (fullLoad = false) => {
    if (!eventId) return;
    const state = useSportsStore.getState().getEvent(eventId);
    const since = fullLoad ? undefined : toSinceTime(state?.lastOddsUpdate ?? 0);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;
    try {
      const { odds, stats, clock } = await fetchEventOdds(eventId, since, signal);
      console.log('[useLiveOdds] results.odds keys', Object.keys(odds), { eventId, fullLoad, since, clock });
      if (signal.aborted || !Object.keys(odds).length) return;
      const sportId = state?.event.sport_id;
      let markets = enrichProviderMarkets(parseOdds(odds, { sportId }), odds, sportId);
      if (fullLoad) {
        const mainCount = markets.filter((row) => row.category === 'main').length;
        console.log('[useLiveOdds] parsed', {
          total: markets.length,
          main: mainCount,
          categories: markets.map((row) => `${row.marketId}:${row.category}:${row.name}`),
        });
        if (mainCount === 0) {
          console.log('[useLiveOdds] no category=main after fullLoad — API did not return 1/2/3 for this event');
        }
      }
      const first = Object.values(odds)[0]?.[0];
      const ss =
        (stats && typeof stats === 'object' && 'ss' in stats ? String(stats.ss ?? '') : '') ||
        (first && typeof first === 'object' && first && 'ss' in first ? String(first.ss ?? '') : '') ||
        state?.score;
      const time =
        clock ||
        pickClockFromOdds(odds, stats) ||
        (stats && typeof stats === 'object' && 'time_str' in stats ? String(stats.time_str ?? '') : '') ||
        (first && typeof first === 'object' && first && 'time_str' in first ? String(first.time_str ?? '') : '');
      if (since) {
        const prev = state?.markets ?? {};
        const delta = parseDelta(odds, prev, { sportId });
        if (!delta.changed.length) {
          if (ss || time) setScore(eventId, ss || state?.score || '-', time);
          return;
        }
        markets = enrichProviderMarkets(delta.markets, odds, sportId);
      }
      if (ss || time) setScore(eventId, ss || state?.score || '-', time);
      const updateTs = Number(
        first && typeof first === 'object' && first && 'odds_update' in first ? first.odds_update : Date.now() / 1000,
      );
      setOdds(eventId, markets, updateTs);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (e instanceof Error && e.name !== 'AbortError') console.warn('odds poll', e.message);
    }
  }, [eventId, setOdds, setScore]);

  useEffect(() => {
    if (!eventId) return;
    fullLoadDoneRef.current = false;
    if (retryRef.current) {
      window.clearTimeout(retryRef.current);
      retryRef.current = null;
    }

    const bootstrap = async () => {
      await tick(true);
      if (marketCount(eventId) < 5) {
        retryRef.current = window.setTimeout(() => {
          void tick(true);
        }, 1000);
      }
      fullLoadDoneRef.current = true;
    };
    void bootstrap();

    const ms = isLive ? 3000 : 10_000;
    intervalRef.current = window.setInterval(() => {
      if (!fullLoadDoneRef.current) return;
      void tick(false);
    }, ms);

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      if (retryRef.current) window.clearTimeout(retryRef.current);
      abortRef.current?.abort();
    };
  }, [eventId, isLive, tick]);

  return { lastUpdate: lastFetchAt };
}
