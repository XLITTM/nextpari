import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useBetHistory } from '../BetHistoryContext';
import { useLiveMatches } from '../LiveMatchesContext';
import {
  betStatusLabel,
  compactLiveClock,
  couponNumber,
  eventLegBadge,
  eventLegLabel,
  selectionCaption,
  tournamentLine,
} from '../lib/betTicket';
import { fetchMatchSnapshots, snapshotFromMatch, type MatchLiveSnapshot } from '../lib/liveMatches';
import { SportIcon } from '../components/SportIcon';
import type { BetEvent, BetHistoryEntry, BetStatus } from '../types';

interface BetDetailsScreenProps {
  betId: string;
  onBack: () => void;
}

export function BetDetailsScreen({ betId, onBack }: BetDetailsScreenProps) {
  const { entries, loading } = useBetHistory();
  const { liveMatches, upcomingMatches } = useLiveMatches();
  const bet = entries.find((entry) => entry.id === betId);
  const [snapshots, setSnapshots] = useState<Record<string, MatchLiveSnapshot>>({});

  const matchIds = useMemo(
    () => [...new Set((bet?.events ?? []).map((event) => event.matchId).filter(Boolean) as string[])],
    [bet],
  );
  const idsKey = matchIds.join(',');

  const loadSnapshots = useCallback(async () => {
    const ids = idsKey ? idsKey.split(',') : [];
    if (!ids.length) {
      setSnapshots({});
      return;
    }
    const rows = await fetchMatchSnapshots(ids);
    setSnapshots(Object.fromEntries(rows.map((row) => [row.id, row])));
  }, [idsKey]);

  useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots]);

  useEffect(() => {
    if (!idsKey) return undefined;
    const timer = window.setInterval(() => {
      void loadSnapshots();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [loadSnapshots, idsKey]);

  const liveById = useMemo(
    () =>
      Object.fromEntries(
        [...liveMatches, ...upcomingMatches].map((match) => [match.id, snapshotFromMatch(match)]),
      ),
    [liveMatches, upcomingMatches],
  );

  if (loading && !bet) {
    return (
      <div className="min-h-full bg-gray-100 dark:bg-gray-900">
        <DetailsHeader onBack={onBack} title="Купон" />
        <p className="text-center py-16 text-sm font-bold text-gray-500">Загрузка...</p>
      </div>
    );
  }

  if (!bet) {
    return (
      <div className="min-h-full bg-gray-100 dark:bg-gray-900">
        <DetailsHeader onBack={onBack} title="Купон" />
        <p className="text-center py-16 text-sm font-bold text-gray-500">Ставка не найдена</p>
      </div>
    );
  }

  const receipt = couponNumber(bet.id, bet.ticketCode);
  const isExpress = bet.events.length > 1 || bet.type === 'express';
  const possibleWin = bet.payout || bet.amount * bet.totalOdds;

  return (
    <div className="min-h-full bg-gray-100 dark:bg-gray-900 pb-28">
      <DetailsHeader onBack={onBack} title={`Купон № ${receipt}`} />

      <section className="mx-4 mt-3 bg-white dark:bg-[#1e293b] rounded-3xl p-4 shadow-sm">
        <p className="text-[11px] text-gray-400 font-medium">{bet.date}</p>
        <h2 className="text-lg font-extrabold text-gray-900 dark:text-white mt-0.5">
          {isExpress ? 'Экспресс' : 'Одинар'}
        </h2>
        <dl className="mt-3 flex flex-col gap-1.5">
          <MetaRow label="Коэффициент" value={bet.totalOdds.toFixed(2)} />
          <MetaRow label="Сумма ставки" value={`${bet.amount.toLocaleString('ru-RU')} TMTM`} />
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-gray-400">Статус</dt>
            <dd className={`text-sm font-semibold ${statusColor(bet.status)}`}>{betStatusLabel(bet.status)}</dd>
          </div>
          <MetaRow
            label="Возможный выигрыш"
            value={
              bet.status === 'lost'
                ? '0 TMTM'
                : `${Number(possibleWin.toFixed(2)).toLocaleString('ru-RU')} TMTM`
            }
          />
        </dl>
      </section>

      <div className="px-4 mt-3 flex flex-col gap-3">
        {bet.events.map((event, index) => {
          const live = resolveLive(event, snapshots, liveById);
          return (
            <EventCard
              key={`${event.matchId ?? event.matchLabel}-${event.outcome}-${index}`}
              event={event}
              live={live}
              betStatus={bet.status}
            />
          );
        })}
      </div>
    </div>
  );
}

function DetailsHeader({ onBack, title }: { onBack: () => void; title: string }) {
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
      <h1 className="text-base font-bold text-gray-900 dark:text-white truncate">{title}</h1>
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

function EventCard({
  event,
  live,
  betStatus,
}: {
  event: BetEvent;
  live?: MatchLiveSnapshot;
  betStatus: BetStatus;
}) {
  const home = live?.homeTeam || event.homeTeam || event.matchLabel.split(/\s+[—–-]\s+/)[0] || 'Команда 1';
  const away = live?.awayTeam || event.awayTeam || event.matchLabel.split(/\s+[—–-]\s+/)[1] || 'Команда 2';
  const tournament =
    live?.tournament ||
    event.tournament ||
    tournamentLine({ sport: event.sport, country: event.country, league: event.league });
  const isLive = live?.isLive ?? Boolean(event.isLive);
  const liveStatus = live?.liveStatus || event.liveStatus;
  const clock = compactLiveClock(liveStatus);
  const badge = eventLegBadge({
    event,
    isLive,
    liveStatus,
    homeScore: live?.scoreHome,
    awayScore: live?.scoreAway,
    betStatus,
  });

  return (
    <article className="bg-white dark:bg-[#1e293b] rounded-3xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <SportIcon sport={live?.sport || event.sport || 'football'} className="w-5 h-5 text-[#4ade80] shrink-0 mt-0.5" />
          <p className="text-[11px] font-medium text-gray-500 leading-snug">
            {tournament || 'Событие'}
          </p>
        </div>
        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeClass(badge)}`}>
          {eventLegLabel(badge)}
        </span>
      </div>

      <p className="text-sm font-extrabold text-gray-900 dark:text-white mt-2 leading-snug">
        {home} — {away}
      </p>

      {live ? (
        <div className="mt-2 flex items-end justify-between gap-3">
          <p className="text-2xl font-black text-gray-900 dark:text-white tabular-nums leading-none">
            {live.scoreHome} : {live.scoreAway}
          </p>
          <p className={`text-xs font-semibold ${isLive ? 'text-red-500' : 'text-gray-500'}`}>
            {clock || (isLive ? 'LIVE' : 'Не начался')}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-xs font-semibold text-gray-500">{clock || event.matchStatus || 'Счёт появится после старта'}</p>
      )}

      <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
        {selectionCaption(event)}
      </p>
    </article>
  );
}

function resolveLive(
  event: BetEvent,
  snapshots: Record<string, MatchLiveSnapshot>,
  liveById: Record<string, MatchLiveSnapshot>,
): MatchLiveSnapshot | undefined {
  const id = event.matchId;
  if (id) {
    const byId = liveById[id] ?? snapshots[id];
    if (byId) return byId;
  }
  const home = (event.homeTeam || '').toLowerCase();
  const away = (event.awayTeam || '').toLowerCase();
  if (!home || !away) return undefined;
  return Object.values(liveById).find(
    (match) => match.homeTeam.toLowerCase() === home && match.awayTeam.toLowerCase() === away,
  );
}

function statusColor(status: BetHistoryEntry['status']): string {
  if (status === 'lost') return 'text-red-500';
  if (status === 'won') return 'text-green-500';
  return 'text-gray-500';
}

function badgeClass(badge: ReturnType<typeof eventLegBadge>): string {
  if (badge === 'in_play') return 'bg-red-500 text-white';
  if (badge === 'won') return 'bg-green-500 text-white';
  if (badge === 'lost') return 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300';
  return 'bg-gray-100 dark:bg-gray-800 text-gray-500';
}
