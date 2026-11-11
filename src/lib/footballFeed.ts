import type { BetSelection, MarketGroup, MatchEvent } from '../types';

export interface FootballFeedCard {
  id: string;
  league: string;
  country: string;
  home: string;
  away: string;
  kickoff: string | null;
  live: boolean;
  score: { home: number; away: number } | null;
  markets: Array<{
    key: '1x2' | 'over_under' | 'asian_handicap';
    name: string;
    line: string;
    status: 'open';
    outcomes: Array<{ key: string; name: string; price: number }>;
    updatedAt: string | null;
  }>;
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
    };
  }
  const groups: MarketGroup[] = card.markets
    .filter((market) => market.key !== '1x2')
    .map((market) => ({
      id: `${card.id}-${market.key}-${market.line}`,
      name: [market.name, market.line].filter(Boolean).join(' '),
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
        };
      }),
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
    betsapiQuotes: quotes,
    marketsLocked: !oneXtwo,
  };
}

export async function fetchFootballFeed(signal?: AbortSignal): Promise<MatchEvent[]> {
  const response = await fetch('/api/player/sports/football-feed', { signal, credentials: 'same-origin' });
  if (!response.ok) return [];
  const body = await response.json() as { events?: FootballFeedCard[] };
  return (body.events ?? []).map(footballCardToMatch);
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
