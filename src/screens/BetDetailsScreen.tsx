import { useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useBetHistory } from '../BetHistoryContext';
import { useLiveMatches } from '../LiveMatchesContext';
import { detailsView, type HistoryLiveOverlay } from '../lib/betHistoryView';
import { BetSummaryCard } from '../components/history/BetSummaryCard';
import { BetLegResultCard } from '../components/history/BetLegResultCard';
import type { MatchEvent } from '../types';

interface BetDetailsScreenProps {
  betId: string;
  onBack: () => void;
}

export function BetDetailsScreen({ betId, onBack }: BetDetailsScreenProps) {
  const { entries, loading } = useBetHistory();
  const { liveMatches, upcomingMatches } = useLiveMatches();
  const bet = entries.find((entry) => entry.id === betId);

  const liveById = useMemo(() => {
    const overlay: Record<string, HistoryLiveOverlay> = {};
    for (const match of [...liveMatches, ...upcomingMatches]) {
      overlay[match.id] = overlayFromMatch(match);
    }
    return overlay;
  }, [liveMatches, upcomingMatches]);

  if (loading && !bet) {
    return (
      <div className="np-page min-h-full">
        <DetailsHeader onBack={onBack} />
        <p className="py-16 text-center text-sm font-bold text-[var(--np-text-secondary)]">Загрузка...</p>
      </div>
    );
  }

  if (!bet) {
    return (
      <div className="np-page min-h-full">
        <DetailsHeader onBack={onBack} />
        <p className="py-16 text-center text-sm font-bold text-[var(--np-text-secondary)]">Ставка не найдена</p>
      </div>
    );
  }

  const view = detailsView(bet, liveById);

  return (
    <div className="np-page min-h-full pb-[calc(6.75rem+env(safe-area-inset-bottom))]">
      <DetailsHeader onBack={onBack} />

      <div className="px-3.5 pt-1">
        <BetSummaryCard view={view} />
      </div>

      <div className="mt-3 flex flex-col gap-3 px-3.5">
        {view.legs.map((leg, index) => (
          <BetLegResultCard key={`${leg.homeTeam}-${leg.awayTeam}-${index}`} leg={leg} />
        ))}
      </div>
    </div>
  );
}

function overlayFromMatch(match: MatchEvent): HistoryLiveOverlay {
  return {
    homeTeam: match.team1,
    awayTeam: match.team2,
    homeLogo: match.team1Logo,
    awayLogo: match.team2Logo,
    score: match.liveScore
      ? `${match.liveScore.team1} : ${match.liveScore.team2}`
      : undefined,
    isLive: match.isLive,
    liveStatus: match.liveStatus,
    country: match.country,
    league: match.league,
    sport: match.sport,
    startTime: match.startTime,
  };
}

function DetailsHeader({ onBack }: { onBack: () => void }) {
  return (
    <header className="relative flex h-14 items-center px-2">
      <button
        type="button"
        onClick={onBack}
        className="np-press z-10 flex h-10 w-10 items-center justify-center text-[var(--np-text)]"
        aria-label="Назад"
      >
        <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
      </button>
      <h1 className="pointer-events-none absolute inset-x-12 truncate text-center text-[17px] font-extrabold text-[var(--np-text)]">
        Информация о ставке
      </h1>
    </header>
  );
}
