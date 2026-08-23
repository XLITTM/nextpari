import { useState } from 'react';
import { ChevronLeft, Search, Globe, Tv, Star, ChevronDown, ChevronUp } from 'lucide-react';
import { SportIcon } from '../components/SportIcon';
import type { Screen, SportId } from '../types';

interface ChampionshipsScreenProps {
  sport: SportId;
  initialMode: 'live' | 'line';
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
}

// Моковые данные стран и лиг (как на твоем скрине)
const CHAMPIONSHIPS_DATA = [
  {
    id: 'eng', country: 'Англия', count: 23, flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    leagues: [
      { id: 'eng-super', name: 'Суперкубок Англии', count: 1, isHot: true },
      { id: 'eng-champ', name: 'Чемпионат Англии. Чемпионшип', count: 1, isHot: true },
      { id: 'eng-w1', name: 'Чемпионат Англии. Национальная лига. Женщины', count: 9 },
      { id: 'eng-w2', name: 'Чемпионат Англии. 1-й дивизион. Женщины', count: 12 },
    ]
  },
  { id: 'por', country: 'Португалия', count: 3, flag: '🇵🇹', leagues: [] },
  { id: 'rus', country: 'Россия', count: 10, flag: '🇷🇺', leagues: [] },
  { id: 'bel', country: 'Бельгия', count: 2, flag: '🇧🇪', leagues: [] },
  { id: 'bra', country: 'Бразилия', count: 10, flag: '🇧🇷', leagues: [] },
  { id: 'ned', country: 'Нидерланды', count: 6, flag: '🇳🇱', leagues: [] },
];

export function ChampionshipsScreen({ sport, initialMode, onBack, onNavigate }: ChampionshipsScreenProps) {
  const [activeTab, setActiveTab] = useState<'live' | 'line'>(initialMode);
  const [expanded, setExpanded] = useState<string>('eng'); // Англия открыта по умолчанию

  const toggleExpand = (id: string) => {
    setExpanded(expanded === id ? '' : id);
  };

  const sportName = sport === 'football' ? 'Футбол' : sport === 'basketball' ? 'Баскетбол' : sport === 'tennis' ? 'Теннис' : sport === 'hockey' ? 'Хоккей' : 'Спорт';

  return (
    <div className="min-h-full flex flex-col bg-gray-100 dark:bg-gray-900">
      {/* Шапка */}
      <div className="bg-white dark:bg-[#1e293b] shrink-0 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-2 h-14">
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center text-gray-500">
            <ChevronLeft className="w-6 h-6" />
          </button>
          
          <h1 className="flex-1 text-center text-lg font-medium text-gray-800 dark:text-white">
            Чемпионаты
          </h1>
          
          <div className="flex items-center gap-1">
            <button className="w-9 h-9 flex items-center justify-center text-gray-500">
              <Search className="w-5 h-5" />
            </button>
            <button className="w-9 h-9 flex items-center justify-center text-gray-500">
              <Globe className="w-5 h-5" />
            </button>
            <button className="w-9 h-9 flex items-center justify-center text-gray-500">
              <Tv className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Табы */}
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
          </div>
        </div>
      </div>

      {/* Заголовок вида спорта */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-100 dark:bg-gray-900 shrink-0">
        <SportIcon sport={sport} className="w-6 h-6 text-[#4ade80]" />
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300 uppercase">{sportName}</span>
      </div>

      {/* Список чемпионатов */}
      <div className="flex-1 overflow-y-auto pb-20">
        <div className="bg-white dark:bg-[#1e293b]">
          {CHAMPIONSHIPS_DATA.map((item) => {
            const isExpanded = expanded === item.id;
            return (
              <div key={item.id} className="border-b border-gray-100 dark:border-gray-800">
                {/* Страна */}
                <button
                  onClick={() => toggleExpand(item.id)}
                  className="w-full flex items-center justify-between px-4 py-3.5 active:bg-gray-50 dark:active:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl leading-none">{item.flag}</span>
                    <span className="text-[15px] font-medium text-gray-800 dark:text-gray-200">{item.country}</span>
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

                {/* Лиги внутри страны */}
                {isExpanded && item.leagues.length > 0 && (
                  <div className="bg-gray-50 dark:bg-[#151e2b]">
                    {item.leagues.map((league) => (
                      <button
                        key={league.id}
                        onClick={() => onNavigate({ name: 'gamelist', mode: activeTab })}
                        className="w-full flex items-center justify-between px-4 py-3 pl-12 active:bg-gray-200 dark:active:bg-gray-800 transition-colors border-t border-gray-100 dark:border-gray-800"
                      >
                        <div className="flex items-center gap-2 text-left pr-4">
                          {league.isHot && (
                            <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center shrink-0">
                              <span className="text-white text-[10px]">🔥</span>
                            </div>
                          )}
                          <span className="text-sm text-gray-700 dark:text-gray-300">{league.name}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full text-xs font-medium min-w-[28px] text-center">
                            {league.count}
                          </div>
                          <Star className="w-5 h-5 text-orange-400" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}