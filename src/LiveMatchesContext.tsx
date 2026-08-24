import { createContext, useContext, useMemo, useCallback, type ReactNode } from 'react';
import { isLineEvent, isLive } from './lib/betsapi';
import { matchEventFromStore } from './lib/liveMatches';
import { useEventsList } from './hooks/useEventsList';
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
      return Object.values(eventsMap ?? {}).flatMap((row) => {
        try {
          return row?.event && isLive(row.event) ? [matchEventFromStore(row)] : [];
        } catch {
          return [];
        }
      });
    } catch {
      return [];
    }
  }, [eventsMap]);

  const upcomingMatches = useMemo(() => {
    try {
      return Object.values(eventsMap ?? {}).flatMap((row) => {
        try {
          return row?.event && isLineEvent(row.event) ? [matchEventFromStore(row)] : [];
        } catch {
          return [];
        }
      });
    } catch {
      return [];
    }
  }, [eventsMap]);

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
