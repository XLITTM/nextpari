import { useState } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import type { MatchEvent } from '../types';
import { MatchCard } from '../components/MatchCard';
import { useLiveMatches } from '../LiveMatchesContext';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { competitionRank, sportNavIndex } from '../lib/competitionCatalog';
import { sports } from '../data';

interface GameListScreenProps {
  mode: 'live' | 'line';
  onBack: () => void;
  onSearchClick: () => void;
  onOpenMatch: (matchId: string) => void;
  favorites: string[];
  onToggleFavorite: (matchId: string) => void;
}

export function GameListScreen({ mode, onBack, onSearchClick, onOpenMatch, favorites, onToggleFavorite }: GameListScreenProps) {
  const [tab, setTab] = useState<'live' | 'line'>(mode);
  const { liveMatches, upcomingMatches, loading } = useLiveMatches();
  const seen = new Set<string>();
  const matches = (tab === 'live' ? liveMatches : upcomingMatches)
    .filter((match) => {
      if (seen.has(match.id) || match.isLive !== (tab === 'live')) return false;
      seen.add(match.id);
      return true;
    })
    .sort((a, b) => sportNavIndex(a.sport) - sportNavIndex(b.sport)
      || competitionRank(a.sport, a.league, a.country) - competitionRank(b.sport, b.league, b.country)
      || a.startTime - b.startTime);

  return (
    <div className="min-h-full bg-gray-200 dark:bg-gray-900 flex flex-col transition-colors">
      <header className="flex items-center justify-between px-4 h-14 bg-white dark:bg-[#1e293b] border-b border-gray-300 dark:border-gray-700 shrink-0 transition-colors">
        <button
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center text-gray-700 dark:text-gray-200 active:scale-90 transition-transform"
          aria-label="Назад"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold text-gray-900 dark:text-white">Список игр</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={onSearchClick}
            className="w-9 h-9 flex items-center justify-center text-gray-700 dark:text-gray-200 active:scale-90 transition-transform"
            aria-label="Поиск"
          >
            <Search className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="px-4 py-2.5 bg-white dark:bg-[#1e293b] border-b border-gray-200 dark:border-gray-700 shrink-0 transition-colors">
        <div className="flex gap-2">
          <button
            onClick={() => setTab('live')}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all ${
              tab === 'live'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-[#1e293b] text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600'
            }`}
          >
            LIVE
          </button>
          <button
            onClick={() => setTab('line')}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all ${
              tab === 'line'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-[#1e293b] text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600'
            }`}
          >
            Линия
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 pb-24">
        {loading && matches.length === 0 ? (
          <SkeletonLoader count={6} />
        ) : matches.length === 0 ? (
          <p className="py-16 text-center text-sm font-bold text-gray-500 dark:text-gray-400">
            Сейчас матчей нет
          </p>
        ) : (
          matches.map((match, index) => {
            const previous = matches[index - 1];
            const sportChanged = previous?.sport !== match.sport;
            const leagueChanged = sportChanged || previous?.league !== match.league || previous?.country !== match.country;
            const sportName = sports.find((sport) => sport.id === match.sport)?.name ?? match.sport;
            return (
              <MatchGroup key={match.id} match={match} sportName={sportChanged ? sportName : ''} leagueName={leagueChanged ? match.league : ''} onOpenMatch={onOpenMatch} favorite={favorites.includes(match.id)} onToggleFavorite={() => onToggleFavorite(match.id)} />
            );
          })
        )}
      </div>
    </div>
  );
}

function MatchGroup({
  match,
  sportName,
  leagueName,
  onOpenMatch,
  favorite,
  onToggleFavorite,
}: {
  match: MatchEvent;
  sportName: string;
  leagueName: string;
  onOpenMatch: (id: string) => void;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  return (
    <div className="space-y-2">
      {sportName ? <p className="px-1 pt-2 text-xs font-bold uppercase text-gray-500">{sportName}</p> : null}
      {leagueName ? <p className="px-1 text-xs font-semibold text-gray-600 dark:text-gray-300">{leagueName}</p> : null}
      <MatchCard match={match} onOpenMatch={onOpenMatch} isFavorite={favorite} onToggleFavorite={onToggleFavorite} />
    </div>
  );
}
