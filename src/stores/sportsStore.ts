import { create } from 'zustand';
import type { BetsEvent } from '@/lib/betsapi';
import { isClosedTimeStatus, isLineEvent, isLive, isUnixClock, laterClock } from '@/lib/betsapi';
import type { ParsedMarket } from '@/lib/odds-parser';

export interface EventState {
  event: BetsEvent;
  markets: Record<string, ParsedMarket>;
  score: string;
  matchTime: string;
  lastOddsUpdate: number;
  lastFetchAt: number;
}

interface SportsStore {
  events: Record<string, EventState>;
  setLiveEvents: (events: BetsEvent[]) => void;
  setUpcomingEvents: (events: BetsEvent[]) => void;
  setEvents: (events: BetsEvent[]) => void;
  setOdds: (eventId: string, markets: ParsedMarket[], sinceTime?: number) => void;
  applyInplay: (events: BetsEvent[], marketsById: Record<string, ParsedMarket[]>) => void;
  applyUpcoming: (events: BetsEvent[], marketsById: Record<string, ParsedMarket[]>) => void;
  setScore: (eventId: string, score: string, time?: string) => void;
  upsertEvent: (event: BetsEvent) => void;
  getEvent: (id: string) => EventState | undefined;
  getMarkets: (id: string) => ParsedMarket[];
  getLiveEvents: () => BetsEvent[];
  getUpcomingEvents: () => BetsEvent[];
  removeEvent: (id: string) => void;
}

function displayMatchTime(ev: BetsEvent, prev?: EventState): string {
  if (ev.period === 'HT') return '45:00';
  return laterClock(ev.time_str, prev?.matchTime);
}

function freshState(ev: BetsEvent, prev?: EventState): EventState {
  return {
    event: ev,
    markets: prev?.markets ?? {},
    score: ev.ss || prev?.score || '-',
    matchTime: displayMatchTime(ev, prev),
    lastOddsUpdate: prev?.lastOddsUpdate ?? 0,
    lastFetchAt: Date.now(),
  };
}

function isUpcoming(ev: BetsEvent): boolean {
  return isLineEvent(ev) && !isClosedTimeStatus(ev.time_status);
}

export const useSportsStore = create<SportsStore>((set, get) => ({
  events: {},

  setLiveEvents: (list) => {
    const prev = get().events;
    const next: Record<string, EventState> = {};
    for (const [id, st] of Object.entries(prev)) {
      if (isUpcoming(st.event) && !isLive(st.event) && !isClosedTimeStatus(st.event.time_status)) next[id] = st;
    }
    for (const ev of list) {
      if (!isLive(ev) || isClosedTimeStatus(ev.time_status)) continue;
      next[ev.id] = freshState(ev, prev[ev.id]);
    }
    set({ events: next });
  },

  setUpcomingEvents: (list) => {
    const prev = get().events;
    const next: Record<string, EventState> = {};
    for (const [id, st] of Object.entries(prev)) {
      if (isLive(st.event)) next[id] = st;
    }
    for (const ev of list) {
      if (!isUpcoming(ev) || next[ev.id]) continue;
      next[ev.id] = freshState(ev, prev[ev.id]);
    }
    set({ events: next });
  },

  setEvents: (list) => {
    get().setLiveEvents(list.filter(isLive));
    get().setUpcomingEvents(list.filter(isUpcoming));
  },

  applyInplay: (events, marketsById) => {
    get().setLiveEvents(events);
    const ts = Date.now() / 1000;
    for (const [id, markets] of Object.entries(marketsById)) {
      if (markets.length) get().setOdds(id, markets, ts);
    }
  },

  applyUpcoming: (events, marketsById) => {
    get().setUpcomingEvents(events);
    const ts = Date.now() / 1000;
    for (const [id, markets] of Object.entries(marketsById)) {
      if (markets.length) get().setOdds(id, markets, ts);
    }
  },

  setOdds: (eventId, markets, sinceTime) => {
    const st = get().events[eventId];
    if (!st) return;
    const mMap = { ...st.markets };
    for (const market of markets) mMap[market.key] = market;
    set({
      events: {
        ...get().events,
        [eventId]: {
          ...st,
          markets: mMap,
          lastOddsUpdate: sinceTime || st.lastOddsUpdate,
          lastFetchAt: Date.now(),
        },
      },
    });
  },

  setScore: (eventId, score, time) => {
    const st = get().events[eventId];
    if (!st) return;
    const ht = st.event.period === 'HT';
    const nextTime = ht
      ? '45:00'
      : time && !isUnixClock(time)
        ? time
        : st.matchTime;
    set({
      events: {
        ...get().events,
        [eventId]: {
          ...st,
          score: score || st.score,
          matchTime: nextTime,
          event: {
            ...st.event,
            time_str: nextTime || st.event.time_str,
            clock_running: ht ? false : st.event.clock_running,
            period: ht ? 'HT' : st.event.period,
          },
        },
      },
    });
  },

  upsertEvent: (ev) => {
    const prev = get().events[ev.id];
    set({ events: { ...get().events, [ev.id]: freshState(ev, prev) } });
  },

  getEvent: (id) => get().events[id],
  getMarkets: (id) => {
    const st = get().events[id];
    return st ? Object.values(st.markets) : [];
  },
  getLiveEvents: () => Object.values(get().events).filter((s) => isLive(s.event)).map((s) => s.event),
  getUpcomingEvents: () => Object.values(get().events).filter((s) => isUpcoming(s.event)).map((s) => s.event),
  removeEvent: (id) => {
    const next = { ...get().events };
    delete next[id];
    set({ events: next });
  },
}));
