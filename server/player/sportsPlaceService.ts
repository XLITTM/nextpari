import { isCanonicalSportsBetEnabled } from '../sports/enabled.js';
import { fetchLsportsCanonicalQuote } from '../sports/feedClient.js';
import { decideSportsQuote } from '../sports/quote.js';
import { evaluateSportsRisk } from '../sports/risk.js';
import type { SportsQuote, SportsQuoteRequest } from '../sports/types.js';
import { staffError, StaffOnboardingError } from '../staff/errors.js';
import { runPlayerGameRpc, type PlayerGameGatewayPorts } from './playerGamesService.js';
import type { PlayerAuthHttpResult } from './playerAuthService.js';

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function requireText(value: unknown, code: string): string {
  const text = String(value ?? '').trim();
  if (!text) throw staffError(code, 400);
  return text;
}

function requireStake(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw staffError('STAKE_NOT_POSITIVE', 400);
  }
  return Number(n.toFixed(2));
}

function parseQuote(value: unknown): SportsQuote {
  const row = asRecord(value);
  const health = row.health === 'HEALTHY' || row.health === 'STALE' || row.health === 'UNKNOWN'
    ? row.health
    : 'UNKNOWN';
  const status = row.status === 'open' || row.status === 'suspended' || row.status === 'settled'
    ? row.status
    : 'missing';
  const priceRaw = row.price;
  const price = typeof priceRaw === 'number' && Number.isFinite(priceRaw) ? priceRaw : Number(priceRaw);
  return {
    provider: row.provider === 'betsapi' ? 'betsapi' : 'lsports',
    feedType: row.feedType === 'prematch' ? 'prematch' : 'inplay',
    fixtureId: String(row.fixtureId ?? ''),
    marketId: String(row.marketId ?? ''),
    marketKey: String(row.marketKey ?? ''),
    line: String(row.line ?? ''),
    outcomeId: String(row.outcomeId ?? row.betId ?? ''),
    outcomeName: String(row.outcomeName ?? ''),
    price: Number.isFinite(price) && price > 1 ? price : null,
    status,
    marketStatus: String(row.marketStatus ?? ''),
    betStatus: String(row.betStatus ?? ''),
    betStatusId: String(row.betStatusId ?? ''),
    selectable: row.selectable === true,
    updatedAt: row.updatedAt == null ? null : String(row.updatedAt),
    health,
    heartbeatAgeMs: row.heartbeatAgeMs == null ? null : Number(row.heartbeatAgeMs),
  };
}

function quoteHttpStatus(reason: string): number {
  if (reason === 'SPORTS_BET_DISABLED') return 403;
  if (reason === 'INVALID_PRICE' || reason === 'MISSING_BET_ID' || reason === 'MISSING_FIXTURE') return 400;
  return 409;
}

export interface SportsPlacePorts extends PlayerGameGatewayPorts {
  fetchQuote?: (request: SportsQuoteRequest) => Promise<SportsQuote>;
}

async function defaultFetchQuote(request: SportsQuoteRequest): Promise<SportsQuote> {
  const json = await fetchLsportsCanonicalQuote({
    fixtureId: request.fixtureId,
    marketId: request.marketId,
    marketKey: request.marketKey,
    outcomeId: request.outcomeId,
    feedType: request.feedType,
  });
  return parseQuote(json);
}

function parseLeg(value: unknown): SportsQuoteRequest {
  const row = asRecord(value);
  return {
    provider: String(row.provider ?? 'lsports'),
    feedType: String(row.feedType ?? row.feed_type ?? 'inplay'),
    fixtureId: requireText(row.fixtureId ?? row.fixture_id ?? row.matchId, 'MISSING_FIXTURE'),
    marketId: String(row.marketId ?? row.market_id ?? ''),
    marketKey: String(row.marketKey ?? row.market_key ?? ''),
    line: String(row.line ?? ''),
    outcomeId: requireText(row.outcomeId ?? row.betId ?? row.outcome_id, 'MISSING_BET_ID'),
    price: Number(row.price ?? row.odds),
  };
}

export async function placeSportsBet(
  ports: SportsPlacePorts,
  cookieHeader: string | undefined,
  body: Record<string, unknown>,
  secure: boolean,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PlayerAuthHttpResult> {
  if (!isCanonicalSportsBetEnabled(env)) {
    throw staffError('SPORTS_BET_DISABLED', 403);
  }
  const stake = requireStake(body.stake);
  const modeRaw = String(body.mode ?? 'single').trim().toLowerCase();
  const mode = modeRaw === 'express' ? 'express' : 'single';
  const idempotencyKey = requireText(body.idempotencyKey ?? body.idempotency_key, 'IDEMPOTENCY_KEY_REQUIRED');
  const rawLegs = Array.isArray(body.legs)
    ? body.legs
    : Array.isArray(body.selections)
      ? body.selections
      : [];
  if (!rawLegs.length) throw staffError('SPORTS_LEGS_REQUIRED', 400);
  if (mode === 'single' && rawLegs.length !== 1) {
    throw staffError('SPORTS_SINGLE_REQUIRES_ONE_LEG', 400);
  }
  if (mode === 'express' && rawLegs.length < 2) {
    throw staffError('SPORTS_EXPRESS_REQUIRES_LEGS', 400);
  }

  const requests = rawLegs.map(parseLeg);
  const fetchQuote = ports.fetchQuote ?? defaultFetchQuote;
  const accepted: Array<Record<string, unknown>> = [];
  const quotes: SportsQuote[] = [];

  for (const request of requests) {
    let quote: SportsQuote;
    try {
      quote = await fetchQuote(request);
    } catch {
      throw staffError('FEED_STALE', 409);
    }
    const decision = decideSportsQuote(request, quote, {
      bettingEnabled: true,
    });
    if (!decision.ok) {
      throw new StaffOnboardingError(decision.reason, quoteHttpStatus(decision.reason), decision.reason, {
        currentPrice: decision.currentPrice ?? decision.quote?.price ?? null,
        quote: decision.quote ?? quote,
      });
    }
    const raw = asRecord(rawLegs[quotes.length]);
    quotes.push(decision.quote);
    accepted.push({
      provider: decision.quote.provider,
      feedType: decision.quote.feedType,
      fixtureId: decision.quote.fixtureId,
      marketId: decision.quote.marketId,
      marketKey: decision.quote.marketKey,
      line: decision.quote.line,
      outcomeId: decision.quote.outcomeId,
      outcomeName: decision.quote.outcomeName,
      acceptedOdds: decision.quote.price,
      marketStatus: decision.quote.marketStatus,
      betStatus: decision.quote.betStatus,
      betStatusId: decision.quote.betStatusId,
      updatedAt: decision.quote.updatedAt,
      fixtureLabel: raw.matchLabel ?? raw.fixtureLabel,
      league: raw.league,
    });
  }

  const risk = evaluateSportsRisk({ stake, mode, quotes });
  if (!risk.ok) throw staffError(risk.code, 409);

  return runPlayerGameRpc(ports, cookieHeader, secure, 'player_sports_place', {
    p_idempotency_key: idempotencyKey,
    p_stake: stake,
    p_mode: mode,
    p_legs: accepted,
  });
}

export async function listSportsBets(
  ports: SportsPlacePorts,
  cookieHeader: string | undefined,
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  return runPlayerGameRpc(ports, cookieHeader, secure, 'player_sports_list', {});
}
