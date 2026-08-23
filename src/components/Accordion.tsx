import { useState } from 'react';
import { ChevronDown, Pin } from 'lucide-react';
import type { MarketGroup, BetSelection, SportId, MarketLayout } from '../types';
import { useBetSlip } from '../BetSlipContext';
import { useOddInteraction } from '../hooks/useOddInteraction';
import { OddsFlashValue } from './OddButton';
import { oddsFlashButtonClass, oddsFlashTextClass, useOddsFlash } from '../hooks/useOddsFlash';

interface AccordionProps {
  group: MarketGroup;
  matchId: string;
  matchLabel: string;
  sport?: SportId;
  country?: string;
  league?: string;
  isLive?: boolean;
  startTime?: number;
  liveStatus?: string;
  activeOutcome: (outcome: string) => boolean;
  onSelect: (selection: BetSelection) => void;
  defaultOpen?: boolean;
}

export function Accordion({
  group,
  matchId,
  matchLabel,
  sport,
  country,
  league,
  isLive,
  startTime,
  liveStatus,
  activeOutcome,
  defaultOpen,
}: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [pinned, setPinned] = useState(false);
  const layout: MarketLayout = group.layout ?? 'grid';

  const teams = matchLabel.split(/\s+[—–-]\s+/);
  const buildSelection = (outcome: string, odds: number): BetSelection => ({
    id: `${matchId}-${group.id}-${outcome}`,
    matchId,
    matchLabel,
    market: group.name,
    outcome,
    odds,
    homeTeam: teams[0]?.trim(),
    awayTeam: teams[1]?.trim(),
    sport,
    country,
    league,
    isLive,
    startTime,
    liveStatus,
  });

  return (
    <div className="bg-white dark:bg-[#1e293b] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
      <div
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3.5 py-3 cursor-pointer select-none"
      >
        <span className="text-sm font-bold text-gray-900 dark:text-white text-left leading-tight">{group.name}</span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setPinned(!pinned); }}
            className="w-6 h-6 flex items-center justify-center active:scale-90 transition-transform"
          >
            <Pin className={`w-4 h-4 transition-colors ${pinned ? 'fill-brand-600 text-brand-600 dark:text-brand-400' : 'text-gray-400 dark:text-gray-400'}`} />
          </button>
          <ChevronDown
            className={`w-4 h-4 text-gray-600 dark:text-gray-200 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </div>
      <div className={open ? 'block' : 'hidden'}>
        <div className="p-3 pt-0">
          {layout === 'grid' && <GridLayout group={group} buildSelection={buildSelection} activeOutcome={activeOutcome} />}
          {layout === 'table' && <TableLayout group={group} buildSelection={buildSelection} activeOutcome={activeOutcome} />}
          {layout === 'combo' && <ComboLayout group={group} buildSelection={buildSelection} activeOutcome={activeOutcome} />}
        </div>
      </div>
    </div>
  );
}

function GridLayout({
  group,
  buildSelection,
  activeOutcome,
}: {
  group: MarketGroup;
  buildSelection: (outcome: string, odds: number) => BetSelection;
  activeOutcome: (outcome: string) => boolean;
}) {
  const cols = group.outcomes.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
  return (
    <div className={`grid ${cols} gap-2`}>
      {group.outcomes.map((o) => (
        <AccordionOddButton
          key={o.label}
          selection={buildSelection(o.label, o.odds)}
          label={o.label}
          odds={o.odds}
          isActive={activeOutcome(o.label)}
        />
      ))}
    </div>
  );
}

function TableLayout({
  group,
  buildSelection,
  activeOutcome,
}: {
  group: MarketGroup;
  buildSelection: (outcome: string, odds: number) => BetSelection;
  activeOutcome: (outcome: string) => boolean;
}) {
  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
      {group.outcomes.map((o, i) => {
        const isOdd = i % 2 === 1;
        return (
          <AccordionOddButton
            key={o.label}
            selection={buildSelection(o.label, o.odds)}
            label={o.label}
            odds={o.odds}
            isActive={activeOutcome(o.label)}
            variant="row"
            bgClass={isOdd ? 'bg-gray-50 dark:bg-gray-700/30' : ''}
          />
        );
      })}
    </div>
  );
}

function ComboLayout({
  group,
  buildSelection,
  activeOutcome,
}: {
  group: MarketGroup;
  buildSelection: (outcome: string, odds: number) => BetSelection;
  activeOutcome: (outcome: string) => boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {group.outcomes.map((o) => (
        <AccordionOddButton
          key={o.label}
          selection={buildSelection(o.label, o.odds)}
          label={o.label}
          odds={o.odds}
          isActive={activeOutcome(o.label)}
          variant="combo"
        />
      ))}
    </div>
  );
}

function AccordionOddButton({
  selection,
  label,
  odds,
  isActive,
  variant = 'default',
  bgClass = '',
}: {
  selection: BetSelection;
  label: string;
  odds: number;
  isActive: boolean;
  variant?: 'default' | 'row' | 'combo';
  bgClass?: string;
}) {
  const { selections } = useBetSlip();
  const handlers = useOddInteraction(selection);
  const flash = useOddsFlash(odds);
  const flashBtn = oddsFlashButtonClass(flash);
  const flashText = oddsFlashTextClass(flash);
  const selected = selections.some((row) => row.id === selection.id) || isActive;
  const text = flashText ? flashText : selected ? 'text-white' : 'text-gray-900 dark:text-white';

  if (variant === 'row') {
    return (
      <button
        {...handlers}
        className={`flex items-center justify-between w-full px-3 py-2.5 border-b border-gray-200 dark:border-gray-600 last:border-b-0 transition-all duration-500 active:scale-[0.98] select-none ${bgClass} ${
          flash === 'up'
            ? 'bg-[rgba(16,185,129,0.12)]'
            : flash === 'down'
              ? 'bg-[rgba(239,68,68,0.12)]'
            : selected
                ? 'bg-brand-600/10 dark:bg-brand-600/20'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'
        }`}
      >
        <span
          className={`text-sm font-bold transition-colors duration-500 ${
            flashText ? flashText : selected ? 'text-brand-600 dark:text-brand-400' : 'text-gray-700 dark:text-gray-200'
          }`}
        >
          {label}
        </span>
        <OddsFlashValue
          odds={odds}
          flash={flash}
          className={`text-sm font-extrabold px-2.5 py-1 rounded-md transition-[background-color,color,border-color] duration-500 border ${
            flashBtn
              ? flashBtn
              : selected
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white border-transparent'
          } ${flashText}`}
        />
      </button>
    );
  }

  if (variant === 'combo') {
    return (
      <button
        {...handlers}
        className={`flex flex-col items-center justify-center gap-0.5 w-full px-2.5 py-3 rounded-lg border active:scale-95 select-none transition-[background-color,border-color,box-shadow,color] duration-500 ${
          flashBtn
            ? flashBtn
            : selected
              ? 'bg-brand-600 border-brand-500 shadow-sm'
              : 'bg-gray-100 dark:bg-[#334155] border-gray-200 dark:border-gray-600 hover:border-brand-600'
        }`}
      >
        <span className={`text-xs font-bold text-center leading-tight transition-colors duration-500 ${text}`}>{label}</span>
        <OddsFlashValue odds={odds} flash={flash} className={`text-base font-extrabold transition-colors duration-500 ${text}`} />
      </button>
    );
  }

  return (
    <button
      {...handlers}
      className={`flex flex-row justify-between items-center w-full px-3 py-2.5 rounded-lg border active:scale-95 select-none transition-[background-color,border-color,box-shadow,color] duration-500 ${
        flashBtn
          ? flashBtn
            : selected
            ? 'bg-brand-600 border-brand-500'
            : 'bg-gray-100 dark:bg-[#1e293b] border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 hover:border-brand-600'
      }`}
    >
      <span className={`text-sm font-bold transition-colors duration-500 ${text}`}>{label}</span>
      <OddsFlashValue odds={odds} flash={flash} className={`text-base font-bold transition-colors duration-500 ${text}`} />
    </button>
  );
}
