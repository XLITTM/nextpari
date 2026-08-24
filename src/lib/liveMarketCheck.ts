import type { ParsedMarket } from './odds-parser';
import { outcomeLabel } from './odds-parser';

export const LIVE_MARKET_MESSAGES = {
  ended: 'Матч завершен или приостановлен',
  scoreChanged: 'Счет матча изменился! Ставка отклонена',
  blocked: 'Прием ставок на данный исход временно заблокирован (Опасный момент / VAR)',
  oddsChanged: (from: number, to: number) =>
    `Коэффициент изменился с ${formatQuote(from)} на ${formatQuote(to)}. Подтвердите ставку`,
} as const;

export type OddsChangePolicy = 'any' | 'increase' | 'none';

export interface BetPlacementSnapshot {
  eventId: string;
  marketKey: string;
  selection: string;
  initialOdds: number;
  initialScore: string;
  selectionId: string;
  isLive: boolean;
  matchLabel: string;
  outcome: string;
  market: string;
}

export interface LiveMatchSnapshot {
  eventId: string;
  timeStatus: string;
  score: string;
  markets: ParsedMarket[];
}

export interface OddsChangeUpdate {
  id: string;
  previousOdds: number;
  odds: number;
  matchLabel: string;
  outcome: string;
}

export type LiveSnapshotResult =
  | { status: 'ok'; updates: OddsChangeUpdate[] }
  | { status: 'ended'; error: string }
  | { status: 'score_changed'; error: string }
  | { status: 'blocked'; error: string }
  | { status: 'odds_changed'; error: string; updates: OddsChangeUpdate[] };

const ODDS_EPS = 0.01;

export function formatQuote(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return (Math.round(value * 100) / 100).toFixed(2);
}

export function normalizeScore(value?: string | null): string {
  const text = String(value ?? '').trim();
  if (!text || text === '-' || text === '—' || text === '–') return '';
  return text.replace(/\s+/g, '').replace(/[-–—]/g, ':').replace(/:+/g, ':');
}

export function foldLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/х/g, 'x')
    .replace(/[^a-z0-9а-я.+-]/gi, '');
}

export function inferMarketKey(market: string): string {
  const text = foldLabel(market);
  if (/обезаб|btts|both.*score/.test(text)) return 'btts';
  if (/тотал|total|тб|тм/.test(text)) return 'total';
  if (/фора|handicap|ф1|ф2/.test(text)) return 'handicap';
  return '1x2';
}

export function inferSelection(outcome: string): string {
  const text = foldLabel(outcome);
  if (/^(п1|p1|w1|home|1)$/.test(text) || text.startsWith('п1') || text.startsWith('p1')) return 'p1';
  if (/^(х|x|draw|ничья)$/.test(text)) return 'draw';
  if (/^(п2|p2|w2|away|2)$/.test(text) || text.startsWith('п2') || text.startsWith('p2')) return 'p2';
  if (/over|тб|больше/.test(text)) return 'over';
  if (/under|тм|меньше/.test(text)) return 'under';
  if (/^(yes|да)$/.test(text)) return 'yes';
  if (/^(no|нет)$/.test(text)) return 'no';
  return text;
}

export function shouldAutoAcceptOdds(
  policy: OddsChangePolicy,
  initialOdds: number,
  freshOdds: number,
): boolean {
  if (policy === 'any') return true;
  if (policy === 'increase') return freshOdds > initialOdds + 0.0005;
  return false;
}

export function findFreshOdds(
  markets: ParsedMarket[],
  item: { marketKey: string; selection: string; market: string; outcome: string },
): number | null {
  const wantedMarket = foldLabel(item.marketKey);
  const wantedSel = foldLabel(item.selection);
  const wantedOutcome = foldLabel(item.outcome);
  const wantedName = foldLabel(item.market);
  const hits: { odds: number; score: number }[] = [];

  for (const market of markets) {
    const marketKey = foldLabel(market.key);
    const marketName = foldLabel(market.name);
    const marketId = foldLabel(market.marketId);
    const marketScore =
      (wantedMarket === '1x2' && (marketId === '1' || /1x2|победитель/.test(marketName)) ? 4 : 0) +
      (wantedMarket === 'total' && (marketId === '3' || /тотал|total/.test(marketName)) ? 4 : 0) +
      (wantedMarket === 'handicap' && (marketId === '2' || /фора|handicap/.test(marketName)) ? 4 : 0) +
      (wantedMarket === 'btts' && /обезаб|btts/.test(marketName) ? 4 : 0) +
      (labelsOverlap(marketName, wantedName) ? 3 : 0) +
      (labelsOverlap(marketKey, wantedName) ? 2 : 0);

    for (const entry of market.entries) {
      if (foldLabel(entry.ss ?? '') === 'suspended') return null;
      for (const outcome of entry.outcomes) {
        const label = foldLabel(outcomeLabel(outcome.key, entry.line));
        const key = foldLabel(outcome.key);
        const raw = foldLabel(outcome.raw);
        const canonical = inferSelection(outcome.key) === item.selection || inferSelection(label) === item.selection;
        const outcomeScore =
          (canonical ? 6 : 0) +
          (key === wantedSel || label === wantedSel || raw === wantedSel ? 5 : 0) +
          (label === wantedOutcome || key === wantedOutcome || raw === wantedOutcome ? 5 : 0) +
          (labelsOverlap(label, wantedOutcome) ? 2 : 0);
        if (!outcomeScore && !marketScore) continue;
        const matched = canonical || outcomeScore >= 5;
        if (!matched && !marketScore) continue;
        if (!(outcome.odds > 1)) {
          if (matched) return null;
          continue;
        }
        if (!matched) continue;
        hits.push({ odds: outcome.odds, score: marketScore + outcomeScore });
      }
    }
  }

  hits.sort((a, b) => b.score - a.score);
  const best = hits[0];
  return best && best.odds > 1 ? best.odds : null;
}

export function checkLiveSnapshots(
  items: BetPlacementSnapshot[],
  liveMatches: LiveMatchSnapshot[],
  policy: OddsChangePolicy,
): LiveSnapshotResult {
  const byId = new Map(liveMatches.map((row) => [row.eventId, row]));
  const updates: OddsChangeUpdate[] = [];
  let confirm: OddsChangeUpdate | null = null;

  for (const item of items) {
    if (!item.isLive) continue;
    const current = byId.get(item.eventId);
    if (!current || current.timeStatus !== '1') {
      return { status: 'ended', error: LIVE_MARKET_MESSAGES.ended };
    }
    if (normalizeScore(current.score) !== normalizeScore(item.initialScore)) {
      return { status: 'score_changed', error: LIVE_MARKET_MESSAGES.scoreChanged };
    }
    const freshOdds = findFreshOdds(current.markets, item);
    if (freshOdds == null || !Number.isFinite(freshOdds) || freshOdds <= 1) {
      return { status: 'blocked', error: LIVE_MARKET_MESSAGES.blocked };
    }
    if (Math.abs(freshOdds - item.initialOdds) >= ODDS_EPS) {
      const update: OddsChangeUpdate = {
        id: item.selectionId,
        previousOdds: item.initialOdds,
        odds: Number(freshOdds.toFixed(3)),
        matchLabel: item.matchLabel,
        outcome: item.outcome,
      };
      if (shouldAutoAcceptOdds(policy, item.initialOdds, freshOdds)) {
        updates.push(update);
      } else {
        confirm = update;
        break;
      }
    }
  }

  if (confirm) {
    return {
      status: 'odds_changed',
      error: LIVE_MARKET_MESSAGES.oddsChanged(confirm.previousOdds, confirm.odds),
      updates: [confirm, ...updates],
    };
  }
  return { status: 'ok', updates };
}

function labelsOverlap(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}
