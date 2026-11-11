import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchFootballFeed } from './lib/footballFeed';
import { useSportsStore } from './stores/sportsStore';
import type { MatchEvent } from './types';

interface LiveMatchesContextValue {
  liveMatches: MatchEvent[];
  upcomingMatches: MatchEvent[];
  loading: boolean;
  refresh: () => Promise<void>;
  findMatch: (id: string) => MatchEvent | undefined;
}

const EMPTY_MATCHES: MatchEvent[] = [];

const LiveMatchesContext = createContext<LiveMatchesContextValue | null>(null);

export function LiveMatchesProvider({ children }: { children: ReactNode }) {
  const clearEvents = useSportsStore((s) => s.clearEvents);
  const [matches, setMatches] = useState<MatchEvent[]>(EMPTY_MATCHES);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setMatches(await fetchFootballFeed());
    } catch {
      setMatches(EMPTY_MATCHES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearEvents();
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [clearEvents, refresh]);

  const findMatch = useCallback((id: string) => matches.find((match) => match.id === id), [matches]);
  const liveMatches = matches.filter((match) => match.isLive);
  const upcomingMatches = matches.filter((match) => !match.isLive);

  const value = useMemo<LiveMatchesContextValue>(
    () => ({
      liveMatches,
      upcomingMatches,
      loading,
      refresh,
      findMatch,
    }),
    [findMatch, liveMatches, loading, refresh, upcomingMatches],
  );

  return <LiveMatchesContext.Provider value={value}>{children}</LiveMatchesContext.Provider>;
}

export function useLiveMatches() {
  const ctx = useContext(LiveMatchesContext);
  if (!ctx) throw new Error('useLiveMatches must be used within LiveMatchesProvider');
  return ctx;
}
