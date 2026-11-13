import { useEffect, useState, type MouseEvent } from 'react';
import { useBetSlip } from '@/BetSlipContext';
import { useOddInteraction } from '@/hooks/useOddInteraction';
import { oddsFlashButtonClass, oddsFlashTextClass, useOddsFlash } from '@/hooks/useOddsFlash';
import { betsapiDetailLines, betsapiDetailTabs, type BetsapiDetailLine } from '@/lib/footballFeed';
import { clickableCardSelection } from '@/lib/sportsSelection';
import type { BetSelection, MatchEvent } from '@/types';

export function BetsapiMarkets({ match }: { match: MatchEvent }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const lines = betsapiDetailLines(match, now);
  const readOnly = match.id.startsWith('betsapi:') || match.sport === 'esports';
  const tabs = betsapiDetailTabs(lines);
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>('all');
  const activeTab = tabs.some((item) => item.id === tab) ? tab : 'all';
  const visible = lines.filter((line) => activeTab === 'all' || line.tab === activeTab);

  return (
    <div className="relative z-10 -mt-4 space-y-2 rounded-t-3xl bg-[#F5F5F5] dark:bg-gray-900 px-2 pb-24 pt-3 shadow-[0_-8px_20px_rgba(0,0,0,0.12)]">
      {tabs.length > 1 && (
        <div className="flex gap-1 overflow-x-auto px-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`shrink-0 rounded-full border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-xs font-bold ${
                activeTab === item.id ? 'bg-[#22C55E] text-white' : 'bg-white text-[#1A1A1A] dark:bg-gray-800 dark:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {visible.map((line) => (
        <LineCard key={line.id} line={line} match={match} readOnly={readOnly} />
      ))}
      {!visible.length && (
        <p className="py-16 text-center text-sm font-semibold text-[#666666]">
          Рынки пока недоступны
        </p>
      )}
    </div>
  );
}

function LineCard({ line, match, readOnly }: { line: BetsapiDetailLine; match: MatchEvent; readOnly: boolean }) {
  return (
    <details open={line.tab === 'main'} className="rounded-xl border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800">
      <summary className="cursor-pointer px-1 pb-2 text-sm font-semibold text-[#1A1A1A] dark:text-white">{line.title}</summary>
      <div className={`grid gap-1.5 ${line.outcomes.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {line.outcomes.map((item) => {
          const fromQuote = item.selection || line.tab !== 'main'
            ? null
            : clickableCardSelection(match, item.label, '1X2', item.odds);
          const selection = item.selection ?? fromQuote?.selection;
          const locked = Boolean(item.locked) || (fromQuote ? fromQuote.locked || item.odds <= 1 : !selection || item.odds <= 1);
          if (readOnly) return (
            <div key={item.label} className="flex justify-between rounded-lg border border-gray-200 p-2 text-xs dark:border-gray-600 dark:text-white">
              <span>{item.label}</span><strong>{item.odds > 1 ? item.odds : '—'}</strong>
            </div>
          );
          if (!selection) return null;
          return (
            <PriceButton
              key={`${line.id}-${item.label}`}
              label={item.label}
              odds={item.odds}
              locked={locked}
              selection={selection}
              activeKey={match.id}
            />
          );
        })}
      </div>
    </details>
  );
}

function PriceButton({
  label,
  odds,
  locked,
  selection,
  activeKey,
}: {
  label: string;
  odds: number;
  locked: boolean;
  selection: BetSelection;
  activeKey: string;
}) {
  const handlers = useOddInteraction(selection);
  const flash = useOddsFlash(odds);
  const { isSelectionActive } = useBetSlip();
  const active = isSelectionActive(activeKey, label, selection.market);
  const canBet = !locked && odds > 1;
  const flashBtn = oddsFlashButtonClass(flash);
  const flashText = oddsFlashTextClass(flash);
  return (
    <button
      type="button"
      {...(canBet ? handlers : { onClick: (event: MouseEvent) => event.stopPropagation() })}
      disabled={!canBet}
      aria-disabled={!canBet}
      className={`flex items-center justify-between rounded-xl border px-2.5 py-2 text-sm font-bold ${
        !canBet
          ? 'border-[#E5E5E5] bg-[#F5F5F5] text-[#888888]'
          : flashBtn
            ? flashBtn
            : active
              ? 'border-[#22C55E] bg-[#22C55E] text-white'
              : 'border-[#E5E5E5] bg-white text-[#1A1A1A]'
      }`}
    >
      <span className={flashText ?? ''}>{label}</span>
      <span>{canBet ? odds.toFixed(2) : '—'}</span>
    </button>
  );
}
