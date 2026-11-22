export const RESULTS_WINDOWS = ['live', 'today', 'yesterday', 'archive'] as const;
export type ResultsWindow = (typeof RESULTS_WINDOWS)[number];

export interface SportsResultEvent {
  canonicalEventId: string;
  provider: string;
  sport: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: 'live' | 'completed' | 'scheduled' | 'cancelled';
  kickoffAt: string;
  completedAt: string | null;
}

export interface SportsResultsQuery {
  window: ResultsWindow;
  sport?: string;
  from?: string;
  to?: string;
}

export interface SportsResultsPage {
  configured: boolean;
  providerId: string | null;
  window: ResultsWindow;
  sport: string | null;
  events: SportsResultEvent[];
  notice: string;
}

export interface SportsResultsProvider {
  readonly providerId: string;
  list(query: SportsResultsQuery): Promise<SportsResultEvent[]>;
}

export class UnconfiguredResultsProvider implements SportsResultsProvider {
  readonly providerId = 'unconfigured';

  async list(_query: SportsResultsQuery): Promise<SportsResultEvent[]> {
    return [];
  }
}

export function normalizeResultsWindow(value: unknown): ResultsWindow {
  const raw = String(value ?? 'today').trim().toLowerCase();
  if ((RESULTS_WINDOWS as readonly string[]).includes(raw)) return raw as ResultsWindow;
  return 'today';
}

export function emptyResultsPage(query: SportsResultsQuery, configured: boolean): SportsResultsPage {
  return {
    configured,
    providerId: configured ? null : 'unconfigured',
    window: query.window,
    sport: query.sport?.trim() || null,
    events: [],
    notice: configured
      ? 'Результатов нет.'
      : 'Источник результатов не подключён.',
  };
}

export async function loadSportsResults(
  provider: SportsResultsProvider | null,
  query: SportsResultsQuery,
): Promise<SportsResultsPage> {
  if (!provider || provider.providerId === 'unconfigured') {
    return emptyResultsPage(query, false);
  }
  const events = await provider.list(query);
  return {
    configured: true,
    providerId: provider.providerId,
    window: query.window,
    sport: query.sport?.trim() || null,
    events,
    notice: events.length ? '' : 'Результатов нет.',
  };
}

export function liveResultsProvider(): SportsResultsProvider {
  return new UnconfiguredResultsProvider();
}
