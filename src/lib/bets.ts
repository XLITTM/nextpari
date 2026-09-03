import { toHistoryEntry } from './betHistoryView';
import { blockedSportsBet, SPORTS_BET_GATE_MESSAGE } from './playerMoneyGate';
import { ensureOwnPlayerWallet } from './playerWallet';
import { serializeSportsPlaceBody } from './sportsPlaceRequest';
import type { OddsUpdate } from './liveBetGuard';
import type { BetHistoryEntry, BetSelection } from '../types';

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

  const res = await fetch('/api/player/sports/place', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(serializeSportsPlaceBody({
      selections: params.selections,
      stake: params.stake,
      idempotencyKey: params.idempotencyKey ?? newIdempotencyKey(),
    })),
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

export async function fetchBets(): Promise<BetHistoryEntry[]> {
  try {
    const res = await fetch('/api/player/sports/bets', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-store' },
    });
    const body = await readJson(res);
    const rows = Array.isArray(body.bets) ? body.bets : [];
    return rows.map((row) => toHistoryEntry(asRecord(row)));
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
