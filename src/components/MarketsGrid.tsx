import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Pin } from 'lucide-react';
import { useBetSlip } from '@/BetSlipContext';
import { useOddInteraction } from '@/hooks/useOddInteraction';
import { useOddsFlash } from '@/hooks/useOddsFlash';
import { formatOdds } from '@/lib/matchOdds';
import { outcomeLabel, type ParsedMarket, type ParsedMarketEntry } from '@/lib/odds-parser';
import { useSportsStore } from '@/stores/sportsStore';
import type { BetSelection, MatchEvent, SportId } from '@/types';

type MarketTab = 'all' | 'main' | 'totals' | 'handicaps' | 'goals' | 'corners' | '1st-half' | '2nd-half' | 'sets' | 'games' | 'quarters' | 'halves';

const FOOTBALL_TABS: { id: MarketTab; label: string }[] = [
  { id: 'main', label: 'Основная игра' },
  { id: '1st-half', label: '1-й тайм' },
  { id: '2nd-half', label: '2-й тайм' },
];

const TENNIS_TABS: { id: MarketTab; label: string }[] = [
  { id: 'all', label: 'Все рынки' },
  { id: 'main', label: 'Победитель' },
  { id: 'sets', label: 'Сеты' },
  { id: 'games', label: 'Геймы' },
];

const BASKETBALL_TABS: { id: MarketTab; label: string }[] = [
  { id: 'all', label: 'Все рынки' },
  { id: 'main', label: 'Победитель' },
  { id: 'totals', label: 'Тотал очков' },
  { id: 'quarters', label: 'Четверти' },
  { id: 'halves', label: 'Половины' },
];

const HOCKEY_TABS: { id: MarketTab; label: string }[] = [
  { id: 'all', label: 'Все рынки' },
  { id: 'main', label: 'Основная игра' },
  { id: 'totals', label: 'Тоталы' },
  { id: 'handicaps', label: 'Форы' },
];

const ESPORTS_TABS: { id: MarketTab; label: string }[] = [
  { id: 'all', label: 'Все рынки' },
  { id: 'main', label: 'Победитель' },
  { id: 'totals', label: 'Карты / раунды' },
];

function tabsForSport(sport: SportId | string): { id: MarketTab; label: string }[] {
  if (sport === 'tennis') return TENNIS_TABS;
  if (sport === 'basketball') return BASKETBALL_TABS;
  if (sport === 'hockey') return HOCKEY_TABS;
  if (sport === 'esports') return ESPORTS_TABS;
  return FOOTBALL_TABS;
}

const FOOTBALL_ONLY = /угл|corner|карточки|желт|оба забьют|точный счёт|1-й тайм|2-й тайм|тайм 1x2/;
const FOOTBALL_ONLY_IDS = new Set(['4', '5', '6', '7', '8', '13', '17']);

function isAllowedForSport(market: ParsedMarket, sport: SportId | string): boolean {
  const name = market.name.toLowerCase();
  if (sport === 'football' || sport === 'all' || !sport) return true;
  if (FOOTBALL_ONLY.test(name) || market.category === 'corners') return false;
  if (FOOTBALL_ONLY_IDS.has(market.marketId) && /^маркет\s+(4|5|6|7|8|13|17)$/i.test(name)) return false;
  if (sport === 'tennis') {
    return /победитель|сет|гейм|фора|тотал|маркет/i.test(name) || market.category === 'main' || market.category === 'specials' || market.category === 'quarter';
  }
  if (sport === 'basketball') {
    return /победитель|тотал|фора|четверт|половин|овертайм|маркет/i.test(name) || market.category === 'main' || market.category === 'half' || market.category === 'quarter' || market.category === 'specials';
  }
  return true;
}

interface DisplayOutcome {
  key: string;
  label: string;
  odds: number;
}

interface DisplayMarket {
  key: string;
  name: string;
  marketId: string;
  category: ParsedMarket['category'];
  lineCount: number;
  outcomes: DisplayOutcome[];
}

const CATEGORY_ORDER: Record<ParsedMarket['category'], number> = {
  main: 0,
  half: 1,
  quarter: 2,
  corners: 3,
  specials: 4,
};

const MAIN_ID_ORDER: Record<string, number> = { '1': 0, '2': 1, '3': 2 };

function uniqueLatestEntries(entries: ParsedMarketEntry[]): ParsedMarketEntry[] {
  const byLine = new Map<string, ParsedMarketEntry>();
  const chronological = [...entries].sort((a, b) => a.updatedAt - b.updatedAt);
  for (const entry of chronological) {
    if (!isOpenEntry(entry)) continue;
    const lineKey = entry.line ?? '__main__';
    byLine.set(lineKey, entry);
  }
  return [...byLine.values()].sort((a, b) => {
    const la = Number(a.line);
    const lb = Number(b.line);
    if (Number.isFinite(la) && Number.isFinite(lb)) return la - lb;
    return String(a.line ?? '').localeCompare(String(b.line ?? ''), 'ru');
  });
}

function isOpenEntry(entry: ParsedMarketEntry): boolean {
  return entry.outcomes.some((row) => row.odds >= 1.01);
}

function parseMatchMinute(...raw: Array<string | undefined>): number | null {
  for (const value of raw) {
    const text = value?.trim();
    if (!text) continue;
    if (/^\d{8,}$/.test(text) || Number(text) > 1_000_000_000) continue;
    const clock = text.match(/(\d{1,3}):(\d{2})/);
    if (clock) {
      const minutes = Number(clock[1]);
      const seconds = Number(clock[2]);
      if (Number.isFinite(minutes)) return minutes + (Number.isFinite(seconds) ? seconds / 60 : 0);
    }
    const withMark = text.match(/(\d{1,3})\s*(?:'|′|мин)/i);
    if (withMark) {
      const n = Number(withMark[1]);
      if (Number.isFinite(n) && n <= 150) return n;
    }
    if (/^\d{1,3}$/.test(text)) {
      const n = Number(text);
      if (Number.isFinite(n) && n <= 150) return n;
    }
  }
  return null;
}

function isMarketVisible(market: ParsedMarket, minute: number | null, sport: SportId | string): boolean {
  if (!isAllowedForSport(market, sport)) return false;
  if (sport !== 'football' && sport !== 'all') return true;
  if (minute == null) return true;
  if (minute > 45 && market.category === 'half') return false;
  if (minute > 90 && market.category === 'main') return false;
  return true;
}

function sortDisplayOutcomes(outcomes: DisplayOutcome[]): DisplayOutcome[] {
  return [...outcomes].sort((a, b) => outcomeRank(a.label) - outcomeRank(b.label));
}

function outcomeRank(label: string): number {
  const value = label.trim().toLowerCase();
  if (value === 'п1' || value.startsWith('п1 ') || value.startsWith('п1(')) return 0;
  if (value === 'x' || value.startsWith('ничья')) return 1;
  if (value === 'п2' || value.startsWith('п2 ') || value.startsWith('п2(')) return 2;
  if (value.startsWith('тб')) return 0;
  if (value.startsWith('тм')) return 1;
  return 50;
}

function toDisplayMarket(market: ParsedMarket): DisplayMarket | null {
  const unique = uniqueLatestEntries(market.entries).filter(isOpenEntry);
  if (!unique.length) return null;
  const isMoneyline = market.marketId === '1' || market.marketId === '8' || /1x2|победитель/i.test(market.name);
  const outcomes = unique.flatMap((entry) => {
    const rows = entry.outcomes.map((row) => ({
      key: `${entry.id}-${row.key}`,
      label: outcomeLabel(row.key, entry.line),
      odds: row.odds,
    }));
    return isMoneyline ? sortDisplayOutcomes(rows) : rows;
  });
  if (!outcomes.length) return null;
  return {
    key: market.key,
    name: market.name,
    marketId: market.marketId,
    category: market.category,
    lineCount: unique.length,
    outcomes: isMoneyline ? sortDisplayOutcomes(outcomes) : outcomes,
  };
}

function matchesTab(market: ParsedMarket, tab: MarketTab): boolean {
  const name = market.name.toLowerCase();
  if (tab === 'all') return true;
  if (tab === 'totals') return /тотал/.test(name) && !/гол|забьют|точный/i.test(name) || market.marketId === '3' || market.marketId === '6' || market.marketId === '9';
  if (tab === 'handicaps') return /фора/.test(name) || market.marketId === '2' || market.marketId === '5';
  if (tab === 'goals') return /голы|забьют|точный счёт|btts|both teams|индивидуальный тотал|team total/i.test(name) || market.marketId === 'btts';
  if (tab === 'corners') return market.category === 'corners' || /угл/.test(name);
  if (tab === '1st-half') return (market.category === 'half' || /1-й тайм|1st/.test(name)) && !/2-й|2nd/.test(name);
  if (tab === '2nd-half') return /2-й тайм|2nd/.test(name);
  if (tab === 'sets') return /сет/.test(name);
  if (tab === 'games') return /гейм/.test(name);
  if (tab === 'quarters') return market.category === 'quarter' || /четверт/.test(name);
  if (tab === 'halves') return /половин/.test(name) || (market.category === 'half' && !/1-й тайм|2-й тайм/.test(name));
  return (market.category === 'main' || /победитель|1x2/.test(name)) && !/тотал|фора|угл/.test(name);
}

function gridClass(market: DisplayMarket): string {
  const isMoneyline = market.marketId === '1' || market.marketId === '8' || /1x2|победитель/i.test(market.name);
  if (isMoneyline) return market.outcomes.length <= 2 ? 'grid-cols-2' : 'grid-cols-3';
  if (/фора|тотал|угл/i.test(market.name) || market.marketId === '2' || market.marketId === '3') {
    return 'grid-cols-2';
  }
  if (market.outcomes.length === 3) return 'grid-cols-3';
  return 'grid-cols-2';
}

export function MarketsGrid({ eventId, match }: { eventId: string; match: MatchEvent }) {
  const state = useSportsStore((s) => s.events[eventId]);
  const tabs = tabsForSport(match.sport);
  const [tab, setTab] = useState<MarketTab>(() => tabsForSport(match.sport)[0]?.id ?? 'main');
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const [pinned, setPinned] = useState<Set<string>>(() => new Set());
  const bootstrappedTab = useRef<MarketTab | null>(null);

  useEffect(() => {
    const allowed = tabsForSport(match.sport).some((item) => item.id === tab);
    if (!allowed) setTab(tabsForSport(match.sport)[0]?.id ?? 'main');
  }, [match.sport, tab]);

  const markets = useMemo(() => {
    const raw = state ? Object.values(state.markets) : [];
    const minute = parseMatchMinute(state?.event.time_str, state?.matchTime, match.liveStatus);
    const filtered = raw
      .filter((market) => isMarketVisible(market, minute, match.sport))
      .filter((market) => matchesTab(market, tab));
    const display = filtered
      .map(toDisplayMarket)
      .filter((row): row is DisplayMarket => Boolean(row))
      .map((row) => {
        if (match.sport !== 'tennis') return row;
        return {
          ...row,
          outcomes: row.outcomes.filter((item) => item.label !== 'X' && !/ничья/i.test(item.label)),
        };
      })
      .filter((row) => row.outcomes.length > 0);
    return display.sort((a, b) => {
      const ap = pinned.has(a.key) ? 0 : 1;
      const bp = pinned.has(b.key) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      const ca = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
      if (ca !== 0) return ca;
      const ia = MAIN_ID_ORDER[a.marketId] ?? 50;
      const ib = MAIN_ID_ORDER[b.marketId] ?? 50;
      if (ia !== ib) return ia - ib;
      return a.name.localeCompare(b.name, 'ru');
    });
  }, [match.liveStatus, match.sport, pinned, state, tab]);

  useEffect(() => {
    if (!markets.length) return;
    if (bootstrappedTab.current === tab) return;
    bootstrappedTab.current = tab;
    setOpenKeys(new Set(markets.slice(0, 2).map((row) => row.key)));
  }, [markets, tab]);

  const toggleOpen = (key: string) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const togglePin = (key: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!state) {
    return (
      <div className="relative z-10 -mt-4 rounded-t-3xl bg-white pb-24 pt-2 shadow-[0_-8px_20px_rgba(0,0,0,0.12)]">
        <div className="flex h-40 items-center justify-center text-sm text-[#666666]">Загрузка росписи...</div>
      </div>
    );
  }

  return (
    <div className="relative z-10 -mt-4 rounded-t-3xl bg-white pb-24 pt-2 shadow-[0_-8px_20px_rgba(0,0,0,0.12)]">
      <div className="mb-1 flex h-9 items-center gap-1.5 overflow-x-auto px-3 scrollbar-hide">
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`shrink-0 whitespace-nowrap rounded-full py-1.5 text-[13px] transition-colors ${
                active
                  ? 'bg-emerald-500 px-5 font-bold text-white shadow'
                  : 'bg-white px-4 font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-0 px-2">
        {markets.length === 0 ? (
          <p className="py-16 text-center text-sm font-semibold text-[#666666]">Нет рынков по этому фильтру</p>
        ) : (
          markets.map((market) => (
            <MarketAccordion
              key={market.key}
              market={market}
              match={match}
              eventId={eventId}
              open={openKeys.has(market.key) || pinned.has(market.key)}
              pinned={pinned.has(market.key)}
              onToggle={() => toggleOpen(market.key)}
              onPin={() => togglePin(market.key)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function MarketAccordion({
  market,
  match,
  eventId,
  open,
  pinned,
  onToggle,
  onPin,
}: {
  market: DisplayMarket;
  match: MatchEvent;
  eventId: string;
  open: boolean;
  pinned: boolean;
  onToggle: () => void;
  onPin: () => void;
}) {
  return (
    <div className="overflow-hidden bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-2.5 py-2 text-left"
      >
        <span className="min-w-0 text-[14px] font-semibold leading-tight text-[#1A1A1A]">
          {market.name}{' '}
          <span className="font-medium text-[#888888]">({market.lineCount})</span>
        </span>
        <div className="ml-2 flex shrink-0 items-center gap-1">
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onPin();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                onPin();
              }
            }}
            className="flex h-7 w-7 items-center justify-center"
          >
            <Pin className={`h-4 w-4 ${pinned ? 'fill-emerald-500 text-emerald-500' : 'text-emerald-500'}`} />
          </span>
          {open ? (
            <ChevronDown className="h-4 w-4 text-emerald-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-emerald-500" />
          )}
        </div>
      </button>
      {open && (
        <div className={`grid gap-1.5 px-2.5 pb-2 ${gridClass(market)}`}>
          {market.outcomes.map((outcome) => (
            <OutcomeButton
              key={outcome.key}
              eventId={eventId}
              match={match}
              marketName={market.name}
              label={outcome.label}
              odds={outcome.odds}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OutcomeButton({
  eventId,
  match,
  marketName,
  label,
  odds,
}: {
  eventId: string;
  match: MatchEvent;
  marketName: string;
  label: string;
  odds: number;
}) {
  const flash = useOddsFlash(odds);
  const { isSelectionActive } = useBetSlip();
  const selection: BetSelection = {
    id: `${eventId}-${marketName}-${label}`,
    matchId: eventId,
    matchLabel: `${match.team1} — ${match.team2}`,
    market: marketName,
    outcome: label,
    odds,
    homeTeam: match.team1,
    awayTeam: match.team2,
    sport: match.sport,
    country: match.country,
    league: match.league,
    isLive: match.isLive,
    startTime: match.startTime,
    liveStatus: match.liveStatus,
  };
  const handlers = useOddInteraction(selection);
  const active = isSelectionActive(eventId, label, marketName);
  const oddsColor = active
    ? 'text-white'
    : flash === 'up'
      ? 'text-[#16A34A]'
      : flash === 'down'
        ? 'text-[#DC2626]'
        : 'text-[#111827]';

  return (
    <button
      type="button"
      {...handlers}
      className={`flex min-h-[44px] items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left shadow-sm transition-[transform,background-color,border-color,box-shadow] duration-150 active:scale-[0.97] ${
        active
          ? 'border-[#16A34A] bg-[#22C55E] shadow-[0_4px_10px_rgba(34,197,94,0.28)]'
          : 'border-[#E5E7EB] bg-[#F3F4F6] hover:border-[#D1D5DB] hover:bg-white hover:shadow-md'
      }`}
    >
      <span
        className={`line-clamp-2 text-[12px] font-semibold leading-tight ${
          active ? 'text-white' : 'text-[#1F2937]'
        }`}
      >
        {label}
      </span>
      <span className={`shrink-0 text-[17px] font-extrabold tabular-nums ${oddsColor}`}>{formatOdds(odds)}</span>
    </button>
  );
}
