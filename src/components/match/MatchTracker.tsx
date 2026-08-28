import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Bell,
  ChevronDown,
  ChevronUp,
  Expand,
  Flag,
  MoreVertical,
  Search,
  Settings2,
  Star,
  X,
  Zap,
} from 'lucide-react';
import { TeamLogo } from '../TeamLogo';
import { laterClock, parseClockSeconds, parseLiveClock } from '../../lib/betsapi';
import {
  buildDetailStats,
  buildH2H,
  buildIncidents,
  buildStadium,
  buildTimeline,
  type DetailStatRow,
  type MatchH2HRow,
  type SideIncidents,
  type TimelineEvent,
} from '../../lib/matchWidgetData';
import { useMatchWidgetExtras } from '../../hooks/useMatchWidgetExtras';
import { useFavoritesStore } from '../../stores/favoritesStore';
import type { MatchEvent } from '../../types';

export type HeaderTab = 'info' | 'stream';
export type VenueSport = 'football' | 'basketball' | 'tennis' | 'hockey' | 'esports' | 'default';

const SLIDE_COUNT = 6;
const FIRST_HALF_END = 45 * 60;
const FULL_TIME_END = 90 * 60;
const CAPSULE =
  'relative z-10 mx-auto flex h-full min-h-0 w-[94%] max-w-[440px] flex-col overflow-y-auto rounded-2xl border border-white/10 bg-[#0b131d]/85 p-3 text-white shadow-2xl backdrop-blur-md';
const SLIDE1_SHADOW = 'drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]';

interface MatchTrackerProps {
  match: MatchEvent;
  sportLabel: string;
  sportKind: VenueSport;
  minute?: string;
  timeStr?: string;
  scoreText?: string;
  clockRunning: boolean;
  period?: string;
  kickoffUnix?: number;
  headerTab: HeaderTab;
  onHeaderTabChange: (tab: HeaderTab) => void;
  onBack: () => void;
  onLiveClick?: () => void;
  venueClassName: string;
  children?: ReactNode;
}

function pad2(value: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(2, '0');
}

function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${pad2(Math.floor(safe / 60))}:${pad2(safe % 60)}`;
}

function formatClockDisplay(raw: string): string {
  const m = String(raw).match(/(\d+)\s*[:']\s*(\d+)/);
  if (m) return `${m[1]} : ${m[2]}`;
  const only = String(raw).match(/(\d+)/);
  if (only) return `${only[1]} : 00`;
  return raw;
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

function periodLabel(period?: string, isLive?: boolean): string {
  if (!isLive) return 'Не начался';
  if (period === 'HT') return 'Перерыв';
  if (period === '2') return '2-й тайм';
  return '1-й тайм';
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
    [apiClock, ht, period, apiSeconds],
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

  return { elapsed, running: isLive && clockRunning && !ht };
}

function formatKickoff(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatStatValue(value: number): string {
  if (Number.isInteger(value) || Math.abs(value - Math.round(value)) < 0.001) return String(Math.round(value));
  return value.toFixed(2);
}

export function MatchTracker({
  match,
  sportLabel,
  sportKind,
  minute,
  timeStr,
  scoreText,
  clockRunning,
  period,
  kickoffUnix,
  headerTab,
  onHeaderTabChange,
  onBack,
  onLiveClick,
  venueClassName,
  children,
}: MatchTrackerProps) {
  const [slide, setSlide] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);
  const [dragPx, setDragPx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const pointerId = useRef<number | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const dragAxis = useRef<'x' | 'y' | null>(null);
  const dragPxRef = useRef(0);
  const minSwipeDistance = 50;
  const isFavorite = useFavoritesStore((s) => s.isMatchFavorite(match.id));
  const toggleMatchFavorite = useFavoritesStore((s) => s.toggleMatchFavorite);
  const { data: apiExtras } = useMatchWidgetExtras(match.id, true);

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
  const clockRaw = match.isLive
    ? period === 'HT'
      ? '45:00'
      : formatLiveClock(elapsed, !running, football, period)
    : formatKickoff(match.startTime);
  const clockLabel = formatClockDisplay(clockRaw);
  const clockPlain = clockRaw.replace(/\s/g, '');
  const periodText = periodLabel(period, match.isLive);

  const enrichedMatch = useMemo<MatchEvent>(
    () => ({
      ...match,
      stats: apiExtras?.stats?.length ? apiExtras.stats : match.stats,
      h2h: apiExtras?.h2h?.length ? apiExtras.h2h : match.h2h,
      stadium: apiExtras?.stadium ?? match.stadium,
    }),
    [match, apiExtras],
  );

  const tourLine = `Тур ${apiExtras?.round || 1}. ${match.country || 'Международный'}`;
  const tournamentTitle = `${sportLabel}. ${match.league}`;
  const incidents = useMemo(
    () => (apiExtras ? { home: apiExtras.home, away: apiExtras.away } : buildIncidents(enrichedMatch)),
    [apiExtras, enrichedMatch],
  );
  const stadium = useMemo(() => buildStadium(enrichedMatch), [enrichedMatch]);
  const h2h = useMemo(() => buildH2H(enrichedMatch), [enrichedMatch]);
  const detailStats = useMemo(() => buildDetailStats(enrichedMatch), [enrichedMatch]);
  const timeline = useMemo(
    () => buildTimeline(enrichedMatch, apiExtras?.timeline),
    [enrichedMatch, apiExtras],
  );
  const firstHalfEvents = useMemo(
    () =>
      timeline
        .filter((row) => {
          const m = Number(String(row.minute).replace(/[^\d]/g, ''));
          return Number.isFinite(m) && m <= 45;
        })
        .sort(
          (a, b) =>
            Number(String(a.minute).replace(/[^\d]/g, '')) - Number(String(b.minute).replace(/[^\d]/g, '')),
        ),
    [timeline],
  );

  const goSlide = (next: number) => {
    const clamped = Math.max(0, Math.min(SLIDE_COUNT - 1, next));
    if (clamped !== slide) setIsExpanded(false);
    setSlide(clamped);
  };

  const nextSlide = () => goSlide(slide + 1);
  const prevSlide = () => goSlide(slide - 1);

  const handleTouchEnd = () => {
    if (touchStartX === null || touchEndX === null) return;
    const distance = touchStartX - touchEndX;
    if (distance > minSwipeDistance) nextSlide();
    if (distance < -minSwipeDistance) prevSlide();
    setTouchStartX(null);
    setTouchEndX(null);
  };

  const endPointerDrag = () => {
    const dx = dragPxRef.current;
    const axis = dragAxis.current;
    pointerId.current = null;
    pointerStart.current = null;
    dragAxis.current = null;
    dragPxRef.current = 0;
    setIsDragging(false);
    setDragPx(0);
    if (axis === 'x' && Math.abs(dx) > 48) {
      setIsExpanded(false);
      setSlide((current) => Math.max(0, Math.min(SLIDE_COUNT - 1, current + (dx < 0 ? 1 : -1))));
    }
  };

  const footerScore = `${score1} : ${score2}  ${match.team1} - ${match.team2}`;

  return (
    <div className={`relative flex h-[240px] w-full flex-col justify-between overflow-hidden ${venueClassName}`}>
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-black/70 via-black/50 to-black/75"
        aria-hidden
      />

      <div className="relative z-10 flex shrink-0 items-center justify-between px-3 pt-2">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={onBack} className="shrink-0 text-white active:scale-90" aria-label="Назад">
            <ArrowLeft className="h-5 w-5" strokeWidth={2.2} />
          </button>
          <p className="min-w-0 truncate text-[14px] font-semibold text-white">{tournamentTitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button type="button" onClick={onLiveClick} className="text-emerald-400 active:scale-90" aria-label="Live">
            <Zap className="h-5 w-5 fill-emerald-400" strokeWidth={2} />
          </button>
          <button type="button" onClick={() => setMenuOpen(true)} className="text-white active:scale-90" aria-label="Меню">
            <MoreVertical className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <div className="relative z-10 mx-auto mt-1.5 inline-flex h-7 justify-center rounded-full border border-white/10 bg-black/40 p-0.5 backdrop-blur-md">
        <button
          type="button"
          onClick={() => onHeaderTabChange('info')}
          className={
            headerTab === 'info'
              ? 'rounded-full bg-white px-4 py-0.5 text-[12px] font-bold text-black shadow'
              : 'rounded-full px-4 py-0.5 text-[12px] font-medium text-zinc-300'
          }
        >
          Информация
        </button>
        <button
          type="button"
          onClick={() => onHeaderTabChange('stream')}
          className={
            headerTab === 'stream'
              ? 'rounded-full bg-white px-4 py-0.5 text-[12px] font-bold text-black shadow'
              : 'rounded-full px-4 py-0.5 text-[12px] font-medium text-zinc-300'
          }
        >
          Трансляция
        </button>
      </div>

      <div
        className={`relative z-10 min-h-0 w-full flex-1 touch-pan-y ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
        onTouchStart={(e) => {
          if (isExpanded) return;
          setTouchStartX(e.targetTouches[0].clientX);
          setTouchEndX(e.targetTouches[0].clientX);
        }}
        onTouchMove={(e) => {
          if (isExpanded) return;
          setTouchEndX(e.targetTouches[0].clientX);
        }}
        onTouchEnd={handleTouchEnd}
        onPointerDown={(e) => {
          if (e.pointerType === 'touch' || e.button !== 0 || isExpanded) return;
          pointerId.current = e.pointerId;
          pointerStart.current = { x: e.clientX, y: e.clientY };
          dragAxis.current = null;
          dragPxRef.current = 0;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        }}
        onPointerMove={(e) => {
          if (e.pointerType === 'touch') return;
          if (pointerId.current !== e.pointerId || !pointerStart.current) return;
          const dx = e.clientX - pointerStart.current.x;
          const dy = e.clientY - pointerStart.current.y;
          if (!dragAxis.current) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            dragAxis.current = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
            if (dragAxis.current === 'y') return;
            setIsDragging(true);
          }
          if (dragAxis.current !== 'x') return;
          dragPxRef.current = dx;
          setDragPx(dx);
        }}
        onPointerUp={(e) => {
          if (e.pointerType === 'touch') return;
          endPointerDrag();
        }}
        onPointerCancel={(e) => {
          if (e.pointerType === 'touch') return;
          endPointerDrag();
        }}
      >
        <div className="h-full overflow-hidden">
          <div
            className={`flex h-full will-change-transform transition-transform duration-300 ${
              isDragging ? 'transition-none' : ''
            }`}
            style={{
              transform: `translateX(calc(-${slide * 100}% + ${dragPx}px))`,
            }}
          >
            <div className="h-full w-full shrink-0 px-2">
              <ScoreSlide
                match={match}
                tourLine={tourLine}
                score1={score1}
                score2={score2}
                clockLabel={clockLabel}
                periodText={periodText}
                isLive={match.isLive}
                isFavorite={isFavorite}
                onToggleFavorite={() => toggleMatchFavorite(match.id)}
              />
            </div>
            <div className="h-full w-full shrink-0 px-2 pb-1">
              <HalvesSlide match={match} home={incidents.home} away={incidents.away} />
            </div>
            <div className="h-full w-full shrink-0 px-2 pb-1">
              <H2HSlide rows={h2h} isExpanded={isExpanded} setIsExpanded={setIsExpanded} />
            </div>
            <div className="h-full w-full shrink-0 px-2 pb-1">
              <StatsSlide
                match={match}
                stats={detailStats}
                isExpanded={isExpanded}
                setIsExpanded={setIsExpanded}
              />
            </div>
            <div className="h-full w-full shrink-0 px-2 pb-1">
              <TimelineSlide
                events={firstHalfEvents}
                isExpanded={isExpanded}
                setIsExpanded={setIsExpanded}
              />
            </div>
            <div className="h-full w-full shrink-0 px-2 pb-1">
              <StadiumSlide stadium={stadium} country={match.country} />
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex shrink-0 flex-col">
        <div className="flex items-center justify-center gap-1.5 pb-1" aria-label="Слайды виджета">
          {Array.from({ length: SLIDE_COUNT }, (_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => goSlide(index)}
              className={
                slide === index
                  ? 'h-1 w-3.5 rounded-full bg-emerald-500'
                  : 'h-1.5 w-1.5 rounded-full bg-white/40'
              }
              aria-label={`Слайд ${index + 1}`}
            />
          ))}
        </div>

        <div className="z-10 flex h-7 items-center justify-between border-t border-white/10 bg-black/40 px-3 text-[12px] text-zinc-200 backdrop-blur-md">
          <p className="min-w-0 truncate">{footerScore}</p>
          <p className="shrink-0 tabular-nums">
            {match.isLive ? `Прошло  ${clockPlain}` : `Начало  ${clockPlain}`}
          </p>
        </div>
      </div>

      {children}

      {menuOpen && (
        <SettingsSheet
          isFavorite={isFavorite}
          onClose={() => setMenuOpen(false)}
          onOpenStats={() => {
            setMenuOpen(false);
            setSlide(3);
            setIsExpanded(true);
          }}
          onToggleFavorite={() => toggleMatchFavorite(match.id)}
        />
      )}
    </div>
  );
}

function ExpandBtn({
  isExpanded,
  onClick,
}: {
  isExpanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-auto mt-1.5 flex h-6 shrink-0 items-center gap-1 rounded-full bg-white/10 px-4 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/20"
    >
      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      {isExpanded ? 'СВЕРНУТЬ' : 'РАЗВЕРНУТЬ'}
    </button>
  );
}

function ScoreSlide({
  match,
  tourLine,
  score1,
  score2,
  clockLabel,
  periodText,
  isLive,
  isFavorite,
  onToggleFavorite,
}: {
  match: MatchEvent;
  tourLine: string;
  score1: string | number;
  score2: string | number;
  clockLabel: string;
  periodText: string;
  isLive: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-white">
      <p className={`mb-0.5 text-center text-[11px] font-medium text-zinc-300 ${SLIDE1_SHADOW}`}>{tourLine}</p>
      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 px-2">
        <div className="flex min-w-0 items-center justify-end gap-1.5">
          <span className={`truncate text-[13px] font-bold text-white ${SLIDE1_SHADOW}`}>{match.team1}</span>
          <button type="button" onClick={onToggleFavorite} aria-label="В избранное">
            <Star className={`h-4 w-4 ${isFavorite ? 'fill-amber-300 text-amber-300' : 'text-zinc-400'} ${SLIDE1_SHADOW}`} />
          </button>
          <TeamLogo teamName={match.team1} logo={match.team1Logo} size="md" className="!h-9 !w-9 bg-white p-0.5" />
        </div>
        <p className={`px-3 text-[28px] font-black tracking-widest text-white tabular-nums drop-shadow-md ${SLIDE1_SHADOW}`}>
          {score1} : {score2}
        </p>
        <div className="flex min-w-0 items-center justify-start gap-1.5">
          <TeamLogo teamName={match.team2} logo={match.team2Logo} size="md" className="!h-9 !w-9 bg-white p-0.5" />
          <Star className={`h-4 w-4 text-zinc-500 ${SLIDE1_SHADOW}`} />
          <span className={`truncate text-[13px] font-bold text-white ${SLIDE1_SHADOW}`}>{match.team2}</span>
        </div>
      </div>
      <p className={`mt-1 text-center text-[10px] text-zinc-300 ${SLIDE1_SHADOW}`}>{isLive ? 'Прошло' : 'Начало'}</p>
      <div className="mx-auto my-0.5 inline-block rounded-md border border-white/15 bg-black/85 px-3 py-0.5 text-[14px] font-bold text-white tabular-nums shadow-lg">
        {clockLabel}
      </div>
      <p className={`text-center text-[10px] font-medium text-zinc-300 ${SLIDE1_SHADOW}`}>{periodText}</p>
    </div>
  );
}

function EventBadges({ red, yellow, corners }: { red: number; yellow: number; corners: number }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-[10px] text-zinc-300">
      <span className="inline-flex items-center gap-0.5">
        <span className="inline-block h-3 w-2 rounded-[1px] bg-red-600" />
        {red}
      </span>
      <span className="inline-flex items-center gap-0.5">
        <span className="inline-block h-3 w-2 rounded-[1px] bg-yellow-400" />
        {yellow}
      </span>
      <span className="inline-flex items-center gap-0.5">
        <span className="leading-none">◣</span>
        {corners}
      </span>
    </span>
  );
}

function HalvesSlide({
  match,
  home,
  away,
}: {
  match: MatchEvent;
  home: SideIncidents;
  away: SideIncidents;
}) {
  return (
    <div className={CAPSULE}>
      <div className="mb-1 grid grid-cols-[1fr_36px_36px] border-b border-white/10 pb-1 text-[11px] font-bold uppercase text-zinc-300">
        <span>Таймы</span>
        <span className="text-center">1</span>
        <span className="text-center">Итог</span>
      </div>
      <div className="grid grid-cols-[1fr_36px_36px] items-center py-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <TeamLogo teamName={match.team1} logo={match.team1Logo} size="xs" className="bg-white" />
          <EventBadges red={home.redFt} yellow={home.yellowFt} corners={home.cornersFt} />
          <span className="truncate text-[13px] font-bold text-white">{match.team1}</span>
        </div>
        <span className="text-center text-[13px] font-extrabold text-white tabular-nums">{home.goals1h}</span>
        <span className="text-center text-[13px] font-extrabold text-emerald-400 tabular-nums">{home.goalsFt}</span>
      </div>
      <div className="grid grid-cols-[1fr_36px_36px] items-center py-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <TeamLogo teamName={match.team2} logo={match.team2Logo} size="xs" className="bg-white" />
          <EventBadges red={away.redFt} yellow={away.yellowFt} corners={away.cornersFt} />
          <span className="truncate text-[13px] font-bold text-white">{match.team2}</span>
        </div>
        <span className="text-center text-[13px] font-extrabold text-white tabular-nums">{away.goals1h}</span>
        <span className="text-center text-[13px] font-extrabold text-emerald-400 tabular-nums">{away.goalsFt}</span>
      </div>
    </div>
  );
}

function H2HRow({ row }: { row: MatchH2HRow }) {
  return (
    <li className="grid grid-cols-[1fr_70px_1fr] items-center gap-1 border-b border-white/5 py-1 text-white last:border-0">
      <div className="flex min-w-0 items-center justify-end gap-1 text-right">
        <span className="truncate text-[13px] font-bold text-white">{row.leftName}</span>
        <TeamLogo teamName={row.leftName} logo={row.leftLogo} size="xs" className="!h-4 !w-4 bg-white p-0" />
      </div>
      <div className="flex flex-col items-center justify-center">
        <span className="text-[13px] font-extrabold leading-tight text-white">
          {row.score.replace(':', ' : ')}
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium leading-none text-zinc-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {row.date}
        </span>
      </div>
      <div className="flex min-w-0 items-center justify-start gap-1 text-left">
        <TeamLogo teamName={row.rightName} logo={row.rightLogo} size="xs" className="!h-4 !w-4 bg-white p-0" />
        <span className="truncate text-[13px] font-bold text-white">{row.rightName}</span>
      </div>
    </li>
  );
}

function H2HSlide({
  rows,
  isExpanded,
  setIsExpanded,
}: {
  rows: MatchH2HRow[];
  isExpanded: boolean;
  setIsExpanded: (value: boolean) => void;
}) {
  return (
    <div className={CAPSULE}>
      <p className="mb-1.5 text-center text-[11px] font-bold uppercase text-zinc-300">Предыдущие встречи</p>
      <ul
        className={
          isExpanded ? 'max-h-none overflow-visible' : 'max-h-[120px] overflow-hidden'
        }
      >
        {rows.map((row, index) => (
          <H2HRow key={`${row.date}-${index}`} row={row} />
        ))}
      </ul>
      <ExpandBtn isExpanded={isExpanded} onClick={() => setIsExpanded(!isExpanded)} />
    </div>
  );
}

function StatBarRow({ row }: { row: DetailStatRow }) {
  const total = row.home + row.away || 1;
  const homePct = Math.max(6, Math.round((row.home / total) * 100));
  const awayPct = Math.max(6, 100 - homePct);

  return (
    <div className="mb-1.5 last:mb-0">
      <div className="mb-0.5 flex justify-between text-[11px]">
        <span className="text-[13px] font-extrabold tabular-nums text-white">{formatStatValue(row.home)}</span>
        <span className="font-medium text-zinc-300">{row.label}</span>
        <span className="text-[13px] font-extrabold tabular-nums text-white">{formatStatValue(row.away)}</span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-zinc-700">
        <div className="h-full bg-emerald-500" style={{ width: `${homePct}%` }} />
        <div className="h-full bg-zinc-500" style={{ width: `${awayPct}%` }} />
      </div>
    </div>
  );
}

function StatsSlide({
  match,
  stats,
  isExpanded,
  setIsExpanded,
}: {
  match: MatchEvent;
  stats: DetailStatRow[];
  isExpanded: boolean;
  setIsExpanded: (value: boolean) => void;
}) {
  return (
    <div className={CAPSULE}>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <TeamLogo teamName={match.team1} logo={match.team1Logo} size="sm" className="bg-white" />
        <TeamLogo teamName={match.team2} logo={match.team2Logo} size="sm" className="bg-white" />
      </div>
      <div
        className={`px-0.5 ${
          isExpanded ? 'max-h-none overflow-visible' : 'max-h-[120px] overflow-hidden'
        }`}
      >
        {stats.map((row) => (
          <StatBarRow key={row.label} row={row} />
        ))}
      </div>
      <ExpandBtn isExpanded={isExpanded} onClick={() => setIsExpanded(!isExpanded)} />
    </div>
  );
}

function TimelineSlide({
  events,
  isExpanded,
  setIsExpanded,
}: {
  events: TimelineEvent[];
  isExpanded: boolean;
  setIsExpanded: (value: boolean) => void;
}) {
  const rows = events.filter((row) => row.kind !== 'period');
  return (
    <div className={CAPSULE}>
      <p className="mb-1 text-center text-[11px] font-bold uppercase text-zinc-300">1-й тайм</p>
      <div
        className={`relative mx-auto w-full max-w-[280px] ${
          isExpanded ? 'max-h-none overflow-visible' : 'max-h-[120px] overflow-hidden'
        }`}
      >
        <div className="absolute bottom-1 left-1/2 top-1 w-0.5 -translate-x-1/2 bg-white/20" />
        <ul className="relative">
          {rows.map((row) => (
            <li key={row.id} className="relative flex items-center justify-center py-0.5">
              {row.side === 'home' && row.label && (
                <span className="absolute right-[calc(50%+22px)] max-w-[100px] truncate text-right text-[11px] font-medium text-zinc-300">
                  {row.label}
                </span>
              )}
              {(row.kind === 'red' || row.kind === 'yellow') && (
                <Flag
                  className={`absolute h-3.5 w-3.5 ${
                    row.side === 'home' ? 'left-[calc(50%-26px)]' : 'left-[calc(50%+12px)]'
                  } ${row.kind === 'red' ? 'fill-red-500 text-red-500' : 'fill-yellow-400 text-yellow-400'}`}
                />
              )}
              <span className="relative z-10 mx-auto my-1 flex h-5 w-7 items-center justify-center rounded-full border border-white/20 bg-black/90 text-[10px] font-bold text-white">
                {row.minute.replace("'", '')}'
              </span>
              {row.side === 'away' && row.label && (
                <span className="absolute left-[calc(50%+22px)] max-w-[100px] truncate text-left text-[11px] font-medium text-zinc-300">
                  {row.label}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <ExpandBtn isExpanded={isExpanded} onClick={() => setIsExpanded(!isExpanded)} />
    </div>
  );
}

function StadiumSlide({
  stadium,
  country,
}: {
  stadium: { name: string; city: string; country: string };
  country: string;
}) {
  const city = stadium.city || country || '—';
  return (
    <div className={CAPSULE}>
      <div className="grid h-full grid-cols-[100px_1fr] items-center gap-3">
        <div className="relative overflow-hidden rounded-lg bg-white p-0.5">
          <div
            className="aspect-[4/3] rounded-md bg-cover bg-center"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=240&q=60')",
            }}
          />
          <span className="absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/75 text-white">
            <Search className="h-3 w-3" />
          </span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold text-white">{stadium.name}</p>
          <div className="mt-1 space-y-0.5 text-[11px] font-medium text-zinc-300">
            <p className="truncate">Адрес: {city}</p>
            <p className="truncate">Город: {city}</p>
            <p className="truncate">Индекс: —</p>
            <p className="truncate">Телефон: —</p>
            <p className="truncate">Веб-сайт: —</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsSheet({
  isFavorite,
  onClose,
  onOpenStats,
  onToggleFavorite,
}: {
  isFavorite: boolean;
  onClose: () => void;
  onOpenStats: () => void;
  onToggleFavorite: () => void;
}) {
  const items = [
    { key: 'stats', icon: Expand, label: 'Статистика', onClick: onOpenStats },
    { key: 'markets', icon: Settings2, label: 'Настройки маркетов', onClick: onClose },
    { key: 'expand', icon: Expand, label: 'Развернуть все маркеты', onClick: onClose },
    {
      key: 'fav',
      icon: Star,
      label: isFavorite ? 'Убрать из избранного' : 'Добавить в избранное',
      onClick: () => {
        onToggleFavorite();
        onClose();
      },
    },
    { key: 'bell', icon: Bell, label: 'Уведомления', onClick: onClose },
  ] as const;

  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-black/50" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl bg-[#121a24] px-4 pb-28 pt-3 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25" />
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="text-[15px] font-semibold">Настройки</h3>
          <button type="button" onClick={onClose} className="p-1 text-white/70" aria-label="Закрыть">
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={item.onClick}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] font-semibold hover:bg-white/5"
              >
                <item.icon
                  className={`h-5 w-5 ${item.key === 'fav' && isFavorite ? 'fill-amber-300 text-amber-300' : 'text-white/80'}`}
                />
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
