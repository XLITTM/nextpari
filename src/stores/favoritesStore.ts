import { create } from 'zustand';
import type { MatchEvent, SportId } from '../types';

const STORAGE_KEY = 'nextpari_favorites';

export interface FavoriteableEvent {
  id?: string;
  leagueId?: string;
  league?: string | { id?: string; name?: string };
  sport?: string;
  sport_id?: string | number;
}

interface FavoritesState {
  favoriteMatchIds: string[];
  favoriteLeagueIds: string[];
  favoriteSportIds: string[];
  toggleMatchFavorite: (id: string) => void;
  toggleLeagueFavorite: (id: string) => void;
  toggleSportFavorite: (id: string) => void;
  isMatchFavorite: (id: string) => boolean;
  isLeagueFavorite: (id: string) => boolean;
  isSportFavorite: (id: string) => boolean;
  isEventFavorite: (match: FavoriteableEvent) => boolean;
}

function toggle(list: string[], id: string): string[] {
  const key = String(id ?? '').trim();
  if (!key) return list;
  return list.includes(key) ? list.filter((item) => item !== key) : [...list, key];
}

function eventKeys(match: FavoriteableEvent): { matchId: string; leagueIds: string[]; sportIds: string[] } {
  const league = match.league;
  const leagueId = typeof league === 'object' ? String(league?.id ?? '').trim() : '';
  const leagueName = typeof league === 'string' ? league.trim() : String(league?.name ?? '').trim();
  const explicitLeague = String(match.leagueId ?? '').trim();
  const sport = String(match.sport ?? '').trim();
  const sportId = match.sport_id != null ? String(match.sport_id).trim() : '';
  return {
    matchId: String(match.id ?? '').trim(),
    leagueIds: [explicitLeague, leagueId, leagueName].filter(Boolean),
    sportIds: [sport, sportId].filter(Boolean),
  };
}

function readStored(): Pick<FavoritesState, 'favoriteMatchIds' | 'favoriteLeagueIds' | 'favoriteSportIds'> {
  const empty = { favoriteMatchIds: [] as string[], favoriteLeagueIds: [] as string[], favoriteSportIds: [] as string[] };
  if (typeof localStorage === 'undefined') return empty;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<FavoritesState>;
    return {
      favoriteMatchIds: Array.isArray(parsed.favoriteMatchIds) ? parsed.favoriteMatchIds.map(String) : [],
      favoriteLeagueIds: Array.isArray(parsed.favoriteLeagueIds) ? parsed.favoriteLeagueIds.map(String) : [],
      favoriteSportIds: Array.isArray(parsed.favoriteSportIds) ? parsed.favoriteSportIds.map(String) : [],
    };
  } catch {
    return empty;
  }
}

function persist(state: Pick<FavoritesState, 'favoriteMatchIds' | 'favoriteLeagueIds' | 'favoriteSportIds'>) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      favoriteMatchIds: state.favoriteMatchIds,
      favoriteLeagueIds: state.favoriteLeagueIds,
      favoriteSportIds: state.favoriteSportIds,
    }),
  );
}

export function isEventFavorite(match: FavoriteableEvent): boolean {
  return useFavoritesStore.getState().isEventFavorite(match);
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  ...readStored(),

  toggleMatchFavorite: (id) => {
    const favoriteMatchIds = toggle(get().favoriteMatchIds, id);
    persist({ ...get(), favoriteMatchIds });
    set({ favoriteMatchIds });
  },

  toggleLeagueFavorite: (id) => {
    const favoriteLeagueIds = toggle(get().favoriteLeagueIds, id);
    persist({ ...get(), favoriteLeagueIds });
    set({ favoriteLeagueIds });
  },

  toggleSportFavorite: (id) => {
    const favoriteSportIds = toggle(get().favoriteSportIds, String(id as SportId));
    persist({ ...get(), favoriteSportIds });
    set({ favoriteSportIds });
  },

  isMatchFavorite: (id) => get().favoriteMatchIds.includes(String(id)),
  isLeagueFavorite: (id) => get().favoriteLeagueIds.includes(String(id)),
  isSportFavorite: (id) => get().favoriteSportIds.includes(String(id)),

  isEventFavorite: (match) => {
    const { matchId, leagueIds, sportIds } = eventKeys(match);
    const state = get();
    if (matchId && state.favoriteMatchIds.includes(matchId)) return true;
    if (leagueIds.some((id) => state.favoriteLeagueIds.includes(id))) return true;
    if (sportIds.some((id) => state.favoriteSportIds.includes(id))) return true;
    return false;
  },
}));

export function isMatchEventFavorite(match: MatchEvent): boolean {
  return isEventFavorite(match);
}