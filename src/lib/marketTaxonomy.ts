/**
 * OddsPapi marketType values are the taxonomy. A label is applied only when the
 * type matches this table exactly. Unknown types keep the provider's own name.
 */
export interface MarketIdentity {
  marketType: string;
  marketName: string;
  period: string;
  handicap: number | null;
}

const SUBTYPE_LABELS: Record<string, string> = {
  '1x2': 'Исход',
  moneyline: 'Победитель',
  doublechance: 'Двойной шанс',
  bothteamsscore: 'Обе забьют',
  totals: 'Тотал',
  spreads: 'Азиатская фора',
  'spreads-european': 'Европейская фора',
  'teamtotals-team1': 'Тотал команды 1',
  'teamtotals-team2': 'Тотал команды 2',
  correctscore: 'Точный счёт',
  exactscore: 'Точное число голов',
  'exactscore-team1': 'Точное число голов команды 1',
  'exactscore-team2': 'Точное число голов команды 2',
  firstgoal: 'Первый гол',
  lastgoal: 'Последний гол',
  'halftime-fulltime': 'Тайм / матч',
  oddeven: 'Чёт / нечет',
  '1x2-corners': 'Угловые: исход',
  'totals-corners': 'Угловые: тотал',
  'spreads-corners': 'Угловые: фора',
  'oddeven-corners': 'Угловые: чёт / нечет',
  'teamtotals-corners-team1': 'Угловые: тотал команды 1',
  'teamtotals-corners-team2': 'Угловые: тотал команды 2',
  'totals-bookings': 'Карточки: тотал',
  'spreads-bookings': 'Карточки: фора',
  '1x2-bookings': 'Карточки: исход',
  'oddeven-bookings': 'Карточки: чёт / нечет',
};

/** Full-time markets first, in bookmaker order. Period blocks repeat afterwards. */
export const FOOTBALL_MARKET_ORDER = [
  '1x2', 'doublechance', 'bothteamsscore', 'totals', 'spreads', 'spreads-european',
  'teamtotals-team1', 'teamtotals-team2', 'correctscore', 'exactscore', 'exactscore-team1', 'exactscore-team2',
  'firstgoal', 'lastgoal', 'halftime-fulltime', 'oddeven',
  '1x2-corners', 'totals-corners', 'spreads-corners', 'oddeven-corners', 'teamtotals-corners-team1', 'teamtotals-corners-team2',
  '1x2-bookings', 'totals-bookings', 'spreads-bookings', 'oddeven-bookings',
];

export const BASKETBALL_MARKET_ORDER = ['moneyline', '1x2', 'spreads', 'totals', 'teamtotals-team1', 'teamtotals-team2', 'oddeven'];
export const RACKET_MARKET_ORDER = ['moneyline', '1x2', 'spreads', 'totals', 'teamtotals-team1', 'teamtotals-team2'];
export const HOCKEY_MARKET_ORDER = ['1x2', 'moneyline', 'totals', 'spreads', 'teamtotals-team1', 'teamtotals-team2', 'bothteamsscore'];
export const ESPORTS_MARKET_ORDER = ['moneyline', '1x2', 'spreads', 'totals', 'teamtotals-team1', 'teamtotals-team2'];

const SIDE_TYPES = new Set([
  '1x2', 'moneyline', 'spreads', 'spreads-european', '1x2-corners', '1x2-bookings', '1x2-shotsongoal',
  'firstgoal', 'lastgoal', 'firstcorner', 'lastcorner', 'drawnobet',
]);

export function marketTypeOf(market: { marketType: string }): string {
  return market.marketType.trim().toLowerCase();
}

export function subtypeLabel(market: MarketIdentity): string {
  return SUBTYPE_LABELS[marketTypeOf(market)] ?? market.marketName;
}

export function marketPriority(marketType: string, sport: string): number {
  const order = sport === 'basketball'
    ? BASKETBALL_MARKET_ORDER
    : sport === 'tennis' || sport === 'volleyball' || sport === 'table-tennis'
      ? RACKET_MARKET_ORDER
      : sport === 'hockey'
        ? HOCKEY_MARKET_ORDER
        : sport === 'esports'
          ? ESPORTS_MARKET_ORDER
          : FOOTBALL_MARKET_ORDER;
  const index = order.indexOf(marketType);
  return index === -1 ? order.length + 1 : index;
}

export function isLadderType(marketType: string): boolean {
  return marketType === 'totals'
    || marketType === 'spreads'
    || marketType === 'spreads-european'
    || marketType.startsWith('totals-')
    || marketType.startsWith('spreads-')
    || marketType.startsWith('teamtotals-')
    || marketType.startsWith('playertotals-');
}

export function isPlayerType(marketType: string): boolean {
  return marketType.startsWith('players-') || marketType.startsWith('playertotals-');
}

export function outcomeLabelFor(marketType: string, outcomeName: string): string {
  const type = marketType.trim().toLowerCase();
  const name = outcomeName.trim();
  if (type === 'correctscore' || type === 'exactscore' || type.startsWith('exactscore-')) return name;
  if (type === 'halftime-fulltime') {
    return name.split('/').map((part) => (part === '1' ? 'П1' : part === '2' ? 'П2' : part)).join('/');
  }
  if (type === 'oddeven' || type.startsWith('oddeven-')) {
    if (/^odd$/i.test(name)) return 'Нечет';
    if (/^even$/i.test(name)) return 'Чёт';
    return name;
  }
  if (isLadderType(type) && type !== 'spreads' && type !== 'spreads-european' && !type.startsWith('spreads-')) {
    if (/^over$/i.test(name)) return 'Больше';
    if (/^under$/i.test(name)) return 'Меньше';
  }
  if (/^yes$/i.test(name)) return 'Да';
  if (/^no$/i.test(name)) return 'Нет';
  if (SIDE_TYPES.has(type)) {
    if (name === '1') return 'П1';
    if (name === '2') return 'П2';
    if (name === 'X' || /^draw$/i.test(name)) return 'X';
    if (/^no goal$/i.test(name)) return 'Гола не будет';
  }
  return name;
}

export function selectionPlayerId(sourceSelectionId: string): string {
  const parts = sourceSelectionId.split(':');
  return parts.length === 4 && parts[3] ? parts[3] : '0';
}
