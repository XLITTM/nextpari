import type {
  BetDisplayStatus,
  BetEvent,
  BetHistoryEntry,
  BetSelection,
  BetStatus,
  MatchEvent,
  SportId,
} from '../types';
import type { ParsedMarket } from './odds-parser';
import { formatOdds } from './matchOdds';
import { selectionFromLsportsOutcome } from './sportsPlaceIdentity';

const LSPORTS_MARKET_LABEL: Record<string, string> = {
  '1': '1X2',
  '2': 'Under/Over',
  '3': 'Asian Handicap',
  '8': 'Тайм 1X2',
  '11': 'Тотал угловых',
  '13': 'Европейская фора',
  '17': 'Both Teams To Score',
  '21': 'Under/Over 1-й тайм',
  '41': 'Победитель 1-го тайма',
  '45': 'Under/Over 2-й тайм',
  '1439': 'Asian Handicap',
};

const OUTCOME_LABEL: Record<string, string> = {
  '1': 'П1',
  '2': 'П2',
  x: 'X',
  X: 'X',
  home: 'П1',
  away: 'П2',
  draw: 'X',
  over: 'ТБ',
  under: 'ТМ',
  Over: 'ТБ',
  Under: 'ТМ',
  yes: 'Да',
  no: 'Нет',
  Yes: 'Да',
  No: 'Нет',
  '1x': '1X',
  '1X': '1X',
  '12': '12',
  x2: 'X2',
  X2: 'X2',
};

const TECHNICAL_KEY = /^\d{5,}:\d*:/;
const BARE_PROVIDER_ID = /^\d{6,}$/;

export function formatBetDateTime(value: string | number | Date | null | undefined): string {
  const date = parseDisplayDate(value);
  if (!date) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy} (${hh}:${min})`;
}

function parseDisplayDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const trimmed = String(value).trim();
  if (/^\d{2}\.\d{2}\.\d{4} \(\d{2}:\d{2}\)$/.test(trimmed)) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatStakeMoney(value: number): string {
  const amount = Number.isFinite(value) ? value : 0;
  return `${amount.toLocaleString('ru-RU', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} TMTM`;
}

export function couponDisplayNumber(betId: string, ticketCode?: string): string {
  if (ticketCode && !ticketCode.includes('-')) return ticketCode.toUpperCase();
  const compact = betId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return compact || betId.slice(0, 8);
}

export function isTechnicalIdentity(value: string | undefined | null): boolean {
  const text = String(value ?? '').trim();
  if (!text) return false;
  if (TECHNICAL_KEY.test(text)) return true;
  if (text.includes(':') && /^\d+:\d+/.test(text)) return true;
  return false;
}

export function friendlyMarketName(params: {
  market?: string;
  marketId?: string;
  line?: string;
}): string {
  const raw = String(params.market ?? '').trim();
  if (raw && !isTechnicalIdentity(raw) && !BARE_PROVIDER_ID.test(raw)) return raw;
  const fromId = LSPORTS_MARKET_LABEL[String(params.marketId ?? '').trim()];
  if (fromId) return fromId;
  return raw && !isTechnicalIdentity(raw) ? raw : 'Исход';
}

export function friendlySelectionName(params: {
  outcome?: string;
  selection?: string;
  line?: string;
  marketId?: string;
}): string {
  const raw = String(params.selection || params.outcome || '').trim();
  const mapped = OUTCOME_LABEL[raw] ?? raw;
  const line = String(params.line ?? '').trim();
  const marketId = String(params.marketId ?? '');
  const needsLine = Boolean(line)
    && !mapped.includes(line)
    && (marketId === '2' || marketId === '3' || marketId === '1439' || /over|under|handicap|тотал|фора/i.test(params.outcome ?? ''));
  if (needsLine && (mapped === 'ТБ' || mapped === 'ТМ' || mapped === 'П1' || mapped === 'П2')) {
    return `${mapped} ${line}`.trim();
  }
  return mapped || '—';
}

export function playerStatus(entry: Pick<BetHistoryEntry, 'status' | 'settlementState' | 'rawStatus'>): BetDisplayStatus {
  const state = String(entry.settlementState ?? '').toLowerCase();
  if (state === 'winner' || state === 'half_won') return 'won';
  if (state === 'loser' || state === 'half_lost') return 'lost';
  if (state === 'refund') return 'refund';
  if (state === 'cancelled') return 'cancelled';
  if (state === 'unsettled' && entry.rawStatus === 'accepted') return 'accepted';
  if (state === 'unsettled') return 'accepted';
  const status = entry.status;
  if (status === 'won') return 'won';
  if (status === 'lost') return 'lost';
  if (status === 'refund') return 'refund';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'accepted') return 'accepted';
  if (status === 'pending') return 'in_progress';
  return 'accepted';
}

export function playerStatusLabel(status: BetDisplayStatus): string {
  if (status === 'won') return 'Выиграна';
  if (status === 'lost') return 'Проиграна';
  if (status === 'refund') return 'Возврат';
  if (status === 'cancelled') return 'Отменена';
  if (status === 'in_progress') return 'В процессе';
  return 'Принята';
}

export function playerStatusClass(status: BetDisplayStatus): string {
  if (status === 'won') return 'text-emerald-600 dark:text-emerald-400';
  if (status === 'lost') return 'text-red-500';
  if (status === 'refund') return 'text-amber-600 dark:text-amber-400';
  if (status === 'cancelled') return 'text-gray-500';
  if (status === 'in_progress') return 'text-gray-700 dark:text-gray-200';
  return 'text-emerald-600 dark:text-emerald-400';
}

export function legStatus(event: BetEvent, betStatus: BetDisplayStatus): BetDisplayStatus {
  const code = event.settlementCode;
  if (code === 2 || code === 5) return 'won';
  if (code === 1) return 'lost';
  if (code === 3 || code === 4) return 'refund';
  if (code === -1) return 'cancelled';
  if (event.isLive) return 'in_progress';
  if (betStatus === 'won' || betStatus === 'lost' || betStatus === 'refund' || betStatus === 'cancelled') {
    return betStatus;
  }
  return 'accepted';
}

export function isLegSettled(event: BetEvent): boolean {
  const code = event.settlementCode;
  return code != null && code !== 0;
}

export function betTypeLabel(entry: Pick<BetHistoryEntry, 'type' | 'events'>): string {
  const count = entry.events.length;
  if (entry.type === 'express' || count > 1) return `Экспресс ${count}`;
  return 'Ординар';
}

export function expressProgress(entry: Pick<BetHistoryEntry, 'type' | 'events'>): { total: number; completed: number } {
  const total = entry.events.length;
  return {
    total,
    completed: entry.events.filter(isLegSettled).length,
  };
}

export function historyPeriodStats(entries: BetHistoryEntry[]): { count: number; stakeTotal: number } {
  return {
    count: entries.length,
    stakeTotal: entries.reduce((sum, row) => sum + (Number.isFinite(row.amount) ? row.amount : 0), 0),
  };
}

export function potentialWin(entry: Pick<BetHistoryEntry, 'amount' | 'totalOdds' | 'payout' | 'status' | 'settlementState'>): number {
  const status = playerStatus(entry);
  if (status === 'lost' || status === 'cancelled') return 0;
  if (status === 'refund') return entry.amount;
  if (entry.payout > 0) return entry.payout;
  return entry.amount * entry.totalOdds;
}

export function parseTeamNames(matchLabel: string): { home: string; away: string } {
  const parts = matchLabel.split(/\s+[—–-]\s+/).map((part) => part.trim()).filter(Boolean);
  return {
    home: parts[0] || 'Команда 1',
    away: parts.length > 1 ? parts.slice(1).join(' — ') : 'Команда 2',
  };
}

function mapStatus(value: string | undefined): BetStatus {
  const raw = String(value ?? '').toLowerCase();
  if (raw === 'won' || raw === 'win' || raw === 'winner' || raw === 'half_won') return 'won';
  if (raw === 'lost' || raw === 'lose' || raw === 'loser' || raw === 'half_lost') return 'lost';
  if (raw === 'refund') return 'refund';
  if (raw === 'cancelled') return 'cancelled';
  if (raw === 'accepted') return 'accepted';
  if (raw === 'pending') return 'pending';
  return 'in_progress';
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function mapHistoryEvent(raw: Record<string, unknown>): BetEvent {
  const label = String(raw.fixtureLabel ?? raw.matchLabel ?? raw.match_label ?? '');
  const parsed = parseTeamNames(label);
  const home = String(raw.homeTeam ?? raw.home_team ?? parsed.home);
  const away = String(raw.awayTeam ?? raw.away_team ?? parsed.away);
  const outcome = String(raw.outcomeName ?? raw.outcome ?? raw.selection ?? '');
  const marketId = raw.marketId != null ? String(raw.marketId) : raw.market_id != null ? String(raw.market_id) : undefined;
  const line = raw.line != null ? String(raw.line) : '';
  const marketRaw = String(raw.market ?? '');
  const sport = (raw.sport ? String(raw.sport) : undefined) as SportId | undefined;
  const country = raw.country ? String(raw.country) : undefined;
  const league = raw.league ? String(raw.league) : undefined;
  return {
    matchId: raw.fixtureId != null
      ? String(raw.fixtureId)
      : raw.matchId != null
        ? String(raw.matchId)
        : raw.match_id != null
          ? String(raw.match_id)
          : undefined,
    matchLabel: label || [home, away].filter(Boolean).join(' — '),
    market: friendlyMarketName({ market: marketRaw, marketId, line }),
    outcome: friendlySelectionName({ outcome, line, marketId }),
    selection: friendlySelectionName({ outcome, line, marketId }),
    odds: Number(raw.acceptedOdds ?? raw.odds ?? 0),
    homeTeam: home || undefined,
    awayTeam: away || undefined,
    homeLogo: raw.homeLogo ? String(raw.homeLogo) : raw.home_logo ? String(raw.home_logo) : undefined,
    awayLogo: raw.awayLogo ? String(raw.awayLogo) : raw.away_logo ? String(raw.away_logo) : undefined,
    sport,
    country,
    league,
    tournament: league || undefined,
    isLive: Boolean(raw.isLive ?? raw.is_live),
    liveStatus: raw.liveStatus ? String(raw.liveStatus) : raw.live_status ? String(raw.live_status) : undefined,
    matchStatus: raw.matchStatus ? String(raw.matchStatus) : raw.match_status ? String(raw.match_status) : undefined,
    finalScore: raw.finalScore ? String(raw.finalScore) : raw.final_score ? String(raw.final_score) : undefined,
    startTime: typeof raw.startTime === 'number' ? raw.startTime : undefined,
    marketId,
    line,
    settlementCode: raw.settlementCode == null && raw.settlement_code == null
      ? null
      : Number(raw.settlementCode ?? raw.settlement_code),
  };
}

function parseLegacyEvents(value: unknown): BetEvent[] {
  const raw = typeof value === 'string'
    ? (() => { try { return JSON.parse(value); } catch { return null; } })()
    : value;
  if (!Array.isArray(raw)) return [];
  return raw.map((event) => mapHistoryEvent(asRecord(event)));
}

export function toHistoryEntry(raw: Record<string, unknown>): BetHistoryEntry {
  const legs = Array.isArray(raw.legs) ? raw.legs : [];
  const events = legs.length
    ? legs.map((leg) => mapHistoryEvent(asRecord(leg)))
    : parseLegacyEvents(raw.events);
  const stake = Number(raw.stake ?? raw.amount ?? 0);
  const odds = Number(raw.acceptedOdds ?? raw.totalOdds ?? 0);
  const settlementState = raw.settlementState != null ? String(raw.settlementState) : undefined;
  const rawStatus = raw.status != null ? String(raw.status) : undefined;
  return {
    id: String(raw.betId ?? raw.id ?? ''),
    type: raw.mode === 'express' || raw.type === 'express' ? 'express' : 'single',
    events,
    totalOdds: odds,
    amount: stake,
    payout: Number(raw.potentialPayout ?? raw.payout ?? 0),
    status: mapStatus(String(settlementState ?? rawStatus ?? '')),
    date: String(raw.acceptedAt ?? raw.date ?? ''),
    ticketCode: raw.betId ? String(raw.betId).replace(/-/g, '').slice(0, 8) : undefined,
    settlementState,
    rawStatus,
  };
}

export interface HistoryCardView {
  dateTime: string;
  couponNo: string;
  typeLabel: string;
  odds: string;
  stake: string;
  potential: string;
  status: BetDisplayStatus;
  statusLabel: string;
  visibleText: string;
}

export function historyCardView(entry: BetHistoryEntry): HistoryCardView {
  const status = playerStatus(entry);
  const dateTime = formatBetDateTime(entry.date) || String(entry.date ?? '');
  const view: HistoryCardView = {
    dateTime,
    couponNo: couponDisplayNumber(entry.id, entry.ticketCode),
    typeLabel: betTypeLabel(entry),
    odds: formatOdds(entry.totalOdds),
    stake: formatStakeMoney(entry.amount),
    potential: formatStakeMoney(potentialWin(entry)),
    status,
    statusLabel: playerStatusLabel(status),
    visibleText: '',
  };
  view.visibleText = [
    view.dateTime,
    `№${view.couponNo}`,
    view.typeLabel,
    view.odds,
    view.stake,
    view.potential,
    view.statusLabel,
  ].join(' ');
  return view;
}

export interface DetailsLegView {
  sport?: SportId;
  country?: string;
  league?: string;
  eventDate?: string;
  isLive: boolean;
  score?: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo?: string;
  awayLogo?: string;
  market: string;
  selection: string;
  odds: string;
  status: BetDisplayStatus;
  statusLabel: string;
}

export interface DetailsView {
  title: string;
  typeLabel: string;
  couponNo: string;
  dateTime: string;
  eventsLabel?: string;
  progressLabel?: string;
  odds: string;
  stake: string;
  potential: string;
  status: BetDisplayStatus;
  statusLabel: string;
  legs: DetailsLegView[];
  visibleText: string;
}

export function detailsView(entry: BetHistoryEntry, live?: Record<string, {
  homeTeam?: string;
  awayTeam?: string;
  homeLogo?: string;
  awayLogo?: string;
  scoreHome?: number;
  scoreAway?: number;
  isLive?: boolean;
  liveStatus?: string;
  startTime?: number;
  country?: string;
  league?: string;
  sport?: SportId;
}>): DetailsView {
  const status = playerStatus(entry);
  const progress = expressProgress(entry);
  const isExpress = entry.type === 'express' || progress.total > 1;
  const typeLabel = isExpress ? 'Экспресс' : 'Ординар';
  const legs = entry.events.map((event) => {
    const overlay = event.matchId ? live?.[event.matchId] : undefined;
    const teams = parseTeamNames(event.matchLabel);
    const home = overlay?.homeTeam || event.homeTeam || teams.home;
    const away = overlay?.awayTeam || event.awayTeam || teams.away;
    const score = overlay && overlay.scoreHome != null && overlay.scoreAway != null
      ? `${overlay.scoreHome} : ${overlay.scoreAway}`
      : event.finalScore;
    const eventDate = overlay?.startTime
      ? formatBetDateTime(overlay.startTime)
      : event.startTime
        ? formatBetDateTime(event.startTime)
        : '';
    const leg = legStatus(event, status);
    return {
      sport: overlay?.sport || event.sport,
      country: overlay?.country || event.country,
      league: overlay?.league || event.league,
      eventDate,
      isLive: Boolean(overlay?.isLive ?? event.isLive),
      score,
      homeTeam: home,
      awayTeam: away,
      homeLogo: overlay?.homeLogo || event.homeLogo,
      awayLogo: overlay?.awayLogo || event.awayLogo,
      market: friendlyMarketName(event),
      selection: friendlySelectionName(event),
      odds: formatOdds(event.odds),
      status: leg,
      statusLabel: playerStatusLabel(leg),
    };
  });
  const view: DetailsView = {
    title: 'Информация о ставке',
    typeLabel,
    couponNo: couponDisplayNumber(entry.id, entry.ticketCode),
    dateTime: formatBetDateTime(entry.date) || String(entry.date ?? ''),
    eventsLabel: isExpress ? `Событий: ${progress.total}` : undefined,
    progressLabel: isExpress ? `Завершено: ${progress.completed} из ${progress.total}` : undefined,
    odds: formatOdds(entry.totalOdds),
    stake: formatStakeMoney(entry.amount),
    potential: formatStakeMoney(potentialWin(entry)),
    status,
    statusLabel: playerStatusLabel(status),
    legs,
    visibleText: '',
  };
  view.visibleText = [
    view.title,
    view.typeLabel,
    view.dateTime,
    view.eventsLabel,
    view.progressLabel,
    view.odds,
    view.stake,
    view.potential,
    view.statusLabel,
    ...legs.flatMap((leg) => [
      leg.league,
      leg.homeTeam,
      leg.awayTeam,
      leg.market,
      leg.selection,
      leg.odds,
      leg.statusLabel,
      leg.score,
    ]),
  ].filter(Boolean).join(' ');
  return view;
}

export function historyViewHasTechnicalIds(text: string): boolean {
  return TECHNICAL_KEY.test(text) || /\bmarketKey\b|\bfixtureId\b|\boutcomeId\b|\bproviderBetId\b|\bBet\.Id\b/i.test(text);
}

export interface RepeatCouponPlan {
  selections: BetSelection[];
  unavailable: string[];
  canRepeat: boolean;
}

export function currentSelectionFromHistoryLeg(
  match: MatchEvent,
  markets: ParsedMarket[],
  event: BetEvent,
): BetSelection | null {
  const marketId = String(event.marketId ?? '').trim();
  const line = String(event.line ?? '');
  const wanted = String(event.selection || event.outcome || '').trim().toLowerCase();
  const candidates = markets.filter((market) => !marketId || String(market.marketId) === marketId);
  for (const market of candidates) {
    for (const entry of market.entries) {
      if (line && String(entry.line ?? '') !== line) continue;
      for (const outcome of entry.outcomes) {
        const label = friendlySelectionName({
          outcome: outcome.key,
          line: entry.line,
          marketId: market.marketId,
        }).toLowerCase();
        const key = String(outcome.key ?? '').toLowerCase();
        if (label === wanted || key === wanted || OUTCOME_LABEL[outcome.key]?.toLowerCase() === wanted) {
          return selectionFromLsportsOutcome(match, market, entry, outcome);
        }
      }
    }
  }
  return null;
}

export function planRepeatCoupon(
  entry: BetHistoryEntry,
  lookup: (event: BetEvent) => BetSelection | null,
): RepeatCouponPlan {
  const selections: BetSelection[] = [];
  const unavailable: string[] = [];
  for (const event of entry.events) {
    const current = lookup(event);
    if (!current || current.odds <= 1) {
      unavailable.push(event.matchLabel || friendlySelectionName(event));
      continue;
    }
    selections.push(current);
  }
  return {
    selections,
    unavailable,
    canRepeat: selections.length > 0 && unavailable.length === 0,
  };
}
