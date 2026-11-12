import type { BetSelection, MarketGroup, MatchEvent } from '../types';

export type FootballPriceState = NonNullable<MatchEvent['priceState']>;

export interface FootballFeedMarket {
  key: '1x2' | 'over_under' | 'asian_handicap';
  name: string;
  line: string;
  status: 'open' | 'suspended';
  outcomes: Array<{ key: string; name: string; price: number; sourceSelectionId?: string | null }>;
  updatedAt: string | null;
  bookmakerId?: string | null;
  externalPeriodId?: string | null;
  externalMarketId?: string;
}

export interface FootballFeedCard {
  id: string;
  league: string;
  country: string;
  home: string;
  away: string;
  kickoff: string | null;
  live: boolean;
  score: { home: number; away: number } | null;
  priceState?: FootballPriceState;
  markets: FootballFeedMarket[];
}

export interface FootballOddsQuote {
  id: string;
  priceState: FootballPriceState;
  stale?: boolean;
  markets: FootballFeedMarket[];
}

const LABELS: Record<string, string> = {
  home: 'П1',
  draw: 'X',
  away: 'П2',
  over: 'ТБ',
  under: 'ТМ',
};

const MARKET_IDS: Record<FootballFeedCard['markets'][number]['key'], string> = {
  '1x2': '1_1',
  asian_handicap: '1_2',
  over_under: '1_3',
};

function selectionFor(
  card: FootballFeedCard,
  market: FootballFeedCard['markets'][number],
  outcome: FootballFeedCard['markets'][number]['outcomes'][number],
): BetSelection {
  const label = LABELS[outcome.key] ?? outcome.name;
  return {
    id: `${card.id}-${market.key}-${market.line}-${outcome.key}`,
    matchId: card.id,
    matchLabel: `${card.home} — ${card.away}`,
    market: market.name,
    outcome: label,
    odds: outcome.price,
    provider: 'betsapi',
    feedType: card.live ? 'inplay' : 'prematch',
    fixtureId: card.id,
    marketId: MARKET_IDS[market.key],
    marketKey: market.key,
    line: market.line,
    outcomeId: outcome.key,
    providerLastUpdate: market.updatedAt ?? undefined,
    bookmakerId: market.bookmakerId ?? null,
    externalPeriodId: market.externalPeriodId ?? null,
    externalMarketId: market.externalMarketId,
    sourceSelectionId: outcome.sourceSelectionId ?? null,
    homeTeam: card.home,
    awayTeam: card.away,
    sport: 'football',
    country: card.country,
    league: card.league,
    isLive: card.live,
    startTime: card.kickoff ? Date.parse(card.kickoff) : undefined,
  };
}

export function footballCardToMatch(card: FootballFeedCard): MatchEvent {
  const oneXtwo = card.markets.find((market) => market.key === '1x2' && market.status === 'open');
  const priceState: FootballPriceState = card.priceState ?? (oneXtwo ? 'open' : 'unpriced');
  const price = (key: string) => oneXtwo?.outcomes.find((outcome) => outcome.key === key)?.price ?? 0;
  const quotes: NonNullable<MatchEvent['betsapiQuotes']> = {};
  for (const outcome of oneXtwo?.outcomes ?? []) {
    const label = LABELS[outcome.key];
    if (!label || !(outcome.price > 1)) continue;
    const selection = selectionFor(card, oneXtwo!, outcome);
    quotes[label] = {
      provider: 'betsapi',
      feedType: selection.feedType ?? 'prematch',
      fixtureId: card.id,
      marketId: selection.marketId ?? '1_1',
      marketKey: '1x2',
      line: '',
      outcomeId: outcome.key,
      updatedAt: oneXtwo?.updatedAt ?? undefined,
      bookmakerId: oneXtwo?.bookmakerId ?? null,
      externalPeriodId: oneXtwo?.externalPeriodId ?? null,
      externalMarketId: oneXtwo?.externalMarketId,
      sourceSelectionId: outcome.sourceSelectionId ?? null,
    };
  }
  const groups: MarketGroup[] = card.markets
    .filter((market) => market.key !== '1x2' && market.status === 'open')
    .map((market) => ({
      id: `${card.id}-${market.key}-${market.line}`,
      name: market.key === 'over_under' ? `Тотал ${market.line}`.trim() : `Фора ${market.line}`.trim(),
      category: market.key === 'over_under' ? 'totals' as const : 'handicaps' as const,
      outcomes: market.outcomes.filter((outcome) => outcome.price > 1).map((outcome) => {
        const selection = selectionFor(card, market, outcome);
        return {
          label: LABELS[outcome.key] ?? outcome.name,
          odds: outcome.price,
          provider: 'betsapi' as const,
          feedType: selection.feedType,
          fixtureId: card.id,
          marketId: selection.marketId,
          marketKey: market.key,
          line: market.line,
          outcomeId: outcome.key,
          updatedAt: market.updatedAt ?? undefined,
          matchLabel: `${card.home} — ${card.away}`,
          bookmakerId: market.bookmakerId ?? null,
          externalPeriodId: market.externalPeriodId ?? null,
          externalMarketId: market.externalMarketId,
          sourceSelectionId: outcome.sourceSelectionId ?? null,
        };
      }),
      bookmakerId: market.bookmakerId ?? null,
      externalPeriodId: market.externalPeriodId ?? null,
      externalMarketId: market.externalMarketId,
    }))
    .filter((group) => group.outcomes.length > 0);
  const kickoff = card.kickoff ? Date.parse(card.kickoff) : 0;
  return {
    id: card.id,
    sport: 'football',
    league: card.league,
    country: card.country,
    team1: card.home,
    team2: card.away,
    team1Color: '#14532d',
    team2Color: '#1d4ed8',
    startTime: Number.isFinite(kickoff) ? kickoff : 0,
    isLive: card.live,
    liveScore: card.score ? { team1: card.score.home, team2: card.score.away } : undefined,
    markets: { '1': price('home'), x: price('draw'), '2': price('away') },
    extraMarkets: groups.length,
    marketGroups: groups,
    feedTag: 'betsapi',
    priceState,
    betsapiQuotes: quotes,
    marketsLocked: !oneXtwo,
  };
}

export function isBetsapiMatch(match: Pick<MatchEvent, 'feedTag' | 'betsapiQuotes'> | undefined): boolean {
  return match?.feedTag === 'betsapi' || Boolean(match?.betsapiQuotes && Object.keys(match.betsapiQuotes).length > 0);
}

export function resolveDetailsMatch(catalog?: MatchEvent, stored?: MatchEvent): MatchEvent | undefined {
  if (isBetsapiMatch(catalog)) return catalog;
  if (isBetsapiMatch(stored)) return stored;
  return catalog ?? stored;
}

export interface BetsapiDetailLine {
  id: string;
  title: string;
  tab: 'main' | 'totals' | 'handicaps';
  outcomes: Array<{ label: string; odds: number; selection?: BetSelection }>;
}

export function betsapiDetailLines(match: MatchEvent): BetsapiDetailLine[] {
  const lines: BetsapiDetailLine[] = [];
  const main = [
    { label: 'П1', odds: match.markets['1'] },
    { label: 'X', odds: match.markets.x },
    { label: 'П2', odds: match.markets['2'] },
  ].filter((item) => item.odds > 1);
  if (main.length) {
    lines.push({ id: `${match.id}-1x2`, title: 'Исход', tab: 'main', outcomes: main });
  }
  for (const group of match.marketGroups ?? []) {
    const tab = group.category === 'handicaps' || /фора/i.test(group.name)
      ? 'handicaps'
      : group.category === 'totals' || /тотал/i.test(group.name)
        ? 'totals'
        : null;
    if (!tab) continue;
    const outcomes = group.outcomes.filter((outcome) => outcome.odds > 1);
    if (!outcomes.length) continue;
    lines.push({
      id: group.id,
      title: group.name,
      tab,
      outcomes: outcomes.map((outcome) => ({
        label: outcome.label,
        odds: outcome.odds,
        selection: outcome.provider === 'betsapi' ? {
          id: `${outcome.fixtureId}-${outcome.marketKey}-${outcome.line ?? ''}-${outcome.outcomeId}`,
          matchId: outcome.fixtureId || match.id,
          matchLabel: outcome.matchLabel || `${match.team1} — ${match.team2}`,
          market: group.name,
          outcome: outcome.label,
          odds: outcome.odds,
          provider: 'betsapi',
          feedType: outcome.feedType,
          fixtureId: outcome.fixtureId,
          marketId: outcome.marketId,
          marketKey: outcome.marketKey,
          line: outcome.line ?? '',
          outcomeId: outcome.outcomeId,
          providerLastUpdate: outcome.updatedAt,
          bookmakerId: outcome.bookmakerId,
          externalPeriodId: outcome.externalPeriodId,
          externalMarketId: outcome.externalMarketId,
          sourceSelectionId: outcome.sourceSelectionId,
          homeTeam: match.team1,
          awayTeam: match.team2,
          sport: 'football',
          isLive: match.isLive,
        } : undefined,
      })),
    });
  }
  return lines;
}

export function betsapiDetailTabs(lines: BetsapiDetailLine[]): Array<{ id: 'all' | BetsapiDetailLine['tab']; label: string }> {
  if (!lines.length) return [];
  const tabs: Array<{ id: 'all' | BetsapiDetailLine['tab']; label: string }> = [{ id: 'all', label: 'Все' }];
  if (lines.some((line) => line.tab === 'main')) tabs.push({ id: 'main', label: '1X2' });
  if (lines.some((line) => line.tab === 'totals')) tabs.push({ id: 'totals', label: 'Тоталы' });
  if (lines.some((line) => line.tab === 'handicaps')) tabs.push({ id: 'handicaps', label: 'Форы' });
  return tabs;
}

export function homeMarketsLabel(match: MatchEvent): string | null {
  if (!isBetsapiMatch(match)) return null;
  const count = Number(match.extraMarkets) || match.marketGroups?.length || 0;
  if (count > 0) return `Все рынки · ${count}`;
  if (match.markets['1'] > 1 || match.markets.x > 1 || match.markets['2'] > 1) return 'Все рынки';
  return footballPriceNote(match.priceState, false);
}

export function advertisedExtraMarketCount(match: MatchEvent, renderedRows: number): number | null {
  const count = match.feedTag === 'lsports'
    ? Math.max(Number(match.extraMarkets) || 0, renderedRows)
    : Math.max(match.feedTag === 'betsapi' ? Number(match.extraMarkets) || 0 : Number(match.extraMarkets) || 0, renderedRows);
  return count > 0 ? count : null;
}

export function footballPriceNote(state: MatchEvent['priceState'], hasPrices: boolean): string | null {
  if (state === 'stale' && hasPrices) return 'Показаны последние коэффициенты';
  if (hasPrices && state !== 'suspended') return null;
  if (state === 'suspended') return 'Коэффициенты приостановлены';
  if (state === 'unavailable') return 'Коэффициенты не опубликованы';
  if (state === 'unrecognized') return 'Коэффициенты не разобраны';
  if (state === 'rate_limited') return 'Лимит поставщика, повтор позже';
  if (state === 'upstream') return 'Коэффициенты временно недоступны';
  if (state === 'deferred' || state === 'unpriced' || !state) return 'Коэффициенты загружаются';
  return null;
}

const RETRY_STATES = new Set<MatchEvent['priceState']>(['unpriced', 'deferred', 'rate_limited', 'upstream', 'stale', undefined]);

export function footballQuoteIds(matches: MatchEvent[]): { primary: string[]; secondary: string[] } {
  const needs = (match: MatchEvent) => match.feedTag === 'betsapi' && RETRY_STATES.has(match.priceState);
  const live = matches.filter((match) => match.isLive && needs(match)).map((match) => match.id);
  const prematch = matches.filter((match) => !match.isLive && needs(match)).map((match) => match.id);
  const primary = [...live.slice(0, 6), ...prematch].slice(0, 8);
  const secondary = prematch.filter((id) => !primary.includes(id)).slice(0, 8);
  return { primary, secondary };
}

export function mergeListedMatches(previous: MatchEvent[], listed: MatchEvent[]): MatchEvent[] {
  const prior = new Map(previous.map((match) => [match.id, match]));
  return listed.map((item) => {
    const old = prior.get(item.id);
    if (!old || item.priceState !== 'unpriced') return item;
    if (!old.priceState || old.priceState === 'unpriced') return item;
    return {
      ...item,
      markets: old.markets,
      extraMarkets: old.extraMarkets,
      marketGroups: old.marketGroups,
      betsapiQuotes: old.betsapiQuotes,
      marketsLocked: old.marketsLocked,
      priceState: old.priceState,
    };
  });
}

export function applyFootballQuotes(matches: MatchEvent[], quotes: FootballOddsQuote[]): MatchEvent[] {
  const byId = new Map(quotes.map((quote) => [quote.id, quote]));
  return matches.map((match) => {
    const quote = byId.get(match.id);
    if (!quote) return match;
    if (quote.priceState === 'deferred' || quote.priceState === 'rate_limited' || quote.priceState === 'upstream') {
      if ((match.priceState === 'open' || match.priceState === 'stale') && (match.markets['1'] > 1 || (match.marketGroups?.length ?? 0) > 0)) {
        return { ...match, priceState: 'stale' };
      }
      return { ...match, priceState: quote.priceState };
    }
    const next = footballCardToMatch({
      id: match.id,
      league: match.league,
      country: match.country,
      home: match.team1,
      away: match.team2,
      kickoff: match.startTime ? new Date(match.startTime).toISOString() : null,
      live: match.isLive,
      score: match.liveScore ? { home: match.liveScore.team1, away: match.liveScore.team2 } : null,
      priceState: quote.priceState,
      markets: quote.markets,
    });
    return quote.priceState === 'stale' ? { ...next, priceState: 'stale' } : next;
  });
}

export async function fetchFootballFeed(signal?: AbortSignal): Promise<MatchEvent[]> {
  const response = await fetch('/api/player/sports/football-feed', { signal, credentials: 'same-origin' });
  if (!response.ok) return [];
  const body = await response.json() as { events?: FootballFeedCard[] };
  return (body.events ?? []).map(footballCardToMatch);
}

export async function fetchFootballQuotes(ids: string[], signal?: AbortSignal): Promise<FootballOddsQuote[]> {
  const unique = ids.filter((id) => /^\d{1,20}$/.test(id)).slice(0, 8);
  if (!unique.length) return [];
  const response = await fetch(`/api/player/sports/football-feed?oddsFor=${unique.map(encodeURIComponent).join(',')}`, {
    signal,
    credentials: 'same-origin',
  });
  if (!response.ok) return [];
  const body = await response.json() as { quotes?: FootballOddsQuote[] };
  return body.quotes ?? [];
}

export async function fetchFootballEvent(eventId: string, signal?: AbortSignal): Promise<MatchEvent | null> {
  if (!/^\d{1,20}$/.test(eventId)) return null;
  const response = await fetch(`/api/player/sports/football-feed?eventId=${encodeURIComponent(eventId)}`, {
    signal,
    credentials: 'same-origin',
  });
  if (!response.ok) return null;
  const body = await response.json() as { events?: FootballFeedCard[] };
  const card = body.events?.[0];
  if (!card) return null;
  return footballCardToMatch(card);
}
