import type { BetSelection } from '../types';
import { useSportsStore, type EventState } from '../stores/sportsStore';
import { useSettingsStore } from '../stores/settingsStore';
import {
  checkLiveSnapshots,
  inferMarketKey,
  inferSelection,
  normalizeScore,
  type BetPlacementSnapshot,
  type LiveMatchSnapshot,
  type LiveSnapshotResult,
  type OddsChangeUpdate,
} from './liveMarketCheck';

export const LIVE_BET_DELAY_MS = 3_000;
export type OddsUpdate = OddsChangeUpdate;
export type { BetPlacementSnapshot, LiveSnapshotResult };

export type LiveQuoteCheck =
  | { status: 'ok'; updates?: OddsUpdate[] }
  | { status: 'suspended'; error: string }
  | { status: 'odds_changed'; error: string; updates: OddsUpdate[] };

export function couponHasLive(selections: BetSelection[]): boolean {
  return selections.some((row) => row.isLive);
}

export function liveBetDelayMs(): number {
  return LIVE_BET_DELAY_MS;
}

export async function waitLiveBetDelay(
  totalMs: number,
  onTick?: (remainingMs: number) => void,
): Promise<void> {
  const started = Date.now();
  onTick?.(totalMs);
  await new Promise<void>((resolve) => {
    const interval = globalThis.setInterval(() => {
      const left = Math.max(0, totalMs - (Date.now() - started));
      onTick?.(left);
      if (left <= 0) {
        globalThis.clearInterval(interval);
        resolve();
      }
    }, 80);
  });
}

export function currentMatchScore(matchId: string): string {
  const state = useSportsStore.getState().getEvent(matchId);
  return normalizeScore(state?.score || state?.event.ss || '');
}

export function snapshotCoupon(selections: BetSelection[]): BetPlacementSnapshot[] {
  return selections.map((row) => ({
    eventId: row.matchId,
    marketKey: row.marketKey || inferMarketKey(row.market),
    selection: row.selectionKey || inferSelection(row.outcome),
    initialOdds: row.odds,
    initialScore: currentMatchScore(row.matchId),
    selectionId: row.id,
    isLive: Boolean(row.isLive),
    matchLabel: row.matchLabel,
    outcome: row.outcome,
    market: row.market,
  }));
}

export function readLiveMatches(): LiveMatchSnapshot[] {
  return useSportsStore.getState().liveMatches().map(toLiveMatchSnapshot);
}

function toLiveMatchSnapshot(state: EventState): LiveMatchSnapshot {
  return {
    eventId: state.event.id,
    timeStatus: String(state.event.time_status ?? ''),
    score: state.score || state.event.ss || '',
    markets: Object.values(state.markets),
  };
}

export function validateLiveSnapshots(
  snapshots: BetPlacementSnapshot[],
  policy = useSettingsStore.getState().oddsChangePolicy,
): LiveQuoteCheck {
  const result = checkLiveSnapshots(snapshots, readLiveMatches(), policy);
  if (result.status === 'ok') return { status: 'ok', updates: result.updates };
  if (result.status === 'odds_changed') {
    return { status: 'odds_changed', error: result.error, updates: result.updates };
  }
  return { status: 'suspended', error: result.error };
}

export function checkLiveQuotes(selections: BetSelection[]): LiveQuoteCheck {
  return validateLiveSnapshots(snapshotCoupon(selections));
}

export function applySnapshotOdds(
  snapshots: BetPlacementSnapshot[],
  updates: OddsUpdate[],
): BetPlacementSnapshot[] {
  if (!updates.length) return snapshots;
  const byId = new Map(updates.map((row) => [row.id, row.odds]));
  return snapshots.map((row) => {
    const next = byId.get(row.selectionId);
    return next != null ? { ...row, initialOdds: next } : row;
  });
}
