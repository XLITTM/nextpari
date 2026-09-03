import type { BetSelection, MarketGroup, MatchEvent } from '../types';
import { inferMarketKey, inferSelection } from './liveMarketCheck';

export function isTwoWaySport(sport: string): boolean {
  return ['basketball', 'tennis', 'volleyball', 'esports'].includes(sport.toLowerCase());
}

export interface CardOutcomeButton {
  key: string;
  odds: number;
  locked: boolean;
}

export function mainOutcomeButtons(match: MatchEvent): CardOutcomeButton[] {
  const lockMissing = Boolean(match.marketsLocked);
  const button = (key: string, odds: number, fallback: number): CardOutcomeButton => {
    if (lockMissing) {
      return { key, odds: odds > 1 ? odds : 0, locked: odds <= 1 };
    }
    return { key, odds: odds > 1 ? odds : fallback, locked: false };
  };
  return [
    button('П1', match.markets['1'], 2.1),
    button('X', match.markets.x, 3.25),
    button('П2', match.markets['2'], 2.8),
  ];
}

export function extraMarketRows(
  match: MatchEvent,
): Array<{ name: string; outcomes: Array<{ label: string; odds: number }> }> {
  const groups = match.marketGroups ?? [];
  const pick = (test: (group: MarketGroup) => boolean, limit = 2) => {
    const group = groups.find(test);
    if (!group) return null;
    const outcomes = group.outcomes.filter((row) => row.odds > 0).slice(0, limit);
    return outcomes.length ? { name: group.name, outcomes } : null;
  };
  const totals = groups
    .filter((group) => group.category === 'totals' || /тотал|under\/over|total/i.test(group.name))
    .slice(0, 3)
    .map((group) => ({
      name: group.name,
      outcomes: group.outcomes.filter((row) => row.odds > 0).slice(0, 2),
    }))
    .filter((row) => row.outcomes.length);
  const handicap = pick((group) => group.category === 'handicaps' || /фора|handicap/i.test(group.name));
  const dc = pick((group) => /двойной шанс|double chance/i.test(group.name), 3);
  const btts = pick((group) => /обе забьют|btts|both teams to score/i.test(group.name));
  return [...totals, handicap, dc, btts].filter((row): row is NonNullable<typeof row> => Boolean(row));
}

export function buildCardSelection(
  match: MatchEvent,
  outcome: string,
  odds: number,
  market: string,
): BetSelection {
  return {
    id: `${match.id}-${market}-${outcome}`,
    matchId: match.id,
    matchLabel: `${match.team1} — ${match.team2}`,
    market,
    outcome,
    odds,
    marketKey: inferMarketKey(market),
    selectionKey: inferSelection(outcome),
    homeTeam: match.team1,
    awayTeam: match.team2,
    sport: match.sport,
    country: match.country,
    league: match.league,
    isLive: match.isLive,
    startTime: match.startTime,
    liveStatus: match.liveStatus,
  };
}
