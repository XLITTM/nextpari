import { useState, type MouseEvent } from 'react';
import { useBetSlip } from '@/BetSlipContext';
import { useOddInteraction } from '@/hooks/useOddInteraction';
import { oddsFlashButtonClass, oddsFlashTextClass, useOddsFlash } from '@/hooks/useOddsFlash';
import { extraMarketRows, mainOutcomeButtons } from '@/lib/cardOdds';
import { footballPriceNote } from '@/lib/footballFeed';
import { clickableCardSelection } from '@/lib/sportsSelection';
import type { BetSelection, MatchEvent } from '@/types';

type DetailTab = 'all' | 'main' | 'totals' | 'handicaps';

const TABS: { id: DetailTab; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'main', label: '1X2' },
  { id: 'totals', label: 'Тоталы' },
  { id: 'handicaps', label: 'Форы' },
];

export function BetsapiMarkets({ match }: { match: MatchEvent }) {
  const [tab, setTab] = useState<DetailTab>('all');
  const oneXtwo = mainOutcomeButtons(match);
  const groups = extraMarketRows(match).filter((group) => {
    if (tab === 'totals') return /тотал|under\/over|total|over\/under/i.test(group.name);
    if (tab === 'handicaps') return /фора|handicap/i.test(group.name);
    if (tab === 'main') return false;
    return true;
  });
  const showMain = tab === 'all' || tab === 'main';
  const mainOpen = oneXtwo.some((item) => item.odds > 1);
  const hasRows = (showMain && mainOpen) || groups.length > 0;
  const note = footballPriceNote(match.priceState, hasRows);

  return (
    <div className="space-y-2 px-2 py-2">
      <div className="flex gap-1 overflow-x-auto">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
              tab === item.id ? 'bg-[#22C55E] text-white' : 'bg-white text-[#1A1A1A]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {showMain && (
        <section className="rounded-xl bg-white p-2">
          <h3 className="px-1 pb-2 text-sm font-semibold text-[#1A1A1A]">1X2</h3>
          <div className="grid grid-cols-3 gap-1.5">
            {oneXtwo.map((item) => {
              const clickable = clickableCardSelection(match, item.key, '1X2', item.odds);
              return (
                <PriceButton
                  key={item.key}
                  label={item.key}
                  odds={item.odds}
                  locked={clickable.locked || item.locked}
                  selection={clickable.selection}
                  activeKey={match.id}
                />
              );
            })}
          </div>
        </section>
      )}
      {groups.map((group) => (
        <section key={group.name} className="rounded-xl bg-white p-2">
          <h3 className="px-1 pb-2 text-sm font-semibold text-[#1A1A1A]">{group.name}</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {group.outcomes.map((item) => {
              const clickable = item.selection?.provider === 'betsapi'
                ? { selection: item.selection, locked: !(item.odds > 1) }
                : clickableCardSelection(match, item.label, group.name, item.odds);
              return (
                <PriceButton
                  key={`${group.name}-${item.label}`}
                  label={item.label}
                  odds={item.odds}
                  locked={clickable.locked}
                  selection={clickable.selection}
                  activeKey={match.id}
                />
              );
            })}
          </div>
        </section>
      ))}
      {!hasRows && (
        <p className="py-16 text-center text-sm font-semibold text-[#666666]">
          {note ?? 'Нет рынков по этому фильтру'}
        </p>
      )}
      {hasRows && note && (
        <p className="px-1 text-center text-xs font-semibold text-[#666666]">{note}</p>
      )}
    </div>
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
