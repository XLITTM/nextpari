import type { MarketGroup, SportId } from '../types';

export const MARKET_FAMILY_ORDER = [
  'main',
  'double-chance',
  'btts',
  'correct-score',
  'totals',
  'asian-handicap',
  'european-handicap',
  'team-totals',
  'corners',
  'cards',
  'players',
  'other',
] as const;

export type MarketFamilyId = (typeof MARKET_FAMILY_ORDER)[number];

const FAMILY_LABELS: Record<MarketFamilyId, string> = {
  main: 'Исход',
  'double-chance': 'Двойной шанс',
  btts: 'Обе забьют',
  'correct-score': 'Точный счёт',
  totals: 'Тотал',
  'asian-handicap': 'Фора',
  'european-handicap': 'Европейская фора',
  'team-totals': 'Индивидуальный тотал',
  corners: 'Угловые',
  cards: 'Карточки',
  players: 'Игроки',
  other: 'Другие рынки',
};

const POPULAR = new Set<MarketFamilyId>(['main', 'double-chance', 'btts', 'correct-score']);

export interface LayoutOutcome {
  label: string;
  odds: number;
  locked?: boolean;
  sourceSelectionId?: string | null;
  externalMarketId?: string;
}

export interface LayoutLine {
  id: string;
  family: MarketFamilyId;
  period: boolean;
  periodId: string | null;
  title: string;
  line: string;
  outcomes: LayoutOutcome[];
}

export interface MarketAccordion {
  id: string;
  family: MarketFamilyId;
  title: string;
  lines: LayoutLine[];
}

export function marketFamilyLabel(family: MarketFamilyId): string {
  return FAMILY_LABELS[family];
}

export function knownMarketFamily(value: string | undefined): MarketFamilyId {
  return MARKET_FAMILY_ORDER.includes(value as MarketFamilyId) ? value as MarketFamilyId : 'other';
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

function lineSort(left: LayoutLine, right: LayoutLine): number {
  const a = Number(left.line);
  const b = Number(right.line);
  if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return a - b;
  return left.title.localeCompare(right.title, 'ru');
}

export function layoutLinesFromGroups(groups: readonly MarketGroup[], sport: SportId): LayoutLine[] {
  return groups.flatMap((group) => {
    const outcomes = group.outcomes.filter((outcome) => outcome.odds > 1 || outcome.locked);
    if (!outcomes.length) return [];
    const family = knownMarketFamily(group.marketFamily);
    return [{
      id: group.id,
      family,
      period: isPeriodMarket(group.externalPeriodId),
      periodId: group.externalPeriodId ?? null,
      title: group.name,
      line: lineCaption(group.name),
      outcomes: outcomes.map((outcome) => ({
        label: outcome.label,
        odds: outcome.odds,
        locked: outcome.locked,
        sourceSelectionId: outcome.sourceSelectionId ?? null,
        externalMarketId: group.externalMarketId,
      })),
    }];
  }).sort((left, right) => MARKET_FAMILY_ORDER.indexOf(left.family) - MARKET_FAMILY_ORDER.indexOf(right.family) || lineSort(left, right));
}

export interface MarketTab {
  id: string;
  label: string;
}

export function marketTabs(lines: readonly LayoutLine[], sport: SportId): MarketTab[] {
  const present = new Set(lines.map((line) => line.family));
  const tabs: MarketTab[] = [{ id: 'all', label: 'Все' }];
  if ([...present].some((family) => POPULAR.has(family) && lines.some((line) => line.family === family && !line.period))) {
    tabs.push({ id: 'popular', label: 'Популярное' });
  }
  if (lines.some((line) => line.family === 'totals' && !line.period)) tabs.push({ id: 'totals', label: 'Тоталы' });
  if (lines.some((line) => (line.family === 'asian-handicap' || line.family === 'european-handicap') && !line.period)) {
    tabs.push({ id: 'handicaps', label: 'Форы' });
  }
  if (lines.some((line) => line.family === 'team-totals')) tabs.push({ id: 'team-totals', label: 'Инд. тоталы' });
  if (lines.some((line) => line.family === 'corners')) tabs.push({ id: 'corners', label: 'Угловые' });
  if (lines.some((line) => line.family === 'cards')) tabs.push({ id: 'cards', label: 'Карточки' });
  if (lines.some((line) => line.period)) tabs.push({ id: 'periods', label: periodTabLabel(sport) });
  if (lines.some((line) => line.family === 'players')) tabs.push({ id: 'players', label: 'Игроки' });
  if (lines.some((line) => line.family === 'other')) tabs.push({ id: 'other', label: 'Другие' });
  return tabs;
}

function matchesTab(line: LayoutLine, tab: string): boolean {
  if (tab === 'all') return true;
  if (tab === 'popular') return POPULAR.has(line.family) && !line.period;
  if (tab === 'totals') return line.family === 'totals' && !line.period;
  if (tab === 'handicaps') return (line.family === 'asian-handicap' || line.family === 'european-handicap') && !line.period;
  if (tab === 'team-totals') return line.family === 'team-totals';
  if (tab === 'periods') return line.period;
  return line.family === tab;
}

function matchesQuery(line: LayoutLine, query: string, sport: SportId): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    marketFamilyLabel(line.family),
    line.title,
    line.line,
    periodCaption(line.periodId, sport),
    ...line.outcomes.map((outcome) => outcome.label),
  ].join(' ').toLowerCase();
  return haystack.includes(needle);
}

export function marketAccordions(lines: readonly LayoutLine[], tab: string, query: string, sport: SportId): MarketAccordion[] {
  const visible = lines.filter((line) => matchesTab(line, tab) && matchesQuery(line, query, sport));
  const buckets = new Map<string, LayoutLine[]>();
  for (const line of visible) {
    const period = line.period ? periodCaption(line.periodId, sport) : '';
    const key = `${line.family}|${period}`;
    buckets.set(key, [...(buckets.get(key) ?? []), line]);
  }
  return [...buckets.entries()]
    .map(([key, grouped]) => {
      const [family, period] = key.split('|');
      const familyId = knownMarketFamily(family);
      const base = marketFamilyLabel(familyId);
      return {
        id: key,
        family: familyId,
        title: period ? `${base} · ${period}` : base,
        lines: grouped.sort(lineSort),
      };
    })
    .sort((left, right) => left.title.localeCompare(right.title, 'ru') || MARKET_FAMILY_ORDER.indexOf(left.family) - MARKET_FAMILY_ORDER.indexOf(right.family));
}
