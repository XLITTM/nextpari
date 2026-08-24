import type { BetSelection } from '../types';
import { fetchEventOdds, fetchEventView } from './betsapi';
import { outcomeLabel, parseOdds, type ParsedMarket } from './odds-parser';
import { useSportsStore } from '../stores/sportsStore';

export const LIVE_BET_DELAY_MS = 2_500;
const ODDS_EPS = 0.01;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OddsUpdate {
  id: string;
  previousOdds: number;
  odds: number;
  matchLabel: string;
  outcome: string;
}

export type LiveQuoteCheck =
  | { status: 'ok' }
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
    const timer = window.setInterval(() => {
      const left = Math.max(0, totalMs - (Date.now() - started));
      onTick?.(left);
      if (left <= 0) {
        window.clearInterval(timer);
        resolve();
      }
    }, 80);
  });
}

function canQueryEvent(matchId?: string): boolean {
  if (!matchId) return false;
  if (matchId.startsWith('mock-')) return false;
  if (UUID_RE.test(matchId)) return false;
  return true;
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/х/g, 'x')
    .replace(/[^a-z0-9а-я.+-]/gi, '');
}

function labelsMatch(a: string, b: string): boolean {
  const left = fold(a);
  const right = fold(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function isMarketOpen(status: string | undefined): boolean {
  return status === '0' || status === '1' || status === '';
}

function findLiveOdds(markets: ParsedMarket[], selection: BetSelection): number | 'missing' | 'suspended' {
  const candidates: { odds: number; score: number }[] = [];
  for (const market of markets) {
    const marketHit = labelsMatch(market.name, selection.market) ? 3 : 0;
    for (const entry of market.entries) {
      if (entry.ss === 'suspended') return 'suspended';
      for (const outcome of entry.outcomes) {
        const label = outcomeLabel(outcome.key, entry.line);
        const outcomeHit =
          labelsMatch(label, selection.outcome) ||
          labelsMatch(outcome.key, selection.outcome) ||
          labelsMatch(outcome.raw, selection.outcome)
            ? 4
            : 0;
        if (!outcomeHit && !marketHit) continue;
        if (outcome.odds <= 1) return 'suspended';
        candidates.push({ odds: outcome.odds, score: marketHit + outcomeHit });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  if (!candidates.length) return 'missing';
  return candidates[0].odds;
}

async function loadFreshMarkets(matchId: string): Promise<{
  markets: ParsedMarket[];
  timeStatus: string;
}> {
  const sportId = useSportsStore.getState().getEvent(matchId)?.event.sport_id;
  const [view, packet] = await Promise.all([
    fetchEventView(matchId).catch(() => null),
    fetchEventOdds(matchId),
  ]);
  const timeStatus = String(view?.time_status ?? '');
  const markets = parseOdds(packet.odds as Record<string, unknown[]>, {
    sportId: sportId != null ? String(sportId) : undefined,
  });
  return { markets, timeStatus };
}

export async function checkLiveQuotes(selections: BetSelection[]): Promise<LiveQuoteCheck> {
  const liveRows = selections.filter((row) => row.isLive);
  if (!liveRows.length) return { status: 'ok' };

  const updates: OddsUpdate[] = [];
  const uniqueIds = [...new Set(liveRows.map((row) => row.matchId).filter(canQueryEvent))];
  if (!uniqueIds.length) return { status: 'ok' };

  const byMatch = new Map<string, { markets: ParsedMarket[]; timeStatus: string }>();
  await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        byMatch.set(id, await loadFreshMarkets(id));
      } catch (error) {
        console.warn('live quote fetch failed', id, error);
      }
    }),
  );

  for (const row of liveRows) {
    if (!canQueryEvent(row.matchId)) continue;
    const packed = byMatch.get(row.matchId);
    if (!packed) {
      return { status: 'suspended', error: 'Приём ставки временно закрыт. Попробуйте позже.' };
    }
    if (!isMarketOpen(packed.timeStatus)) {
      return { status: 'suspended', error: 'Приём ставки закрыт: событие недоступно.' };
    }
    const liveOdds = findLiveOdds(packed.markets, row);
    if (liveOdds === 'suspended' || liveOdds === 'missing') {
      return {
        status: 'suspended',
        error: 'Маркет приостановлен (Suspended). Ставка отклонена.',
      };
    }
    if (Math.abs(liveOdds - row.odds) >= ODDS_EPS) {
      updates.push({
        id: row.id,
        previousOdds: row.odds,
        odds: Number(liveOdds.toFixed(3)),
        matchLabel: row.matchLabel,
        outcome: row.outcome,
      });
    }
  }

  if (updates.length) {
    return {
      status: 'odds_changed',
      error: 'Коэффициент изменился. Принять новые условия?',
      updates,
    };
  }
  return { status: 'ok' };
}
