import { BETSAPI_SPORTS, fetchInplay, fetchUpcoming, type BetsEvent } from '@/lib/betsapi';

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function asEventList(value: unknown): BetsEvent[] {
  return Array.isArray(value) ? value.filter((row): row is BetsEvent => Boolean(row && typeof row === 'object' && 'id' in row)) : [];
}

export async function fetchLiveEvents(sportId = '1', signal?: AbortSignal): Promise<BetsEvent[]> {
  try {
    return asEventList(await fetchInplay(sportId, 1, signal));
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) return [];
    console.warn('[sportsApi] live request failed', error);
    return [];
  }
}

export async function fetchLineEvents(sportId = '1', signal?: AbortSignal): Promise<BetsEvent[]> {
  try {
    return asEventList(await fetchUpcoming(sportId, 1, 48, signal));
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) return [];
    console.warn('[sportsApi] line request failed', error);
    return [];
  }
}

export async function fetchEventsForSports(
  tab: 'live' | 'line',
  sportId: string,
  signal?: AbortSignal,
): Promise<BetsEvent[]> {
  const ids = sportId === 'all' ? BETSAPI_SPORTS.map((row) => String(row.sportId)) : [sportId || '1'];
  const events: BetsEvent[] = [];
  for (const id of ids) {
    if (signal?.aborted) return events;
    const chunk = tab === 'live' ? await fetchLiveEvents(id, signal) : await fetchLineEvents(id, signal);
    events.push(...chunk);
  }
  return events;
}
