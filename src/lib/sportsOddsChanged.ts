import type { BetSelection } from '../types';
import type { OddsUpdate } from './liveBetGuard';

export interface ChangedLegIdentity {
  fixtureId: string;
  marketId: string;
  marketKey: string;
  line: string;
  outcomeId: string;
  currentPrice: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function norm(value: unknown): string {
  return String(value ?? '').trim();
}

export function parseChangedLeg(value: unknown): ChangedLegIdentity | null {
  const row = asRecord(value);
  const fixtureId = norm(row.fixtureId);
  const marketId = norm(row.marketId);
  const marketKey = norm(row.marketKey);
  const line = String(row.line ?? '');
  const outcomeId = norm(row.outcomeId);
  const currentPrice = Number(row.currentPrice);
  if (!fixtureId || !marketId || !marketKey || !outcomeId) return null;
  if (!Number.isFinite(currentPrice) || currentPrice <= 1) return null;
  return { fixtureId, marketId, marketKey, line, outcomeId, currentPrice };
}

export function selectionMatchesChangedLeg(
  row: BetSelection,
  leg: ChangedLegIdentity,
): boolean {
  return norm(row.fixtureId ?? row.matchId) === leg.fixtureId
    && norm(row.marketId) === leg.marketId
    && norm(row.marketKey) === leg.marketKey
    && String(row.line ?? '') === leg.line
    && norm(row.outcomeId) === leg.outcomeId;
}

export function oddsUpdatesFromPlaceError(
  body: Record<string, unknown>,
  selections: BetSelection[],
): OddsUpdate[] | undefined {
  const changed = parseChangedLeg(body.changedLeg);
  if (changed) {
    const row = selections.find((item) => selectionMatchesChangedLeg(item, changed));
    if (!row) return undefined;
    return [{
      id: row.id,
      previousOdds: row.odds,
      odds: changed.currentPrice,
      matchLabel: row.matchLabel,
      outcome: row.outcome,
    }];
  }

  if (selections.length !== 1) return undefined;
  const current = Number(body.currentPrice);
  if (!Number.isFinite(current) || current <= 1) return undefined;
  const row = selections[0];
  return [{
    id: row.id,
    previousOdds: row.odds,
    odds: current,
    matchLabel: row.matchLabel,
    outcome: row.outcome,
  }];
}
