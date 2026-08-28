import { ChevronLeft } from 'lucide-react';
import { MatchCard } from '../components/MatchCard';
import { fromLeagueId } from '../lib/leagueRoute';
import { useLiveMatches } from '../LiveMatchesContext';
import type { MatchEvent } from '../types';

interface LeagueScreenProps {
  leagueId: string;
  onBack: () => void;
  onOpenMatch: (matchId: string) => void;
  favorites: string[];
  onToggleFavorite: (matchId: string) => void;
}

function stubMatch(leagueId: string, index: number, league: string, country: string): MatchEvent {
  const teams: Array<[string, string]> = [
    ['ФК Оренбург', 'ФК Ахмат'],
    ['Реал Мадрид', 'Жирона'],
    ['Арсенал', 'Челси'],
  ];
  const [team1, team2] = teams[index] ?? teams[0];
  return {
    id: `league-stub-${leagueId}-${index}`,
    sport: 'football',
    league,
    country: country || 'Международные',
    team1,
    team2,
    team1Color: '#1d4ed8',
    team2Color: '#16a34a',
    startTime: Date.now() - (47 + index) * 60_000,
    isLive: true,
    liveStatus: `${47 + index}:00`,
    liveScore: { team1: 1, team2: index % 2 },
    markets: { '1': 2.1, x: 3.25, '2': 2.8 },
    extraMarkets: 3,
  };
}

export function LeagueScreen({
  leagueId,
  onBack,
  onOpenMatch,
  favorites,
  onToggleFavorite,
}: LeagueScreenProps) {
  const { liveMatches } = useLiveMatches();
  const { country, name } = fromLeagueId(leagueId);
  const fromLive = liveMatches.filter(
    (match) => match.league === name && (!country || match.country === country),
  );
  const matches = fromLive.length > 0
    ? fromLive.slice(0, 3)
    : [0, 1, 2].map((index) => stubMatch(leagueId, index, name, country));

  const handleBack = () => {
    if (window.history.state?.name === 'league' && window.history.length > 1) {
      window.history.back();
      return;
    }
    onBack();
  };

  return (
    <div className="min-h-full flex flex-col bg-[#f0f2f5] dark:bg-gray-900">
      <header className="sticky top-0 z-20 bg-white dark:bg-zinc-900 shadow-sm">
        <div className="flex h-14 items-center px-2">
          <button
            type="button"
            onClick={handleBack}
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
        {matches.map((match) => (
          <MatchCard
            key={match.id}
            match={match}
            onOpenMatch={onOpenMatch}
            isFavorite={favorites.includes(match.id)}
            onToggleFavorite={() => onToggleFavorite(match.id)}
          />
        ))}
      </div>
    </div>
  );
}
