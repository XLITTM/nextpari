import { tournamentLine } from './betTicket';
import { blockedSportsBet, SPORTS_BET_GATE_MESSAGE } from './playerMoneyGate';
import { ensureOwnPlayerWallet } from './playerWallet';
import { serializeSportsPlaceBody } from './sportsPlaceRequest';
import type { OddsUpdate } from './liveBetGuard';
import type { BetEvent, BetHistoryEntry, BetSelection, BetStatus, SportId } from '../types';

export interface WalletRow {
  id: string;
  balance: number;
  publicId: string | null;
}

export async function fetchWallet(): Promise<WalletRow | null> {
  try {
    const wallet = await ensureOwnPlayerWallet();
    return {
      id: '',
      balance: wallet.balance,
      publicId: wallet.publicId,
    };
  } catch (error) {
    console.error('Failed to load wallet:', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function fetchWalletBalance(): Promise<number | null> {
  const wallet = await fetchWallet();
  return wallet?.balance ?? null;
}

export type PlaceBetResult =
  | { ok: true; newBalance: number; betId?: string; isDuplicate?: boolean }
  | { ok: false; error: string; reason?: 'odds_changed' | 'suspended' | 'generic'; updates?: OddsUpdate[] };

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const body = await res.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function rejectReason(code: string): 'odds_changed' | 'suspended' | 'generic' {
  if (code === 'ODDS_CHANGED') return 'odds_changed';
  if (code === 'MARKET_SUSPENDED') return 'suspended';
  return 'generic';
}

export async function placeBet(params: {
  selections: BetSelection[];
  stake: number;
  mode: 'single' | 'express';
  skipLiveCheck?: boolean;
  idempotencyKey?: string;
}): Promise<PlaceBetResult> {
  const blocked = blockedSportsBet();
  if (blocked) return { ok: false, error: blocked };

  const payload = serializeSportsPlaceBody({
    selections: params.selections,
    stake: params.stake,
    idempotencyKey: params.idempotencyKey ?? newIdempotencyKey(),
  });
  if (!payload) return { ok: false, error: 'EVENT_UNAVAILABLE' };

  const res = await fetch('/api/player/sports/place', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(payload),
  });
  const body = await readJson(res);
  if (!res.ok || body.ok === false) {
    const code = String(body.error ?? SPORTS_BET_GATE_MESSAGE);
    const current = Number(body.currentPrice);
    const updates = Number.isFinite(current) && current > 1
      ? params.selections.map((row) => ({
        id: row.id,
        previousOdds: row.odds,
        odds: current,
        matchLabel: row.matchLabel,
        outcome: row.outcome,
      }))
      : undefined;
    return {
      ok: false,
      error: code,
      reason: rejectReason(code),
      updates,
    };
  }
  const balance = Number(body.balanceAfter ?? body.balance_after);
  return {
    ok: true,
    newBalance: Number.isFinite(balance) ? balance : 0,
    betId: body.betId ? String(body.betId) : undefined,
    isDuplicate: body.isDuplicate === true,
  };
}

function mapStatus(value: string | undefined): BetStatus {
  if (value === 'won' || value === 'win' || value === 'winner' || value === 'half_won') return 'won';
  if (value === 'lost' || value === 'lose' || value === 'loser' || value === 'half_lost') return 'lost';
  if (value === 'pending' || value === 'cancelled' || value === 'refund') return 'pending';
  return 'in_progress';
}

export async function fetchBets(): Promise<BetHistoryEntry[]> {
  try {
    const res = await fetch('/api/player/sports/bets', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-store' },
    });
    const body = await readJson(res);
    const rows = Array.isArray(body.bets) ? body.bets : [];
    return rows.map((row) => mapHistory(asRecord(row)));
  } catch {
    return [];
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function mapHistory(raw: Record<string, unknown>): BetHistoryEntry {
  const legs = Array.isArray(raw.legs) ? raw.legs : [];
  const events = legs.length
    ? legs.map((leg) => mapEvent(asRecord(leg)))
    : parseEventsJson(raw.events);
  const stake = Number(raw.stake ?? raw.amount ?? 0);
  const odds = Number(raw.acceptedOdds ?? raw.totalOdds ?? 0);
  return {
    id: String(raw.betId ?? raw.id ?? ''),
    type: raw.mode === 'express' ? 'express' : 'single',
    events,
    totalOdds: odds,
    amount: stake,
    payout: Number(raw.potentialPayout ?? raw.payout ?? 0),
    status: mapStatus(String(raw.settlementState ?? raw.status ?? '')),
    date: String(raw.acceptedAt ?? raw.date ?? ''),
    ticketCode: raw.betId ? String(raw.betId).slice(0, 8) : undefined,
  };
}

function mapEvent(raw: Record<string, unknown>): BetEvent {
  const home = String(raw.homeTeam ?? raw.home_team ?? '');
  const away = String(raw.awayTeam ?? raw.away_team ?? '');
  const outcome = String(raw.outcomeName ?? raw.outcome ?? raw.selection ?? '');
  const sport = (raw.sport ? String(raw.sport) : undefined) as SportId | undefined;
  const country = raw.country ? String(raw.country) : undefined;
  const league = raw.league ? String(raw.league) : undefined;
  const tournament = tournamentLine({
    tournament: raw.tournament ? String(raw.tournament) : undefined,
    sport,
    country,
    league,
  });
  const isLive = Boolean(raw.isLive ?? raw.is_live);
  const liveStatus = raw.liveStatus ? String(raw.liveStatus) : raw.live_status ? String(raw.live_status) : undefined;

  return {
    matchId: raw.fixtureId ? String(raw.fixtureId) : raw.matchId ? String(raw.matchId) : raw.match_id ? String(raw.match_id) : undefined,
    matchLabel: String(raw.fixtureLabel ?? raw.matchLabel ?? raw.match_label ?? [home, away].filter(Boolean).join(' — ')),
    market: String(raw.marketKey ?? raw.market ?? ''),
    outcome,
    selection: String(raw.selection ?? outcome),
    odds: Number(raw.acceptedOdds ?? raw.odds ?? 0),
    homeTeam: home || undefined,
    awayTeam: away || undefined,
    sport,
    country,
    league,
    tournament: tournament || undefined,
    isLive,
    liveStatus,
    matchStatus: String(raw.matchStatus ?? raw.match_status ?? (isLive ? 'LIVE' : 'Не начался')),
  };
}

function parseEventsJson(value: unknown): BetEvent[] {
  const raw = typeof value === 'string' ? safeParse(value) : value;
  if (!Array.isArray(raw)) return [];
  return raw.map((event) => mapEvent(event as Record<string, unknown>));
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
