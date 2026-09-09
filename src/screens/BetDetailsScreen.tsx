import { useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useBetHistory } from '../BetHistoryContext';
import { useLiveMatches } from '../LiveMatchesContext';
import {
  detailsView,
  playerStatusClass,
  type HistoryLiveOverlay,
} from '../lib/betHistoryView';
import { SportIcon } from '../components/SportIcon';
import { TeamLogo } from '../components/TeamLogo';
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
      <div className="min-h-full bg-gray-100 dark:bg-gray-900">
        <DetailsHeader onBack={onBack} />
        <p className="text-center py-16 text-sm font-bold text-gray-500">Загрузка...</p>
      </div>
    );
  }

  if (!bet) {
    return (
      <div className="min-h-full bg-gray-100 dark:bg-gray-900">
        <DetailsHeader onBack={onBack} />
        <p className="text-center py-16 text-sm font-bold text-gray-500">Ставка не найдена</p>
      </div>
    );
  }

  const view = detailsView(bet, liveById);

  return (
    <div className="min-h-full bg-gray-100 dark:bg-gray-900 pb-28">
      <DetailsHeader onBack={onBack} />

      <section className="mx-4 mt-3 bg-white dark:bg-[#1e293b] rounded-2xl p-4 shadow-sm">
        <p className="text-[11px] text-gray-400 font-medium tabular-nums">
          {view.dateTime} · №{view.couponNo}
        </p>
        <h2 className="text-lg font-extrabold text-gray-900 dark:text-white mt-0.5">{view.typeLabel}</h2>
        {view.eventsLabel && (
          <p className="text-xs text-gray-500 mt-1">{view.eventsLabel}</p>
        )}
        {view.progressLabel && (
          <p className="text-xs text-gray-500 mt-0.5">{view.progressLabel}</p>
        )}
        <dl className="mt-3 flex flex-col gap-1">
          <MetaRow label="Коэффициент" value={view.odds} />
          <MetaRow label="Ставка" value={view.stake} />
          <MetaRow label="Возможный выигрыш" value={view.potential} />
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-gray-400">Статус</dt>
            <dd className={`text-sm font-semibold ${playerStatusClass(view.status)}`}>{view.statusLabel}</dd>
          </div>
        </dl>
      </section>

      <div className="px-4 mt-3 flex flex-col gap-3">
        {view.legs.map((leg, index) => (
          <article key={`${leg.homeTeam}-${leg.awayTeam}-${index}`} className="bg-white dark:bg-[#1e293b] rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <SportIcon sport={leg.sport || 'football'} className="w-5 h-5 text-[#4ade80] shrink-0 mt-0.5" />
                <p className="text-[11px] font-medium text-gray-500 leading-snug">
                  {[leg.country, leg.league].filter(Boolean).join('. ') || 'Событие'}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {leg.isLive && (
                  <span className="text-[9px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded leading-none">
                    LIVE
                  </span>
                )}
                {leg.statusLabel && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${legBadgeClass(leg.status)}`}>
                    {leg.statusLabel}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <TeamLogo teamName={leg.homeTeam} logo={leg.homeLogo} size="sm" />
              <p className="min-w-0 flex-1 text-sm font-extrabold text-gray-900 dark:text-white leading-snug">
                {leg.homeTeam}
              </p>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <TeamLogo teamName={leg.awayTeam} logo={leg.awayLogo} size="sm" />
              <p className="min-w-0 flex-1 text-sm font-extrabold text-gray-900 dark:text-white leading-snug">
                {leg.awayTeam}
              </p>
            </div>

            {leg.score && (
              <p className="mt-2 text-xl font-black text-gray-900 dark:text-white tabular-nums leading-none">
                {leg.score}
              </p>
            )}

            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
              {leg.market}: {leg.selection} ({leg.odds})
            </p>
          </article>
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
  };
}

function DetailsHeader({ onBack }: { onBack: () => void }) {
  return (
    <header className="bg-white dark:bg-[#1e293b] px-2 h-14 flex items-center gap-1">
      <button
        type="button"
        onClick={onBack}
        className="w-10 h-10 flex items-center justify-center text-gray-700 dark:text-gray-200 active:scale-90 transition-transform"
        aria-label="Назад"
      >
        <ChevronLeft className="w-6 h-6" strokeWidth={2} />
      </button>
      <h1 className="text-base font-bold text-gray-900 dark:text-white truncate">Информация о ставке</h1>
    </header>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{value}</dd>
    </div>
  );
}

function legBadgeClass(status: ReturnType<typeof detailsView>['legs'][number]['status']): string {
  if (status === 'in_progress') return 'bg-red-500 text-white';
  if (status === 'won') return 'bg-green-500 text-white';
  if (status === 'lost') return 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300';
  if (status === 'refund') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
  return 'bg-gray-100 dark:bg-gray-800 text-gray-500';
}
