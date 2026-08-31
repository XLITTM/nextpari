import { tournamentLine } from './betTicket';
import { blockedSportsBet, SPORTS_BET_GATE_MESSAGE } from './playerMoneyGate';
import { ensureOwnPlayerWallet } from './playerWallet';
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
  | { ok: true; newBalance: number }
  | { ok: false; error: string; reason?: 'odds_changed' | 'suspended' | 'generic'; updates?: OddsUpdate[] };

export async function placeBet(_params: {
  selections: BetSelection[];
  stake: number;
  mode: 'single' | 'express';
  skipLiveCheck?: boolean;
}): Promise<PlaceBetResult> {
  const blocked = blockedSportsBet();
  if (blocked) return { ok: false, error: blocked };
  return { ok: false, error: SPORTS_BET_GATE_MESSAGE };
}

function mapStatus(value: string | undefined): BetStatus {
  if (value === 'won' || value === 'win') return 'won';
  if (value === 'lost' || value === 'lose') return 'lost';
  return 'in_progress';
}

export async function fetchBets(): Promise<BetHistoryEntry[]> {
  return [];
}

function mapEvent(raw: Record<string, unknown>): BetEvent {
  const home = String(raw.homeTeam ?? raw.home_team ?? '');
  const away = String(raw.awayTeam ?? raw.away_team ?? '');
  const outcome = String(raw.outcome ?? raw.selection ?? '');
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
    matchId: raw.matchId ? String(raw.matchId) : raw.match_id ? String(raw.match_id) : undefined,
    matchLabel: String(raw.matchLabel ?? raw.match_label ?? [home, away].filter(Boolean).join(' — ')),
    market: String(raw.market ?? ''),
    outcome,
    selection: String(raw.selection ?? outcome),
    odds: Number(raw.odds ?? 0),
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

function mapItem(raw: Record<string, unknown>): BetEvent {
  return mapEvent(raw);
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
