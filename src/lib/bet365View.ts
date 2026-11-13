import type { MarketGroup, MarketOutcome, MatchEvent } from '../types';

export interface Bet365SelectionPayload {
  selectionId: string;
  name: string;
  price: number | null;
  line: string | null;
  suspended: boolean;
}

export interface Bet365MarketPayload {
  marketId: string;
  name: string;
  russianName: string;
  family: string;
  period: string;
  line: string | null;
  bookmakerId: string;
  updatedAt: string | null;
  locked: boolean;
  selections: Bet365SelectionPayload[];
}

export interface Bet365ExpandedPayload {
  mapped: boolean;
  stale: boolean;
  rateLimited: boolean;
  markets: Bet365MarketPayload[];
}

function labelOf(name: string): string {
  const raw = name.trim();
  if (raw === '1') return 'П1';
  if (/^draw$|^x$/i.test(raw)) return 'X';
  if (raw === '2') return 'П2';
  if (/^over$/i.test(raw)) return 'ТБ';
  if (/^under$/i.test(raw)) return 'ТМ';
  if (/^yes$/i.test(raw)) return 'Да';
  if (/^no$/i.test(raw)) return 'Нет';
  if (/^odd$/i.test(raw)) return 'Нечет';
  if (/^even$/i.test(raw)) return 'Чет';
  return raw;
}

function categoryOf(market: Bet365MarketPayload): MarketGroup['category'] {
  if (market.period === '1st_half') return '1st-half';
  if (market.period === '2nd_half') return '2nd-half';
  if (market.family === 'goal_totals') return 'totals';
  if (market.family === 'asian_handicap' || market.family === 'european_handicap') return 'handicaps';
  if (market.family === 'full_time_result') return 'main';
  return 'main';
}

export function bet365Groups(markets: readonly Bet365MarketPayload[], match: MatchEvent): MarketGroup[] {
  return markets.flatMap((market) => {
    const outcomes: MarketOutcome[] = market.selections.flatMap((selection) => {
      if (!selection.selectionId) return [];
      if (!(selection.price && selection.price > 1) && !selection.suspended) return [];
      const outcome: MarketOutcome = {
        label: labelOf(selection.name),
        odds: selection.price && selection.price > 1 && !selection.suspended ? selection.price : 0,
        locked: selection.suspended || market.locked || !(selection.price && selection.price > 1),
        provider: 'betsapi',
        feedType: match.isLive ? 'inplay' : 'prematch',
        fixtureId: match.id,
        marketId: market.marketId,
        marketKey: market.family,
        line: selection.line ?? market.line ?? '',
        outcomeId: selection.selectionId,
        updatedAt: market.updatedAt ?? undefined,
        matchLabel: `${match.team1} — ${match.team2}`,
        bookmakerId: market.bookmakerId,
        externalPeriodId: market.period,
        externalMarketId: market.marketId,
        sourceSelectionId: selection.selectionId,
      };
      return [outcome];
    });
    if (!outcomes.length) return [];
    const group: MarketGroup = {
      id: `bet365-${match.id}-${market.marketId}-${market.period}-${market.line ?? ''}`,
      name: market.russianName,
      category: categoryOf(market),
      outcomes,
      bookmakerId: market.bookmakerId,
      externalPeriodId: market.period,
      externalMarketId: market.marketId,
    };
    return [group];
  });
}

export async function fetchBet365Expanded(eventsId: string, live: boolean, signal?: AbortSignal): Promise<Bet365ExpandedPayload | null> {
  if (!/^\d{1,20}$/.test(eventsId)) return null;
  const response = await fetch(`/api/player/sports/football-feed?bet365For=${encodeURIComponent(eventsId)}&live=${live ? '1' : '0'}`, {
    signal,
    credentials: 'same-origin',
  });
  if (!response.ok) return null;
  const body = await response.json() as Partial<Bet365ExpandedPayload>;
  return {
    mapped: Boolean(body.mapped),
    stale: Boolean(body.stale),
    rateLimited: Boolean(body.rateLimited),
    markets: Array.isArray(body.markets) ? body.markets : [],
  };
}
