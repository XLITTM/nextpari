import { ChevronLeft } from 'lucide-react';
import { MatchCard } from '../components/MatchCard';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { fromLeagueId } from '../lib/leagueRoute';
import { useLiveMatches } from '../LiveMatchesContext';

interface LeagueScreenProps {
  leagueId: string;
  mode?: 'live' | 'line';
  onBack: () => void;
  onOpenMatch: (matchId: string) => void;
  favorites: string[];
  onToggleFavorite: (matchId: string) => void;
}

export function LeagueScreen({
  leagueId,
  mode,
  onBack,
  onOpenMatch,
  favorites,
  onToggleFavorite,
}: LeagueScreenProps) {
  const { liveMatches, upcomingMatches, loading } = useLiveMatches();
  const { country, name } = fromLeagueId(leagueId);
  const resolvedMode = mode ?? 'live';
  const pool = resolvedMode === 'line' ? upcomingMatches : liveMatches;
  const matches = pool.filter(
    (match) => match.league === name && (!country || match.country === country),
  );

  return (
    <div className="min-h-full flex flex-col bg-[#f0f2f5] dark:bg-gray-900">
      <header className="sticky top-0 z-20 bg-white dark:bg-zinc-900 shadow-sm">
        <div className="flex h-14 items-center px-2">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center text-gray-700 dark:text-gray-200 active:scale-95"
            aria-label="Назад"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="min-w-0 flex-1 truncate pr-10 text-center text-base font-bold text-gray-900 dark:text-white">
            {name}
          </h1>
        </div>
      </header>

      <div className="space-y-3 px-4 py-4">
        {loading && matches.length === 0 ? (
          <SkeletonLoader count={3} variant="list" />
        ) : matches.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Сейчас матчей нет</p>
        ) : (
          matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              onOpenMatch={onOpenMatch}
              isFavorite={favorites.includes(match.id)}
              onToggleFavorite={() => onToggleFavorite(match.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
