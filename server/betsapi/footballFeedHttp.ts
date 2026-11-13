import { ownerFootballLogo } from '../sports/catalog/ownerFootballMedia.js';
import type { EventsSportId } from './sportIds.js';
import {
  BetsApiReadOnlyClient,
  getFootballOddsClient,
  getSharedBetsApiClient,
  type EventOddsRead,
  type EventOddsState,
} from './client.js';
import { eventTier, rankFeaturedFootball, selectFeaturedLine, selectFeaturedLive, selectSchedule } from './footballCoverage.js';
import { publishLiveClock } from './liveClock.js';
import type { EventInsights, FeedResult, FootballPeriod, LiveClock, NormalizedEvent, NormalizedMarket } from './types.js';

export const FOOTBALL_FEED_PATH = '/api/player/sports/football-feed';
const MAX_ODDS_IDS = 8;
const ODDS_BATCH_BUDGET_MS = 20_000;

export interface FootballFeedMarket {
  key: NormalizedMarket['key'];
  name: string;
  line: string;
  status: 'open' | 'suspended';
  outcomes: Array<{ key: string; name: string; price: number; sourceSelectionId?: string | null }>;
  updatedAt: string | null;
  bookmakerId: string | null;
  externalPeriodId: string | null;
  externalMarketId: string;
}

export interface FootballFeedCard {
  id: string;
  sport: NormalizedEvent['sport'];
  tier: number;
  logos: { competitionId: string | null; competition: string | null; home: string | null; away: string | null };
  league: string;
  country: string;
  home: string;
  away: string;
  kickoff: string | null;
  live: boolean;
  score: { home: number; away: number } | null;
  liveClock: LiveClock | null;
  period: FootballPeriod | null;
  insights?: EventInsights | null;
  priceState: EventOddsState | 'unpriced';
  markets: FootballFeedMarket[];
}

export interface FootballOddsQuote {
  id: string;
  priceState: EventOddsState | 'deferred';
  stale: boolean;
  markets: FootballFeedMarket[];
}

function cardsFrom(result: FeedResult | null, now = Date.now()): FootballFeedCard[] {
  const events = result?.feed?.events ?? [];
  return events.map((event) => toCard(event, now));
}

function priceStateOf(event: NormalizedEvent): FootballFeedCard['priceState'] {
  if (!event.marketsKnown) return 'unpriced';
  if (event.markets.some((market) => market.status === 'open')) return 'open';
  if (event.markets.some((market) => market.availability === 'suspended')) return 'suspended';
  return 'unavailable';
}

function marketToCard(market: NormalizedMarket): FootballFeedMarket | null {
  if (market.status !== 'open' && market.availability !== 'suspended') return null;
  return {
    key: market.key,
    name: market.name,
    line: market.line ?? '',
    status: market.availability === 'suspended' ? 'suspended' : 'open',
    outcomes: market.outcomes.map((outcome) => ({
      key: outcome.key,
      name: outcome.name,
      price: outcome.price,
      sourceSelectionId: outcome.sourceSelectionId ?? null,
    })),
    updatedAt: market.updatedAt,
    bookmakerId: market.bookmakerId ?? null,
    externalPeriodId: market.externalPeriodId ?? null,
    externalMarketId: market.externalMarketId ?? '',
  };
}

function toCard(event: NormalizedEvent, now = Date.now()): FootballFeedCard {
  const football = event.sportId === '1';
  const competition = football ? ownerFootballLogo('competition', event.league.id) : null;
  const tier = eventTier(event);
  const liveClock = publishLiveClock(event.liveClock, now);
  const markets = event.markets.filter((market) => {
    if (football || market.availability === 'suspended') return true;
    const observed = Date.parse(market.updatedAt ?? '');
    return observed <= now && now - observed <= (event.status === 'live' ? 30_000 : 180_000);
  });
  return {
    id: football ? event.eventId : `betsapi:${event.sportId}:${event.eventId}`,
    sport: event.sport === 'esports' || tier === 5 ? 'esports' : event.sport,
    tier,
    logos: {
      competitionId: competition?.canonicalId ?? null,
      competition: competition?.path ?? null,
      home: football ? ownerFootballLogo('participant', event.home.id)?.path ?? null : null,
      away: football ? ownerFootballLogo('participant', event.away.id)?.path ?? null : null,
    },
    league: event.league.name ?? '',
    country: competition?.canonicalId === 'football:eng:premier-league' ? 'eng' : event.league.countryCode ?? '',
    home: event.home.name,
    away: event.away.name,
    kickoff: event.kickoff,
    live: event.status === 'live',
    score: event.score,
    liveClock,
    period: liveClock && !liveClock.stale && tier !== 5 ? event.period ?? null : null,
    insights: event.insights ?? null,
    priceState: priceStateOf({ ...event, markets }),
    markets: markets.flatMap((market) => {
      const card = marketToCard(market);
      return card ? [card] : [];
    }),
  };
}

function quoteFrom(read: EventOddsRead): FootballOddsQuote {
  return {
    id: read.eventId,
    priceState: read.priceState,
    stale: read.stale,
    markets: read.markets.flatMap((market) => {
      const card = marketToCard(market);
      return card ? [card] : [];
    }),
  };
}

function oddsIds(raw: string): string[] {
  const ids: string[] = [];
  for (const part of raw.split(',')) {
    const id = part.trim();
    if (!/^\d{1,20}$/.test(id) || ids.includes(id)) continue;
    ids.push(id);
    if (ids.length >= MAX_ODDS_IDS) break;
  }
  return ids;
}

export async function handleFootballFeedRequest(
  input: { method?: string; url?: string },
  client: BetsApiReadOnlyClient = getSharedBetsApiClient(),
  oddsClient?: BetsApiReadOnlyClient,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (String(input.method ?? 'GET').toUpperCase() !== 'GET') {
    return { status: 404, body: { ok: false, error: 'NOT_FOUND' } };
  }
  const params = input.url ? new URL(input.url, 'http://127.0.0.1').searchParams : new URLSearchParams();
  if (params.has('bet365For')) {
    const eventsId = params.get('bet365For') ?? '';
    const read = await client.readBet365Expanded(eventsId, params.get('live') === '1');
    return {
      status: 200,
      body: {
        ok: true,
        error: null,
        mapped: read.mapped,
        rateLimited: read.rateLimited,
        stale: read.stale,
        fi: read.link?.fi ?? null,
        eventsId: read.mapped ? eventsId : null,
        markets: read.markets?.markets ?? [],
      },
    };
  }
  if (params.has('oddsFor')) {
    return readOddsBatch(params.get('oddsFor') ?? '', oddsClient ?? (client === getSharedBetsApiClient() ? getFootballOddsClient() : client));
  }
  const eventId = params.get('eventId') ?? '';
  if (eventId) {
    const additional = /^betsapi:(\d{1,3}):(\d{1,20})$/.exec(eventId);
    const sportId = additional?.[1] as EventsSportId | undefined;
    if (additional ? !sportId || !client.additionalSportIds().includes(sportId) : !/^\d{1,20}$/.test(eventId)) {
      return { status: 404, body: { ok: false, error: 'NOT_FOUND' } };
    }
    const event = additional ? await client.getEvent(additional[2], sportId) : await client.getEvent(eventId);
    return {
      status: event.ok ? 200 : event.error === 'TOKEN_MISSING' ? 200 : 503,
      body: {
        ok: event.ok || event.error === 'TOKEN_MISSING',
        error: event.error,
        stale: Boolean(event.feed?.stale),
        events: cardsFrom(event),
      },
    };
  }
  const includeSports = params.get('includeSports') === '1';
  const [live, upcoming, additional] = await Promise.all([
    client.getInplay(), client.getPrematchCoverage(),
    includeSports ? client.getAdditionalSports() : [],
  ]);
  const tokenMissing = live.error === 'TOKEN_MISSING' || upcoming.error === 'TOKEN_MISSING';
  return {
    status: tokenMissing || live.ok || upcoming.ok ? 200 : 503,
    body: {
      ok: tokenMissing || live.ok || upcoming.ok,
      error: tokenMissing ? 'TOKEN_MISSING' : live.error ?? upcoming.error,
      stale: Boolean(live.feed?.stale || upcoming.feed?.stale),
      coverage: additional.map(({ sportId, prematch, result }) => ({
        sportId, phase: prematch ? 'prematch' : 'live', observed: Boolean(result?.ok && !result.feed?.stale),
        count: result?.feed?.events.length ?? 0, upstreamStatus: result?.upstreamStatus ?? null, error: result?.error ?? null,
      })),
      ...(() => {
        const now = Date.now();
        const pool = [
          ...(live.feed?.events ?? []),
          ...(upcoming.feed?.events ?? []),
          ...additional.flatMap(({ result }) => result?.feed?.events.filter((event) =>
            event.status !== 'prematch' || Date.parse(event.kickoff ?? '') > now) ?? []),
        ];
        const cards = (events: NormalizedEvent[]) => events.map((event) => toCard(event, now));
        return {
          events: cards(rankFeaturedFootball(pool, includeSports)),
          featuredLive: cards(selectFeaturedLive(pool)),
          featuredLine: cards(selectFeaturedLine(pool, now)),
          schedule: cards(selectSchedule(pool)),
        };
      })(),
    },
  };
}

async function readOddsBatch(
  raw: string,
  client: BetsApiReadOnlyClient,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const ids = oddsIds(raw);
  const quotes: FootballOddsQuote[] = [];
  const started = Date.now();
  let stop = false;
  for (const id of ids) {
    if (stop || (quotes.length > 0 && Date.now() - started > ODDS_BATCH_BUDGET_MS)) {
      quotes.push({ id, priceState: 'deferred', stale: false, markets: [] });
      continue;
    }
    const read = await client.readEventOdds(id);
    quotes.push(quoteFrom(read));
    if (read.priceState === 'rate_limited') stop = true;
  }
  return {
    status: 200,
    body: {
      ok: true,
      error: null,
      quotes,
    },
  };
}
