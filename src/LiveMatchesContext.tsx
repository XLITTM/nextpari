import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
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

  useEffect(() => {
    clearEvents();
  }, [clearEvents]);

  const refresh = useCallback(async () => {}, []);
  const findMatch = useCallback((_id: string) => undefined, []);

  const value = useMemo<LiveMatchesContextValue>(
    () => ({
      liveMatches: EMPTY_MATCHES,
      upcomingMatches: EMPTY_MATCHES,
      loading: false,
      refresh,
      findMatch,
    }),
    [refresh, findMatch],
  );

  return <LiveMatchesContext.Provider value={value}>{children}</LiveMatchesContext.Provider>;
}

export function useLiveMatches() {
  const ctx = useContext(LiveMatchesContext);
  if (!ctx) throw new Error('useLiveMatches must be used within LiveMatchesProvider');
  return ctx;
}
