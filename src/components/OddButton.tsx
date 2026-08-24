import type { BetSelection } from '../types';
import { useBetSlip } from '../BetSlipContext';
import { useOddInteraction } from '../hooks/useOddInteraction';
import { oddsFlashButtonClass, oddsFlashTextClass, useOddsFlash, type OddsFlash } from '../hooks/useOddsFlash';

export function OddsFlashValue({
  odds,
  flash,
  className = '',
}: {
  odds: number;
  flash: OddsFlash;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-0.5 tabular-nums ${className}`}>
      {flash === 'up' && <span className="text-[10px] font-black leading-none">▲</span>}
      {flash === 'down' && <span className="text-[10px] font-black leading-none">▼</span>}
      {odds.toFixed(2)}
    </span>
  );
}

interface OddButtonProps {
  label: string;
  odds: number;
  selection: BetSelection;
  onClick?: () => void;
  active?: boolean;
  size?: 'sm' | 'md' | 'lg';
  layout?: 'row' | 'column';
}

export function OddButton({ label, odds, selection, onClick, active, size = 'md', layout = 'row' }: OddButtonProps) {
  const flash = useOddsFlash(odds);
  const { isSelectionActive } = useBetSlip();
  const handlers = useOddInteraction(selection);
  const isActive = active ?? isSelectionActive(selection.matchId, selection.outcome);
  const flashBtn = oddsFlashButtonClass(flash);
  const flashText = oddsFlashTextClass(flash);

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base',
  };

  const surface = flashBtn
    ? flashBtn
    : isActive
      ? 'bg-brand-600 border-brand-600 shadow-sm'
      : layout === 'column'
        ? 'bg-gray-50 dark:bg-[#1e293b] border-gray-200 dark:border-gray-600 hover:border-brand-600'
        : 'bg-white dark:bg-[#0f172a] border-gray-200 dark:border-gray-600 hover:border-brand-600';

  const text = flashText ? flashText : isActive ? 'text-white' : 'text-gray-900 dark:text-white';
  const eventHandlers = onClick
    ? {
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          onClick();
        },
      }
    : handlers;

  if (layout === 'column') {
    return (
      <button
        {...eventHandlers}
        className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl border active:scale-95 transition-[background-color,border-color,box-shadow,color] duration-500 ${sizeClasses[size]} ${surface}`}
      >
        <span className={`text-xs font-bold transition-colors duration-500 ${text}`}>{label}</span>
        <OddsFlashValue odds={odds} flash={flash} className={`font-extrabold transition-colors duration-500 ${text}`} />
      </button>
    );
  }

  return (
    <button
      {...eventHandlers}
      className={`flex items-center justify-between rounded-2xl border active:scale-95 select-none transition-[background-color,border-color,box-shadow,color] duration-500 ${sizeClasses[size]} ${surface}`}
    >
      <span className={`text-xs font-bold transition-colors duration-500 ${text}`}>{label}</span>
      <OddsFlashValue odds={odds} flash={flash} className={`font-extrabold transition-colors duration-500 ${text}`} />
    </button>
  );
}
