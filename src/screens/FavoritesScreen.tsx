import { Star } from 'lucide-react';
import { SectionHeader } from '../components/SectionHeader';
import { MatchCard } from '../components/MatchCard';
import { useLiveMatches } from '../LiveMatchesContext';

interface FavoritesScreenProps {
  favorites: string[];
  onToggleFavorite: (matchId: string) => void;
  onOpenMatch: (matchId: string) => void;
}

export function FavoritesScreen({ favorites, onToggleFavorite, onOpenMatch }: FavoritesScreenProps) {
  const { liveMatches, upcomingMatches } = useLiveMatches();
  const favoriteMatches = [...liveMatches, ...upcomingMatches]
    .filter((match, index, all) => favorites.includes(match.id) && all.findIndex((item) => item.id === match.id) === index);

  return (
    <div className="pt-2 pb-4">
      <SectionHeader title="Избранное" />
      {favoriteMatches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-6">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-[#1e293b] flex items-center justify-center mb-4">
            <Star className="w-8 h-8 text-gray-400" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300 leading-relaxed max-w-xs">
            Здесь пока ничего нет. Добавляйте матчи в избранное, чтобы следить за ними
          </p>
        </div>
      ) : (
        <div className="px-4 space-y-2.5">
          {favoriteMatches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              onOpenMatch={onOpenMatch}
              isFavorite
              onToggleFavorite={() => onToggleFavorite(match.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
