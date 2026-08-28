import type { H2HGame, MatchEvent, MatchStat } from '../types';

export type TimelineKind = 'goal' | 'yellow' | 'red' | 'corner' | 'sub' | 'var' | 'period' | 'other';

export interface TimelineEvent {
  id: string;
  minute: string;
  kind: TimelineKind;
  label: string;
  side: 'home' | 'away' | 'neutral';
}

export interface FormMatchRow {
  date: string;
  opponent: string;
  score: string;
  result: 'W' | 'D' | 'L';
}

export interface SideIncidents {
  goals1h: number;
  goalsFt: number;
  yellow1h: number;
  yellowFt: number;
  red1h: number;
  redFt: number;
  corners1h: number;
  cornersFt: number;
}

export interface MatchWeather {
  tempC: number;
  windMs: number;
  pressureMm: number;
  humidity: number;
}

export interface MatchH2HRow {
  date: string;
  label: string;
  score: string;
  result: string;
  leftName: string;
  rightName: string;
  leftLogo?: string;
  rightLogo?: string;
}

export interface DetailStatRow {
  label: string;
  home: number;
  away: number;
}

function hashSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash || 1;
}

function pick(seed: number, mod: number, offset = 0): number {
  return (seed + offset * 17) % Math.max(1, mod);
}

function numStat(stats: MatchStat[] | undefined, patterns: RegExp[], side: 'team1' | 'team2'): number | null {
  if (!stats?.length) return null;
  const row = stats.find((item) => patterns.some((re) => re.test(item.label)));
  if (!row) return null;
  const raw = side === 'team1' ? row.team1 : row.team2;
  const n = Number(String(raw).replace('%', '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function buildIncidents(match: MatchEvent): { home: SideIncidents; away: SideIncidents } {
  const seed = hashSeed(match.id);
  const homeGoalsFt = match.liveScore?.team1 ?? pick(seed, 3, 1);
  const awayGoalsFt = match.liveScore?.team2 ?? pick(seed, 3, 2);
  const homeGoals1h = Math.min(homeGoalsFt, pick(seed, homeGoalsFt + 1, 3));
  const awayGoals1h = Math.min(awayGoalsFt, pick(seed, awayGoalsFt + 1, 4));

  const yellowHome = numStat(match.stats, [/желт|yellow/i], 'team1');
  const yellowAway = numStat(match.stats, [/желт|yellow/i], 'team2');
  const redHome = numStat(match.stats, [/красн|red card/i], 'team1');
  const redAway = numStat(match.stats, [/красн|red card/i], 'team2');
  const cornerHome = numStat(match.stats, [/угл|corner/i], 'team1');
  const cornerAway = numStat(match.stats, [/угл|corner/i], 'team2');

  const homeYellowFt = yellowHome ?? pick(seed, 4, 5);
  const awayYellowFt = yellowAway ?? pick(seed, 4, 6);
  const homeRedFt = redHome ?? (pick(seed, 8, 7) === 0 ? 1 : 0);
  const awayRedFt = redAway ?? (pick(seed, 9, 8) === 0 ? 1 : 0);
  const homeCornersFt = cornerHome ?? 2 + pick(seed, 6, 9);
  const awayCornersFt = cornerAway ?? 2 + pick(seed, 6, 10);

  return {
    home: {
      goals1h: homeGoals1h,
      goalsFt: homeGoalsFt,
      yellow1h: Math.min(homeYellowFt, pick(seed, homeYellowFt + 1, 11)),
      yellowFt: homeYellowFt,
      red1h: Math.min(homeRedFt, pick(seed, homeRedFt + 1, 12)),
      redFt: homeRedFt,
      corners1h: Math.min(homeCornersFt, Math.floor(homeCornersFt / 2) + pick(seed, 2, 13)),
      cornersFt: homeCornersFt,
    },
    away: {
      goals1h: awayGoals1h,
      goalsFt: awayGoalsFt,
      yellow1h: Math.min(awayYellowFt, pick(seed, awayYellowFt + 1, 14)),
      yellowFt: awayYellowFt,
      red1h: Math.min(awayRedFt, pick(seed, awayRedFt + 1, 15)),
      redFt: awayRedFt,
      corners1h: Math.min(awayCornersFt, Math.floor(awayCornersFt / 2) + pick(seed, 2, 16)),
      cornersFt: awayCornersFt,
    },
  };
}

export function buildStadium(match: MatchEvent): { name: string; city: string; country: string } {
  if (match.stadium?.name) {
    return {
      name: match.stadium.name,
      city: match.stadium.city || match.country || '',
      country: match.country || 'Испания',
    };
  }
  const venues = [
    { name: 'Камп Ноу', city: 'Барселона', country: 'Испания' },
    { name: 'Сантьяго Бернабеу', city: 'Мадрид', country: 'Испания' },
    { name: 'Уэмбли', city: 'Лондон', country: 'Англия' },
    { name: 'Олимпийский', city: '', country: match.country || 'Испания' },
  ];
  const venue = venues[hashSeed(match.id) % venues.length];
  return {
    name: venue.name,
    city: venue.city,
    country: venue.country,
  };
}

export function buildWeather(match: MatchEvent): MatchWeather {
  const seed = hashSeed(`${match.id}-weather`);
  return {
    tempC: 18 + pick(seed, 14, 1),
    windMs: Number((1.5 + pick(seed, 50, 2) / 10).toFixed(1)),
    pressureMm: 745 + pick(seed, 25, 3),
    humidity: 45 + pick(seed, 40, 4),
  };
}

export function buildH2H(match: MatchEvent): MatchH2HRow[] {
  if (match.h2h?.length) {
    return match.h2h.map((row: H2HGame, i: number) => {
      const swap = i % 2 === 1;
      return {
        date: row.date,
        label: row.result,
        score: row.score,
        result: row.result,
        leftName: swap ? match.team2 : match.team1,
        rightName: swap ? match.team1 : match.team2,
        leftLogo: swap ? match.team2Logo : match.team1Logo,
        rightLogo: swap ? match.team1Logo : match.team2Logo,
      };
    });
  }
  const demos: Array<{ date: string; score: string; swap: boolean }> = [
    { date: '06.10.2025', score: '1:1', swap: false },
    { date: '27.03.2025', score: '2:1', swap: true },
    { date: '25.10.2024', score: '1:1', swap: true },
    { date: '21.04.2024', score: '3:0', swap: false },
    { date: '03.06.2023', score: '5:2', swap: false },
    { date: '21.07.2022', score: '3:1', swap: false },
    { date: '17.04.2022', score: '1:6', swap: true },
    { date: '14.02.2023', score: '2:3', swap: true },
  ];
  return demos.map((demo) => {
    const [h, a] = demo.score.split(':').map(Number);
    return {
      date: demo.date,
      label: `${match.team1} — ${match.team2}`,
      score: demo.score,
      result: h === a ? 'Ничья' : h > a ? `П1 ${demo.score}` : `П2 ${demo.score}`,
      leftName: demo.swap ? match.team2 : match.team1,
      rightName: demo.swap ? match.team1 : match.team2,
      leftLogo: demo.swap ? match.team2Logo : match.team1Logo,
      rightLogo: demo.swap ? match.team1Logo : match.team2Logo,
    };
  });
}

export function buildDetailStats(match: MatchEvent): DetailStatRow[] {
  const fromMatch = match.stats?.length
    ? match.stats.map((row) => ({
        label: row.label,
        home: Number(String(row.team1).replace('%', '').replace(',', '.')) || 0,
        away: Number(String(row.team2).replace('%', '').replace(',', '.')) || 0,
      }))
    : null;

  if (fromMatch?.length) return fromMatch;

  const seed = hashSeed(`${match.id}-stats`);
  const possessionHome = 40 + pick(seed, 25, 1);
  return [
    { label: 'xG', home: Number((0.4 + pick(seed, 20, 2) / 10).toFixed(2)), away: Number((0.3 + pick(seed, 20, 3) / 10).toFixed(2)) },
    { label: 'Атаки', home: 20 + pick(seed, 40, 4), away: 18 + pick(seed, 40, 5) },
    { label: 'Опасные атаки', home: 8 + pick(seed, 25, 6), away: 7 + pick(seed, 25, 7) },
    { label: 'Владение мячом %', home: possessionHome, away: 100 - possessionHome },
    { label: 'Удары в створ', home: 1 + pick(seed, 8, 8), away: 1 + pick(seed, 7, 9) },
    { label: 'Удары в сторону ворот', home: 3 + pick(seed, 10, 10), away: 2 + pick(seed, 10, 11) },
    { label: 'Желтые карточки', home: pick(seed, 4, 12), away: pick(seed, 4, 13) },
    { label: 'Красные карточки', home: pick(seed, 2, 14) === 1 ? 1 : 0, away: pick(seed, 3, 15) === 1 ? 1 : 0 },
    { label: 'Сейвы', home: 1 + pick(seed, 6, 16), away: 1 + pick(seed, 6, 17) },
    { label: 'Угловые', home: 2 + pick(seed, 7, 18), away: 2 + pick(seed, 7, 19) },
    { label: 'Точность передач %', home: 70 + pick(seed, 20, 20), away: 68 + pick(seed, 20, 21) },
    { label: 'Кроссы', home: 4 + pick(seed, 12, 22), away: 3 + pick(seed, 12, 23) },
  ];
}

export function buildTimeline(match: MatchEvent, apiRows?: TimelineEvent[]): TimelineEvent[] {
  if (apiRows?.length) return apiRows;
  const demo: Array<{ minute: string; kind: TimelineKind; side: TimelineEvent['side']; player: string }> = [
    { minute: "2'", kind: 'red', side: 'home', player: '' },
    { minute: "12'", kind: 'yellow', side: 'home', player: '' },
    { minute: "23'", kind: 'goal', side: 'home', player: 'Бальтасар Гальего' },
    { minute: "29'", kind: 'yellow', side: 'away', player: 'Факундо Бруэра' },
    { minute: "33'", kind: 'other', side: 'neutral', player: '' },
    { minute: "40'", kind: 'goal', side: 'home', player: 'Кевин Дзаппати' },
    { minute: "42'", kind: 'goal', side: 'away', player: 'Диего Менэс' },
    { minute: "45'", kind: 'period', side: 'neutral', player: 'Конец 1-го тайма' },
  ];
  return demo.map((row, i) => ({
    id: `${match.id}-tl-${i}`,
    minute: row.minute,
    kind: row.kind,
    label: row.player,
    side: row.side,
  }));
}

export function buildTeamForm(
  match: MatchEvent,
  side: 'home' | 'away',
  apiRows?: FormMatchRow[],
): FormMatchRow[] {
  if (apiRows?.length) return apiRows;
  const seed = hashSeed(`${match.id}-form-${side}`);
  const team = side === 'home' ? match.team1 : match.team2;
  const opponentPool = [match.team1, match.team2, 'Rival FC', 'United', 'City', 'Athletic'];
  const rows: FormMatchRow[] = [];
  for (let i = 0; i < 5; i++) {
    const resultRoll = pick(seed, 5, i);
    const result: FormMatchRow['result'] = resultRoll === 0 ? 'L' : resultRoll <= 3 ? 'W' : 'D';
    const scored = result === 'W' ? 1 + pick(seed, 3, i + 1) : result === 'D' ? pick(seed, 3, i + 2) : pick(seed, 2, i + 3);
    const conceded = result === 'W' ? pick(seed, 2, i + 4) : result === 'D' ? scored : 1 + pick(seed, 3, i + 5);
    const month = String(((seed + i) % 12) + 1).padStart(2, '0');
    const day = String(((seed + i * 5) % 27) + 1).padStart(2, '0');
    rows.push({
      date: `${day}.${month}.2025`,
      opponent: opponentPool[(seed + i) % opponentPool.length] === team
        ? opponentPool[(seed + i + 1) % opponentPool.length]
        : opponentPool[(seed + i) % opponentPool.length],
      score: `${scored}:${conceded}`,
      result,
    });
  }
  return rows;
}
