import type { MarketGroup, SportId } from '../types';
import { isLadderType, isPlayerType, isQuarterLine, marketPriority, selectionPlayerId, subtypeLabel } from './marketTaxonomy';

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

export type MarketTable = 'rows' | 'outcomes' | 'total' | 'handicap2' | 'handicap3' | 'grid' | 'yesno';

export interface MarketAccordion {
  id: string;
  family: string;
  periodId: string | null;
  title: string;
  lines: LayoutLine[];
  table: MarketTable;
  order: number;
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

const FOOTBALL_SECTIONS: ReadonlyArray<readonly [string, string]> = [
  ['main', 'Основная игра'],
  ['p1', '1-й тайм'],
  ['p2', '2-й тайм'],
  ['corners', 'Угловые'],
  ['quick', 'Быстрые события'],
  ['cards', 'Жёлтые карточки'],
  ['shots', 'Удары в створ ворот'],
  ['offsides', 'Офсайды'],
  ['fouls', 'Фолы'],
  ['combo', 'Результат + тотал'],
];

const POPULAR_KEYS = new Set(['1x2', 'doublechance', 'bothteamsscore', 'totals', 'fora', 'team1', 'team2']);

interface FootballView {
  tab: string;
  key: string;
  label: string;
  order: number;
  table: MarketTable;
}

function lineHandicap(line: LayoutLine): number | null {
  if (!isLadderType(line.family) || !line.line) return null;
  const value = Number(line.line.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

export function formatHandicap(value: number): string {
  if (!Number.isFinite(value)) return '';
  const cents = Math.round(value * 100);
  const text = String(cents / 100);
  if (cents > 0) return `+${text}`;
  return text;
}

/** Home keeps the provider handicap. Away is the other participant of the same two-way market. */
export function handicapSides(line: string, outcomes: readonly { label: string }[]): { home: string; away: string } | null {
  if (outcomes.length !== 2) return null;
  const labels = new Set(outcomes.map((outcome) => outcome.label));
  if (!(labels.has('П1') || labels.has('1')) || !(labels.has('П2') || labels.has('2'))) return null;
  const value = Number(line.replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return { home: formatHandicap(cents / 100), away: formatHandicap(-cents / 100) };
}

function footballSection(type: string, periodId: string | null): string {
  if (isPlayerType(type)) return 'players';
  if (type.includes('corner')) return 'corners';
  if (type.includes('booking') || type.includes('card')) return 'cards';
  if (type.includes('shots')) return 'shots';
  if (type.includes('offside')) return 'offsides';
  if (type.includes('foul')) return 'fouls';
  if (type.includes('penalt')) return 'quick';
  if (type.includes('result') && type.includes('total')) return 'combo';
  if (periodId === 'p1') return 'p1';
  if (periodId === 'p2') return 'p2';
  if (isPeriodMarket(periodId)) return periodId ?? 'main';
  return 'main';
}

function footballView(line: LayoutLine): FootballView {
  const type = line.family;
  const quarter = isQuarterLine(lineHandicap(line));
  const tab = footballSection(type, line.periodId);
  const providerLabel = subtypeLabel({ marketType: type, marketName: subtypeTitle(line.title), period: line.periodId ?? '', handicap: lineHandicap(line) });
  const view = (key: string, label: string, order: number, table: MarketTable): FootballView => ({ tab, key, label, order, table });

  if (type === '1x2' || type === 'moneyline') return view('1x2', '1X2', 1, 'outcomes');
  if (type === 'doublechance') return view('doublechance', 'Двойной шанс', 2, 'outcomes');
  if (type === 'totals' && !quarter) return view('totals', 'Тотал', 3, 'total');
  if (type === 'totals' && quarter) return view('asian-totals', 'Азиатский тотал', 13, 'total');
  if (type === 'spreads' && !quarter) return view('fora', 'Фора', 5, 'handicap2');
  if (type === 'spreads' && quarter) return view('asian-fora', 'Азиатская фора', 14, 'handicap2');
  if (type === 'spreads-european') return view('european', 'Европейский гандикап', 18, 'handicap3');
  if (type === 'teamtotals-team1' && !quarter) return view('team1', 'Индивидуальный тотал 1-го', 7, 'total');
  if (type === 'teamtotals-team2' && !quarter) return view('team2', 'Индивидуальный тотал 2-го', 8, 'total');
  if (type === 'teamtotals-team1' && quarter) return view('asian-team1', 'Азиатский индивидуальный тотал 1-го', 15, 'total');
  if (type === 'teamtotals-team2' && quarter) return view('asian-team2', 'Азиатский индивидуальный тотал 2-го', 16, 'total');
  if (type === 'correctscore') return view('correctscore', 'Точный счёт', 12, 'grid');
  if (type === 'oddeven') return view('oddeven', 'Тотал чёт / нечёт', 17, 'outcomes');
  if (type === 'bothteamsscore') return view('bothteamsscore', 'Обе забьют', 20, 'yesno');
  if (type === 'firstgoal') return view('firstgoal', 'Первый гол', 21, 'outcomes');
  if (type === 'lastgoal') return view('lastgoal', 'Последний гол', 22, 'outcomes');
  if (type === '1x2-corners') return view('corner-1x2', 'Угловые: исход', 1, 'outcomes');
  if (type === 'totals-corners' && !quarter) return view('corner-total', 'Угловые: тотал', 2, 'total');
  if (type === 'totals-corners' && quarter) return view('corner-asian-total', 'Угловые: азиатский тотал', 3, 'total');
  if (type === 'spreads-corners' && !quarter) return view('corner-fora', 'Угловые: фора', 4, 'handicap2');
  if (type === 'spreads-corners' && quarter) return view('corner-asian-fora', 'Угловые: азиатская фора', 5, 'handicap2');
  if (type === 'teamtotals-corners-team1') return view('corner-team1', quarter ? 'Угловые: азиатский индивидуальный тотал 1-го' : 'Угловые: индивидуальный тотал 1-го', 6, 'total');
  if (type === 'teamtotals-corners-team2') return view('corner-team2', quarter ? 'Угловые: азиатский индивидуальный тотал 2-го' : 'Угловые: индивидуальный тотал 2-го', 7, 'total');
  if (type === '1x2-bookings') return view('card-1x2', 'Исход', 1, 'outcomes');
  if (type === 'totals-bookings') return view(quarter ? 'card-asian-total' : 'card-total', quarter ? 'Азиатский тотал' : 'Тотал', 2, 'total');
  if (type === 'spreads-bookings') return view(quarter ? 'card-asian-fora' : 'card-fora', quarter ? 'Азиатская фора' : 'Фора', 3, 'handicap2');
  if (type === 'teamtotals-bookings-team1') return view('card-team1', quarter ? 'Азиатский индивидуальный тотал 1-го' : 'Индивидуальный тотал 1-го', 4, 'total');
  if (type === 'teamtotals-bookings-team2') return view('card-team2', quarter ? 'Азиатский индивидуальный тотал 2-го' : 'Индивидуальный тотал 2-го', 5, 'total');
  const ladder = isLadderType(type);
  const table: MarketTable = type === 'correctscore' || type.startsWith('exactscore')
    ? 'grid'
    : ladder && type.startsWith('spreads')
      ? 'handicap2'
      : ladder
        ? 'total'
        : 'outcomes';
  return view(type, providerLabel, 100 + marketPriority(type, 'football'), table);
}

export function marketTabs(lines: readonly LayoutLine[], sport: SportId): MarketTab[] {
  if (sport === 'football') {
    const present = new Set(lines.map((line) => footballView(line).tab).filter((tab) => tab !== 'players'));
    const known = FOOTBALL_SECTIONS.filter(([id]) => present.has(id)).map(([id, label]) => ({ id, label }));
    const extra = [...present]
      .filter((id) => !FOOTBALL_SECTIONS.some(([knownId]) => knownId === id))
      .map((id) => ({ id, label: periodCaption(id, sport) || id }));
    return [...known, ...extra];
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
  if (sport === 'football') {
    const view = footballView(line);
    if (tab === 'popular') return view.tab === 'main' && POPULAR_KEYS.has(view.key);
    return view.tab === tab;
  }
  if (tab === 'popular') {
    return marketCategory(line, sport).id === 'main' && ['1x2', 'doublechance', 'bothteamsscore', 'totals', 'spreads', 'spreads-european', 'teamtotals-team1', 'teamtotals-team2', 'correctscore', 'exactscore'].includes(line.family);
  }
  return marketCategory(line, sport).id === tab;
}

function matchesQuery(line: LayoutLine, query: string, sport: SportId): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const view = sport === 'football' ? footballView(line) : null;
  const haystack = [view?.label, line.title, line.line, periodCaption(line.periodId, sport), ...line.outcomes.map((outcome) => outcome.label)].join(' ').toLowerCase();
  return haystack.includes(needle);
}

function periodRank(periodId: string | null): number {
  if (!isPeriodMarket(periodId)) return 0;
  if (periodId === 'p1') return 1;
  if (periodId === 'p2') return 2;
  return 3;
}

function sectionRank(tab: string): number {
  const index = FOOTBALL_SECTIONS.findIndex(([id]) => id === tab);
  return index === -1 ? FOOTBALL_SECTIONS.length : index;
}

export function marketAccordions(lines: readonly LayoutLine[], tab: string, query: string, sport: SportId): MarketAccordion[] {
  const visible = lines.filter((line) => matchesTab(line, tab, sport) && matchesQuery(line, query, sport));
  const buckets = new Map<string, { lines: LayoutLine[]; view: FootballView | null }>();
  for (const line of visible) {
    const view = sport === 'football' ? footballView(line) : null;
    const period = line.periodId ?? 'match';
    const key = view ? `${view.tab}:${view.key}:${period}` : `${line.family}|${period}`;
    const bucket = buckets.get(key) ?? { lines: [], view };
    bucket.lines.push(line);
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .map(([key, bucket]) => {
      const grouped = bucket.lines;
      const periodId = grouped[0]?.periodId ?? null;
      const period = periodCaption(periodId, sport);
      const base = bucket.view?.label ?? subtypeTitle(grouped[0]?.title ?? key);
      const repeatPeriod = Boolean(bucket.view && (bucket.view.tab === 'corners' || bucket.view.tab === 'cards') && period);
      return {
        id: key,
        family: grouped[0]?.family ?? key,
        periodId,
        title: repeatPeriod ? `${base} · ${period}` : base,
        lines: grouped.sort(lineSort),
        table: bucket.view?.table ?? 'rows',
        order: bucket.view?.order ?? marketPriority(grouped[0]?.family ?? '', sport),
      };
    })
    .sort((left, right) => {
      const leftView = sport === 'football' ? sectionRank(left.id.split(':')[0] ?? '') : periodRank(left.periodId);
      const rightView = sport === 'football' ? sectionRank(right.id.split(':')[0] ?? '') : periodRank(right.periodId);
      return leftView - rightView
        || periodRank(left.periodId) - periodRank(right.periodId)
        || left.order - right.order
        || Number(left.lines[0]?.outcomes[0]?.externalMarketId ?? 0) - Number(right.lines[0]?.outcomes[0]?.externalMarketId ?? 0);
    });
}
