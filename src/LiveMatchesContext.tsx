import { createContext, useContext, useMemo, useEffect, useCallback, type ReactNode } from 'react';
import { isLive } from './lib/betsapi';
import { matchEventFromStore } from './lib/liveMatches';
import { useEventsList } from './hooks/useEventsList';
import { startSportsFeed } from './services/sportsWorker';
import { useSportsStore } from './stores/sportsStore';
import type { MatchEvent } from './types';

interface LiveMatchesContextValue {
  liveMatches: MatchEvent[];
  upcomingMatches: MatchEvent[];
  loading: boolean;
  refresh: () => Promise<void>;
  findMatch: (id: string) => MatchEvent | undefined;
}

const LiveMatchesContext = createContext<LiveMatchesContextValue | null>(null);

export function LiveMatchesProvider({ children }: { children: ReactNode }) {
  const { loading, refresh } = useEventsList('live', 'all');
  const eventsMap = useSportsStore((s) => s.events);

  const liveMatches = useMemo(
    () =>
      Object.values(eventsMap)
        .filter((row) => isLive(row.event))
        .map(matchEventFromStore),
    [eventsMap],
  );
  const upcomingMatches = useMemo(
    () =>
      Object.values(eventsMap)
        .filter((row) => row.event.time_status === '0')
        .map(matchEventFromStore),
    [eventsMap],
  );

  useEffect(() => startSportsFeed(120_000), []);

  const findMatch = useCallback(
    (id: string) => liveMatches.find((match) => match.id === id) ?? upcomingMatches.find((match) => match.id === id),
    [liveMatches, upcomingMatches],
  );

  return (
    <LiveMatchesContext.Provider value={{ liveMatches, upcomingMatches, loading, refresh, findMatch }}>
      {children}
    </LiveMatchesContext.Provider>
  );
}

export function useLiveMatches() {
  const ctx = useContext(LiveMatchesContext);
  if (!ctx) throw new Error('useLiveMatches must be used within LiveMatchesProvider');
  return ctx;
}
