import { footballLogoData } from './footballLogoData';

const teams: Record<string, string> = footballLogoData.teams;
const competitions: Record<string, string> = footballLogoData.competitions;
const canonical: Record<string, string> = footballLogoData.canonical;
const aliases: Record<string, string> = footballLogoData.aliases;
const nationalAliases: Record<string, string> = footballLogoData.nationalAliases;
const membership: Record<string, readonly string[]> = footballLogoData.membership;
const teamCountries: Record<string, readonly string[]> = footballLogoData.teamCountries;
const contexts = footballLogoData.contexts;

const slugWords = new Map<string, string>();
for (const slug of Object.keys(teams)) slugWords.set(slug.replace(/-/g, ' '), slug);

/** OddsPapi prints a longer club name than the verified registry. Exact names only. */
const feedAliases: Record<string, string> = {
  'racing club de lens': 'rc-lens',
  'fenerbahce istanbul': 'fenerbahce',
  'fk rubin kazan': 'rubin',
  'rubin kazan': 'rubin',
  'fk zenit saint petersburg': 'zenit',
  'zenit saint petersburg': 'zenit',
  'rfk akhmat grozny': 'akhmat',
  'akhmat grozny': 'akhmat',
  'cska moscow': 'cska-moskva',
  'wacker innsbruck': 'fc-wacker-innsbruck',
  'maritimo madeira': 'maritimo',
  'tsg hoffenheim': 'hoffenheim',
  'celtic glasgow': 'celtic',
  'bolton wanderers': 'bolton',
  'afc bournemouth': 'bournemouth',
  'royal charleroi sc': 'charleroi',
  'st truidense vv': 'sint-truidense',
  'ssc napoli': 'napoli',
  'lille osc': 'lille',
  'olympique lyon': 'lyon',
  'olympique lyonnais': 'lyon',
  'strasbourg alsace': 'rc-strasbourg-alsace',
  'stade brest 29': 'brest',
  'rc celta de vigo': 'celta',
  'celta de vigo': 'celta',
  'as monaco': 'as-monaco',
  'aj auxerre': 'auxerre',
  'juventus turin': 'juventus',
  'venezia fc': 'venezia',
  'torino fc': 'torino',
  'toulouse fc': 'toulouse',
  'angers sco': 'angers',
  'lazio rome': 'lazio',
};

const suffixes = new Set(['fc', 'afc', 'cf', 'fk', 'sk', 'ac', 'club', 'calcio']);
const prefixes = new Set(['fc', 'cf', 'ac', 'as', 'cd', 'rc', 'fk', 'sk']);
const ambiguous = new Set([
  'premier league', 'pro league', 'liga 1', 'ligue 1', 'ligue 2', '2 lig', '2 liga',
  'serie a', 'serie b', 'championship', 'superliga', 'bundesliga', 'primera division', 'premiership',
]);
const restrictedTeam = /\b(women|woman|ladies|feminine|female|wfc|reserves?|youth|academy|amateur|primavera|ii|iii|u ?\d{2})\b/u;
const restrictedCompetition = /\b(women|woman|ladies|feminine|female|wfc|reserves?|youth|academy|amateur|primavera|u ?\d{2})\b/u;
const countryAliases: Record<string, string> = {
  england: 'eng', англия: 'eng', 'gb-eng': 'eng',
  scotland: 'sco', шотландия: 'sco', 'gb-sct': 'sco',
  wales: 'wal', уэльс: 'wal', 'gb-wls': 'wal',
  'northern ireland': 'nir', 'северная ирландия': 'nir', 'gb-nir': 'nir',
  uk: 'gb', spain: 'es', испания: 'es', germany: 'de', france: 'fr',
  italy: 'it', turkey: 'tr', türkiye: 'tr', czechia: 'cz',
};

export function footballLogoPath(
  kind: 'team' | 'competition',
  name: string,
  country = '',
  league = '',
  canonicalId = '',
): string | null {
  if (canonicalId) {
    const known = canonical[canonicalId];
    if (known) return known;
    if (canonicalId.startsWith('football:')) return null;
  }
  if (kind === 'competition') return competitionPath(name, country);
  return teamPath(name, country, league);
}

function competitionPath(league: string, country: string): string | null {
  const selected = context(league, country);
  return selected ? competitions[selected.id] ?? null : null;
}

function teamPath(name: string, country: string, league: string): string | null {
  const normalized = normalize(name);
  if (restrictedTeam.test(normalized) || restrictedCompetition.test(normalize(league))) return null;
  const selected = context(league, country);
  const forms = keys(normalized);
  if (selected?.national) {
    const national = nationalAliases[normalized];
    if (national && teams[national]) return teams[national];
    const scoped = slugFor(forms, selected.id);
    if (scoped) return teams[scoped];
  }
  if (selected) {
    const scoped = slugFor(forms, selected.id);
    if (scoped) return teams[scoped];
  }
  const slug = slugFor(forms, null);
  if (!slug) return null;
  const countryToken = countryKey(country);
  if (countryToken && !teamCountries[slug]?.includes(countryToken)) return null;
  return teams[slug] ?? null;
}

function context(leagueName: string, country: string) {
  const league = normalize(leagueName);
  const countryToken = countryKey(country);
  const selfContained = contexts.find((item) => item.leagues.includes(league) && !ambiguous.has(league));
  if (selfContained) return selfContained;
  return contexts.find((item) => item.leagues.includes(league) && item.countries.includes(countryToken)) ?? null;
}

function slugFor(forms: string[], competition: string | null): string | null {
  const found = new Set<string>();
  for (const form of forms) {
    const alias = aliases[form] ?? feedAliases[form];
    for (const slug of [slugWords.get(form), alias]) {
      if (!slug) continue;
      if (competition === null || membership[slug]?.includes(competition)) found.add(slug);
    }
  }
  return found.size === 1 ? [...found][0] : null;
}

function keys(value: string): string[] {
  const stripped = strip(value);
  return stripped && stripped !== value ? [value, stripped] : [value];
}

function strip(value: string): string {
  const tokens = value.split(' ').filter(Boolean);
  while (tokens.length > 1 && suffixes.has(tokens[tokens.length - 1])) tokens.pop();
  while (tokens.length > 1 && prefixes.has(tokens[0])) tokens.shift();
  return tokens.join(' ');
}

function countryKey(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return '';
  return countryAliases[key] ?? ((key.length === 2 || key === 'eng' || key === 'sco' || key === 'wal' || key === 'nir') ? key : normalize(raw));
}

function normalize(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
