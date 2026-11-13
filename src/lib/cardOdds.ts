import type { BetSelection, MarketGroup, MarketOutcome, MatchEvent } from '../types';
import { inferSelection } from './liveMarketCheck';

export function isTwoWaySport(sport: string): boolean {
  return ['basketball', 'tennis', 'volleyball', 'esports'].includes(sport.toLowerCase());
}

export interface CardOutcomeButton {
  key: string;
  odds: number;
  locked: boolean;
}

export function mainOutcomeButtons(match: MatchEvent): CardOutcomeButton[] {
  const button = (key: string, odds: number): CardOutcomeButton => ({
    key,
    odds: odds > 1 ? odds : 0,
    locked: odds <= 1,
  });
  return [
    button('П1', match.markets['1']),
    button('X', match.markets.x),
    button('П2', match.markets['2']),
  ];
}

export interface ExtraCardOutcome {
  label: string;
  odds: number;
  selection?: BetSelection;
}

export function extraMarketRows(
  match: MatchEvent,
): Array<{ name: string; outcomes: ExtraCardOutcome[] }> {
  const groups = match.marketGroups ?? [];
  const pick = (test: (group: MarketGroup) => boolean, limit = 2) => {
    const group = groups.find(test);
    if (!group) return null;
    const outcomes = group.outcomes.filter((row) => row.odds > 0).slice(0, limit).map(withBetsapiSelection);
    return outcomes.length ? { name: group.name, outcomes } : null;
  };
  const totals = groups
    .filter((group) => group.category === 'totals' || /тотал|under\/over|total/i.test(group.name))
    .slice(0, 3)
    .map((group) => ({
      name: group.name,
      outcomes: group.outcomes.filter((row) => row.odds > 0).slice(0, 2).map(withBetsapiSelection),
    }))
    .filter((row) => row.outcomes.length);
  const handicap = pick((group) => group.category === 'handicaps' || /фора|handicap/i.test(group.name));
  const dc = pick((group) => /двойной шанс|double chance/i.test(group.name), 3);
  const btts = pick((group) => /обе забьют|btts|both teams to score/i.test(group.name));
  return [...totals, handicap, dc, btts].filter((row): row is NonNullable<typeof row> => Boolean(row));
}

function withBetsapiSelection(outcome: MarketOutcome & { selection?: BetSelection }): ExtraCardOutcome {
  if (outcome.selection?.provider === 'betsapi' && outcome.selection.outcomeId) return outcome;
  if (outcome.provider !== 'betsapi' || !outcome.fixtureId || !outcome.outcomeId || !outcome.marketKey) {
    return outcome;
  }
  return {
    ...outcome,
    selection: {
      id: `${outcome.fixtureId}-${outcome.marketKey}-${outcome.line ?? ''}-${outcome.outcomeId}`,
      matchId: outcome.fixtureId,
      matchLabel: outcome.matchLabel || outcome.label,
      market: outcome.marketKey,
      outcome: outcome.label,
      odds: outcome.odds,
      provider: 'betsapi',
      feedType: outcome.feedType,
      fixtureId: outcome.fixtureId,
      marketId: outcome.marketId,
      marketKey: outcome.marketKey,
      line: outcome.line ?? '',
      outcomeId: outcome.outcomeId,
      providerLastUpdate: outcome.updatedAt,
      bookmakerId: outcome.bookmakerId,
      externalPeriodId: outcome.externalPeriodId,
      externalMarketId: outcome.externalMarketId,
      sourceSelectionId: outcome.sourceSelectionId,
    },
  };
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
