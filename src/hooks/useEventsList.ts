import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hydrateCatalogOdds, pickCatalogIds } from '@/lib/hydrateCatalogOdds';
import { seedMockSportsStore, USE_MOCK } from '@/lib/mockSports';
import { fetchEventsForSports } from '@/services/sportsApi';
import { useSportsStore } from '@/stores/sportsStore';
import type { BetsEvent } from '@/lib/betsapi';

export type EventTab = 'live' | 'line';

function safeEvents(tab: EventTab, eventsMap: Record<string, { event: BetsEvent }>): BetsEvent[] {
  try {
    return Object.values(eventsMap ?? {}).reduce<BetsEvent[]>((acc, row) => {
      const event = row?.event;
      if (!event) return acc;
      const live = event.time_status === '1' || event.our_events === '1';
      if (tab === 'live' ? live : event.time_status === '0') acc.push(event);
      return acc;
    }, []);
  } catch {
    return [];
  }
}

export function useEventsList(tab: EventTab, sportId = '1') {
  const [loading, setLoading] = useState(!USE_MOCK);
  const [error, setError] = useState<string | null>(null);
  const eventsMap = useSportsStore((s) => s.events);
  const setLiveEvents = useSportsStore((s) => s.setLiveEvents);
  const setUpcomingEvents = useSportsStore((s) => s.setUpcomingEvents);
  const liveAbort = useRef<AbortController | null>(null);
  const lineAbort = useRef<AbortController | null>(null);

  const events = useMemo(() => safeEvents(tab, eventsMap), [eventsMap, tab]);

  const loadLive = useCallback(async () => {
    if (USE_MOCK) {
      seedMockSportsStore();
      return;
    }
    if (liveAbort.current) return;
    liveAbort.current = new AbortController();
    const { signal } = liveAbort.current;
    try {
      const live = await fetchEventsForSports('live', sportId, signal);
      if (signal.aborted) return;
      setLiveEvents(live);
      if (live.length) void hydrateCatalogOdds(pickCatalogIds(), signal).catch(() => undefined);
    } catch (e) {
      if (signal.aborted) return;
      setError(e instanceof Error ? e.message : 'Не удалось загрузить live');
      setLiveEvents([]);
    } finally {
      liveAbort.current = null;
    }
  }, [setLiveEvents, sportId]);

  const loadLine = useCallback(async () => {
    if (USE_MOCK) {
      seedMockSportsStore();
      return;
    }
    if (lineAbort.current) return;
    lineAbort.current = new AbortController();
    const { signal } = lineAbort.current;
    try {
      const upcoming = await fetchEventsForSports('line', sportId, signal);
      if (signal.aborted) return;
      setUpcomingEvents(upcoming);
      if (upcoming.length) void hydrateCatalogOdds(pickCatalogIds(), signal).catch(() => undefined);
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
    if (USE_MOCK) {
      seedMockSportsStore();
      setLoading(false);
      return;
    }
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
