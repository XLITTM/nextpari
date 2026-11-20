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
  'teamtotals-bookings-team1': 'Карточки: тотал команды 1',
  'teamtotals-bookings-team2': 'Карточки: тотал команды 2',
  'cleansheet-team1': 'Сухой матч команды 1',
  'cleansheet-team2': 'Сухой матч команды 2',
  'oddeven-team1': 'Чёт / нечет команды 1',
  'oddeven-team2': 'Чёт / нечет команды 2',
  'toscoreinbh-team1': 'Команда 1 забьёт в обоих таймах',
  'toscoreinbh-team2': 'Команда 2 забьёт в обоих таймах',
  'winbothh-team1': 'Команда 1 выиграет оба тайма',
  'winbothh-team2': 'Команда 2 выиграет оба тайма',
  'wineitherh-team1': 'Команда 1 выиграет хотя бы один тайм',
  'wineitherh-team2': 'Команда 2 выиграет хотя бы один тайм',
  'wintonil-team1': 'Команда 1 победит всухую',
  'wintonil-team2': 'Команда 2 победит всухую',
  'highestscoringh': 'Самый результативный тайм',
  'highestscoringh-team1': 'Самый результативный тайм команды 1',
  'highestscoringh-team2': 'Самый результативный тайм команды 2',
  'winningmargin': 'Победа с разницей',
  'winfrombehind': 'Победа с отыгрышем',
  'players-anytimegoalscorer': 'Автор гола',
  'players-firstgoalscorer': 'Первый гол игрока',
  'players-lastgoalscorer': 'Последний гол игрока',
  'players-goals': 'Голы игрока',
  'players-assists': 'Передачи игрока',
  'playertotals-goals': 'Тотал голов игрока',
  'playertotals-shots': 'Тотал ударов игрока',
  'playertotals-shotsongoal': 'Тотал ударов в створ игрока',
  'playertotals-saves': 'Тотал сейвов игрока',
  'playertotals-tackles': 'Тотал отборов игрока',
  'playertotals-cards': 'Тотал карточек игрока',
  'playertotals-foulscommitted': 'Тотал фолов игрока',
};

/** Full-time markets first, in bookmaker order. Period blocks repeat afterwards. */
export const FOOTBALL_MARKET_ORDER = [
  '1x2', 'doublechance', 'bothteamsscore', 'totals', 'spreads', 'spreads-european',
  'teamtotals-team1', 'teamtotals-team2', 'correctscore', 'exactscore', 'exactscore-team1', 'exactscore-team2',
  'firstgoal', 'lastgoal', 'halftime-fulltime', 'oddeven',
  '1x2-corners', 'totals-corners', 'spreads-corners', 'oddeven-corners', 'teamtotals-corners-team1', 'teamtotals-corners-team2',
  '1x2-bookings', 'totals-bookings', 'spreads-bookings', 'oddeven-bookings', 'teamtotals-bookings-team1', 'teamtotals-bookings-team2',
  'wintonil-team1', 'wintonil-team2', 'cleansheet-team1', 'cleansheet-team2',
  'toscoreinbh-team1', 'toscoreinbh-team2', 'winbothh-team1', 'winbothh-team2', 'wineitherh-team1', 'wineitherh-team2',
  'highestscoringh', 'highestscoringh-team1', 'highestscoringh-team2', 'winningmargin', 'winfrombehind',
  'players-anytimegoalscorer', 'players-firstgoalscorer', 'players-lastgoalscorer', 'players-goals', 'players-assists',
  'playertotals-goals', 'playertotals-shots', 'playertotals-shotsongoal', 'playertotals-saves', 'playertotals-tackles', 'playertotals-cards', 'playertotals-foulscommitted',
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
