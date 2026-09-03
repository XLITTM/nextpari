import { GAME_NO_STORE_HEADERS, serverTimingHeader } from '../games/httpCache.js';
import { isCanonicalSportsBetEnabled } from '../sports/enabled.js';
import { fetchLsportsCanonicalQuote } from '../sports/feedClient.js';
import { createSportsPlaceAsPlayerRpc, type SportsPlaceAsPlayer } from '../sports/placeRpc.js';
import { decideSportsQuote } from '../sports/quote.js';
import { evaluateSportsRisk } from '../sports/risk.js';
import type { SportsQuote, SportsQuoteRequest } from '../sports/types.js';
import { staffError, StaffOnboardingError } from '../staff/errors.js';
import {
  livePlayerGamePorts,
  runPlayerGameRpc,
  type PlayerGameGatewayPorts,
} from './playerGamesService.js';
import type { PlayerAuthHttpResult } from './playerAuthService.js';
import {
  readPlayerCookies,
  serializePlayerCookies,
} from './playerCookies.js';

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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
  placeAsVerifiedPlayer?: SportsPlaceAsPlayer;
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

async function resolveVerifiedPlayerUserId(
  ports: SportsPlacePorts,
  cookieHeader: string | undefined,
  secure: boolean,
): Promise<{ userId: string; cookies?: string[]; authMs: number; refreshed: boolean }> {
  const started = Date.now();
  const cookies = readPlayerCookies(cookieHeader);
  if (!cookies.accessToken && !cookies.refreshToken) {
    throw staffError('JWT_REQUIRED', 401);
  }

  let accessToken = cookies.accessToken;
  let setCookies: string[] | undefined;
  let refreshed = false;

  if (!accessToken) {
    if (!cookies.refreshToken) throw staffError('JWT_REQUIRED', 401);
    try {
      const tokens = await ports.refreshSession(cookies.refreshToken);
      accessToken = tokens.accessToken;
      setCookies = serializePlayerCookies(tokens.accessToken, tokens.refreshToken, secure);
      refreshed = true;
    } catch {
      throw staffError('JWT_INVALID', 401);
    }
  }

  try {
    const user = await ports.getAuthUser(accessToken);
    const userId = String(user.id ?? '').trim();
    if (!userId || !isUuid(userId)) throw staffError('AUTH_REQUIRED', 401);
    return { userId, cookies: setCookies, authMs: Date.now() - started, refreshed };
  } catch (error) {
    if (refreshed || !cookies.refreshToken) {
      if (error instanceof StaffOnboardingError) throw error;
      throw staffError('JWT_INVALID', 401);
    }
    let tokens;
    try {
      tokens = await ports.refreshSession(cookies.refreshToken);
    } catch {
      throw staffError('JWT_INVALID', 401);
    }
    const user = await ports.getAuthUser(tokens.accessToken);
    const userId = String(user.id ?? '').trim();
    if (!userId || !isUuid(userId)) throw staffError('AUTH_REQUIRED', 401);
    return {
      userId,
      cookies: serializePlayerCookies(tokens.accessToken, tokens.refreshToken, secure),
      authMs: Date.now() - started,
      refreshed: true,
    };
  }
}

export async function placeSportsBet(
  ports: SportsPlacePorts,
  cookieHeader: string | undefined,
  body: Record<string, unknown>,
  secure: boolean,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PlayerAuthHttpResult> {
  const totalStart = Date.now();
  if (!isCanonicalSportsBetEnabled(env)) {
    throw staffError('SPORTS_BET_DISABLED', 403);
  }

  const session = await resolveVerifiedPlayerUserId(ports, cookieHeader, secure);

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
      bettingEnabled: isCanonicalSportsBetEnabled(env),
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

  if (!isCanonicalSportsBetEnabled(env)) {
    throw staffError('SPORTS_BET_DISABLED', 403);
  }

  const place = ports.placeAsVerifiedPlayer ?? createSportsPlaceAsPlayerRpc();
  const rpcStart = Date.now();
  const payload = await place({
    playerUserId: session.userId,
    idempotencyKey,
    stake,
    mode,
    legs: accepted,
  });
  return {
    status: 200,
    body: payload,
    cookies: session.cookies,
    headers: {
      ...GAME_NO_STORE_HEADERS,
      'Server-Timing': serverTimingHeader({
        authMs: session.authMs,
        rpcMs: Date.now() - rpcStart,
        totalMs: Date.now() - totalStart,
        refreshed: session.refreshed,
      }),
    },
  };
}

export async function listSportsBets(
  ports: SportsPlacePorts,
  cookieHeader: string | undefined,
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  return runPlayerGameRpc(ports, cookieHeader, secure, 'player_sports_list', {});
}

export function liveSportsPlacePorts(): SportsPlacePorts {
  return {
    ...livePlayerGamePorts(),
    placeAsVerifiedPlayer: createSportsPlaceAsPlayerRpc(),
  };
}
