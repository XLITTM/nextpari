import {
  filterLiveEvents,
  toBetsEvent,
  type BetsApiEvent,
  type BetsEvent,
} from '@/lib/betsapi';
import { parseOdds, type ParsedMarket, type ParsedOutcome } from '@/lib/odds-parser';

export interface InplayMatch {
  event: BetsEvent;
  markets: ParsedMarket[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 1 ? n : 0;
}

function outcome(key: string, odds: number): ParsedOutcome | null {
  if (odds <= 1) return null;
  return { key, odds, raw: odds.toFixed(2) };
}

function market(
  eventId: string,
  marketId: string,
  name: string,
  outcomes: Array<ParsedOutcome | null>,
  line?: string,
): ParsedMarket | null {
  const list = outcomes.filter((row): row is ParsedOutcome => Boolean(row));
  if (!list.length) return null;
  return {
    key: `${eventId}_${marketId}`,
    bookmaker: 'bet365',
    marketId,
    name,
    category: 'main',
    entries: [{
      id: `${marketId}-${line ?? 'main'}`,
      outcomes: list,
      line,
      updatedAt: Date.now(),
    }],
  };
}

function parseLooseOdds(raw: BetsApiEvent & Record<string, unknown>, eventId: string, sportId?: string): ParsedMarket[] {
  const extra = asRecord(raw.extra) ?? {};
  const oddsBlob = raw.odds ?? extra.odds;
  const dict = asRecord(oddsBlob);
  if (dict) {
    const asArrays: Record<string, unknown[]> = {};
    for (const [key, value] of Object.entries(dict)) {
      if (Array.isArray(value)) asArrays[key] = value;
    }
    if (Object.keys(asArrays).length) {
      const parsed = parseOdds(asArrays, { sportId });
      if (parsed.length) return parsed;
    }
  }

  const home = asNumber(raw.home_od ?? extra.home_od ?? extra['1'] ?? extra.p1);
  const draw = asNumber(raw.draw_od ?? extra.draw_od ?? extra.x ?? extra.pX);
  const away = asNumber(raw.away_od ?? extra.away_od ?? extra['2'] ?? extra.p2);
  const over = asNumber(raw.over_od ?? extra.over_od ?? extra.tb ?? extra.over);
  const under = asNumber(raw.under_od ?? extra.under_od ?? extra.tm ?? extra.under);
  const hcHome = asNumber(raw.handicap_home_od ?? extra.handicap_home_od ?? extra.ah_home);
  const hcAway = asNumber(raw.handicap_away_od ?? extra.handicap_away_od ?? extra.ah_away);
  const totalLine = raw.total ?? extra.total ?? extra.total_line;
  const hcLine = raw.handicap ?? extra.handicap ?? extra.handicap_line;
  const twoWay = Boolean(sportId && sportId !== '1');

  return [
    market(
      eventId,
      '1',
      twoWay ? 'Победитель' : '1X2',
      [
        outcome('home', home),
        twoWay ? null : outcome('draw', draw),
        outcome('away', away),
      ],
    ),
    market(
      eventId,
      '3',
      'Тотал',
      [outcome('over', over), outcome('under', under)],
      totalLine != null && String(totalLine) !== '' ? String(totalLine) : '2.5',
    ),
    market(
      eventId,
      '2',
      'Фора',
      [outcome('home', hcHome), outcome('away', hcAway)],
      hcLine != null && String(hcLine) !== '' ? String(hcLine) : undefined,
    ),
  ].filter((row): row is ParsedMarket => Boolean(row));
}

export function parseInplayMarkets(raw: BetsApiEvent, sportId?: string): ParsedMarket[] {
  const eventId = String(raw.id ?? '');
  if (!eventId) return [];
  return parseLooseOdds(raw as BetsApiEvent & Record<string, unknown>, eventId, sportId);
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
