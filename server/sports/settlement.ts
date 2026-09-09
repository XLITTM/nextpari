import type { SportsProvider } from './types.js';

export const SPORTS_SETTLEMENT = {
  Cancelled: -1,
  Pending: 0,
  Lost: 1,
  Won: 2,
  Refund: 3,
  HalfLost: 4,
  HalfWon: 5,
} as const;

export type SportsSettlementCode = (typeof SPORTS_SETTLEMENT)[keyof typeof SPORTS_SETTLEMENT];

export interface SportsSettlementNotice {
  provider: SportsProvider;
  fixtureId: string;
  marketId: string;
  marketKey: string;
  outcomeId: string;
  settlement: SportsSettlementCode;
  fingerprint: string;
  lastUpdate: string | null;
}

export function isSportsSettlementCode(value: unknown): value is SportsSettlementCode {
  return value === SPORTS_SETTLEMENT.Cancelled
    || value === SPORTS_SETTLEMENT.Pending
    || value === SPORTS_SETTLEMENT.Lost
    || value === SPORTS_SETTLEMENT.Won
    || value === SPORTS_SETTLEMENT.Refund
    || value === SPORTS_SETTLEMENT.HalfLost
    || value === SPORTS_SETTLEMENT.HalfWon;
}

export function readSportsSettlementCode(value: unknown): SportsSettlementCode | null {
  if (typeof value === 'number' && isSportsSettlementCode(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (isSportsSettlementCode(parsed)) return parsed;
  }
  return null;
}

export function normalizeSettlementProviderId(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export type SportsSettlementParseError =
  | 'SETTLEMENT_PROVIDER_REQUIRED'
  | 'SETTLEMENT_PROVIDER_MISMATCH'
  | 'SETTLEMENT_FINGERPRINT_REQUIRED'
  | 'SETTLEMENT_IDENTITY_REQUIRED'
  | 'SETTLEMENT_INVALID';

export function uniformSettlementProvider(
  notices: Array<{ provider: string }>,
  batchProvider = '',
): { ok: true; provider: string } | { ok: false; error: Extract<SportsSettlementParseError, 'SETTLEMENT_PROVIDER_REQUIRED' | 'SETTLEMENT_PROVIDER_MISMATCH'> } {
  const batch = normalizeSettlementProviderId(batchProvider);
  const providers = [...new Set(notices.map((row) => normalizeSettlementProviderId(row.provider)))];
  if (!providers.length || providers.some((id) => !id)) {
    return { ok: false, error: 'SETTLEMENT_PROVIDER_REQUIRED' };
  }
  if (providers.length !== 1) {
    return { ok: false, error: 'SETTLEMENT_PROVIDER_MISMATCH' };
  }
  if (batch && providers[0] !== batch) {
    return { ok: false, error: 'SETTLEMENT_PROVIDER_MISMATCH' };
  }
  return { ok: true, provider: providers[0] };
}

export function parseSportsSettlementNotice(
  value: unknown,
  defaultProvider = '',
): { ok: true; notice: SportsSettlementNotice } | { ok: false; error: SportsSettlementParseError } {
  const row = asRecord(value);
  const provider = normalizeSettlementProviderId(row.provider) || normalizeSettlementProviderId(defaultProvider);
  if (!provider) return { ok: false, error: 'SETTLEMENT_PROVIDER_REQUIRED' };
  const fingerprint = String(row.fingerprint ?? '').trim();
  if (!fingerprint) return { ok: false, error: 'SETTLEMENT_FINGERPRINT_REQUIRED' };
  const fixtureId = String(row.fixtureId ?? row.fixture_id ?? '').trim();
  const outcomeId = String(row.outcomeId ?? row.outcome_id ?? row.betId ?? '').trim();
  if (!fixtureId || !outcomeId) return { ok: false, error: 'SETTLEMENT_IDENTITY_REQUIRED' };
  const settlement = readSportsSettlementCode(row.settlement);
  if (settlement == null) return { ok: false, error: 'SETTLEMENT_INVALID' };
  return {
    ok: true,
    notice: {
      provider,
      fixtureId,
      marketId: String(row.marketId ?? row.market_id ?? '').trim(),
      marketKey: String(row.marketKey ?? row.market_key ?? '').trim(),
      outcomeId,
      settlement,
      fingerprint,
      lastUpdate: row.lastUpdate == null ? null : String(row.lastUpdate),
    },
  };
}

export function settlementNoticeToRpcItem(notice: SportsSettlementNotice): Record<string, unknown> {
  return {
    provider: notice.provider,
    fixtureId: notice.fixtureId,
    marketId: notice.marketId,
    marketKey: notice.marketKey,
    outcomeId: notice.outcomeId,
    settlement: notice.settlement,
    fingerprint: notice.fingerprint,
    lastUpdate: notice.lastUpdate,
  };
}
