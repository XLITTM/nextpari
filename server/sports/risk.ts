import type { SportsQuote } from './types.js';

export interface SportsRiskInput {
  playerUserId?: string;
  stake: number;
  mode: 'single' | 'express';
  quotes: SportsQuote[];
}

export type SportsRiskDecision = { ok: true } | { ok: false; code: string };

/**
 * Server-side hook before bet acceptance.
 * Do not hardcode production stake/event limits here.
 * Future: player stake limit, event/market/selection exposure, suspicious behavior, AI risk.
 */
export function evaluateSportsRisk(_input: SportsRiskInput): SportsRiskDecision {
  return { ok: true };
}
