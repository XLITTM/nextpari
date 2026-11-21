import type { SportId } from '../types';

export const SPORT_NAV_ORDER: SportId[] = [
  'football',
  'tennis',
  'basketball',
  'hockey',
  'volleyball',
  'table-tennis',
  'esports',
];

const INTERNATIONAL = new Set([
  'international', 'europe', 'world', 'uefa', 'fifa', 'atp', 'wta', 'itf', 'wtt', 'ittf',
  'fivb', 'cev', 'iihf', 'blast', 'utr men', 'utr women',
]);

const COUNTRY_RU: Record<string, { label: string; region: string }> = {
  england: { label: 'Англия', region: 'eng' },
  scotland: { label: 'Шотландия', region: 'sco' },
  wales: { label: 'Уэльс', region: 'wal' },
  'northern ireland': { label: 'Северная Ирландия', region: 'nir' },
  spain: { label: 'Испания', region: 'es' },
  germany: { label: 'Германия', region: 'de' },
  italy: { label: 'Италия', region: 'it' },
  france: { label: 'Франция', region: 'fr' },
  portugal: { label: 'Португалия', region: 'pt' },
  netherlands: { label: 'Нидерланды', region: 'nl' },
  turkey: { label: 'Турция', region: 'tr' },
  turkiye: { label: 'Турция', region: 'tr' },
  brazil: { label: 'Бразилия', region: 'br' },
  argentina: { label: 'Аргентина', region: 'ar' },
  usa: { label: 'США', region: 'us' },
  'united states': { label: 'США', region: 'us' },
  russia: { label: 'Россия', region: 'ru' },
  china: { label: 'Китай', region: 'cn' },
  greece: { label: 'Греция', region: 'gr' },
  sweden: { label: 'Швеция', region: 'se' },
  finland: { label: 'Финляндия', region: 'fi' },
  czechia: { label: 'Чехия', region: 'cz' },
  ukraine: { label: 'Украина', region: 'ua' },
  kazakhstan: { label: 'Казахстан', region: 'kz' },
  romania: { label: 'Румыния', region: 'ro' },
  norway: { label: 'Норвегия', region: 'no' },
  lithuania: { label: 'Литва', region: 'lt' },
  latvia: { label: 'Латвия', region: 'lv' },
  cyprus: { label: 'Кипр', region: 'cy' },
  lebanon: { label: 'Ливан', region: 'lb' },
};

type Rule = { sport: SportId; countries: string[]; leagues: string[]; rank: number };

const RULES: Rule[] = [
  { sport: 'football', countries: ['international', 'europe', 'uefa'], leagues: ['uefa champions league'], rank: 1 },
  { sport: 'football', countries: ['international', 'europe', 'uefa'], leagues: ['uefa europa league'], rank: 2 },
  { sport: 'football', countries: ['international', 'europe', 'uefa'], leagues: ['uefa conference league', 'uefa europa conference league'], rank: 3 },
  { sport: 'football', countries: ['england'], leagues: ['premier league'], rank: 4 },
  { sport: 'football', countries: ['spain'], leagues: ['laliga', 'la liga'], rank: 5 },
  { sport: 'football', countries: ['italy'], leagues: ['serie a'], rank: 6 },
  { sport: 'football', countries: ['germany'], leagues: ['bundesliga'], rank: 7 },
  { sport: 'football', countries: ['france'], leagues: ['ligue 1'], rank: 8 },
  { sport: 'football', countries: ['portugal'], leagues: ['primeira liga', 'liga portugal'], rank: 9 },
  { sport: 'football', countries: ['netherlands'], leagues: ['eredivisie'], rank: 10 },
  { sport: 'football', countries: ['turkey', 'turkiye'], leagues: ['super lig', 'süper lig', 'turkish super lig'], rank: 11 },
  { sport: 'football', countries: ['brazil'], leagues: ['serie a', 'brasileirao', 'brasileirão', 'brazilian serie a'], rank: 12 },
  { sport: 'football', countries: ['argentina'], leagues: ['primera division', 'liga profesional', 'argentina primera division'], rank: 13 },
  { sport: 'football', countries: ['usa', 'united states'], leagues: ['mls', 'major league soccer'], rank: 14 },
  { sport: 'basketball', countries: ['usa', 'united states'], leagues: ['nba'], rank: 1 },
  { sport: 'basketball', countries: ['international', 'europe'], leagues: ['euroleague', 'turkish airlines euroleague'], rank: 2 },
  { sport: 'basketball', countries: ['international', 'europe'], leagues: ['eurocup'], rank: 3 },
  { sport: 'basketball', countries: ['usa', 'united states'], leagues: ['ncaa', 'ncaa men'], rank: 4 },
  { sport: 'tennis', countries: ['atp', 'international'], leagues: ['atp world tour finals', 'atp world tour finals men singles', 'nitto atp finals'], rank: 5 },
  { sport: 'hockey', countries: ['usa', 'united states', 'international'], leagues: ['nhl'], rank: 1 },
  { sport: 'hockey', countries: ['russia', 'international'], leagues: ['khl'], rank: 2 },
  { sport: 'volleyball', countries: ['international', 'fivb'], leagues: ['nations league', 'fivb nations league'], rank: 1 },
  { sport: 'table-tennis', countries: ['international', 'wtt', 'ittf'], leagues: ['wtt star contender muscat'], rank: 4 },
  { sport: 'esports', countries: ['blast', 'international'], leagues: ['blast slam'], rank: 10 },
];

export function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

export function competitionRank(sport: string, league: string, country: string): number {
  const leagueKey = normalizeLabel(league);
  const countryKey = normalizeLabel(country);
  let best = 1000;
  for (const rule of RULES) {
    if (rule.sport !== sport || !rule.leagues.includes(leagueKey)) continue;
    if (rule.countries.length > 0 && !rule.countries.includes(countryKey)) continue;
    best = Math.min(best, rule.rank);
  }
  return best;
}

export function isTopCompetition(sport: string, league: string, country: string): boolean {
  return competitionRank(sport, league, country) < 30;
}

export function isInternationalCompetition(league: string, country: string): boolean {
  const countryKey = normalizeLabel(country);
  const leagueKey = normalizeLabel(league);
  return INTERNATIONAL.has(countryKey) || (countryKey !== '' && countryKey === leagueKey);
}

export type CompetitionBucket = 'top' | 'international' | 'country';

export function competitionBucket(sport: string, league: string, country: string): CompetitionBucket {
  if (isTopCompetition(sport, league, country)) return 'top';
  if (isInternationalCompetition(league, country)) return 'international';
  return 'country';
}

export function countryPresentation(country: string): { name: string; region: string } {
  const key = normalizeLabel(country);
  const known = COUNTRY_RU[key];
  if (known) return { name: known.label, region: known.region };
  return { name: country.trim(), region: key.length === 2 ? key : '' };
}

export function sportNavIndex(sport: string): number {
  const index = SPORT_NAV_ORDER.indexOf(sport as SportId);
  return index === -1 ? SPORT_NAV_ORDER.length + 1 : index;
}

export function takeDiverse<T>(items: readonly T[], limit: number, identity: (item: T) => string, rank: (item: T) => number, time: (item: T) => number): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = identity(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  for (const rows of groups.values()) rows.sort((left, right) => time(left) - time(right));
  const ordered = [...groups.entries()].sort((left, right) => rank(left[1][0]!) - rank(right[1][0]!) || time(left[1][0]!) - time(right[1][0]!));
  const picked: T[] = [];
  for (let round = 0; picked.length < limit; round += 1) {
    let added = false;
    for (const [, rows] of ordered) {
      const row = rows[round];
      if (!row) continue;
      picked.push(row);
      added = true;
      if (picked.length === limit) break;
    }
    if (!added) break;
  }
  return picked;
}
