import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronDown, LayoutGrid, Zap, Radio } from 'lucide-react';
import { TeamLogo } from '@/components/TeamLogo';
import { MarketsGrid } from '@/components/MarketsGrid';
import { SportIcon } from '@/components/SportIcon';
import { useBetSlip } from '../BetSlipContext';
import { getMatchById } from '../data';
import { useLiveMatches } from '../LiveMatchesContext';
import { useLiveOdds } from '../hooks/useLiveOdds';
import { laterClock, parseClockSeconds, parseLiveClock } from '../lib/betsapi';
import { matchEventFromStore } from '../lib/liveMatches';
import { useSportsStore } from '../stores/sportsStore';
import type { MatchEvent, Screen } from '../types';

interface MatchDetailsScreenProps {
  matchId: string;
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
}

type HeaderTab = 'info' | 'stream';
type VenueSport = 'football' | 'basketball' | 'tennis' | 'hockey' | 'esports' | 'default';

function venueSport(sport?: string, sportId?: string): VenueSport {
  const id = String(sportId ?? '');
  const value = String(sport ?? '').toLowerCase();
  if (id === '18' || value === 'basketball') return 'basketball';
  if (id === '13' || value === 'tennis') return 'tennis';
  if (id === '17' || value === 'hockey') return 'hockey';
  if (id === '151' || id === '91' || value === 'esports') return 'esports';
  if (id === '1' || value === 'football') return 'football';
  return 'default';
}

function venueBgClass(kind: VenueSport): string {
  if (kind === 'football') return 'match-bg-football';
  if (kind === 'basketball') return 'match-bg-basketball';
  if (kind === 'tennis') return 'match-bg-tennis';
  if (kind === 'hockey') return 'match-bg-hockey';
  if (kind === 'esports') return 'match-bg-esports';
  return 'match-bg-default';
}

function tennisSurface(league: string): 'hard' | 'clay' | 'grass' {
  if (/wimbledon|трава|grass/i.test(league)) return 'grass';
  if (/roland|french open|грунт|clay|monte.?carlo/i.test(league)) return 'clay';
  return 'hard';
}

export function MatchDetailsScreen({ matchId, onBack, onNavigate }: MatchDetailsScreenProps) {
  const { findMatch } = useLiveMatches();
  const catalogMatch = findMatch(matchId) ?? getMatchById(matchId);
  const storeState = useSportsStore((s) => s.events[matchId]);
  const upsertEvent = useSportsStore((s) => s.upsertEvent);
  const isLive = storeState?.event.time_status === '1' || Boolean(catalogMatch?.isLive);
  const [headerTab, setHeaderTab] = useState<HeaderTab>('info');

  useEffect(() => {
    if (!matchId || storeState || !catalogMatch) return;
    upsertEvent({
      id: matchId,
      sport_id:
        catalogMatch.sport === 'basketball'
          ? '18'
          : catalogMatch.sport === 'tennis'
            ? '13'
            : catalogMatch.sport === 'hockey'
              ? '17'
              : catalogMatch.sport === 'esports'
                ? '151'
                : '1',
      league: { name: catalogMatch.league, cc: catalogMatch.country },
      home: { name: catalogMatch.team1 },
      away: { name: catalogMatch.team2 },
      time_status: catalogMatch.isLive ? '1' : '0',
      start_time: String(Math.floor(catalogMatch.startTime / 1000)),
      ss: catalogMatch.liveScore
        ? `${catalogMatch.liveScore.team1}-${catalogMatch.liveScore.team2}`
        : undefined,
      time: catalogMatch.liveStatus,
    });
  }, [matchId, catalogMatch, storeState, upsertEvent]);

  useLiveOdds(matchId, isLive);

  const match = useMemo(() => {
    const fromStore = storeState ? matchEventFromStore(storeState) : undefined;
    return fromStore ?? catalogMatch;
  }, [catalogMatch, storeState]);
  const { count: betCount } = useBetSlip();

  if (!match) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-[#F5F5F5]">
        <p className="text-[#1A1A1A]">Матч не найден</p>
      </div>
    );
  }

  const sportKind = venueSport(match.sport, storeState?.event.sport_id);
  const sportLabel =
    sportKind === 'football' ? 'Футбол' :
    sportKind === 'basketball' ? 'Баскетбол' :
    sportKind === 'tennis' ? 'Теннис' :
    sportKind === 'hockey' ? 'Хоккей' :
    sportKind === 'esports' ? 'Киберспорт' : 'Спорт';

  return (
    <div className="flex min-h-full flex-col bg-[#F5F5F5]">
      <div className={`relative overflow-hidden ${venueBgClass(sportKind)}`}>
        <div className="relative z-10">
          <div className="flex h-14 items-center justify-between px-2">
            <button
              type="button"
              onClick={onBack}
              className="flex h-9 w-9 items-center justify-center text-white active:scale-90"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <div className="min-w-0 flex-1 px-2">
              <div className="flex min-w-0 items-center justify-center gap-1.5">
                <SportIcon sport={match.sport} className="h-6 w-6 shrink-0 text-[#4ade80]" />
                <p className="truncate text-sm font-bold text-white">
                  {sportLabel}. {match.league}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onNavigate({ name: 'betslip' })}
                className="flex h-9 w-9 items-center justify-center text-white active:scale-90"
              >
                <Zap className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate({ name: 'menu' })}
                className="flex h-9 w-9 items-center justify-center text-white active:scale-90"
              >
                <LayoutGrid className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex justify-center px-4 pb-3">
            <div className="flex rounded-full bg-black/35 p-1 backdrop-blur-[2px] ring-1 ring-white/15">
              <button
                type="button"
                onClick={() => setHeaderTab('info')}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                  headerTab === 'info' ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-white/80'
                }`}
              >
                Информация
              </button>
              <button
                type="button"
                onClick={() => setHeaderTab('stream')}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                  headerTab === 'stream' ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-white/80'
                }`}
              >
                Трансляция
              </button>
            </div>
          </div>

          <MatchHeader
            match={match}
            sportKind={sportKind}
            minute={storeState?.matchTime}
            timeStr={storeState?.event.time_str}
            scoreText={storeState?.score}
            clockRunning={storeState?.event.period !== 'HT' && storeState?.event.clock_running !== false}
            period={storeState?.event.period}
            kickoffUnix={Number(storeState?.event.start_time || storeState?.event.time || 0)}
          />
        </div>
      </div>

      <div className="flex-1 overscroll-contain">
        {headerTab === 'info' ? (
          <MarketsGrid eventId={matchId} match={match} />
        ) : (
          <StreamPanel hasStream={Boolean(match.hasStream)} />
        )}
      </div>

      {betCount > 0 && (
        <button
          type="button"
          onClick={() => onNavigate({ name: 'betslip' })}
          className="absolute bottom-16 left-3 right-3 z-40 flex items-center justify-between rounded-xl bg-[#22C55E] px-4 py-3 text-white shadow-lg active:scale-[0.98]"
        >
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-extrabold">
              {betCount}
            </div>
            <span className="text-sm font-bold">Купон</span>
          </div>
          <ChevronDown className="h-5 w-5 -rotate-90" />
        </button>
      )}
    </div>
  );
}

function StreamPanel({ hasStream }: { hasStream: boolean }) {
  return (
    <div className="relative z-10 -mt-5 rounded-t-[24px] bg-[#F5F5F5] px-4 pb-24 pt-8 shadow-[0_-12px_24px_rgba(0,0,0,0.18)]">
      <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl bg-white px-6 text-center shadow-sm">
        <Radio className="mb-3 h-10 w-10 text-[#22C55E]" />
        <p className="text-base font-bold text-[#1A1A1A]">
          {hasStream ? 'Трансляция скоро начнётся' : 'Трансляция недоступна'}
        </p>
        <p className="mt-1 text-sm font-medium text-[#666666]">
          {hasStream ? 'Видео появится в этом блоке после старта эфира.' : 'Для этого матча видеопоток не подключен.'}
        </p>
      </div>
    </div>
  );
}

const FIRST_HALF_END = 45 * 60;
const FULL_TIME_END = 90 * 60;

function pad2(value: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(2, '0');
}

function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${pad2(Math.floor(safe / 60))}:${pad2(safe % 60)}`;
}

function formatAdded(limitSeconds: number, elapsed: number): string {
  const extra = Math.max(0, elapsed - limitSeconds);
  const extraMin = Math.floor(extra / 60);
  return extraMin > 0 ? `${formatMmSs(limitSeconds)} +${extraMin}'` : formatMmSs(limitSeconds);
}

function formatLiveClock(
  elapsed: number,
  paused: boolean,
  football: boolean,
  period?: string,
): string {
  if (period === 'HT' || (paused && football && elapsed >= FIRST_HALF_END - 20 && elapsed < 50 * 60)) {
    return '45:00';
  }
  if (!football) return formatMmSs(elapsed);
  if (elapsed >= FULL_TIME_END) return formatAdded(FULL_TIME_END, elapsed);
  if (period === '1' && elapsed >= FIRST_HALF_END) return formatAdded(FIRST_HALF_END, elapsed);
  return formatMmSs(elapsed);
}

function useTickingClock(
  isLive: boolean,
  apiClock: string | undefined,
  liveStatus: string | undefined,
  clockRunning: boolean,
  period?: string,
  kickoffUnix?: number,
) {
  const ht = period === 'HT' || (!clockRunning && /ht|перерыв/i.test(`${apiClock ?? ''} ${liveStatus ?? ''}`));
  let apiSeconds =
    parseClockSeconds(apiClock) ??
    parseClockSeconds(parseLiveClock(liveStatus).clock) ??
    parseClockSeconds(liveStatus) ??
    0;
  if (period === '2' && apiSeconds < FIRST_HALF_END) apiSeconds += FIRST_HALF_END;

  const sync = useMemo(
    () => ({ seconds: ht ? FIRST_HALF_END : apiSeconds, at: Date.now() }),
    [apiClock, ht, period],
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isLive || ht || !clockRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isLive, ht, clockRunning]);

  let elapsed = ht
    ? FIRST_HALF_END
    : sync.seconds + (isLive && clockRunning ? Math.max(0, Math.floor((now - sync.at) / 1000)) : 0);

  if (!ht && period === '2' && kickoffUnix && kickoffUnix > 1_000_000_000) {
    const sinceSecondHalf = Date.now() / 1000 - kickoffUnix - 45 * 60 - 15 * 60;
    elapsed = Math.max(elapsed, FIRST_HALF_END + Math.max(0, sinceSecondHalf));
  }

  return { elapsed, apiSeconds: ht ? FIRST_HALF_END : apiSeconds, running: isLive && clockRunning && !ht };
}

function formatKickoff(ts: number): string {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm} ${hh}:${min}`;
}

function MatchHeader({
  match,
  sportKind,
  minute,
  timeStr,
  scoreText,
  clockRunning,
  period,
  kickoffUnix,
}: {
  match: MatchEvent;
  sportKind: VenueSport;
  minute?: string;
  timeStr?: string;
  scoreText?: string;
  clockRunning: boolean;
  period?: string;
  kickoffUnix?: number;
}) {
  const fromSs = String(scoreText || '').match(/^(\d+)\s*[-:]\s*(\d+)/);
  const score1 = fromSs ? fromSs[1] : match.liveScore?.team1 ?? (match.isLive ? 0 : '—');
  const score2 = fromSs ? fromSs[2] : match.liveScore?.team2 ?? (match.isLive ? 0 : '—');
  const football = sportKind === 'football';
  const apiClock = laterClock(minute, timeStr);
  const { elapsed, running } = useTickingClock(
    match.isLive,
    apiClock,
    match.liveStatus,
    clockRunning && period !== 'HT',
    period,
    kickoffUnix,
  );
  const clockLabel = match.isLive
    ? period === 'HT'
      ? '45:00'
      : formatLiveClock(elapsed, !running, football, period)
    : formatKickoff(match.startTime);

  return (
    <div className="px-4 pb-10 pt-1">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <TeamLogo teamName={match.team1} logo={match.team1Logo} size="lg" className="bg-white/95" />
          <p className="line-clamp-2 text-center text-sm font-bold leading-tight text-white drop-shadow">{match.team1}</p>
        </div>

        <div className="flex shrink-0 flex-col items-center px-1 text-center">
          <p className="mb-1.5 flex items-center justify-center gap-1.5 text-lg font-extrabold tabular-nums text-white drop-shadow">
            {match.isLive ? (
              <span
                className={`h-2 w-2 animate-pulse-live rounded-full ${
                  running ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]' : 'bg-[#22C55E] shadow-[0_0_8px_rgba(34,197,94,0.9)]'
                }`}
              />
            ) : null}
            <span>{clockLabel}</span>
          </p>
          <p className="text-5xl font-extrabold tabular-nums leading-none tracking-tight text-white drop-shadow-md">
            {score1} : {score2}
          </p>
          <VenueMarkings sportKind={sportKind} league={match.league} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <TeamLogo teamName={match.team2} logo={match.team2Logo} size="lg" className="bg-white/95" />
          <p className="line-clamp-2 text-center text-sm font-bold leading-tight text-white drop-shadow">{match.team2}</p>
        </div>
      </div>
    </div>
  );
}

function VenueMarkings({ sportKind, league }: { sportKind: VenueSport; league: string }) {
  if (sportKind === 'tennis') {
    const surface = tennisSurface(league);
    const fill = surface === 'clay' ? '#C65A3A' : surface === 'grass' ? '#3FA34A' : '#3B82F6';
    return (
      <svg className="mt-3 h-10 w-[7.5rem] opacity-90" viewBox="0 0 120 48" aria-hidden>
        <rect x="4" y="4" width="112" height="40" fill={fill} stroke="white" strokeWidth="1.5" rx="1" />
        <line x1="60" y1="4" x2="60" y2="44" stroke="white" strokeWidth="1.4" />
        <rect x="4" y="12" width="112" height="24" fill="none" stroke="white" strokeWidth="1" />
        <rect x="28" y="12" width="64" height="24" fill="none" stroke="white" strokeWidth="1" />
      </svg>
    );
  }
  if (sportKind === 'basketball') {
    return (
      <svg className="mt-3 h-10 w-[7.5rem] opacity-90" viewBox="0 0 120 48" aria-hidden>
        <rect x="3" y="4" width="114" height="40" fill="#C47A3A" stroke="white" strokeWidth="1.4" />
        <circle cx="60" cy="24" r="7" fill="none" stroke="white" strokeWidth="1.2" />
        <rect x="3" y="14" width="18" height="20" fill="none" stroke="white" strokeWidth="1.2" />
        <rect x="99" y="14" width="18" height="20" fill="none" stroke="white" strokeWidth="1.2" />
        <path d="M21 14 C 36 14 36 34 21 34" fill="none" stroke="white" strokeWidth="1.2" />
        <path d="M99 14 C 84 14 84 34 99 34" fill="none" stroke="white" strokeWidth="1.2" />
      </svg>
    );
  }
  if (sportKind === 'hockey') {
    return (
      <svg className="mt-3 h-10 w-[7.5rem] opacity-90" viewBox="0 0 120 48" aria-hidden>
        <rect x="4" y="6" width="112" height="36" rx="12" fill="#E8EEF5" stroke="#1D4ED8" strokeWidth="1.6" />
        <line x1="60" y1="6" x2="60" y2="42" stroke="#DC2626" strokeWidth="1.4" />
        <line x1="34" y1="6" x2="34" y2="42" stroke="#2563EB" strokeWidth="1.2" />
        <line x1="86" y1="6" x2="86" y2="42" stroke="#2563EB" strokeWidth="1.2" />
        <circle cx="60" cy="24" r="5" fill="none" stroke="#DC2626" strokeWidth="1" />
      </svg>
    );
  }
  if (sportKind === 'esports') {
    return (
      <svg className="mt-3 h-10 w-[7.5rem] opacity-90" viewBox="0 0 120 48" aria-hidden>
        <rect x="8" y="10" width="104" height="28" rx="4" fill="#111827" stroke="#22C55E" strokeWidth="1.4" />
        <rect x="18" y="16" width="22" height="16" rx="1" fill="#22C55E" opacity="0.85" />
        <rect x="49" y="16" width="22" height="16" rx="1" fill="#A855F7" opacity="0.85" />
        <rect x="80" y="16" width="22" height="16" rx="1" fill="#22D3EE" opacity="0.85" />
      </svg>
    );
  }
  return (
    <svg className="mt-3 h-10 w-[7.5rem] opacity-80" viewBox="0 0 120 48" aria-hidden>
      <rect x="6" y="6" width="108" height="36" fill="#166534" stroke="white" strokeWidth="1.4" />
      <line x1="60" y1="6" x2="60" y2="42" stroke="white" strokeWidth="1.3" />
      <circle cx="60" cy="24" r="7" fill="none" stroke="white" strokeWidth="1.2" />
      <rect x="6" y="14" width="14" height="20" fill="none" stroke="white" strokeWidth="1.1" />
      <rect x="100" y="14" width="14" height="20" fill="none" stroke="white" strokeWidth="1.1" />
    </svg>
  );
}
