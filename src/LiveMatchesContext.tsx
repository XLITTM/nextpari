import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  applyFootballQuotes,
  fetchFootballFeed,
  fetchFootballQuotes,
  footballQuoteIds,
  mergeListedMatches,
} from './lib/footballFeed';
import { useSportsStore } from './stores/sportsStore';
import type { MatchEvent } from './types';

interface LiveMatchesContextValue {
  liveMatches: MatchEvent[];
  upcomingMatches: MatchEvent[];
  loading: boolean;
  refresh: () => Promise<void>;
  ensurePrices: (ids: string[]) => Promise<void>;
  findMatch: (id: string) => MatchEvent | undefined;
}

const EMPTY_MATCHES: MatchEvent[] = [];

const LiveMatchesContext = createContext<LiveMatchesContextValue | null>(null);

export function LiveMatchesProvider({ children }: { children: ReactNode }) {
  const clearEvents = useSportsStore((s) => s.clearEvents);
  const [matches, setMatches] = useState<MatchEvent[]>(EMPTY_MATCHES);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const latest = useRef<MatchEvent[]>(EMPTY_MATCHES);

  const applyQuotes = useCallback(async (ids: string[], ticket: number) => {
    if (!ids.length || ticket !== generation.current) return;
    const quotes = await fetchFootballQuotes(ids);
    if (ticket !== generation.current) return;
    latest.current = applyFootballQuotes(latest.current, quotes);
    setMatches(latest.current);
    return quotes;
  }, []);

  const ensurePrices = useCallback(async (ids: string[]) => {
    const ticket = generation.current;
    await applyQuotes(ids.filter((id) => /^\d{1,20}$/.test(id)).slice(0, 8), ticket);
  }, [applyQuotes]);

  const refresh = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true);
    try {
      const listed = await fetchFootballFeed();
      if (ticket !== generation.current) return;
      const merged = mergeListedMatches(latest.current, listed);
      latest.current = merged;
      setMatches(merged);
      const plan = footballQuoteIds(merged);
      const first = await applyQuotes(plan.primary, ticket);
      const limited = first?.some((quote) => quote.priceState === 'rate_limited' || quote.priceState === 'deferred');
      if (!limited) await applyQuotes(plan.secondary, ticket);
    } catch {
      if (ticket === generation.current) {
        setMatches((current) => current);
      }
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }, [applyQuotes]);

  useEffect(() => {
    clearEvents();
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [clearEvents, refresh]);

  const archive = useRef(new Map<string, MatchEvent>());
  for (const match of matches) {
    if (match.feedTag === 'betsapi') archive.current.set(match.id, match);
  }
  const findMatch = useCallback(
    (id: string) => matches.find((match) => match.id === id) ?? archive.current.get(id),
    [matches],
  );
  const liveMatches = matches.filter((match) => match.isLive);
  const upcomingMatches = matches.filter((match) => !match.isLive);

  const value = useMemo<LiveMatchesContextValue>(
    () => ({
      liveMatches,
      upcomingMatches,
      loading,
      refresh,
      ensurePrices,
      findMatch,
    }),
    [ensurePrices, findMatch, liveMatches, loading, refresh, upcomingMatches],
  );

  return <LiveMatchesContext.Provider value={value}>{children}</LiveMatchesContext.Provider>;
}

export function useLiveMatches() {
  const ctx = useContext(LiveMatchesContext);
  if (!ctx) throw new Error('useLiveMatches must be used within LiveMatchesProvider');
  return ctx;
}
