import type { BetDisplayStatus, BetEvent, BetHistoryEntry, BetStatus, SportId } from '../types';
import { historyPeriodRange, type HistoryPeriodInput } from './historyPeriodFilter';

const TECHNICAL_KEY = /^\d{5,}:\d*:/;
const BARE_PROVIDER_ID = /^\d{6,}$/;

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

export function parseBetTimestamp(value: string | number | Date | null | undefined): number | null {
  const date = parseDisplayDate(value);
  return date ? date.getTime() : null;
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
  const already = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4}) \((\d{2}):(\d{2})\)$/);
  if (already) {
    const date = new Date(
      Number(already[3]),
      Number(already[2]) - 1,
      Number(already[1]),
      Number(already[4]),
      Number(already[5]),
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }
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

export function formatHistoryOdds(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return Number(value).toFixed(2);
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
  if (BARE_PROVIDER_ID.test(text)) return true;
  return false;
}

export function friendlyMarketName(params: {
  market?: string;
  marketName?: string;
  marketLabel?: string;
}): string {
  const supplied = String(params.marketName || params.marketLabel || '').trim();
  if (supplied && !isTechnicalIdentity(supplied)) return supplied;
  const raw = String(params.market ?? '').trim();
  if (raw && !isTechnicalIdentity(raw) && !/^\d+$/.test(raw)) return raw;
  return 'Исход';
}

export function friendlySelectionName(params: {
  outcome?: string;
  selection?: string;
  outcomeName?: string;
  line?: string;
}): string {
  const raw = String(params.outcomeName || params.selection || params.outcome || '').trim();
  if (!raw || isTechnicalIdentity(raw)) return raw && !isTechnicalIdentity(raw) ? raw : '—';
  const mapped = OUTCOME_LABEL[raw] ?? raw;
  const line = String(params.line ?? '').trim();
  if (
    line
    && !mapped.includes(line)
    && (mapped === 'ТБ' || mapped === 'ТМ')
  ) {
    return `${mapped} ${line}`.trim();
  }
  return mapped || '—';
}

export function mapCanonicalStatus(value: string | undefined): BetStatus {
  const raw = String(value ?? '').toLowerCase();
  if (raw === 'won' || raw === 'win' || raw === 'winner' || raw === 'half_won') return 'won';
  if (raw === 'lost' || raw === 'lose' || raw === 'loser' || raw === 'half_lost') return 'lost';
  if (raw === 'refund') return 'refund';
  if (raw === 'cancelled') return 'cancelled';
  if (raw === 'accepted') return 'accepted';
  if (raw === 'in_progress') return 'in_progress';
  if (raw === 'pending') return 'pending';
  return 'accepted';
}

export function playerStatus(entry: Pick<BetHistoryEntry, 'status' | 'settlementState' | 'rawStatus' | 'events'>): BetDisplayStatus {
  const state = String(entry.settlementState ?? '').toLowerCase();
  if (state === 'winner' || state === 'won' || state === 'half_won') return 'won';
  if (state === 'loser' || state === 'lost' || state === 'half_lost') return 'lost';
  if (state === 'refund') return 'refund';
  if (state === 'cancelled') return 'cancelled';
  const liveUnsettled = state === 'unsettled' && (entry.events ?? []).some((event) => event.isLive);
  if (liveUnsettled) return 'in_progress';
  if (state === 'unsettled' && (entry.rawStatus === 'accepted' || !entry.rawStatus)) return 'accepted';
  if (state === 'unsettled') return 'accepted';
  const status = entry.status;
  if (status === 'won') return 'won';
  if (status === 'lost') return 'lost';
  if (status === 'refund') return 'refund';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'accepted') return 'accepted';
  if (status === 'in_progress' || status === 'pending') return 'in_progress';
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

export function detailsStatusLabel(status: BetDisplayStatus): string {
  if (status === 'won') return 'Выплачена';
  return playerStatusLabel(status);
}

export function legResultLabel(status: BetDisplayStatus | null | undefined): string {
  if (status === 'won') return 'Выигрыш';
  if (status === 'lost') return 'Проигрыш';
  if (status === 'refund') return 'Возврат';
  if (status === 'cancelled') return 'Отменена';
  if (status === 'in_progress') return 'В процессе';
  if (status === 'accepted') return 'Принята';
  return '';
}

export function payoutRowLabel(status: BetDisplayStatus): string {
  return status === 'won' ? 'Выигрыш:' : 'Возможный выигрыш:';
}

export function playerStatusClass(status: BetDisplayStatus): string {
  if (status === 'lost' || status === 'cancelled') return 'text-[var(--np-danger)]';
  if (status === 'refund') return 'text-[var(--np-info)]';
  if (status === 'in_progress') return 'text-[var(--np-text-secondary)]';
  return 'text-[var(--np-success)]';
}

export function formatLegMarketLine(market: string, selection: string, line?: string): string {
  const marketText = String(market || '').trim();
  const selectionText = String(selection || '').trim();
  const lineText = String(line || '').trim();
  const withLine =
    lineText && !marketText.includes(lineText) && !selectionText.includes(lineText)
      ? `${marketText}. (${lineText}) ${selectionText}`
      : `${marketText}. ${selectionText}`;
  return withLine.replace(/\s+/g, ' ').replace(/^[\.\s]+|[\.\s]+$/g, '').trim();
}

export function legStatus(event: BetEvent): BetDisplayStatus | null {
  const code = event.settlementCode;
  if (code === 2 || code === 5) return 'won';
  if (code === 1 || code === 4) return 'lost';
  if (code === 3) return 'refund';
  if (code === -1) return 'cancelled';
  if (event.isLive) return 'in_progress';
  return null;
}

export function isLegSettled(event: BetEvent): boolean {
  const code = event.settlementCode;
  return code != null && code !== 0;
}

export function isExpressBet(entry: Pick<BetHistoryEntry, 'type' | 'events'>): boolean {
  const type = String(entry.type ?? '').trim().toLowerCase();
  if (type === 'express') return true;
  if (type === 'single') return false;
  // Fallback only when the existing model has no canonical type.
  return Array.isArray(entry.events) && entry.events.length > 1;
}

export function betTypeLabel(entry: Pick<BetHistoryEntry, 'type' | 'events'>): string {
  return isExpressBet(entry) ? 'Экспресс' : 'Одиночная';
}

export function expressProgress(entry: Pick<BetHistoryEntry, 'type' | 'events'>): { total: number; completed: number; supported: boolean } {
  const total = entry.events.length;
  const supported = entry.events.some((event) => event.settlementCode != null);
  return {
    total,
    completed: entry.events.filter(isLegSettled).length,
    supported,
  };
}

export function historyPeriodStats(entries: BetHistoryEntry[]): { count: number; stakeTotal: number } {
  return {
    count: entries.length,
    stakeTotal: entries.reduce((sum, row) => sum + (Number.isFinite(row.amount) ? row.amount : 0), 0),
  };
}

export function potentialWin(entry: Pick<BetHistoryEntry, 'amount' | 'totalOdds' | 'payout' | 'status' | 'settlementState' | 'rawStatus' | 'events'>): number {
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

export function hasRealCashout(entry: Pick<BetHistoryEntry, 'cashout'>): boolean {
  return entry.cashout != null && Number.isFinite(entry.cashout) && entry.cashout > 0;
}

export function filterHistoryEntries(
  entries: BetHistoryEntry[],
  period: HistoryPeriodInput,
  saleOnly: boolean,
  now = Date.now(),
): BetHistoryEntry[] {
  const range = historyPeriodRange(period, now);
  return entries.filter((entry) => {
    if (saleOnly && !hasRealCashout(entry)) return false;
    if (!range) return true;
    if (!Number.isFinite(range.startMs) || !Number.isFinite(range.endMs)) return false;
    const ts = parseBetTimestamp(entry.date);
    if (ts == null) return false;
    return ts >= range.startMs && ts <= range.endMs;
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

export function mapHistoryEvent(raw: Record<string, unknown>): BetEvent {
  const label = pickString(raw.fixtureLabel, raw.matchLabel, raw.match_label);
  const parsed = parseTeamNames(label);
  const home = pickString(raw.homeTeam, raw.home_team, parsed.home);
  const away = String(raw.awayTeam ?? raw.away_team ?? parsed.away);
  const outcomeName = pickString(raw.outcomeName, raw.outcome_name);
  const selection = pickString(raw.selection, raw.outcome);
  const marketName = pickString(raw.marketName, raw.market_name, raw.marketLabel, raw.market_label);
  const marketRaw = pickString(raw.market, raw.marketKey, raw.market_key);
  const line = raw.line != null ? String(raw.line) : '';
  const sport = (raw.sport ? String(raw.sport) : undefined) as SportId | undefined;
  const country = raw.country ? String(raw.country) : undefined;
  const league = raw.league ? String(raw.league) : undefined;
  const tournament = pickString(raw.tournament);
  const startRaw = raw.startTime ?? raw.start_time;
  const settlementRaw = raw.settlementCode ?? raw.settlement_code;
  return {
    matchId: pickString(raw.fixtureId, raw.matchId, raw.match_id) || undefined,
    matchLabel: label || [home, away].filter(Boolean).join(' — '),
    market: friendlyMarketName({ market: marketRaw, marketName, marketLabel: marketName }),
    outcome: friendlySelectionName({ outcome: selection, selection, outcomeName, line }),
    selection: friendlySelectionName({ outcome: selection, selection, outcomeName, line }),
    odds: Number(raw.acceptedOdds ?? raw.odds ?? 0),
    homeTeam: home || undefined,
    awayTeam: away || undefined,
    homeLogo: pickString(raw.homeLogo, raw.home_logo) || undefined,
    awayLogo: pickString(raw.awayLogo, raw.away_logo) || undefined,
    sport,
    country,
    league,
    tournament: tournament || league || undefined,
    isLive: Boolean(raw.isLive ?? raw.is_live),
    liveStatus: pickString(raw.liveStatus, raw.live_status) || undefined,
    matchStatus: pickString(raw.matchStatus, raw.match_status) || undefined,
    finalScore: pickString(raw.finalScore, raw.final_score) || undefined,
    startTime: typeof startRaw === 'number' ? startRaw : undefined,
    marketId: raw.marketId != null ? String(raw.marketId) : raw.market_id != null ? String(raw.market_id) : undefined,
    line: line || undefined,
    settlementCode: settlementRaw == null || settlementRaw === '' ? null : Number(settlementRaw),
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
  const cashoutRaw = Number(raw.cashout);
  const liveUnsettled = String(settlementState ?? '').toLowerCase() === 'unsettled'
    && events.some((event) => event.isLive);
  const mapped = mapCanonicalStatus(String(settlementState ?? rawStatus ?? ''));
  const status: BetStatus = liveUnsettled && mapped !== 'won' && mapped !== 'lost' && mapped !== 'refund' && mapped !== 'cancelled'
    ? 'in_progress'
    : mapped === 'pending'
      ? 'accepted'
      : mapped;
  return {
    id: String(raw.betId ?? raw.id ?? ''),
    type: raw.mode === 'express' || raw.type === 'express' ? 'express' : 'single',
    events,
    totalOdds: odds,
    amount: stake,
    payout: Number(raw.potentialPayout ?? raw.payout ?? 0),
    cashout: Number.isFinite(cashoutRaw) && cashoutRaw > 0 ? cashoutRaw : undefined,
    status,
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
  isExpress: boolean;
  legCount: number;
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
  const isExpress = isExpressBet(entry);
  const view: HistoryCardView = {
    dateTime,
    couponNo: couponDisplayNumber(entry.id, entry.ticketCode),
    typeLabel: betTypeLabel(entry),
    isExpress,
    legCount: entry.events.length,
    odds: formatHistoryOdds(entry.totalOdds),
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
    isExpress ? String(view.legCount) : '',
    view.odds,
    view.stake,
    view.potential,
    view.statusLabel,
  ].filter(Boolean).join(' ');
  return view;
}

export interface DetailsLegView {
  sport?: SportId;
  country?: string;
  league?: string;
  startTime?: string;
  isLive: boolean;
  score?: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo?: string;
  awayLogo?: string;
  market: string;
  selection: string;
  marketLine: string;
  odds: string;
  status: BetDisplayStatus | null;
  statusLabel?: string;
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
  payoutLabel: string;
  status: BetDisplayStatus;
  statusLabel: string;
  legs: DetailsLegView[];
  visibleText: string;
}

export interface HistoryLiveOverlay {
  homeTeam?: string;
  awayTeam?: string;
  homeLogo?: string;
  awayLogo?: string;
  score?: string;
  isLive?: boolean;
  liveStatus?: string;
  country?: string;
  league?: string;
  sport?: SportId;
  startTime?: number;
}

export function detailsView(entry: BetHistoryEntry, live?: Record<string, HistoryLiveOverlay>): DetailsView {
  const status = playerStatus(entry);
  const progress = expressProgress(entry);
  const isExpress = isExpressBet(entry);
  const typeLabel = betTypeLabel(entry);
  const legs = entry.events.map((event) => {
    const overlay = event.matchId ? live?.[event.matchId] : undefined;
    const teams = parseTeamNames(event.matchLabel);
    const home = overlay?.homeTeam || event.homeTeam || teams.home;
    const away = overlay?.awayTeam || event.awayTeam || teams.away;
    const score = overlay?.score || event.finalScore || undefined;
    const genuinelyLive = Boolean(overlay?.isLive ?? event.isLive);
    const leg = genuinelyLive ? 'in_progress' : legStatus({ ...event, isLive: false });
    const showSettlement = !genuinelyLive && leg != null;
    const market = friendlyMarketName(event);
    const selection = friendlySelectionName(event);
    const startTime = formatBetDateTime(overlay?.startTime ?? event.startTime);
    return {
      sport: overlay?.sport || event.sport,
      country: overlay?.country || event.country,
      league: overlay?.league || event.league,
      startTime: startTime || undefined,
      isLive: genuinelyLive,
      score,
      homeTeam: home,
      awayTeam: away,
      homeLogo: overlay?.homeLogo || event.homeLogo,
      awayLogo: overlay?.awayLogo || event.awayLogo,
      market,
      selection,
      marketLine: formatLegMarketLine(market, selection, event.line),
      odds: formatHistoryOdds(event.odds),
      status: showSettlement ? leg : genuinelyLive ? 'in_progress' : null,
      statusLabel: showSettlement && leg ? legResultLabel(leg) : genuinelyLive ? legResultLabel('in_progress') : undefined,
    };
  });
  const view: DetailsView = {
    title: 'Информация о ставке',
    typeLabel,
    couponNo: couponDisplayNumber(entry.id, entry.ticketCode),
    dateTime: formatBetDateTime(entry.date) || String(entry.date ?? ''),
    eventsLabel: isExpress ? `Событий: ${progress.total}` : undefined,
    progressLabel: isExpress && progress.supported ? `Завершено: ${progress.completed} из ${progress.total}` : undefined,
    odds: formatHistoryOdds(entry.totalOdds),
    stake: formatStakeMoney(entry.amount),
    potential: formatStakeMoney(potentialWin(entry)),
    payoutLabel: payoutRowLabel(status),
    status,
    statusLabel: detailsStatusLabel(status),
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
      leg.marketLine,
      leg.odds,
      leg.statusLabel,
      leg.score,
    ]),
  ].filter(Boolean).join(' ');
  return view;
}

export function historyViewHasTechnicalIds(text: string): boolean {
  return TECHNICAL_KEY.test(text)
    || /\bmarketKey\b|\bfixtureId\b|\boutcomeId\b|\bproviderBetId\b|\bBet\.Id\b|\bMarket\.Id\b|\bselectionKey\b/i.test(text);
}
