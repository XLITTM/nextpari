import { useEffect, useState } from 'react';
import { Bell, Star, ChevronRight, Play, Lock } from 'lucide-react';
import type { MatchEvent, BetSelection } from '../types';
import { useBetSlip } from '../BetSlipContext';
import { useOddInteraction } from '../hooks/useOddInteraction';
import { OddsFlashValue } from './OddButton';
import { oddsFlashButtonClass, oddsFlashTextClass, useOddsFlash } from '../hooks/useOddsFlash';
import { SportIcon } from './SportIcon';
import { TeamLogo } from './TeamLogo';
import { extraMarketRows, buildCardSelection, mainOutcomeButtons } from '../lib/cardOdds';

interface MatchCardProps {
  match: MatchEvent;
  onOpenMatch: (matchId: string) => void;
  carousel?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

function formatCardMinute(status?: string): string {
  const value = status?.trim() ?? '';
  if (!value) return '';
  if (/^\d{8,}$/.test(value)) return '';
  const cleaned = value.replace(/^●?\s*LIVE\s*/i, '').trim();
  if (!cleaned || /^\d{8,}$/.test(cleaned)) return '';
  if (/^\d{1,3}$/.test(cleaned)) return `${cleaned}'`;
  return cleaned;
}

export function MatchCard({ match, onOpenMatch, carousel, isFavorite = false, onToggleFavorite }: MatchCardProps) {
  const { isSelectionActive } = useBetSlip();
  const [scoreHighlight, setScoreHighlight] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const scoreKey =
    match.isLive && match.liveScore
      ? `${match.liveScore.team1}:${match.liveScore.team2}`
      : null;

  useEffect(() => {
    if (!scoreKey) return;
    setScoreHighlight(true);
    const timer = window.setTimeout(() => setScoreHighlight(false), 2000);
    return () => window.clearTimeout(timer);
  }, [scoreKey]);

  const formatDateTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);

    const isSameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();

    const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    if (isSameDay(d, now)) return `Сегодня, ${time}`;
    if (isSameDay(d, tomorrow)) return `Завтра, ${time}`;

    const day = d.getDate();
    const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    return `${day} ${months[d.getMonth()]}, ${time}`;
  };

  const outcomeButtons = mainOutcomeButtons(match);
  const liveMinute = formatCardMinute(match.liveStatus);
  const extraRows = extraMarketRows(match);
  const extraCount = Math.max(Number(match.extraMarkets) || 0, extraRows.length, 3);

  const buildSelection = (outcome: string, odds: number): BetSelection => ({
    id: `${match.id}-1X2-${outcome}`,
    matchId: match.id,
    matchLabel: `${match.team1} — ${match.team2}`,
    market: '1X2',
    outcome,
    odds,
    marketKey: '1x2',
    selectionKey: outcome === 'П1' ? 'p1' : outcome === 'П2' ? 'p2' : 'draw',
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
      className={`bg-gray-50 dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden active:scale-[0.99] transition-transform cursor-pointer ${
        carousel ? 'w-[85%] shrink-0' : 'w-full'
      }`}
      onClick={() => onOpenMatch(match.id)}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-200 min-w-0">
          <SportIcon sport={match.sport} className="w-6 h-6 text-[#4ade80] shrink-0 hover:scale-105 transition-transform" />
          <span className="truncate font-bold text-gray-900 dark:text-white">{match.league}</span>
          <span className="text-gray-600 dark:text-gray-300">•</span>
          <span className="truncate font-bold text-gray-700 dark:text-gray-200">{match.country}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            className="w-7 h-7 flex items-center justify-center text-gray-700 dark:text-gray-200 hover:text-brand-600 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <Bell className="w-4 h-4" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="w-7 h-7 flex items-center justify-center text-gray-700 dark:text-gray-200 hover:text-green-500 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite?.();
            }}
            aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
          >
            <Star
              className={`w-4 h-4 ${isFavorite ? 'fill-green-500 text-green-500' : ''}`}
              strokeWidth={2.2}
            />
          </button>
          {match.hasStream && (
            <button
              className="w-7 h-7 flex items-center justify-center text-brand-600"
              onClick={(e) => e.stopPropagation()}
            >
              <Play className="w-4 h-4" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      <div className="px-3 py-2">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0 text-right">
            <div className="flex items-center justify-end gap-2">
              <span className="text-sm font-extrabold text-gray-900 dark:text-white truncate">{match.team1}</span>
              <TeamLogo teamName={match.team1} logo={match.team1Logo} size="sm" />
            </div>
          </div>

          {match.isLive && match.liveScore ? (
            <span
              className={`font-bold text-xl transition-colors duration-300 tabular-nums shrink-0 ${
                scoreHighlight ? 'text-green-500' : 'text-gray-900'
              }`}
            >
              {match.liveScore.team1} : {match.liveScore.team2}
            </span>
          ) : (
            <div className="shrink-0 bg-gray-100 dark:bg-[#1e293b] rounded-lg px-2 py-1 border border-gray-200 dark:border-gray-600 flex flex-col items-center leading-tight">
              <span className="text-[10px] font-bold text-gray-700 dark:text-gray-200">{formatDateTime(match.startTime).split(', ')[0]}</span>
              <span className="text-xs font-extrabold text-gray-900 dark:text-white tabular-nums">{formatDateTime(match.startTime).split(', ')[1]}</span>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <TeamLogo teamName={match.team2} logo={match.team2Logo} size="sm" />
              <span className="text-sm font-extrabold text-gray-900 dark:text-white truncate">{match.team2}</span>
            </div>
          </div>
        </div>

        {match.isLive && (
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse-live" />
            <span className="text-xs text-red-500 font-semibold">LIVE</span>
            {liveMinute ? <span className="text-xs text-red-500 font-semibold">{liveMinute}</span> : null}
          </div>
        )}
      </div>

      <div className="px-3 pb-2">
        <div className="grid grid-cols-3 gap-1.5">
          {outcomeButtons.map((o) => (
            <MatchOddButton
              key={o.key}
              selection={buildSelection(o.key, o.odds)}
              label={o.key}
              odds={o.odds}
              locked={o.locked}
              isActive={isSelectionActive(match.id, o.key, '1X2')}
            />
          ))}
        </div>
        {extrasOpen && extraRows.map((row) => (
          <div key={row.name} className="mt-1.5">
            <div className="mb-1 text-[10px] font-bold text-gray-500 dark:text-gray-400">{row.name}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {row.outcomes.map((item) => (
                <MatchOddButton
                  key={`${row.name}-${item.label}`}
                  selection={buildCardSelection(match, item.label, item.odds, row.name)}
                  label={item.label}
                  odds={item.odds}
                  isActive={isSelectionActive(match.id, item.label, row.name)}
                />
              ))}
            </div>
          </div>
        ))}
        <button
          className="w-full flex items-center justify-between mt-2 text-xs text-gray-700 dark:text-gray-200 px-1 hover:text-brand-600 transition-colors font-bold"
          onClick={(e) => {
            e.stopPropagation();
            if (extraRows.length) {
              setExtrasOpen((open) => !open);
              return;
            }
            onOpenMatch(match.id);
          }}
        >
          <span className="font-bold">+{extraCount} рынков</span>
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${extrasOpen ? 'rotate-90' : ''}`} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

function MatchOddButton({
  selection,
  label,
  odds,
  isActive,
  locked = false,
}: {
  selection: BetSelection;
  label: string;
  odds: number;
  isActive: boolean;
  locked?: boolean;
}) {
  const handlers = useOddInteraction(selection);
  const flash = useOddsFlash(odds);
  const flashBtn = oddsFlashButtonClass(flash);
  const flashText = oddsFlashTextClass(flash);
  const canBet = !locked && odds > 1;

  return (
    <button
      {...(canBet ? handlers : { onClick: (e: React.MouseEvent) => e.stopPropagation() })}
      disabled={!canBet}
      className={`flex items-center justify-between px-2.5 py-1.5 rounded-2xl border select-none transition-[background-color,border-color,box-shadow,color] duration-500 ${
        !canBet
          ? 'bg-gray-100 dark:bg-[#0f172a] border-gray-200 dark:border-gray-700 opacity-80'
          : flashBtn
            ? flashBtn
            : isActive
              ? 'bg-brand-600 border-brand-600 shadow-sm'
              : 'bg-white dark:bg-[#0f172a] border-gray-200 dark:border-gray-600 hover:border-brand-600 active:scale-95'
      }`}
    >
      <span
        className={`text-xs font-bold transition-colors duration-500 ${
          flashText ? flashText : isActive && canBet ? 'text-white' : 'text-gray-900 dark:text-white'
        }`}
      >
        {label}
      </span>
      {locked || odds <= 1 ? (
        <Lock className="w-3.5 h-3.5 text-gray-400" strokeWidth={2.4} />
      ) : (
        <OddsFlashValue
          odds={odds}
          flash={flash}
          className={`text-sm font-extrabold transition-colors duration-500 ${
            flashText ? flashText : isActive ? 'text-white' : 'text-gray-900 dark:text-white'
          }`}
        />
      )}
    </button>
  );
}