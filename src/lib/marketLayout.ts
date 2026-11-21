import type { MarketGroup, SportId } from '../types';
import { isLadderType, isPlayerType, marketPriority, placeFootballMarket, selectionPlayerId, type FootballPlacement } from './marketTaxonomy';

export interface LayoutOutcome {
  label: string;
  odds: number;
  locked?: boolean;
  sourceSelectionId?: string | null;
  externalMarketId?: string;
  externalPeriodId?: string | null;
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
    externalPeriodId: group.externalPeriodId ?? null,
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
      const line = isLadderType(family) && typeof group.handicap === 'number'
        ? String(group.handicap)
        : lineCaption(group.name);
      return [{ id: group.id, ...shared, line, outcomes: toOutcomes(group, outcomes) }];
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

function marketCategory(line: LayoutLine, sport: SportId): { id: string; label: string } {
  const type = line.family;
  if (isPlayerType(type)) return { id: 'players', label: 'Статистика игроков' };
  if (isCornerType(type)) return { id: 'corners', label: 'Угловые' };
  if (isCardType(type)) return { id: 'cards', label: 'Желтые карточки' };
  if (type.includes('shotsongoal') || type.includes('shots')) return { id: 'shots', label: 'Удары в створ ворот' };
  if (type.includes('offside')) return { id: 'offsides', label: 'Офсайды' };
  if (type.includes('foul')) return { id: 'fouls', label: 'Фолы' };
  if (type.includes('penalt')) return { id: 'quick', label: 'Быстрые события' };
  if (line.periodId === 'p1') return { id: 'p1', label: sport === 'football' ? '1-й тайм' : periodCaption('p1', sport) };
  if (line.periodId === 'p2') return { id: 'p2', label: sport === 'football' ? '2-й тайм' : periodCaption('p2', sport) };
  return { id: 'main', label: 'Основная игра' };
}

const CATEGORY_ORDER = ['main', 'p1', 'p2', 'corners', 'quick', 'cards', 'shots', 'offsides', 'fouls', 'players'];

const FOOTBALL_TABS: ReadonlyArray<readonly [string, string]> = [
  ['all', 'Все'],
  ['main', 'Основные'],
  ['totals', 'Тоталы'],
  ['asian-totals', 'Азиатские тоталы'],
  ['european-handicap', 'Европейская фора'],
  ['asian-handicap', 'Азиатская фора'],
  ['corners', 'Угловые'],
  ['cards', 'Карточки'],
  ['team-totals', 'Тоталы команд'],
  ['periods', 'Таймы'],
  ['other', 'Другие'],
  ['players', 'Статистика игроков'],
];

const POPULAR_FAMILIES = new Set([
  '1x2', 'doublechance', 'bothteamsscore', 'totals', 'spreads', 'spreads-european',
  'teamtotals-team1', 'teamtotals-team2', 'correctscore', 'exactscore',
]);

function lineHandicap(line: LayoutLine): number | null {
  if (!isLadderType(line.family) || !line.line) return null;
  const value = Number(line.line.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function footballPlacement(line: LayoutLine): FootballPlacement {
  return placeFootballMarket({
    marketType: line.family,
    period: line.periodId,
    handicap: lineHandicap(line),
    marketName: line.title,
  });
}

export function marketTabs(lines: readonly LayoutLine[], sport: SportId): MarketTab[] {
  if (sport === 'football') {
    const present = new Set(lines.map((line) => footballPlacement(line).tab));
    return FOOTBALL_TABS
      .filter(([id]) => id === 'all' ? present.size > 0 : present.has(id))
      .map(([id, label]) => ({ id, label }));
  }
  const present = new Map<string, string>();
  for (const line of lines) {
    const category = marketCategory(line, sport);
    if (!present.has(category.id)) present.set(category.id, category.label);
  }
  return CATEGORY_ORDER.filter((id) => present.has(id)).map((id) => ({ id, label: present.get(id) ?? id }));
}

function matchesTab(line: LayoutLine, tab: string, sport: SportId): boolean {
  if (tab === 'all') return true;
  if (tab === 'popular') {
    return !isPeriodMarket(line.periodId) && POPULAR_FAMILIES.has(line.family);
  }
  if (sport === 'football') return footballPlacement(line).tab === tab;
  return marketCategory(line, sport).id === tab;
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
  const visible = lines.filter((line) => matchesTab(line, tab, sport) && matchesQuery(line, query, sport));
  const buckets = new Map<string, LayoutLine[]>();
  for (const line of visible) {
    const placed = sport === 'football' ? footballPlacement(line) : null;
    const key = placed
      ? `${placed.bucket}|${line.periodId ?? 'match'}`
      : `${line.family}|${line.periodId ?? 'match'}`;
    buckets.set(key, [...(buckets.get(key) ?? []), line]);
  }
  return [...buckets.entries()]
    .map(([key, grouped]) => {
      const periodId = grouped[0]?.periodId ?? null;
      const period = periodCaption(periodId, sport);
      const placed = sport === 'football' && grouped[0] ? footballPlacement(grouped[0]) : null;
      const base = placed ? placed.label : subtypeTitle(grouped[0]?.title ?? key);
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
