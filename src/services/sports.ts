import {
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function oddsDictFromEvent(raw: BetsApiEvent & Record<string, unknown>): Record<string, unknown[]> {
  const extra = asRecord(raw.extra) ?? {};
  const blob = raw.odds ?? extra.odds ?? raw.main ?? extra.main;
  const dict = asRecord(blob) ?? {};
  const asArrays: Record<string, unknown[]> = {};
  for (const [key, value] of Object.entries(dict)) {
    if (Array.isArray(value)) asArrays[key] = value;
  }
  if (Object.keys(asArrays).length) return asArrays;

  const home = toDecimalOdds(raw.home_od ?? extra.home_od);
  const draw = toDecimalOdds(raw.draw_od ?? extra.draw_od);
  const away = toDecimalOdds(raw.away_od ?? extra.away_od);
  if (home > 1 && away > 1) {
    asArrays['1_1'] = [{ home_od: home, draw_od: draw, away_od: away }];
  }
  return asArrays;
}

export function parseInplayMarkets(raw: BetsApiEvent, sportId?: string): ParsedMarket[] {
  const payload = raw as BetsApiEvent & Record<string, unknown>;
  const dict = oddsDictFromEvent(payload);
  const parsed = Object.keys(dict).length ? parseOdds(dict, { sportId }) : [];
  return enrichProviderMarkets(parsed, dict, sportId);
}

export async function fetchInplay(signal?: AbortSignal): Promise<InplayMatch[]> {
  try {
    const response = await fetch('/api/sports/inplay', { signal });
    if (!response.ok) return [];
    const json = (await response.json()) as { results?: BetsApiEvent[] };
    const rows = filterLiveEvents(json.results ?? []);
    return rows.flatMap((raw) => {
      const event = toBetsEvent(raw);
      if (!event.id) return [];
      return [{
        event,
        markets: parseInplayMarkets(raw, event.sport_id),
      }];
    });
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      return [];
    }
    console.warn('[sports] inplay request failed', error);
    return [];
  }
}
