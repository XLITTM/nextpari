import { useState, type MouseEvent } from 'react';
import { useBetSlip } from '@/BetSlipContext';
import { useOddInteraction } from '@/hooks/useOddInteraction';
import { oddsFlashButtonClass, oddsFlashTextClass, useOddsFlash } from '@/hooks/useOddsFlash';
import { betsapiDetailLines, betsapiDetailTabs, footballPriceNote, type BetsapiDetailLine } from '@/lib/footballFeed';
import { clickableCardSelection } from '@/lib/sportsSelection';
import type { BetSelection, MatchEvent } from '@/types';

export function BetsapiMarkets({ match }: { match: MatchEvent }) {
  const lines = betsapiDetailLines(match);
  const tabs = betsapiDetailTabs(lines);
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>('all');
  const activeTab = tabs.some((item) => item.id === tab) ? tab : 'all';
  const visible = lines.filter((line) => activeTab === 'all' || line.tab === activeTab);
  const note = footballPriceNote(match.priceState, visible.length > 0);

  return (
    <div className="relative z-10 -mt-4 space-y-2 rounded-t-3xl bg-[#F5F5F5] px-2 pb-24 pt-3 shadow-[0_-8px_20px_rgba(0,0,0,0.12)]">
      {tabs.length > 1 && (
        <div className="flex gap-1 overflow-x-auto px-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                activeTab === item.id ? 'bg-[#22C55E] text-white' : 'bg-white text-[#1A1A1A]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {visible.map((line) => (
        <LineCard key={line.id} line={line} match={match} />
      ))}
      {!visible.length && (
        <p className="py-16 text-center text-sm font-semibold text-[#666666]">
          {note ?? 'Коэффициенты не опубликованы'}
        </p>
      )}
      {visible.length > 0 && note && (
        <p className="px-1 pb-2 text-center text-xs font-semibold text-[#666666]">{note}</p>
      )}
    </div>
  );
}

function LineCard({ line, match }: { line: BetsapiDetailLine; match: MatchEvent }) {
  return (
    <section className="rounded-xl bg-white p-2">
      <h3 className="px-1 pb-2 text-sm font-semibold text-[#1A1A1A]">{line.title}</h3>
      <div className={`grid gap-1.5 ${line.outcomes.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {line.outcomes.map((item) => {
          const fromQuote = item.selection || line.tab !== 'main'
            ? null
            : clickableCardSelection(match, item.label, '1X2', item.odds);
          const selection = item.selection ?? fromQuote?.selection;
          const locked = Boolean(item.locked) || (fromQuote ? fromQuote.locked || item.odds <= 1 : !selection || item.odds <= 1);
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
    </section>
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
