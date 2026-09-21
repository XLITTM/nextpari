import type { BetsApiEvent } from './betsapi';
import type { H2HGame, MatchStat } from '../types';
import type {
  FormMatchRow,
  MatchWeather,
  SideIncidents,
  TimelineEvent,
  TimelineKind,
} from './matchWidgetData';

/** Direct gateway fetch — bypasses the shared client odds queue so the match widget stays snappy. */
async function gatewayGet<T>(
  _path: string,
  _params: Record<string, string | number>,
  _timeoutMs = 7000,
): Promise<T> {
  throw new Error('LEGACY_SPORTS_FEED_DISABLED');
}

interface ViewEventRow {
  id?: string;
  text?: string;
}

type ViewPayload = BetsApiEvent & {
  stats?: Record<string, string[] | undefined>;
  events?: ViewEventRow[];
};

export interface MatchWidgetApiBundle {
  stats: MatchStat[];
  h2h: H2HGame[];
  stadium?: { name: string; city: string; capacity: string };
  weather?: MatchWeather;
  round?: string;
  home: SideIncidents;
  away: SideIncidents;
  timeline: TimelineEvent[];
  homeForm: FormMatchRow[];
  awayForm: FormMatchRow[];
}

const DETAIL_STAT_ORDER: Array<{ key: string; label: string }> = [
  { key: 'attacks', label: 'Атаки' },
  { key: 'dangerous_attacks', label: 'Опасные атаки' },
  { key: 'possession_rt', label: 'Владение мячом %' },
  { key: 'on_target', label: 'Удары в створ' },
  { key: 'off_target', label: 'Удары в сторону ворот' },
  { key: 'yellowcards', label: 'Желтые карточки' },
  { key: 'redcards', label: 'Красные карточки' },
  { key: 'saves', label: 'Сейвы' },
  { key: 'corners', label: 'Угловые' },
  { key: 'goalattempts', label: 'Удары' },
  { key: 'fouls', label: 'Фолы' },
  { key: 'offsides', label: 'Офсайды' },
];

function pairNum(stats: Record<string, string[] | undefined> | undefined, key: string): [number, number] {
  const row = stats?.[key];
  if (!row || row.length < 2) return [0, 0];
  return [Number(String(row[0]).replace('%', '')) || 0, Number(String(row[1]).replace('%', '')) || 0];
}

function parseSs(ss?: string | null): [number, number] {
  const m = String(ss ?? '').match(/(\d+)\s*[-:]\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

function formatHistoryDate(unix: string | number | undefined): string {
  const n = Number(unix);
  if (!Number.isFinite(n) || n < 1_000_000) return '—';
  const d = new Date(n * 1000);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function parseWeather(raw: unknown): MatchWeather | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'object' && raw) {
    const obj = raw as Record<string, unknown>;
    const tempC = Number(obj.temp ?? obj.temperature ?? obj.temp_c);
    const windMs = Number(obj.wind ?? obj.wind_speed ?? obj.wind_ms);
    const pressureMm = Number(obj.pressure ?? obj.pressure_mm);
    const humidity = Number(obj.humidity);
    if ([tempC, windMs, pressureMm, humidity].every((n) => Number.isFinite(n))) {
      return { tempC, windMs, pressureMm, humidity };
    }
  }
  const text = String(raw);
  const temp = text.match(/([+-]?\d+(?:\.\d+)?)\s*°?\s*C/i);
  const wind = text.match(/(\d+(?:\.\d+)?)\s*m\/?s/i);
  const pressure = text.match(/(\d+(?:\.\d+)?)\s*mm/i);
  const humidity = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!temp && !wind && !pressure && !humidity) return undefined;
  return {
    tempC: temp ? Number(temp[1]) : 20,
    windMs: wind ? Number(wind[1]) : 3,
    pressureMm: pressure ? Number(pressure[1]) : 750,
    humidity: humidity ? Number(humidity[1]) : 60,
  };
}

function parseStadium(extra: Record<string, unknown> | undefined): MatchWidgetApiBundle['stadium'] {
  if (!extra) return undefined;
  const data = extra.stadium_data;
  if (data && typeof data === 'object') {
    const row = data as Record<string, unknown>;
    const name = String(row.name ?? row.stadium ?? '').trim();
    if (name) {
      return {
        name,
        city: String(row.city ?? '').trim(),
        capacity: String(row.capacity ?? '').trim(),
      };
    }
  }
  const stadium = String(extra.stadium ?? '').trim();
  if (!stadium) return undefined;
  const m = stadium.match(/^(.+?)\s*\((.+?)\)\s*$/);
  if (m) return { name: m[1].trim(), city: m[2].trim(), capacity: '' };
  return { name: stadium, city: '', capacity: '' };
}

function countCardsBeforeHt(
  events: ViewEventRow[] | undefined,
  homeName: string,
  awayName: string,
): { homeY: number; awayY: number; homeR: number; awayR: number } {
  const result = { homeY: 0, awayY: 0, homeR: 0, awayR: 0 };
  if (!events?.length) return result;
  const home = homeName.toLowerCase();
  const away = awayName.toLowerCase();
  for (const row of events) {
    const text = String(row.text ?? '');
    if (/Score After First Half/i.test(text)) break;
    const isYellow = /yellow card/i.test(text);
    const isRed = /red card/i.test(text) && !/yellowred|second yellow/i.test(text);
    if (!isYellow && !isRed) continue;
    const lower = text.toLowerCase();
    const sideHome = home && lower.includes(home);
    const sideAway = away && lower.includes(away);
    if (isYellow) {
      if (sideHome) result.homeY += 1;
      else if (sideAway) result.awayY += 1;
    }
    if (isRed) {
      if (sideHome) result.homeR += 1;
      else if (sideAway) result.awayR += 1;
    }
  }
  return result;
}

function mapStats(stats: Record<string, string[] | undefined> | undefined): MatchStat[] {
  if (!stats) return [];
  return DETAIL_STAT_ORDER.flatMap(({ key, label }) => {
    const [home, away] = pairNum(stats, key);
    if (!stats[key]) return [];
    return [{ label, team1: home, team2: away }];
  });
}

function mapH2H(rows: BetsApiEvent[] | undefined): H2HGame[] {
  if (!rows?.length) return [];
  return rows.slice(0, 12).map((row) => {
    const [h, a] = parseSs(row.ss);
    const home = row.home?.name ?? 'Хозяева';
    const away = row.away?.name ?? 'Гости';
    return {
      date: formatHistoryDate(row.time),
      result: `${home} — ${away}`,
      score: `${h}:${a}`,
    };
  });
}

function detectTimelineKind(text: string): TimelineKind {
  if (/goal|гол/i.test(text) && !/goal kick|удар от ворот/i.test(text)) return 'goal';
  if (/yellow card|желт/i.test(text)) return 'yellow';
  if (/red card|красн/i.test(text)) return 'red';
  if (/corner|угл/i.test(text)) return 'corner';
  if (/substitution|замен/i.test(text)) return 'sub';
  if (/\bvar\b/i.test(text)) return 'var';
  if (/half|перерыв|full time|конец|начал/i.test(text)) return 'period';
  return 'other';
}

function cleanEventLabel(text: string): string {
  return text
    .replace(/^\d+(?:\+\d+)?'?\s*[-~]\s*/i, '')
    .replace(/\s*~\s*/g, ' · ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function mapTimeline(
  events: ViewEventRow[] | undefined,
  homeName: string,
  awayName: string,
): TimelineEvent[] {
  if (!events?.length) return [];
  const home = homeName.toLowerCase();
  const away = awayName.toLowerCase();
  return events
    .map((row, index) => {
      const text = String(row.text ?? '').trim();
      if (!text) return null;
      const minuteMatch = text.match(/^(\d+(?:\+\d+)?)'?/);
      const minute = minuteMatch ? `${minuteMatch[1]}'` : '—';
      const lower = text.toLowerCase();
      let side: TimelineEvent['side'] = 'neutral';
      if (home && lower.includes(home)) side = 'home';
      else if (away && lower.includes(away)) side = 'away';
      return {
        id: String(row.id ?? `${index}-${text}`),
        minute,
        kind: detectTimelineKind(text),
        label: cleanEventLabel(text) || text,
        side,
      } satisfies TimelineEvent;
    })
    .filter((row): row is TimelineEvent => Boolean(row))
    .slice(-16)
    .reverse();
}

function mapTeamForm(
  rows: BetsApiEvent[] | undefined,
  teamName: string,
): FormMatchRow[] {
  if (!rows?.length) return [];
  const team = teamName.toLowerCase();
  return rows.slice(0, 5).map((row) => {
    const [h, a] = parseSs(row.ss);
    const homeName = row.home?.name ?? '';
    const awayName = row.away?.name ?? '';
    const isHome = homeName.toLowerCase() === team || (team && homeName.toLowerCase().includes(team));
    const opponent = isHome ? awayName : homeName;
    const scored = isHome ? h : a;
    const conceded = isHome ? a : h;
    let result: FormMatchRow['result'] = 'D';
    if (scored > conceded) result = 'W';
    else if (scored < conceded) result = 'L';
    return {
      date: formatHistoryDate(row.time),
      opponent: opponent || 'Соперник',
      score: `${scored}:${conceded}`,
      result,
    };
  });
}

function mapIncidents(view: ViewPayload): { home: SideIncidents; away: SideIncidents } {
  const [homeSs, awaySs] = parseSs(view.ss);
  const home1h = Number(view.scores?.['1']?.home ?? 0) || 0;
  const away1h = Number(view.scores?.['1']?.away ?? 0) || 0;
  const homeFt = view.ss != null && String(view.ss).trim() !== ''
    ? homeSs
    : Number(view.scores?.['2']?.home ?? home1h) || 0;
  const awayFt = view.ss != null && String(view.ss).trim() !== ''
    ? awaySs
    : Number(view.scores?.['2']?.away ?? away1h) || 0;
  const [yH, yA] = pairNum(view.stats, 'yellowcards');
  const [rH, rA] = pairNum(view.stats, 'redcards');
  const [cH, cA] = pairNum(view.stats, 'corners');
  const [cH1, cA1] = pairNum(view.stats, 'corner_h');
  const cards1h = countCardsBeforeHt(view.events, view.home?.name ?? '', view.away?.name ?? '');

  return {
    home: {
      goals1h: home1h,
      goalsFt: homeFt,
      yellow1h: cards1h.homeY,
      yellowFt: yH,
      red1h: cards1h.homeR,
      redFt: rH,
      corners1h: cH1,
      cornersFt: cH,
    },
    away: {
      goals1h: away1h,
      goalsFt: awayFt,
      yellow1h: cards1h.awayY,
      yellowFt: yA,
      red1h: cards1h.awayR,
      redFt: rA,
      corners1h: cA1,
      cornersFt: cA,
    },
  };
}

export async function fetchMatchWidgetBundle(_eventId: string): Promise<MatchWidgetApiBundle | null> {
  return null;
}

