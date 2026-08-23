import type { BetHistoryEntry, BetSelection } from './types';
import { tournamentLine } from './lib/betTicket';

/** Backend stub: unique 7-digit draw code for the «Непобедимый» promo. */
export function generateTicketCode(): string {
  let code = '';
  for (let i = 0; i < 7; i += 1) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

export function buildPlacedBet(params: {
  type: 'single' | 'express';
  selections: BetSelection[];
  stake: number;
  totalOdds: number;
  potentialWin: number;
}): BetHistoryEntry {
  const isExpress = params.type === 'express' && params.selections.length >= 2;

  return {
    id: `bh-${Date.now()}`,
    type: params.type,
    events: params.selections.map((s) => ({
      matchId: s.matchId,
      matchLabel: s.matchLabel,
      market: s.market,
      outcome: s.outcome,
      selection: s.outcome,
      odds: s.odds,
      homeTeam: s.homeTeam,
      awayTeam: s.awayTeam,
      sport: s.sport,
      country: s.country,
      league: s.league,
      tournament:
        s.tournament ||
        tournamentLine({ sport: s.sport, country: s.country, league: s.league }),
      isLive: s.isLive,
      liveStatus: s.liveStatus,
      matchStatus: s.isLive ? s.liveStatus || 'LIVE' : 'Не начался',
    })),
    totalOdds: params.totalOdds,
    amount: params.stake,
    payout: Math.round(params.potentialWin),
    cashout: isExpress ? Math.round(params.stake * 0.72) : undefined,
    status: 'in_progress',
    date: new Date().toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
    ticketCode: generateTicketCode(),
  };
}
