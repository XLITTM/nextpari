import type { LsportsFixtureState } from '../state/types.js';
import {
  LSPORTS_DISPLAY_TAG,
  LSPORTS_FOOTBALL_SPORT_ID,
  NEXTPARI_FOOTBALL_SPORT_ID,
  type AdaptedBetsEvent,
} from './types.js';
import { asRecord, formatClockSeconds, readNamed, readPosition, toUnixStartTime } from './read.js';

export function readSportId(fixture: Record<string, unknown> | null): number | null {
  const sport = readNamed(fixture?.Sport).id;
  if (sport == null) return null;
  const numeric = Number(sport);
  return Number.isInteger(numeric) ? numeric : null;
}

export function isLsportsFootball(fixture: Record<string, unknown> | null): boolean {
  return readSportId(fixture) === LSPORTS_FOOTBALL_SPORT_ID;
}

export function mapConfirmedPeriod(currentPeriod: unknown): AdaptedBetsEvent['period'] | undefined {
  if (currentPeriod === 10 || currentPeriod === '10') return '1';
  if (currentPeriod === 20 || currentPeriod === '20') return '2';
  return undefined;
}

function readParticipants(fixture: Record<string, unknown> | null): {
  home?: { name: string; id?: string };
  away?: { name: string; id?: string };
} {
  const raw = fixture?.Participants ?? fixture?.participants;
  if (!Array.isArray(raw)) return {};
  let home: { name: string; id?: string } | undefined;
  let away: { name: string; id?: string } | undefined;
  for (const entry of raw) {
    const record = asRecord(entry);
    if (!record) continue;
    const named = readNamed(record);
    if (!named.name) continue;
    const position = readPosition(record.Position ?? record.position);
    const team = { name: named.name, id: named.id };
    if (position === '1') home = team;
    else if (position === '2') away = team;
  }
  return { home, away };
}

function readScoreboard(livescore: Record<string, unknown> | null): Record<string, unknown> | null {
  return asRecord(livescore?.Scoreboard) ?? asRecord(livescore?.scoreboard);
}

function readScoreSs(scoreboard: Record<string, unknown> | null): string | undefined {
  const results = scoreboard?.Results ?? scoreboard?.results;
  if (!Array.isArray(results)) return undefined;
  let home: string | undefined;
  let away: string | undefined;
  for (const row of results) {
    const record = asRecord(row);
    if (!record) continue;
    const position = readPosition(record.Position ?? record.position);
    const value = record.Value ?? record.value;
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    if (position === '1') home = String(value);
    if (position === '2') away = String(value);
  }
  if (home == null || away == null) return undefined;
  return `${home}-${away}`;
}

function readClockSeconds(scoreboard: Record<string, unknown> | null): number | null {
  const clock = asRecord(scoreboard?.Clock) ?? asRecord(scoreboard?.clock);
  const seconds = clock?.Seconds ?? clock?.seconds;
  if (typeof seconds === 'number' && Number.isFinite(seconds)) return seconds;
  if (typeof seconds === 'string' && seconds.trim() && Number.isFinite(Number(seconds))) {
    return Number(seconds);
  }
  return null;
}

export function adaptLsportsEvent(state: LsportsFixtureState): AdaptedBetsEvent | null {
  const { home, away } = readParticipants(state.fixture);
  if (!home || !away) return null;
  const league = readNamed(state.fixture?.League);
  const location = readNamed(state.fixture?.Location);
  const scoreboard = readScoreboard(state.livescore);
  const seconds = readClockSeconds(scoreboard);
  const timeStr = seconds != null ? formatClockSeconds(seconds) : undefined;
  const period = mapConfirmedPeriod(scoreboard?.CurrentPeriod ?? scoreboard?.currentPeriod);
  const event: AdaptedBetsEvent = {
    id: String(state.fixtureId),
    sport_id: NEXTPARI_FOOTBALL_SPORT_ID,
    league: {
      id: league.id,
      name: league.name ?? '',
      cc: location.name,
    },
    home,
    away,
    time_status: '1',
    start_time: toUnixStartTime(state.fixture?.StartDate ?? state.fixture?.startDate),
    our_events: LSPORTS_DISPLAY_TAG,
  };
  const ss = readScoreSs(scoreboard);
  if (ss) event.ss = ss;
  if (timeStr) {
    event.time_str = timeStr;
    event.time = timeStr;
  }
  if (period) event.period = period;
  return event;
}

export function participantNames(state: LsportsFixtureState): { home?: string; away?: string } {
  const { home, away } = readParticipants(state.fixture);
  return { home: home?.name, away: away?.name };
}
