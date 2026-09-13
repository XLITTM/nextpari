export type SelectionOutcome = 'won' | 'lost' | 'void' | 'pending';

function signedLine(raw: string): number {
  return Number(String(raw).replace(',', '.').replace(/^\+/, ''));
}

/** Display-only outcome from a final score. Does not write wallets or bets. */
export function settleSelection(
  selection: string,
  market: string,
  homeScore: number,
  awayScore: number,
): SelectionOutcome {
  const total = homeScore + awayScore;
  const sel = selection.trim();
  const blob = `${market} ${sel}`.trim();
  const key = sel.toUpperCase().replace('Х', 'X').replace(/\s+/g, '');

  const over = sel.match(/(?:ТБ|OVER|O)\s*([+-]?\d+(?:[.,]\d+)?)/i);
  const under = sel.match(/(?:ТМ|UNDER|U)\s*([+-]?\d+(?:[.,]\d+)?)/i);
  if (over && !/ТМ|UNDER/i.test(sel)) {
    const line = signedLine(over[1]);
    if (total === line) return 'void';
    return total > line ? 'won' : 'lost';
  }
  if (under) {
    const line = signedLine(under[1]);
    if (total === line) return 'void';
    return total < line ? 'won' : 'lost';
  }

  const homeHandicap = blob.match(/Ф1\s*\(([^)]+)\)/i);
  const awayHandicap = blob.match(/Ф2\s*\(([^)]+)\)/i);
  if (homeHandicap) {
    const line = signedLine(homeHandicap[1]);
    const diff = homeScore + line - awayScore;
    if (diff === 0) return 'void';
    return diff > 0 ? 'won' : 'lost';
  }
  if (awayHandicap) {
    const line = signedLine(awayHandicap[1]);
    const diff = awayScore + line - homeScore;
    if (diff === 0) return 'void';
    return diff > 0 ? 'won' : 'lost';
  }

  if (['П1', '1', 'W1', 'HOME'].includes(key)) return homeScore > awayScore ? 'won' : 'lost';
  if (['П2', '2', 'W2', 'AWAY'].includes(key)) return awayScore > homeScore ? 'won' : 'lost';
  if (['X', 'НИЧЬЯ', 'DRAW', 'Н'].includes(key)) return homeScore === awayScore ? 'won' : 'lost';
  return 'pending';
}
