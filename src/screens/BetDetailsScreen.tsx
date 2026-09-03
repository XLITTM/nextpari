import { useMemo } from 'react';
import { ChevronLeft, Bell, MoreHorizontal } from 'lucide-react';
import { useBetHistory } from '../BetHistoryContext';
import { useBetSlip } from '../BetSlipContext';
import { useLiveMatches } from '../LiveMatchesContext';
import { useToast } from '../ToastContext';
import { TeamLogo } from '../components/TeamLogo';
import { SportIcon } from '../components/SportIcon';
import {
  currentSelectionFromHistoryLeg,
  detailsView,
  planRepeatCoupon,
  playerStatusClass,
} from '../lib/betHistoryView';
import { lsportsStoreMarkets } from '../lib/sportsSelection';
import { snapshotFromMatch } from '../lib/liveMatches';
import type { BetSelection, MatchEvent, Screen } from '../types';

interface BetDetailsScreenProps {
  betId: string;
  onBack: () => void;
  onNavigate?: (screen: Screen) => void;
}

export function BetDetailsScreen({ betId, onBack, onNavigate }: BetDetailsScreenProps) {
  const { entries, loading } = useBetHistory();
  const { addSelection, clearAll } = useBetSlip();
  const { toast } = useToast();
  const { liveMatches, upcomingMatches } = useLiveMatches();
  const bet = entries.find((entry) => entry.id === betId);

  const liveById = useMemo(
    () =>
      Object.fromEntries(
        [...liveMatches, ...upcomingMatches].map((match) => {
          const snap = snapshotFromMatch(match);
          return [match.id, {
            homeTeam: match.team1,
            awayTeam: match.team2,
            homeLogo: match.team1Logo,
            awayLogo: match.team2Logo,
            scoreHome: snap.scoreHome,
            scoreAway: snap.scoreAway,
            isLive: match.isLive,
            liveStatus: match.liveStatus,
            startTime: match.startTime,
            country: match.country,
            league: match.league,
            sport: match.sport,
          }];
        }),
      ),
    [liveMatches, upcomingMatches],
  );

  if (loading && !bet) {
    return (
      <div className="min-h-full bg-gray-100 dark:bg-gray-900">
        <DetailsHeader onBack={onBack} title="Информация о ставке" />
        <p className="text-center py-16 text-sm font-bold text-gray-500">Загрузка...</p>
      </div>
    );
  }

  if (!bet) {
    return (
      <div className="min-h-full bg-gray-100 dark:bg-gray-900">
        <DetailsHeader onBack={onBack} title="Информация о ставке" />
        <p className="text-center py-16 text-sm font-bold text-gray-500">Ставка не найдена</p>
      </div>
    );
  }

  const view = detailsView(bet, liveById);
  const repeat = planRepeatCoupon(bet, (event) => lookupCurrentLeg(event, [...liveMatches, ...upcomingMatches]));

  const handleRepeat = () => {
    if (!repeat.canRepeat) {
      toast.error(repeat.unavailable.length
        ? 'Некоторые события больше недоступны'
        : 'Купон сейчас недоступен');
      return;
    }
    clearAll();
    for (const selection of repeat.selections) {
      addSelection(selection);
    }
    toast.success('Купон собран по текущим коэффициентам');
    onNavigate?.({ name: 'betslip' });
  };

  return (
    <div className="min-h-full bg-gray-100 dark:bg-gray-900 pb-36">
      <DetailsHeader onBack={onBack} title={view.title} />

      <section className="mx-3 mt-3 bg-white dark:bg-[#1e293b] rounded-2xl px-3 py-3 shadow-sm">
        <p className="text-[11px] text-gray-400 font-medium tabular-nums">
          {view.dateTime} · №{view.couponNo}
        </p>
        <h2 className="text-lg font-extrabold text-gray-900 dark:text-white mt-0.5">{view.typeLabel}</h2>
        {view.eventsLabel && (
          <p className="text-xs text-gray-500 mt-1">
            {view.eventsLabel}
            {view.progressLabel ? ` · ${view.progressLabel}` : ''}
          </p>
        )}
        <dl className="mt-2.5 flex flex-col gap-1">
          <MetaRow label="Коэффициент" value={view.odds} />
          <MetaRow label="Ставка" value={view.stake} />
          <MetaRow label="Возможный выигрыш" value={view.potential} />
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[11px] text-gray-400">Статус</dt>
            <dd className={`text-sm font-semibold ${playerStatusClass(view.status)}`}>{view.statusLabel}</dd>
          </div>
        </dl>
      </section>

      <div className="px-3 mt-3 flex flex-col gap-2">
        {view.legs.map((leg, index) => (
          <article key={`${leg.homeTeam}-${leg.selection}-${index}`} className="bg-white dark:bg-[#1e293b] rounded-2xl px-3 py-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-1.5 min-w-0">
                <SportIcon sport={leg.sport || 'football'} className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                <p className="text-[11px] font-medium text-gray-500 leading-snug">
                  {[leg.sport === 'football' ? 'Футбол' : undefined, leg.country, leg.league].filter(Boolean).join('. ') || 'Событие'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {leg.isLive && (
                  <span className="text-[9px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded leading-none">LIVE</span>
                )}
                {leg.eventDate && (
                  <span className="text-[10px] text-gray-400 tabular-nums">{leg.eventDate}</span>
                )}
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <TeamLogo teamName={leg.homeTeam} logo={leg.homeLogo} size="xs" />
                <span className="text-sm font-bold text-gray-900 dark:text-white truncate">{leg.homeTeam}</span>
              </div>
              <span className="text-sm font-black text-gray-900 dark:text-white tabular-nums shrink-0 px-1">
                {leg.score || 'VS'}
              </span>
              <div className="flex items-center justify-end gap-1.5 min-w-0 flex-1">
                <span className="text-sm font-bold text-gray-900 dark:text-white truncate text-right">{leg.awayTeam}</span>
                <TeamLogo teamName={leg.awayTeam} logo={leg.awayLogo} size="xs" />
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-gray-100 dark:border-gray-700 space-y-1">
              <MetaRow label="Маркет" value={leg.market} />
              <MetaRow label="Исход" value={leg.selection} />
              <MetaRow label="Коэффициент" value={leg.odds} />
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[11px] text-gray-400">Статус</dt>
                <dd className={`text-sm font-semibold ${playerStatusClass(leg.status)}`}>{leg.statusLabel}</dd>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="fixed bottom-16 left-0 w-full z-40 px-3 pb-3">
        <div className="max-w-lg mx-auto">
          <button
            type="button"
            onClick={handleRepeat}
            disabled={!repeat.canRepeat}
            className="w-full bg-brand-600 disabled:bg-gray-300 disabled:text-gray-500 text-white font-bold text-sm rounded-xl py-3 active:scale-[0.99] transition-transform"
          >
            Повторить купон
          </button>
          {!repeat.canRepeat && (
            <p className="text-[11px] text-center text-gray-500 mt-1.5">
              Доступны только текущие события и коэффициенты
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function lookupCurrentLeg(event: import('../types').BetEvent, matches: MatchEvent[]): BetSelection | null {
  const fixtureId = event.matchId;
  if (!fixtureId) return null;
  const markets = lsportsStoreMarkets(fixtureId);
  if (!markets.length) return null;
  const listed = matches.find((match) => match.id === fixtureId);
  const teams = {
    team1: event.homeTeam || listed?.team1 || 'Home',
    team2: event.awayTeam || listed?.team2 || 'Away',
  };
  const match: MatchEvent = listed ?? {
    id: fixtureId,
    sport: event.sport || 'football',
    league: event.league || '',
    country: event.country || '',
    team1: teams.team1,
    team2: teams.team2,
    team1Color: '#000',
    team2Color: '#fff',
    startTime: event.startTime || 0,
    isLive: Boolean(event.isLive),
    extraMarkets: 0,
    markets: { '1': 0, x: 0, '2': 0 },
    feedTag: 'lsports',
  };
  return currentSelectionFromHistoryLeg(match, markets, event);
}

function DetailsHeader({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <header className="bg-white dark:bg-[#1e293b] px-2 h-12 flex items-center gap-1">
      <button
        type="button"
        onClick={onBack}
        className="w-10 h-10 flex items-center justify-center text-gray-700 dark:text-gray-200 active:scale-90 transition-transform"
        aria-label="Назад"
      >
        <ChevronLeft className="w-6 h-6" strokeWidth={2} />
      </button>
      <h1 className="text-base font-bold text-gray-900 dark:text-white truncate flex-1">{title}</h1>
      <span className="w-9 h-9 flex items-center justify-center text-gray-400">
        <Bell className="w-4 h-4" strokeWidth={1.8} />
      </span>
      <span className="w-9 h-9 flex items-center justify-center text-gray-400">
        <MoreHorizontal className="w-4 h-4" strokeWidth={1.8} />
      </span>
    </header>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] text-gray-400">{label}</dt>
      <dd className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{value}</dd>
    </div>
  );
}
