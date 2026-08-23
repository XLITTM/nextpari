import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BETSAPI_SPORTS, fetchInplay, fetchUpcoming } from '@/lib/betsapi';
import { hydrateCatalogOdds, pickCatalogIds } from '@/lib/hydrateCatalogOdds';
import { useSportsStore } from '@/stores/sportsStore';

export type EventTab = 'live' | 'line';

export function useEventsList(tab: EventTab, sportId = '1') {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventsMap = useSportsStore((s) => s.events);
  const setLiveEvents = useSportsStore((s) => s.setLiveEvents);
  const setUpcomingEvents = useSportsStore((s) => s.setUpcomingEvents);
  const liveAbort = useRef<AbortController | null>(null);
  const lineAbort = useRef<AbortController | null>(null);

  const events = useMemo(() => {
    const rows = Object.values(eventsMap);
    if (tab === 'live') {
      return rows.filter((s) => s.event.time_status === '1' || s.event.our_events === '1').map((s) => s.event);
    }
    return rows.filter((s) => s.event.time_status === '0').map((s) => s.event);
  }, [eventsMap, tab]);

  const loadLive = useCallback(async () => {
    if (liveAbort.current) return;
    liveAbort.current = new AbortController();
    const { signal } = liveAbort.current;
    const ids = sportId === 'all' ? BETSAPI_SPORTS.map((row) => String(row.sportId)) : [sportId];
    try {
      const live = [];
      for (const id of ids) {
        if (signal.aborted) return;
        live.push(...(await fetchInplay(id, 1, signal)));
      }
      if (!signal.aborted) {
        setLiveEvents(live);
        void hydrateCatalogOdds(pickCatalogIds(), signal);
      }
    } catch (e) {
      if (signal.aborted) return;
      setError(e instanceof Error ? e.message : 'Не удалось загрузить live');
    } finally {
      liveAbort.current = null;
    }
  }, [setLiveEvents, sportId]);

  const loadLine = useCallback(async () => {
    if (lineAbort.current) return;
    lineAbort.current = new AbortController();
    const { signal } = lineAbort.current;
    const ids = sportId === 'all' ? BETSAPI_SPORTS.map((row) => String(row.sportId)) : [sportId];
    try {
      const upcoming = [];
      for (const id of ids) {
        if (signal.aborted) return;
        upcoming.push(...(await fetchUpcoming(id, 1, 48, signal)));
      }
      if (!signal.aborted) {
        setUpcomingEvents(upcoming);
        void hydrateCatalogOdds(pickCatalogIds(), signal);
      }
    } catch (e) {
      if (signal.aborted) return;
      setError(e instanceof Error ? e.message : 'Не удалось загрузить линию');
    } finally {
      lineAbort.current = null;
    }
  }, [setUpcomingEvents, sportId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadLive();
      await loadLine();
    } finally {
      setLoading(false);
    }
  }, [loadLine, loadLive]);

  useEffect(() => {
    setLoading(true);
    void loadLive().finally(() => setLoading(false));
    void loadLine();
    const liveTimer = window.setInterval(() => {
      void loadLive();
    }, 20_000);
    const lineTimer = window.setInterval(() => {
      void loadLine();
    }, 30_000);
    return () => {
      window.clearInterval(liveTimer);
      window.clearInterval(lineTimer);
      liveAbort.current?.abort();
      lineAbort.current?.abort();
      liveAbort.current = null;
      lineAbort.current = null;
    };
  }, [loadLine, loadLive]);

  return { events, loading, error, refresh: load };
}
