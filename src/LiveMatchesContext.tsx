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
  featuredLive: MatchEvent[];
  featuredLine: MatchEvent[];
  scheduleMatches: MatchEvent[];
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
  const [groups, setGroups] = useState({ live: [] as string[], line: [] as string[], schedule: [] as string[] });
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const latest = useRef<MatchEvent[]>(EMPTY_MATCHES);
  const attempted = useRef(new Set<string>());

  const applyQuotes = useCallback(async (ids: string[], ticket: number) => {
    const unique = ids.filter((id) => /^(?:\d{1,20}|oddspapi-v5:id\d{8,32})$/.test(id) && !attempted.current.has(id));
    if (!unique.length || ticket !== generation.current) return;
    for (const id of unique) attempted.current.add(id);
    const quotes = await fetchFootballQuotes(unique);
    if (ticket !== generation.current) return;
    latest.current = applyFootballQuotes(latest.current, quotes);
    setMatches(latest.current);
    return quotes;
  }, []);

  const ensurePrices = useCallback(async (ids: string[]) => {
    const ticket = generation.current;
    await applyQuotes(ids, ticket);
  }, [applyQuotes]);

  const refresh = useCallback(async () => {
    const ticket = ++generation.current;
    attempted.current = new Set();
    setLoading(true);
    try {
      const listed = await fetchFootballFeed();
      if (ticket !== generation.current) return;
      const merged = mergeListedMatches(latest.current, listed.events);
      latest.current = merged;
      setMatches(merged);
      setGroups({
        live: listed.featuredLive.map((match) => match.id),
        line: listed.featuredLine.map((match) => match.id),
        schedule: listed.schedule.map((match) => match.id),
      });
      const hydrateRest = async () => {
        for (;;) {
          if (ticket !== generation.current) return;
          const plan = footballQuoteIds(latest.current, attempted.current);
          if (!plan.primary.length) return;
          const batch = await applyQuotes(plan.primary, ticket);
          const limited = batch?.some((quote) => quote.priceState === 'rate_limited' || quote.priceState === 'deferred');
          if (limited) return;
          if (!batch?.length) return;
        }
      };
      const plan = footballQuoteIds(merged, attempted.current);
      const first = await applyQuotes(plan.primary, ticket);
      const limited = first?.some((quote) => quote.priceState === 'rate_limited' || quote.priceState === 'deferred');
      if (!limited) {
        if (plan.secondary.length) await applyQuotes(plan.secondary, ticket);
        void hydrateRest();
      }
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
