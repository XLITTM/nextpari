import { fetchLineMatches, fetchLiveMatches, fetchMatchesForSports } from '@/services/betsApi';
import type { BetsEvent } from '@/lib/betsapi';

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

export async function fetchLiveEvents(sportId = '1', signal?: AbortSignal): Promise<BetsEvent[]> {
  try {
    return await fetchLiveMatches(sportId, signal);
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) return [];
    console.warn('[sportsApi] live request failed', error);
    return [];
  }
}

export async function fetchLineEvents(sportId = '1', signal?: AbortSignal): Promise<BetsEvent[]> {
  try {
    return await fetchLineMatches(sportId, signal);
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
  try {
    return await fetchMatchesForSports(tab, sportId, signal);
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) return [];
    console.warn('[sportsApi] events request failed', error);
    return [];
  }
}
