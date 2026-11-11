import { BetsApiReadOnlyClient, getSharedBetsApiClient } from './client.js';
import { eventWithOdds } from './parse.js';
import type { FeedResult, NormalizedEvent, NormalizedMarket } from './types.js';

const ODDS_ENRICH_LIMIT = 3;

export const FOOTBALL_FEED_PATH = '/api/player/sports/football-feed';

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
    key: NormalizedMarket['key'];
    name: string;
    line: string;
    status: 'open' | 'closed';
    outcomes: Array<{ key: string; name: string; price: number }>;
    updatedAt: string | null;
  }>;
}

function cardsFrom(result: FeedResult | null): FootballFeedCard[] {
  const events = result?.feed?.events ?? [];
  return events.map(toCard);
}

async function enrichListedOdds(
  client: BetsApiReadOnlyClient,
  events: NormalizedEvent[],
): Promise<NormalizedEvent[]> {
  let remaining = ODDS_ENRICH_LIMIT;
  const priced: NormalizedEvent[] = [];
  for (const event of events) {
    if (remaining <= 0 || event.markets.some((market) => market.status === 'open')) {
      priced.push(event);
      continue;
    }
    remaining -= 1;
    const payload = await client.getOddsPayload(event.eventId);
    priced.push(payload ? eventWithOdds(event, payload) : event);
  }
  return priced;
}

function toCard(event: NormalizedEvent): FootballFeedCard {
  return {
    id: event.eventId,
    league: event.league.name ?? '',
    country: event.league.countryCode ?? '',
    home: event.home.name,
    away: event.away.name,
    kickoff: event.kickoff,
    live: event.status === 'live',
    score: event.score,
    markets: event.markets.filter((market) => market.status === 'open').map((market) => ({
      key: market.key,
      name: market.name,
      line: market.line ?? '',
      status: 'open' as const,
      outcomes: market.outcomes.map((outcome) => ({
        key: outcome.key,
        name: outcome.name,
        price: outcome.price,
      })),
      updatedAt: market.updatedAt,
    })),
  };
}

export async function handleFootballFeedRequest(
  input: { method?: string; url?: string },
  client: BetsApiReadOnlyClient = getSharedBetsApiClient(),
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (String(input.method ?? 'GET').toUpperCase() !== 'GET') {
    return { status: 404, body: { ok: false, error: 'NOT_FOUND' } };
  }
  const params = input.url ? new URL(input.url, 'http://127.0.0.1').searchParams : new URLSearchParams();
  const eventId = params.get('eventId') ?? '';
  if (eventId) {
    if (!/^\d{1,20}$/.test(eventId)) return { status: 404, body: { ok: false, error: 'NOT_FOUND' } };
    const event = await client.getEvent(eventId);
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
  const [live, upcoming] = await Promise.all([client.getInplay(), client.getUpcoming(1)]);
  const tokenMissing = live.error === 'TOKEN_MISSING' || upcoming.error === 'TOKEN_MISSING';
  const listed = [...(live.feed?.events ?? []), ...(upcoming.feed?.events ?? [])];
  const priced = tokenMissing ? listed : await enrichListedOdds(client, listed);
  return {
    status: tokenMissing || live.ok || upcoming.ok ? 200 : 503,
    body: {
      ok: tokenMissing || live.ok || upcoming.ok,
      error: tokenMissing ? 'TOKEN_MISSING' : live.error ?? upcoming.error,
      stale: Boolean(live.feed?.stale || upcoming.feed?.stale),
      events: priced.map(toCard),
    },
  };
}
