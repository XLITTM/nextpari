import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  applyFootballQuotes,
  applyLiveBoard,
  fetchFootballFeed,
  fetchFootballLiveBoard,
  fetchFootballQuotes,
  mergeListedMatches,
} from './lib/footballFeed';
import {
  hasDisplayedMainPrices,
  OddsHydrationQueue,
  type HydrationMatch,
} from './lib/oddsHydration';
import { useSportsStore } from './stores/sportsStore';
import type { MatchEvent } from './types';

interface LiveMatchesContextValue {
  liveMatches: MatchEvent[];
  upcomingMatches: MatchEvent[];
  featuredLive: MatchEvent[];
  featuredLine: MatchEvent[];
  scheduleMatches: MatchEvent[];
  loading: boolean;
  refresh: () => Promise<void>;
  ensurePrices: (ids: string[]) => Promise<void>;
  findMatch: (id: string) => MatchEvent | undefined;
}

const EMPTY_MATCHES: MatchEvent[] = [];
const EVENT_ID = /^(?:\d{1,20}|oddspapi-v5:id\d{8,32})$/;

const LiveMatchesContext = createContext<LiveMatchesContextValue | null>(null);

function hydrationRows(matches: readonly MatchEvent[]): HydrationMatch[] {
  return matches.map((match) => ({
    id: match.id,
    isLive: match.isLive,
    priceState: match.priceState,
    hasPrices: hasDisplayedMainPrices(match),
  }));
}

export function LiveMatchesProvider({ children }: { children: ReactNode }) {
  const clearEvents = useSportsStore((s) => s.clearEvents);
  const [matches, setMatches] = useState<MatchEvent[]>(EMPTY_MATCHES);
  const [groups, setGroups] = useState({ live: [] as string[], line: [] as string[], schedule: [] as string[] });
  const [loading, setLoading] = useState(false);
  const refreshSeq = useRef(0);
  const latest = useRef<MatchEvent[]>(EMPTY_MATCHES);
  const queue = useRef(new OddsHydrationQueue());
  const pumping = useRef(false);
  const pauseUntil = useRef(0);
  const retryTimer = useRef<number>(0);

  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    window.clearTimeout(retryTimer.current);
    try {
      for (;;) {
        const wait = pauseUntil.current - Date.now();
        if (wait > 0) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, wait);
          });
        }
        const rows = hydrationRows(latest.current);
        queue.current.syncCatalog(rows);
        const batch = queue.current.takeBatch(rows);
        if (!batch.length) {
          const retryAt = queue.current.nextRetryAt();
          if (retryAt !== null) {
            retryTimer.current = window.setTimeout(() => {
              void pump();
            }, Math.max(250, retryAt - Date.now()));
          }
          return;
        }
        queue.current.markInFlight(batch);
        const result = await fetchFootballQuotes(batch);
        if (!result.ok) {
          queue.current.markFailed(batch);
          pauseUntil.current = Date.now() + 2_000;
          continue;
        }
        latest.current = applyFootballQuotes(latest.current, result.quotes);
        setMatches(latest.current);
        const seen = new Set(result.quotes.map((quote) => quote.id));
        const byId = new Map(latest.current.map((match) => [match.id, match]));
        let limited = false;
        for (const quote of result.quotes) {
          const match = byId.get(quote.id);
          queue.current.applyQuote(quote.id, {
            priceState: quote.priceState,
            hasPrices: match ? hasDisplayedMainPrices(match) : false,
          });
          if (quote.priceState === 'rate_limited' || quote.priceState === 'deferred') limited = true;
        }
        queue.current.markFailed(batch.filter((id) => !seen.has(id)));
        if (limited) {
          pauseUntil.current = Date.now() + 2_000;
        }
      }
    } finally {
      pumping.current = false;
    }
  }, []);

  const ensurePrices = useCallback(async (ids: string[]) => {
    const valid = ids.filter((id) => EVENT_ID.test(id));
    if (!valid.length) return;
    queue.current.markVisible(valid);
    void pump();
  }, [pump]);

  const refresh = useCallback(async () => {
    const ticket = ++refreshSeq.current;
    setLoading(true);
    try {
      const listed = await fetchFootballFeed();
      if (ticket !== refreshSeq.current) return;
      const merged = mergeListedMatches(latest.current, listed.events);
      latest.current = merged;
      setMatches(merged);
      setGroups({
        live: listed.featuredLive.map((match) => match.id),
        line: listed.featuredLine.map((match) => match.id),
        schedule: listed.schedule.map((match) => match.id),
      });
      queue.current.setFeatured([
        ...listed.featuredLive.map((match) => match.id),
        ...listed.featuredLine.map((match) => match.id),
      ]);
      queue.current.syncCatalog(hydrationRows(merged));
      void pump();
    } catch {
      if (ticket === refreshSeq.current) {
        setMatches((current) => current);
      }
    } finally {
      if (ticket === refreshSeq.current) setLoading(false);
    }
  }, [pump]);

  const refreshBoard = useCallback(async () => {
    if (!latest.current.some((match) => match.isLive)) return;
    const live = await fetchFootballLiveBoard();
    if (!live.length) return;
    latest.current = applyLiveBoard(latest.current, live);
    setMatches(latest.current);
  }, []);

  useEffect(() => {
    clearEvents();
    void refresh();
    const catalogTimer = window.setInterval(() => {
      void refresh();
    }, 60_000);
    const boardTimer = window.setInterval(() => {
      void refreshBoard();
    }, 15_000);
    return () => {
      window.clearInterval(catalogTimer);
      window.clearInterval(boardTimer);
      window.clearTimeout(retryTimer.current);
    };
  }, [clearEvents, refresh, refreshBoard]);

  const archive = useRef(new Map<string, MatchEvent>());
  for (const match of matches) {
    if (match.feedTag === 'betsapi' || match.feedTag === 'oddspapi-v5') archive.current.set(match.id, match);
  }
  const findMatch = useCallback(
    (id: string) => matches.find((match) => match.id === id) ?? archive.current.get(id),
    [matches],
  );
  const liveMatches = matches.filter((match) => match.isLive);
  const upcomingMatches = matches.filter((match) => !match.isLive);
  const byId = new Map(matches.map((match) => [match.id, match]));
  const pick = (ids: string[]) => ids.flatMap((id) => {
    const match = byId.get(id);
    return match ? [match] : [];
  });
  const featuredLive = pick(groups.live);
  const featuredLine = pick(groups.line);
  const scheduleMatches = pick(groups.schedule);

  const value = useMemo<LiveMatchesContextValue>(
    () => ({
      liveMatches,
      upcomingMatches,
      featuredLive,
      featuredLine,
      scheduleMatches,
      loading,
      refresh,
      ensurePrices,
      findMatch,
    }),
    [ensurePrices, featuredLine, featuredLive, findMatch, liveMatches, loading, refresh, scheduleMatches, upcomingMatches],
  );

  return <LiveMatchesContext.Provider value={value}>{children}</LiveMatchesContext.Provider>;
}

export function useLiveMatches() {
  const ctx = useContext(LiveMatchesContext);
  if (!ctx) throw new Error('useLiveMatches must be used within LiveMatchesProvider');
  return ctx;
}
