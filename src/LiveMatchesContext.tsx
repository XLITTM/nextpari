import { createContext, useContext, useMemo, useEffect, useCallback, type ReactNode } from 'react';
import { isLive } from './lib/betsapi';
import { matchEventFromNormalized, matchEventFromStore } from './lib/liveMatches';
import { USE_MOCK } from './lib/mockSports';
import { useEventsList } from './hooks/useEventsList';
import { getLiveCatalog, startSportsFeed } from './services/sportsWorker';
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

  const liveMatches = useMemo(() => {
    try {
      const rows = Object.values(eventsMap ?? {}).flatMap((row) => {
        try {
          return row?.event && isLive(row.event) ? [matchEventFromStore(row)] : [];
        } catch {
          return [];
        }
      });
      if (rows.length) return rows;
      return getLiveCatalog().live.map(matchEventFromNormalized);
    } catch {
      return [];
    }
  }, [eventsMap]);
  const upcomingMatches = useMemo(() => {
    try {
      const rows = Object.values(eventsMap ?? {}).flatMap((row) => {
        try {
          return row?.event?.time_status === '0' ? [matchEventFromStore(row)] : [];
        } catch {
          return [];
        }
      });
      if (rows.length) return rows;
      return getLiveCatalog().upcoming.map(matchEventFromNormalized);
    } catch {
      return [];
    }
  }, [eventsMap]);

  useEffect(() => {
    if (USE_MOCK) return;
    return startSportsFeed(30_000);
  }, []);

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
