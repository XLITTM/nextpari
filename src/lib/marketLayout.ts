import type { MarketGroup, SportId } from '../types';
import { isPlayerType, marketPriority, selectionPlayerId } from './marketTaxonomy';

export interface LayoutOutcome {
  label: string;
  odds: number;
  locked?: boolean;
  sourceSelectionId?: string | null;
  externalMarketId?: string;
}

export interface LayoutLine {
  id: string;
  family: string;
  period: boolean;
  periodId: string | null;
  title: string;
  line: string;
  outcomes: LayoutOutcome[];
}

export interface MarketAccordion {
  id: string;
  family: string;
  periodId: string | null;
  title: string;
  lines: LayoutLine[];
}

export function isPeriodMarket(periodId: string | null | undefined): boolean {
  const period = (periodId ?? '').trim().toLowerCase();
  return period !== '' && !/^(ft|fulltime|full-time|full time|match|regular|result)$/.test(period);
}

export function lineCaption(name: string): string {
  const parts = name.split('·').map((part) => part.trim()).filter(Boolean);
  const numeric = parts.filter((part) => /^[-+]?\d+(?:[.,]\d+)?$/.test(part));
  if (numeric.length) return numeric[numeric.length - 1]!.replace(',', '.');
  return '';
}

export function periodCaption(periodId: string | null, sport: SportId): string {
  const period = (periodId ?? '').toLowerCase();
  if (period === 'p1') {
    if (sport === 'football') return '1-й тайм';
    if (sport === 'basketball') return '1-я четверть';
    if (sport === 'hockey') return '1-й период';
    if (sport === 'esports') return '1-я карта';
    return '1-я партия';
  }
  if (period === 'p2') {
    if (sport === 'football') return '2-й тайм';
    if (sport === 'basketball') return '2-я четверть';
    if (sport === 'hockey') return '2-й период';
    if (sport === 'esports') return '2-я карта';
    return '2-я партия';
  }
  if (period === 'p3') {
    if (sport === 'basketball') return '3-я четверть';
    if (sport === 'hockey') return '3-й период';
    if (sport === 'esports') return '3-я карта';
    return '3-я партия';
  }
  if (period === 'p4') {
    if (sport === 'basketball') return '4-я четверть';
    if (sport === 'esports') return '4-я карта';
    return '4-я партия';
  }
  if (!isPeriodMarket(period)) return '';
  return periodId ?? '';
}

export function periodTabLabel(sport: SportId): string {
  if (sport === 'football') return 'Таймы';
  if (sport === 'basketball') return 'Четверти';
  if (sport === 'hockey') return 'Периоды';
  if (sport === 'esports') return 'Карты';
  if (sport === 'tennis' || sport === 'volleyball' || sport === 'table-tennis') return 'Партии';
  return 'Периоды';
}

function subtypeTitle(name: string): string {
  return name.split('·')[0]?.trim() || name;
}

function lineSort(left: LayoutLine, right: LayoutLine): number {
  const a = Number(left.line);
  const b = Number(right.line);
  if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return a - b;
  return left.line.localeCompare(right.line, 'ru') || left.id.localeCompare(right.id);
}

function toOutcomes(group: MarketGroup, outcomes: MarketGroup['outcomes']): LayoutOutcome[] {
  return outcomes.map((outcome) => ({
    label: outcome.label,
    odds: outcome.odds,
    locked: outcome.locked,
    sourceSelectionId: outcome.sourceSelectionId ?? null,
    externalMarketId: group.externalMarketId,
  }));
}

export function layoutLinesFromGroups(groups: readonly MarketGroup[], _sport: SportId): LayoutLine[] {
  return groups.flatMap((group) => {
    const outcomes = group.outcomes.filter((outcome) => outcome.odds > 1 || outcome.locked);
    if (!outcomes.length) return [];
    const family = group.marketFamily || `market:${group.externalMarketId ?? group.id}`;
    const shared = {
      family,
      period: isPeriodMarket(group.externalPeriodId),
      periodId: group.externalPeriodId ?? null,
      title: group.name,
    };
    if (!isPlayerType(family)) {
      return [{ id: group.id, ...shared, line: lineCaption(group.name), outcomes: toOutcomes(group, outcomes) }];
    }
    const byPlayer = new Map<string, MarketGroup['outcomes']>();
    for (const outcome of outcomes) {
      const playerId = selectionPlayerId(outcome.sourceSelectionId ?? '');
      byPlayer.set(playerId, [...(byPlayer.get(playerId) ?? []), outcome]);
    }
    return [...byPlayer.entries()].map(([playerId, rows]) => ({
      id: `${group.id}:player:${playerId}`,
      ...shared,
      line: playerId === '0' ? lineCaption(group.name) : playerId,
      outcomes: toOutcomes(group, rows),
    }));
  });
}

export interface MarketTab {
  id: string;
  label: string;
}

function isCornerType(type: string): boolean {
  return type === '1x2-corners' || type.endsWith('-corners') || type.includes('-corners-');
}

function isCardType(type: string): boolean {
  return type.endsWith('-bookings') || type.includes('-bookings-') || type.includes('-cards');
}

function isTotalType(type: string): boolean {
  return type === 'totals' || type === 'totals-points' || type === 'teamtotals-team1' || type === 'teamtotals-team2';
}

function isHandicapType(type: string): boolean {
  return type === 'spreads' || type === 'spreads-european' || type === 'spreads-points';
}

export function marketTabs(lines: readonly LayoutLine[], sport: SportId): MarketTab[] {
  const tabs: MarketTab[] = [{ id: 'all', label: 'Все' }];
  if (lines.some((line) => line.family === '1x2' && !line.period)) tabs.push({ id: '1x2', label: 'Исход' });
  if (lines.some((line) => isTotalType(line.family) && !line.period)) tabs.push({ id: 'totals', label: 'Тоталы' });
  if (lines.some((line) => isHandicapType(line.family) && !line.period)) tabs.push({ id: 'handicaps', label: 'Форы' });
  if (lines.some((line) => isCornerType(line.family))) tabs.push({ id: 'corners', label: 'Угловые' });
  if (lines.some((line) => isCardType(line.family))) tabs.push({ id: 'cards', label: 'Карточки' });
  if (lines.some((line) => line.period)) tabs.push({ id: 'periods', label: periodTabLabel(sport) });
  if (lines.some((line) => isPlayerType(line.family))) tabs.push({ id: 'players', label: 'Игроки' });
  return tabs;
}

function matchesTab(line: LayoutLine, tab: string): boolean {
  if (tab === 'all') return true;
  if (tab === '1x2') return line.family === '1x2' && !line.period;
  if (tab === 'totals') return isTotalType(line.family) && !line.period;
  if (tab === 'handicaps') return isHandicapType(line.family) && !line.period;
  if (tab === 'corners') return isCornerType(line.family);
  if (tab === 'cards') return isCardType(line.family);
  if (tab === 'periods') return line.period;
  if (tab === 'players') return isPlayerType(line.family);
  return false;
}

function matchesQuery(line: LayoutLine, query: string, sport: SportId): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [line.title, line.line, periodCaption(line.periodId, sport), ...line.outcomes.map((outcome) => outcome.label)].join(' ').toLowerCase();
  return haystack.includes(needle);
}

function periodRank(periodId: string | null): number {
  if (!isPeriodMarket(periodId)) return 0;
  if (periodId === 'p1') return 1;
  if (periodId === 'p2') return 2;
  return 3;
}

export function marketAccordions(lines: readonly LayoutLine[], tab: string, query: string, sport: SportId): MarketAccordion[] {
  const visible = lines.filter((line) => matchesTab(line, tab) && matchesQuery(line, query, sport));
  const buckets = new Map<string, LayoutLine[]>();
  for (const line of visible) {
    const key = `${line.family}|${line.periodId ?? 'match'}`;
    buckets.set(key, [...(buckets.get(key) ?? []), line]);
  }
  return [...buckets.entries()]
    .map(([key, grouped]) => {
      const periodId = grouped[0]?.periodId ?? null;
      const period = periodCaption(periodId, sport);
      const base = subtypeTitle(grouped[0]?.title ?? key);
      return {
        id: key,
        family: grouped[0]?.family ?? key,
        periodId,
        title: period ? `${base} · ${period}` : base,
        lines: grouped.sort(lineSort),
      };
    })
    .sort((left, right) => periodRank(left.periodId) - periodRank(right.periodId)
      || marketPriority(left.family, sport) - marketPriority(right.family, sport)
      || Number(left.lines[0]?.outcomes[0]?.externalMarketId ?? 0) - Number(right.lines[0]?.outcomes[0]?.externalMarketId ?? 0));
}
