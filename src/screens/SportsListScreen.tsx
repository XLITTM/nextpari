import { useState } from 'react';
import { ChevronLeft, Search, Star } from 'lucide-react';
import { SportIcon } from '../components/SportIcon';
import { useLiveMatches } from '../LiveMatchesContext';
import { useFavoritesStore } from '../stores/favoritesStore';
import type { Screen, SportId } from '../types';

interface SportsListScreenProps {
  initialMode?: 'live' | 'line' | 'cybers';
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
  onSearchClick: () => void;
}

const SUPPORTED_SPORTS: { id: SportId; name: string }[] = [
  { id: 'football', name: 'Футбол' },
  { id: 'tennis', name: 'Теннис' },
  { id: 'basketball', name: 'Баскетбол' },
  { id: 'hockey', name: 'Хоккей' },
  { id: 'volleyball', name: 'Волейбол' },
  { id: 'table-tennis', name: 'Настольный теннис' },
  { id: 'badminton', name: 'Бадминтон' },
  { id: 'esports', name: 'КиберСпорт' },
  { id: 'cricket', name: 'Крикет' },
  { id: 'beach-volleyball', name: 'Пляжный волейбол' },
  { id: 'snooker', name: 'Снукер' },
  { id: 'futsal', name: 'Футзал' },
];

export function SportsListScreen({ initialMode = 'live', onBack, onNavigate, onSearchClick }: SportsListScreenProps) {
  const [activeTab, setActiveTab] = useState<'live' | 'line' | 'cybers'>(initialMode);
  const { liveMatches, upcomingMatches } = useLiveMatches();
  const favoriteSportIds = useFavoritesStore((s) => s.favoriteSportIds);
  const toggleSportFavorite = useFavoritesStore((s) => s.toggleSportFavorite);
  const pool = activeTab === 'line' ? upcomingMatches : liveMatches;
  const sports = SUPPORTED_SPORTS
    .filter((sport) => (activeTab === 'cybers' ? sport.id === 'esports' : true))
    .map((sport) => ({
      ...sport,
      count: pool.filter((match) => match.sport === sport.id).length,
    }))
    .sort((a, b) => {
      const featured = ['football', 'tennis', 'basketball', 'hockey', 'esports'];
      const ai = featured.indexOf(a.id);
      const bi = featured.indexOf(b.id);
      if (ai !== -1 || bi !== -1) {
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }
      return b.count - a.count;
    })
    .filter((sport) => sport.count > 0 || ['football', 'tennis', 'basketball', 'hockey', 'esports'].includes(sport.id));

  return (
    <div className="min-h-full flex flex-col bg-gray-100 dark:bg-gray-900">
      {/* Шапка */}
      <div className="bg-white dark:bg-[#1e293b] shrink-0 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-2 h-14">
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center text-gray-500">
            <ChevronLeft className="w-6 h-6" />
          </button>
          
          <h1 className="flex-1 text-center text-lg font-medium text-gray-800 dark:text-white">
            Виды спорта
          </h1>
          
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onSearchClick}
              className="w-9 h-9 flex items-center justify-center text-gray-500"
              aria-label="Поиск"
            >
              <Search className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Табы (LIVE / Линия / Киберы) */}
        <div className="px-4 pb-3 pt-1">
          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-1 flex">
            <button
              onClick={() => setActiveTab('live')}
              className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-colors ${
                activeTab === 'live' ? 'bg-[#d9822b] text-white shadow-sm' : 'text-gray-500'
              }`}
            >
              LIVE
            </button>
            <button
              onClick={() => setActiveTab('line')}
              className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-colors ${
                activeTab === 'line' ? 'bg-[#d9822b] text-white shadow-sm' : 'text-gray-500'
              }`}
            >
              Линия
            </button>
            <button
              onClick={() => setActiveTab('cybers')}
              className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-colors ${
                activeTab === 'cybers' ? 'bg-[#d9822b] text-white shadow-sm' : 'text-gray-500'
              }`}
            >
              Киберы
            </button>
          </div>
        </div>
      </div>

      {/* Список видов спорта */}
      <div className="flex-1 overflow-y-auto pb-20">
        <div className="bg-white dark:bg-[#1e293b] mt-2">
          {sports.map((sport, index) => (
            <div
              key={sport.id}
              onClick={() => onNavigate({ name: 'championships', sport: sport.id, mode: activeTab === 'cybers' ? 'live' : activeTab })}
              className={`flex items-center justify-between px-4 py-3.5 active:bg-gray-50 dark:active:bg-gray-800 cursor-pointer ${
                index !== sports.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <SportIcon sport={sport.id} className="w-6 h-6 text-[#4ade80] hover:scale-105 transition-transform" />
                <span className="text-[15px] text-gray-800 dark:text-gray-200 font-medium">
                  {sport.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-brand-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSportFavorite(sport.id);
                  }}
                  aria-label="Добавить вид спорта в избранное"
                >
                  <Star className={`w-4 h-4 ${favoriteSportIds.includes(sport.id) ? 'fill-brand-600 text-brand-600' : ''}`} />
                </button>
                <div className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full text-xs font-medium min-w-[28px] text-center">
                  {sport.count}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}