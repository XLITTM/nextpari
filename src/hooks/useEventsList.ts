import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchInplay } from '@/services/sports';
import { fetchEventsForSports } from '@/services/sportsApi';
import { useSportsStore } from '@/stores/sportsStore';
import { isLineEvent, isLive, type BetsEvent } from '@/lib/betsapi';

export type EventTab = 'live' | 'line';

function safeEvents(tab: EventTab, eventsMap: Record<string, { event: BetsEvent }>): BetsEvent[] {
  try {
    return Object.values(eventsMap ?? {}).reduce<BetsEvent[]>((acc, row) => {
      const event = row?.event;
      if (!event) return acc;
      if (tab === 'live' ? isLive(event) : isLineEvent(event)) acc.push(event);
      return acc;
    }, []);
  } catch {
    return [];
  }
}

export function useEventsList(tab: EventTab, sportId = '1') {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventsMap = useSportsStore((s) => s.events);
  const applyInplay = useSportsStore((s) => s.applyInplay);
  const setLiveEvents = useSportsStore((s) => s.setLiveEvents);
  const setUpcomingEvents = useSportsStore((s) => s.setUpcomingEvents);
  const liveAbort = useRef<AbortController | null>(null);
  const lineAbort = useRef<AbortController | null>(null);

  const events = useMemo(() => safeEvents(tab, eventsMap), [eventsMap, tab]);

  const loadLive = useCallback(async () => {
    if (liveAbort.current) liveAbort.current.abort();
    liveAbort.current = new AbortController();
    const { signal } = liveAbort.current;
    try {
      const rows = await fetchInplay(signal);
      if (signal.aborted) return;
      const marketsById: Record<string, typeof rows[number]['markets']> = {};
      for (const row of rows) {
        if (row.markets.length) marketsById[row.event.id] = row.markets;
      }
      applyInplay(rows.map((row) => row.event), marketsById);
    } catch (e) {
      if (signal.aborted) return;
      setError(e instanceof Error ? e.message : 'Не удалось загрузить live');
      setLiveEvents([]);
    } finally {
      if (liveAbort.current?.signal === signal) liveAbort.current = null;
    }
  }, [applyInplay, setLiveEvents]);

  const loadLine = useCallback(async () => {
    if (lineAbort.current) return;
    lineAbort.current = new AbortController();
    const { signal } = lineAbort.current;
    try {
      const upcoming = await fetchEventsForSports('line', sportId, signal);
      if (signal.aborted) return;
      setUpcomingEvents(upcoming);
    } catch (e) {
      if (signal.aborted) return;
      setError(e instanceof Error ? e.message : 'Не удалось загрузить линию');
      setUpcomingEvents([]);
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
    } catch {
      setError('Не удалось загрузить события');
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
    }, 3_000);
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
