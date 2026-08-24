import {
  BETSAPI_SPORTS,
  fetchInplay,
  fetchUpcoming,
  filterLineEvents,
  filterLiveEvents,
  type BetsEvent,
} from '@/lib/betsapi';

export {
  CLOSED_TIME_STATUSES,
  filterLineEvents,
  filterLiveEvents,
  isClosedTimeStatus,
  isLineEvent,
  isLive,
  isLiveTimeStatus,
  timeStatusOf,
} from '@/lib/betsapi';

export async function fetchLiveMatches(sportId = '1', signal?: AbortSignal): Promise<BetsEvent[]> {
  return filterLiveEvents(await fetchInplay(sportId, 1, signal));
}

export async function fetchLineMatches(sportId = '1', signal?: AbortSignal): Promise<BetsEvent[]> {
  return filterLineEvents(await fetchUpcoming(sportId, 1, 48, signal));
}

export async function fetchMatchesForSports(
  tab: 'live' | 'line',
  sportId: string,
  signal?: AbortSignal,
): Promise<BetsEvent[]> {
  const ids = sportId === 'all' ? BETSAPI_SPORTS.map((row) => String(row.sportId)) : [sportId || '1'];
  const events: BetsEvent[] = [];
  for (const id of ids) {
    if (signal?.aborted) return events;
    const chunk = tab === 'live' ? await fetchLiveMatches(id, signal) : await fetchLineMatches(id, signal);
    events.push(...chunk);
  }
  return events;
}

export function clearStaleSportsCaches(): void {
  if (typeof localStorage === 'undefined') return;
  const prefixes = ['betsapi', 'sports-live', 'sports-upcoming', 'live-catalog', 'nextpari-live', 'nextpari-sports'];
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key) keys.push(key);
  }
  for (const key of keys) {
    if (prefixes.some((prefix) => key.toLowerCase().includes(prefix))) {
      localStorage.removeItem(key);
    }
  }
}
