import { outcomeLabel, type ParsedMarket, type ParsedMarketEntry, type ParsedOutcome } from './odds-parser';
import type { BetSelection, MatchEvent } from '../types';

function looksLikeBetId(value: string): boolean {
  return /^\d{6,}$/.test(value.trim());
}

export function canonicalKeyFromNormalized(
  fixtureId: string,
  market: ParsedMarket,
  entry: ParsedMarketEntry,
): string {
  const fromEntry = String(entry.canonicalKey ?? '').trim();
  if (fromEntry.includes(':')) return fromEntry;
  const fromMarket = String(market.canonicalKey ?? '').trim();
  if (fromMarket.includes(':')) return fromMarket;
  const marketId = String(market.marketId ?? '').trim();
  const line = String(entry.line ?? '');
  return `${fixtureId}:${marketId}:${line}`;
}

export function hasCompleteLsportsIdentity(row: {
  provider?: string;
  fixtureId?: string;
  marketId?: string;
  marketKey?: string;
  line?: string;
  outcomeId?: string;
}): boolean {
  const fixtureId = String(row.fixtureId ?? '').trim();
  const marketId = String(row.marketId ?? '').trim();
  const marketKey = String(row.marketKey ?? '').trim();
  const outcomeId = String(row.outcomeId ?? '').trim();
  if (!fixtureId || !marketId || !marketKey || !outcomeId) return false;
  if (!looksLikeBetId(outcomeId)) return false;
  const parts = marketKey.split(':');
  if (parts.length < 3) return false;
  if (parts[0] !== fixtureId || parts[1] !== marketId) return false;
  return parts.slice(2).join(':') === String(row.line ?? '');
}

export function selectionFromLsportsOutcome(
  match: MatchEvent,
  market: ParsedMarket,
  entry: ParsedMarketEntry,
  outcome: ParsedOutcome,
): BetSelection | null {
  const fixtureId = String(match.id ?? '').trim();
  const marketId = String(market.marketId ?? '').trim();
  const providerBetId = String(outcome.providerBetId ?? '').trim();
  if (!fixtureId || !marketId || !looksLikeBetId(providerBetId)) return null;
  const line = String(entry.line ?? '');
  const marketKey = canonicalKeyFromNormalized(fixtureId, market, entry);
  const label = outcomeLabel(outcome.key, entry.line);
  return {
    id: `lsports:${fixtureId}:${marketKey}:${providerBetId}`,
    matchId: fixtureId,
    matchLabel: `${match.team1} — ${match.team2}`,
    market: market.name,
    outcome: label,
    odds: outcome.odds,
    homeTeam: match.team1,
    awayTeam: match.team2,
    sport: match.sport,
    country: match.country,
    league: match.league,
    isLive: match.isLive,
    startTime: match.startTime,
    liveStatus: match.liveStatus,
    provider: 'lsports',
    feedType: 'inplay',
    fixtureId,
    marketId,
    marketKey,
    line,
    outcomeId: providerBetId,
  };
}
