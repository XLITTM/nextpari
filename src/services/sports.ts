import {
  filterLineEvents,
  filterLiveEvents,
  toBetsEvent,
  type BetsApiEvent,
  type BetsEvent,
} from '@/lib/betsapi';
import { parseOdds, type ParsedMarket } from '@/lib/odds-parser';
import { enrichProviderMarkets, toDecimalOdds } from '@/lib/matchOdds';

export interface InplayMatch {
  event: BetsEvent;
  markets: ParsedMarket[];
}

export type SportsFeedType = 'inplay' | 'upcoming';

export const DEFAULT_1X2 = { home: 2.1, draw: 3.25, away: 2.8 };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function oddsDictFromEvent(raw: BetsApiEvent & Record<string, unknown>): Record<string, unknown[]> {
  const extra = asRecord(raw.extra) ?? {};
  const blob = raw.odds ?? extra.odds ?? raw.main ?? extra.main;
  const dict = asRecord(blob) ?? {};
  const asArrays: Record<string, unknown[]> = {};
  for (const [key, value] of Object.entries(dict)) {
    if (Array.isArray(value)) asArrays[key] = value;
  }
  const lsports = String(raw.our_events ?? extra.our_events ?? '') === 'lsports';
  const home = toDecimalOdds(raw.home_od ?? extra.home_od);
  const draw = toDecimalOdds(raw.draw_od ?? extra.draw_od);
  const away = toDecimalOdds(raw.away_od ?? extra.away_od);
  if (!asArrays['1_1'] && !asArrays['1']) {
    if (lsports) {
      if (home > 1 && draw > 1 && away > 1) {
        asArrays['1_1'] = [{ home_od: home, draw_od: draw, away_od: away }];
      }
    } else {
      asArrays['1_1'] = [{
        home_od: home || DEFAULT_1X2.home,
        draw_od: draw || DEFAULT_1X2.draw,
        away_od: away || DEFAULT_1X2.away,
      }];
    }
  }
  return asArrays;
}

export function parseInplayMarkets(raw: BetsApiEvent, sportId?: string): ParsedMarket[] {
  const payload = raw as BetsApiEvent & Record<string, unknown>;
  const dict = oddsDictFromEvent(payload);
  const parsed = Object.keys(dict).length ? parseOdds(dict, { sportId }) : [];
  return enrichProviderMarkets(parsed, dict, sportId);
}

function mapFeedRows(rows: BetsApiEvent[]): InplayMatch[] {
  return rows.flatMap((raw) => {
    const event = toBetsEvent(raw);
    if (!event.id) return [];
    return [{
      event,
      markets: parseInplayMarkets(raw, event.sport_id),
    }];
  });
}

export async function fetchSportsFeed(type: SportsFeedType, signal?: AbortSignal): Promise<InplayMatch[]> {
  try {
    const response = await fetch(`/api/sports?type=${type}`, { signal });
    if (!response.ok) return [];
    const json = (await response.json()) as { results?: BetsApiEvent[] };
    const rows = type === 'upcoming'
      ? filterLineEvents(json.results ?? [])
      : filterLiveEvents(json.results ?? []);
    return mapFeedRows(rows);
  } catch (error) {
    if (isAbortError(error)) return [];
    console.warn(`[sports] ${type} request failed`, error);
    return [];
  }
}

export async function fetchInplay(signal?: AbortSignal): Promise<InplayMatch[]> {
  return fetchSportsFeed('inplay', signal);
}

export async function fetchUpcomingFeed(signal?: AbortSignal): Promise<InplayMatch[]> {
  return fetchSportsFeed('upcoming', signal);
}
