import { createHash } from 'node:crypto';
import type { NormalizedEvent } from '../betsapi/types.js';
import { SPORTS_SETTLEMENT, type SportsSettlementCode, type SportsSettlementNotice } from './settlement.js';

type Side = 'win' | 'lose' | 'push';

function partsOf(line: string): number[] | null {
  const raw = line.trim();
  if (!raw) return [0];
  const pieces = raw.split(',');
  if (pieces.length > 2) return null;
  const numbers = pieces.map((part) => Number(part));
  if (numbers.some((part) => !Number.isFinite(part))) return null;
  if (numbers.length === 2) return numbers;
  const value = numbers[0];
  const quarters = Math.round(value * 4);
  if (Math.abs(value * 4 - quarters) > 1e-6) return null;
  if (quarters % 2 === 0) return [value];
  return [value - 0.25, value + 0.25];
}

function sideOf(diff: number): Side {
  if (diff > 1e-9) return 'win';
  if (diff < -1e-9) return 'lose';
  return 'push';
}

function combine(sides: Side[]): SportsSettlementCode | null {
  if (!sides.length) return null;
  if (sides.every((side) => side === 'win')) return SPORTS_SETTLEMENT.Won;
  if (sides.every((side) => side === 'lose')) return SPORTS_SETTLEMENT.Lost;
  if (sides.every((side) => side === 'push')) return SPORTS_SETTLEMENT.Refund;
  const wins = sides.filter((side) => side === 'win').length;
  const losses = sides.filter((side) => side === 'lose').length;
  const pushes = sides.filter((side) => side === 'push').length;
  if (wins === 1 && pushes === 1 && losses === 0) return SPORTS_SETTLEMENT.HalfWon;
  if (losses === 1 && pushes === 1 && wins === 0) return SPORTS_SETTLEMENT.HalfLost;
  return null;
}

export function gradeFootballOutcome(input: {
  status: NormalizedEvent['status'];
  timeStatus: string;
  score: { home: number; away: number } | null;
  marketKey: string;
  line: string;
  outcomeId: string;
}): SportsSettlementCode | null {
  if (input.status === 'live' || input.status === 'prematch') return SPORTS_SETTLEMENT.Pending;
  if (input.status === 'closed' || input.timeStatus !== '3') return SPORTS_SETTLEMENT.Cancelled;
  if (!input.score) return null;
  const home = input.score.home;
  const away = input.score.away;
  if (input.marketKey === '1x2') {
    const winner = home > away ? 'home' : away > home ? 'away' : 'draw';
    if (!['home', 'draw', 'away'].includes(input.outcomeId)) return null;
    return input.outcomeId === winner ? SPORTS_SETTLEMENT.Won : SPORTS_SETTLEMENT.Lost;
  }
  const lines = partsOf(input.line);
  if (!lines) return null;
  if (input.marketKey === 'over_under') {
    const total = home + away;
    const diffFor = (line: number) => input.outcomeId === 'over' ? total - line : line - total;
    if (input.outcomeId !== 'over' && input.outcomeId !== 'under') return null;
    return combine(lines.map((line) => sideOf(diffFor(line))));
  }
  if (input.marketKey === 'asian_handicap') {
    if (input.outcomeId !== 'home' && input.outcomeId !== 'away') return null;
    return combine(lines.map((line) => {
      const homeDiff = home + line - away;
      return sideOf(input.outcomeId === 'home' ? homeDiff : -homeDiff);
    }));
  }
  return null;
}

export function settlementNoticeForLeg(
  event: NormalizedEvent,
  leg: { marketId?: string; marketKey: string; line?: string; outcomeId: string },
): SportsSettlementNotice | null {
  const settlement = gradeFootballOutcome({
    status: event.status,
    timeStatus: event.timeStatus,
    score: event.score,
    marketKey: leg.marketKey,
    line: leg.line ?? '',
    outcomeId: leg.outcomeId,
  });
  if (settlement == null || settlement === SPORTS_SETTLEMENT.Pending) return null;
  const score = event.score ? `${event.score.home}-${event.score.away}` : 'none';
  const identity = [
    'betsapi',
    event.eventId,
    event.timeStatus,
    score,
    leg.marketKey,
    leg.line ?? '',
    leg.outcomeId,
    String(settlement),
  ].join('|');
  return {
    provider: 'betsapi',
    fixtureId: event.eventId,
    marketId: leg.marketId ?? '',
    marketKey: leg.marketKey,
    outcomeId: leg.outcomeId,
    settlement,
    fingerprint: createHash('sha256').update(identity).digest('hex'),
    lastUpdate: event.updatedAt,
  };
}
