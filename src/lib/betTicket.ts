import { sports } from '../data';
import type { BetEvent, BetStatus, SportId } from '../types';
import { settleSelection } from './settlement';

export function sportLabel(sport?: SportId | string | null): string {
  if (!sport) return '';
  return sports.find((item) => item.id === sport)?.name ?? '';
}

export function tournamentLine(params: {
  tournament?: string | null;
  sport?: SportId | string | null;
  country?: string | null;
  league?: string | null;
}): string {
  if (params.tournament?.trim()) return params.tournament.trim();
  return [sportLabel(params.sport), params.country, params.league]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join('. ');
}

export function couponNumber(betId: string, ticketCode?: string): string {
  if (ticketCode) return ticketCode;
  const digits = betId.replace(/\D/g, '');
  if (digits.length >= 7) return digits.slice(-7);
  return digits.padStart(7, '0');
}

export function betStatusLabel(status: BetStatus): string {
  if (status === 'lost') return 'Проиграла';
  if (status === 'won') return 'Выиграла';
  if (status === 'pending') return 'В расчёте';
  return 'Принята';
}

export function compactLiveClock(status?: string | null): string {
  if (!status) return '';
  const trimmed = status.trim();
  if (/заверш/i.test(trimmed) || /finished/i.test(trimmed)) return 'Завершён';
  const time = trimmed.match(/(\d{1,2})[:.](\d{2})/);
  const period = trimmed.split(',')[0]?.trim() ?? trimmed;
  if (time) {
    const minutes = Number(time[1]);
    return `${period} ${minutes}'`;
  }
  return trimmed.replace(/, прошло\s+/i, ' ');
}

export type EventLegBadge = 'in_play' | 'won' | 'lost' | 'pending';

export function evaluateSelection(
  outcome: string,
  homeScore: number,
  awayScore: number,
  market = '',
): boolean | null {
  const result = settleSelection(outcome, market, homeScore, awayScore);
  if (result === 'won') return true;
  if (result === 'lost') return false;
  return null;
}

export function eventLegBadge(params: {
  event: BetEvent;
  isLive?: boolean;
  liveStatus?: string | null;
  homeScore?: number;
  awayScore?: number;
  betStatus: BetStatus;
}): EventLegBadge {
  if (params.isLive) return 'in_play';

  const finished = /заверш/i.test(params.liveStatus ?? '') || /finished/i.test(params.liveStatus ?? '');
  if (finished && params.homeScore != null && params.awayScore != null) {
    const result = evaluateSelection(
      params.event.outcome || params.event.selection || '',
      params.homeScore,
      params.awayScore,
      params.event.market,
    );
    if (result === true) return 'won';
    if (result === false) return 'lost';
  }

  if (params.betStatus === 'won') return 'won';
  if (params.betStatus === 'lost') return 'lost';
  return 'pending';
}

export function eventLegLabel(badge: EventLegBadge): string {
  if (badge === 'in_play') return 'В игре';
  if (badge === 'won') return 'Зашел';
  if (badge === 'lost') return 'Не зашел';
  return 'Ожидание';
}

export function selectionCaption(event: BetEvent): string {
  const market = !event.market || event.market === '1X2' ? 'Исход' : event.market;
  const pick = event.selection || event.outcome;
  return `${market}: ${pick} (${Number(event.odds).toFixed(2)})`;
}
