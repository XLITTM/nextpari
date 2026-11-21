import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Search, Globe, Tv, Star, ChevronDown, ChevronUp } from 'lucide-react';
import { SportIcon } from '../components/SportIcon';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { useLiveMatches } from '../LiveMatchesContext';
import { useFavoritesStore } from '../stores/favoritesStore';
import { competitionBucket, competitionRank, countryPresentation, isInternationalCompetition } from '../lib/competitionCatalog';
import { sportsRegion } from '../lib/sportsRegion';
import { toLeagueId } from '../lib/leagueRoute';
import { sports } from '../data';
import type { MatchEvent, Screen, SportId } from '../types';

interface ChampionshipsScreenProps {
  sport: SportId;
  initialMode: 'live' | 'line';
  discipline?: string;
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
  onSearchClick?: () => void;
}

interface LeagueRow {
  name: string;
  country: string;
  count: number;
}

interface CountryGroup {
  country: string;
  count: number;
  leagues: LeagueRow[];
}

function leagueRows(matches: MatchEvent[]): LeagueRow[] {
  const leagues = new Map<string, LeagueRow>();
  for (const match of matches) {
    const name = match.league.trim();
    const country = match.country.trim();
    if (!name) continue;
    const key = `${country}|${name}`;
    const row = leagues.get(key) ?? { name, country, count: 0 };
    row.count += 1;
    leagues.set(key, row);
  }
  return [...leagues.values()].sort((a, b) => competitionRank(matches[0]?.sport ?? 'football', a.name, a.country) - competitionRank(matches[0]?.sport ?? 'football', b.name, b.country) || a.name.localeCompare(b.name, 'ru'));
}

function groupByCountry(matches: MatchEvent[]): CountryGroup[] {
  const countries = new Map<string, { count: number; leagues: Map<string, LeagueRow> }>();
  for (const league of leagueRows(matches)) {
    const countryRow = countries.get(league.country) ?? { count: 0, leagues: new Map<string, LeagueRow>() };
    countryRow.count += league.count;
    countryRow.leagues.set(`${league.country}|${league.name}`, league);
    countries.set(league.country, countryRow);
  }
  return [...countries.entries()]
    .map(([country, row]) => ({
      country,
      count: row.count,
      leagues: [...row.leagues.values()],
    }))
    .sort((a, b) => regionLabel(a.country).localeCompare(regionLabel(b.country), 'ru'));
}

function regionLabel(country: string): string {
  const presentation = countryPresentation(country);
  return sportsRegion(presentation.region) || presentation.name;
}

export function ChampionshipsScreen({ sport, initialMode, discipline, onBack, onNavigate, onSearchClick }: ChampionshipsScreenProps) {
  const [activeTab, setActiveTab] = useState<'live' | 'line'>(initialMode);
  const [expanded, setExpanded] = useState('');
  const { liveMatches, upcomingMatches, loading } = useLiveMatches();
  const favoriteLeagueIds = useFavoritesStore((s) => s.favoriteLeagueIds);
  const toggleLeagueFavorite = useFavoritesStore((s) => s.toggleLeagueFavorite);

  const sportName = sports.find((row) => row.id === sport)?.name ?? 'Спорт';
  const pool = useMemo(() => {
    const source = activeTab === 'line' ? upcomingMatches : liveMatches;
    return source.filter((match) => match.sport === sport && (!discipline || match.discipline === discipline));
  }, [activeTab, discipline, liveMatches, upcomingMatches, sport]);
  const rows = useMemo(() => leagueRows(pool), [pool]);
  const favorites = rows.filter((league) => favoriteLeagueIds.includes(league.name));
  const top = rows.filter((league) => competitionBucket(sport, league.name, league.country) === 'top' && !favoriteLeagueIds.includes(league.name));
  const international = rows.filter((league) => competitionBucket(sport, league.name, league.country) === 'international' && !favoriteLeagueIds.includes(league.name));
  const groups = useMemo(() => groupByCountry(pool.filter((match) => competitionBucket(sport, match.league, match.country) === 'country' && !favoriteLeagueIds.includes(match.league) && !isInternationalCompetition(match.league, match.country))), [pool, favoriteLeagueIds, sport]);

  useEffect(() => {
    if (!groups.some((group) => group.country === expanded)) {
      setExpanded(groups[0]?.country ?? '');
    }
  }, [groups, expanded]);

  return (
    <div className="min-h-full flex flex-col bg-gray-100 dark:bg-gray-900">
      <div className="bg-white dark:bg-[#1e293b] shrink-0 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-2 h-14">
          <button type="button" onClick={onBack} className="w-10 h-10 flex items-center justify-center text-gray-500">
            <ChevronLeft className="w-6 h-6" />
          </button>

          <h1 className="flex-1 text-center text-lg font-medium text-gray-800 dark:text-white">
            Чемпионаты
          </h1>

          <div className="flex items-center gap-1">
            <button type="button" onClick={onSearchClick} className="w-9 h-9 flex items-center justify-center text-gray-500" aria-label="Поиск">
              <Search className="w-5 h-5" />
            </button>
            <button type="button" className="w-9 h-9 flex items-center justify-center text-gray-500">
              <Globe className="w-5 h-5" />
            </button>
            <button type="button" className="w-9 h-9 flex items-center justify-center text-gray-500">
              <Tv className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-4 pb-3 pt-1">
          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-1 flex">
            <button
              type="button"
              onClick={() => setActiveTab('live')}
              className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-colors ${
                activeTab === 'live' ? 'bg-[#d9822b] text-white shadow-sm' : 'text-gray-500'
              }`}
            >
              LIVE
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('line')}
              className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-colors ${
                activeTab === 'line' ? 'bg-[#d9822b] text-white shadow-sm' : 'text-gray-500'
              }`}
            >
              Линия
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 py-3 bg-gray-100 dark:bg-gray-900 shrink-0">
        <SportIcon sport={sport} className="w-6 h-6 text-[#4ade80]" />
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300 uppercase">{sportName}</span>
      </div>

      <div className="flex-1 overflow-y-auto pb-20">
        {loading && groups.length === 0 ? (
          <SkeletonLoader count={4} variant="list" />
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Сейчас матчей нет</p>
        ) : (
          <div className="bg-white dark:bg-[#1e293b]">
            {[{ title: 'Избранное', leagues: favorites }, { title: 'Топ-турниры', leagues: top }, { title: 'Международные', leagues: international }].filter((section) => section.leagues.length > 0).map((section) => (
              <div key={section.title} className="border-b border-gray-100 dark:border-gray-800">
                <p className="px-4 pt-3 text-xs font-medium uppercase text-gray-500">{section.title}</p>
                {section.leagues.map((league) => (
                  <button
                    key={`${section.title}|${league.country}|${league.name}`}
                    type="button"
                    onClick={() => onNavigate({ name: 'league', leagueId: toLeagueId(league.country, league.name), mode: activeTab })}
                    className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50 dark:active:bg-gray-800"
                  >
                    <span className="min-w-0 truncate pr-3 text-left text-sm text-gray-700 dark:text-gray-300">{league.name}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full text-xs font-medium">{league.count}</span>
                      <span
                        role="button"
                        tabIndex={0}
                        className="flex h-8 w-8 items-center justify-center text-gray-400"
                        onClick={(event) => { event.stopPropagation(); toggleLeagueFavorite(league.name); }}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.stopPropagation(); event.preventDefault(); toggleLeagueFavorite(league.name); } }}
                        aria-label="Добавить чемпионат в избранное"
                      >
                        <Star className={`h-5 w-5 ${favoriteLeagueIds.includes(league.name) ? 'fill-brand-600 text-brand-600' : ''}`} />
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {groups.length > 0 && <p className="px-4 pt-3 text-xs font-medium uppercase text-gray-500">Страны</p>}
            {groups.map((item) => {
              const isExpanded = expanded === item.country;
              return (
                <div key={item.country || item.leagues[0]?.name} className="border-b border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? '' : item.country)}
                    className="w-full flex items-center justify-between px-4 py-3.5 active:bg-gray-50 dark:active:bg-gray-800 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Globe className="w-5 h-5 shrink-0 text-gray-400" />
                      <span className="text-[15px] font-medium text-gray-800 dark:text-gray-200 truncate">
                        {regionLabel(item.country)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full text-xs font-medium min-w-[28px] text-center">
                        {item.count}
                      </div>
                      <div className="bg-gray-100 dark:bg-gray-800 rounded-full p-1 text-gray-400">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </button>

                  {isExpanded && item.leagues.length > 0 && (
                    <div className="bg-gray-50 dark:bg-[#151e2b]">
                      {item.leagues.map((league) => (
                        <button
                          key={`${league.country}|${league.name}`}
                          type="button"
                          onClick={() => onNavigate({
                            name: 'league',
                            leagueId: toLeagueId(league.country, league.name),
                            mode: activeTab,
                          })}
                          className="w-full flex items-center justify-between px-4 py-3 pl-12 active:bg-gray-200 dark:active:bg-gray-800 transition-colors border-t border-gray-100 dark:border-gray-800"
                        >
                          <div className="flex items-center gap-2 text-left pr-4 min-w-0">
                            <span className="text-sm text-gray-700 dark:text-gray-300">{league.name}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full text-xs font-medium min-w-[28px] text-center">
                              {league.count}
                            </div>
                            <span
                              role="button"
                              tabIndex={0}
                              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-brand-600"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleLeagueFavorite(league.name);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.stopPropagation();
                                  event.preventDefault();
                                  toggleLeagueFavorite(league.name);
                                }
                              }}
                              aria-label="Добавить чемпионат в избранное"
                            >
                              <Star className={`w-5 h-5 ${favoriteLeagueIds.includes(league.name) ? 'fill-brand-600 text-brand-600' : ''}`} />
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
