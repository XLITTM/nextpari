import { useState } from 'react';
import { Search, X } from 'lucide-react';
import type { MatchEvent } from '../types';
import { SportIcon } from './SportIcon';
import { useLiveMatches } from '../LiveMatchesContext';

interface SearchModalProps {
  onClose: () => void;
  onSelectMatch?: (match: MatchEvent) => void;
}

export function SearchModal({ onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const { liveMatches, upcomingMatches } = useLiveMatches();
  const allMatches = [...liveMatches, ...upcomingMatches];

  const results = query.trim()
    ? allMatches.filter(
        (m) =>
          m.team1.toLowerCase().includes(query.toLowerCase()) ||
          m.team2.toLowerCase().includes(query.toLowerCase()) ||
          m.league.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  return (
    <div className="fixed inset-0 z-[100] bg-gray-100 dark:bg-gray-900 flex flex-col animate-slide-in-right transition-colors">
      {/* Search bar */}
      <div className="flex items-center gap-2 px-3 h-14 bg-white dark:bg-[#1e293b] border-b border-gray-200 dark:border-gray-700 shrink-0 transition-colors">
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-gray-600 dark:text-gray-200">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 flex-1 bg-gray-100 dark:bg-[#1e293b] rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-600 focus-within:border-brand-600 transition-colors">
          <Search className="w-4 h-4 text-gray-400 dark:text-gray-200" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск матчей, команд, лиг..."
            autoFocus
            className="flex-1 bg-transparent text-sm text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none"
          />
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
        {query.trim() === '' ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Search className="w-12 h-12 text-gray-400 dark:text-gray-500 mb-3" />
            <p className="text-sm text-gray-700 dark:text-gray-200 font-bold">Начните искать матчи, команды или лиги</p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-gray-700 dark:text-gray-200 font-bold">Ничего не найдено по запросу «{query}»</p>
          </div>
        ) : (
          <div className="space-y-2">
            {results.map((m) => (
              <div
                key={m.id}
                className="bg-white dark:bg-[#1e293b] rounded-xl p-3 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <SportIcon sport={m.sport} className="w-6 h-6 text-[#4ade80] shrink-0" />
                    <p className="text-xs text-gray-700 dark:text-gray-200 font-bold">{m.league} • {m.country}</p>
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                    {m.team1} — {m.team2}
                  </p>
                </div>
                {m.isLive && (
                  <span className="text-xs font-bold text-red-500 shrink-0 ml-2 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse-live" />
                    LIVE
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
