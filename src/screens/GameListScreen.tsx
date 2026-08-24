import { useState } from 'react';
import { ArrowLeft, Search, Monitor, Link as LinkIcon, Bell, Star } from 'lucide-react';
import type { MatchEvent, BetSelection } from '../types';
import { extraMarketRows, mainOutcomeButtons } from '../lib/cardOdds';
import { OddButton } from '../components/OddButton';
import { SportIcon } from '../components/SportIcon';
import { useLiveMatches } from '../LiveMatchesContext';
import { SkeletonLoader } from '../components/SkeletonLoader';

interface GameListScreenProps {
  mode: 'live' | 'line';
  onBack: () => void;
  onSearchClick: () => void;
  onOpenMatch: (matchId: string) => void;
  favorites: string[];
  onToggleFavorite: (matchId: string) => void;
}

function getOutcomeButtons(match: MatchEvent) {
  return mainOutcomeButtons(match);
}

function MatchRowCard({
  match,
  onOpenMatch,
  isFavorite,
  onToggleFavorite,
}: {
  match: MatchEvent;
  onOpenMatch: (id: string) => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  const outcomeButtons = getOutcomeButtons(match);
  const columnsCount = outcomeButtons.length === 3 ? 'grid-cols-3' : 'grid-cols-2';

  const buildSelection = (outcome: string, odds: number): BetSelection => ({
    id: `${match.id}-${outcome}`,
    matchId: match.id,
    matchLabel: `${match.team1} — ${match.team2}`,
    market: outcomeButtons.length === 3 ? '1X2' : 'Победитель',
    outcome,
    odds,
    homeTeam: match.team1,
    awayTeam: match.team2,
    sport: match.sport,
    country: match.country,
    league: match.league,
    isLive: match.isLive,
    startTime: match.startTime,
    liveStatus: match.liveStatus,
  });

  return (
    <div
      onClick={() => onOpenMatch(match.id)}
      className="bg-gray-50 dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden active:scale-[0.99] transition-transform cursor-pointer"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-1.5 min-w-0">
          <SportIcon sport={match.sport} className="w-6 h-6 text-[#4ade80] shrink-0" />
          <span className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">
            {match.country}. {match.league}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <LinkIcon className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          <Bell className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          <Star
            className={`w-4 h-4 transition-colors ${isFavorite ? 'fill-green-500 text-green-500' : 'text-gray-600 dark:text-gray-300'}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
          />
        </div>
      </div>

      <div className="px-3 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-6 h-6 rounded-full shrink-0 border border-gray-200 dark:border-gray-600"
              style={{ backgroundColor: match.team1Color }}
            />
            <span className="text-sm font-bold text-gray-900 dark:text-white truncate">{match.team1}</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full shrink-0 border border-gray-200 dark:border-gray-600"
              style={{ backgroundColor: match.team2Color }}
            />
            <span className="text-sm font-bold text-gray-900 dark:text-white truncate">{match.team2}</span>
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-center px-2">
          {match.isLive ? (
            <span className="text-2xl font-extrabold text-gray-900 dark:text-white tabular-nums leading-none">
              {match.liveScore?.team1} : {match.liveScore?.team2}
            </span>
          ) : (
            <span className="text-2xl font-extrabold text-gray-700 dark:text-gray-300 tabular-nums leading-none">
              0 : 0
            </span>
          )}
          <span className="text-[11px] text-gray-700 dark:text-gray-300 mt-1.5 text-center font-bold">
            {match.isLive
              ? /^\d{8,}$/.test((match.liveStatus ?? '').trim())
                ? 'LIVE'
                : ['LIVE', match.liveStatus].filter(Boolean).join(' ')
              : 'Скоро начнётся'}
          </span>
        </div>
      </div>

      <div className="px-3 pb-3">
        <div className="text-xs font-bold text-gray-700 dark:text-gray-200 mb-1.5">1X2</div>
        <div className="grid grid-cols-3 gap-2">
          {outcomeButtons.map((outcome) => (
            <OddButton
              key={outcome.key}
              label={outcome.key}
              odds={outcome.odds}
              selection={buildSelection(outcome.key, outcome.odds)}
              size="sm"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function GameListScreen({ mode, onBack, onSearchClick, onOpenMatch, favorites, onToggleFavorite }: GameListScreenProps) {
  const [tab, setTab] = useState<'live' | 'line'>(mode);
  const { liveMatches, upcomingMatches, loading } = useLiveMatches();
  const matches = tab === 'live' ? liveMatches : upcomingMatches;

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
          <button
            className="w-9 h-9 flex items-center justify-center text-gray-700 dark:text-gray-200 active:scale-90 transition-transform"
            aria-label="Трансляции"
          >
            <Monitor className="w-5 h-5" />
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
        {loading || matches.length === 0 ? (
          <SkeletonLoader count={6} />
        ) : (
          matches.map((match) => (
            <MatchRowCard
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
