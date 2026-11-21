import { useMemo, useState } from 'react';
import { ChevronDown, List, Pin, Search } from 'lucide-react';
import { handicapSides, layoutLinesFromGroups, marketAccordions, marketTabs, type LayoutLine, type LayoutOutcome, type MarketAccordion, type MarketTable } from '@/lib/marketLayout';
import type { MatchEvent } from '@/types';

export function OddsPapiMarketBoard({ match, startOpen = false }: { match: MatchEvent; startOpen?: boolean }) {
  const lines = useMemo(
    () => layoutLinesFromGroups(match.marketGroups ?? [], match.sport),
    [match.marketGroups, match.sport],
  );
  const tabs = marketTabs(lines, match.sport);
  const [mode, setMode] = useState<'all' | 'players' | 'popular'>('all');
  const [tab, setTab] = useState('main');
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState(false);
  const [pinned, setPinned] = useState<string[]>([]);
  const activeTab = mode === 'players'
    ? 'players'
    : mode === 'popular'
      ? 'popular'
      : (tabs.some((item) => item.id === tab) ? tab : tabs[0]?.id ?? 'main');
  const accordions = marketAccordions(lines, activeTab, query, match.sport)
    .sort((left, right) => Number(pinned.includes(right.id)) - Number(pinned.includes(left.id)));

  return (
    <div className="relative z-10 -mt-4 space-y-2 rounded-t-3xl bg-[#F5F5F5] px-2 pb-24 pt-3 shadow-[0_-8px_20px_rgba(0,0,0,0.12)] dark:bg-gray-900">
      <p className="px-2 py-1 text-sm text-gray-600 dark:text-gray-300">Приём ставок временно закрыт</p>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-white p-1 dark:bg-gray-800">
        {([
          ['all', 'Все маркеты'],
          ['players', 'Игроки'],
          ['popular', 'Популярные'],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setMode(id)} className={`rounded-lg px-2 py-1.5 text-xs font-bold ${mode === id ? 'bg-[#22C55E] text-white' : 'text-[#1A1A1A] dark:text-white'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
          <Search className="h-4 w-4 shrink-0 text-gray-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск подыгры"
            aria-label="Поиск подыгры"
            className="w-full bg-transparent text-sm text-[#1A1A1A] outline-none dark:text-white"
          />
        </div>
        <button type="button" onClick={() => setSheet(true)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-white" aria-label="Категории рынков">
          <List className="h-4 w-4" />
        </button>
      </div>
      {mode === 'all' && tabs.length > 0 && (
        <div className="flex gap-1 overflow-x-auto px-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`shrink-0 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-bold dark:border-gray-600 ${
                activeTab === item.id ? 'bg-[#22C55E] text-white' : 'bg-white text-[#1A1A1A] dark:bg-gray-800 dark:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {accordions.map((accordion) => (
        <details key={accordion.id} {...(pinned.includes(accordion.id) || startOpen ? { open: true } : {})} className="group rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <summary className="flex cursor-pointer list-none items-center gap-2 border-b border-transparent px-3 py-2 text-sm font-semibold text-[#1A1A1A] group-open:border-gray-100 dark:text-white dark:group-open:border-gray-700">
            <span className="min-w-0 flex-1 truncate">{accordion.title}</span>
            <span className="text-xs font-medium text-gray-500">{accordion.lines.reduce((sum, line) => sum + line.outcomes.length, 0)}</span>
            <button
              type="button"
              aria-label="Закрепить рынок"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setPinned((current) => current.includes(accordion.id) ? current.filter((id) => id !== accordion.id) : [accordion.id, ...current]);
              }}
              className="text-gray-400"
            >
              <Pin className={`h-3.5 w-3.5 ${pinned.includes(accordion.id) ? 'fill-[#22C55E] text-[#22C55E]' : ''}`} />
            </button>
            <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-2 py-2" data-table={accordion.table}>
            <MarketTableView accordion={accordion} />
          </div>
        </details>
      ))}
      {!accordions.length && <p className="py-16 text-center text-sm font-semibold text-[#666666]">Рынки пока недоступны</p>}
      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setSheet(false)}>
          <div className="max-h-[70vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 dark:bg-gray-900" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" />
            <p className="mb-3 text-sm font-bold text-[#1A1A1A] dark:text-white">Поиск подыгры</p>
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => { setMode('all'); setTab(item.id); setSheet(false); }}
                className="flex w-full items-center justify-between border-b border-gray-100 py-3 text-left text-sm text-[#1A1A1A] dark:border-gray-800 dark:text-white"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function priceText(odds: number): string {
  return odds > 1 ? String(odds) : '—';
}

function MarketTableView({ accordion }: { accordion: MarketAccordion }) {
  const table = resolvedTable(accordion);
  if (table === 'total') return <TotalTable lines={accordion.lines} />;
  if (table === 'handicap2') return <HandicapTable lines={accordion.lines} />;
  if (table === 'handicap3') return <EuropeanTable lines={accordion.lines} />;
  if (table === 'grid') return <SelectionGrid lines={accordion.lines} />;
  if (table === 'yesno' || table === 'outcomes') return <OutcomeRow lines={accordion.lines} />;
  return <LegacyRows lines={accordion.lines} />;
}

function resolvedTable(accordion: MarketAccordion): MarketTable {
  if (accordion.table === 'handicap3' && accordion.lines.every((line) => line.outcomes.length <= 3 && line.outcomes.every((outcome) => ['П1', 'X', 'П2'].includes(outcome.label)))) return 'handicap3';
  if (accordion.table === 'handicap2' && accordion.lines.every((line) => handicapSides(line.line, line.outcomes))) return 'handicap2';
  if (accordion.table === 'total' && accordion.lines.every((line) => line.outcomes.every((outcome) => outcome.label === 'Больше' || outcome.label === 'Меньше'))) return 'total';
  if (accordion.table === 'rows') return 'rows';
  if (accordion.table === 'grid') return 'grid';
  if (accordion.table === 'yesno') return 'yesno';
  return 'outcomes';
}

function rowAttrs(line: LayoutLine) {
  return {
    'data-market-id': line.outcomes[0]?.externalMarketId ?? '',
    'data-period-id': line.periodId ?? '',
    'data-line': line.line,
  };
}

function Price({ outcome, lineId }: { outcome: LayoutOutcome | null; lineId: string }) {
  if (!outcome) return <div className="rounded-md bg-gray-100 py-1.5 text-center text-xs text-gray-400 dark:bg-gray-700">—</div>;
  return (
    <div data-selection-id={outcome.sourceSelectionId ?? ''} className="rounded-md bg-gray-100 py-1.5 text-center text-xs font-bold tabular-nums text-[#1A1A1A] dark:bg-gray-700 dark:text-white">
      <span className="sr-only">{lineId}</span>
      {priceText(outcome.odds)}
    </div>
  );
}

function findOutcome(line: LayoutLine, labels: string[]): LayoutOutcome | null {
  return line.outcomes.find((outcome) => labels.includes(outcome.label)) ?? null;
}

function TotalTable({ lines }: { lines: LayoutLine[] }) {
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[3.25rem_1fr_1fr] gap-1 text-[11px] font-semibold text-gray-500">
        <span />
        <span className="text-center">Больше</span>
        <span className="text-center">Меньше</span>
      </div>
      {lines.map((line) => (
        <div key={line.id} className="grid grid-cols-[3.25rem_1fr_1fr] items-center gap-1" {...rowAttrs(line)}>
          <span className="text-center text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-200">{line.line}</span>
          <Price outcome={findOutcome(line, ['Больше'])} lineId={line.id} />
          <Price outcome={findOutcome(line, ['Меньше'])} lineId={line.id} />
        </div>
      ))}
    </div>
  );
}

function HandicapTable({ lines }: { lines: LayoutLine[] }) {
  return (
    <div className="space-y-1">
      {lines.map((line) => {
        const sides = handicapSides(line.line, line.outcomes);
        const home = findOutcome(line, ['П1', '1']);
        const away = findOutcome(line, ['П2', '2']);
        return (
          <div key={line.id} className="grid grid-cols-2 gap-1" {...rowAttrs(line)}>
            <LabeledPrice label={sides?.home ?? line.line} outcome={home} />
            <LabeledPrice label={sides?.away ?? ''} outcome={away} />
          </div>
        );
      })}
    </div>
  );
}

function EuropeanTable({ lines }: { lines: LayoutLine[] }) {
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[3.25rem_1fr_1fr_1fr] gap-1 text-[11px] font-semibold text-gray-500">
        <span />
        <span className="text-center">П1</span>
        <span className="text-center">X</span>
        <span className="text-center">П2</span>
      </div>
      {lines.map((line) => (
        <div key={line.id} className="grid grid-cols-[3.25rem_1fr_1fr_1fr] items-center gap-1" {...rowAttrs(line)}>
          <span className="text-center text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-200">{line.line}</span>
          <Price outcome={findOutcome(line, ['П1'])} lineId={line.id} />
          <Price outcome={findOutcome(line, ['X'])} lineId={line.id} />
          <Price outcome={findOutcome(line, ['П2'])} lineId={line.id} />
        </div>
      ))}
    </div>
  );
}

function OutcomeRow({ lines }: { lines: LayoutLine[] }) {
  return (
    <div className="space-y-1">
      {lines.map((line) => (
        <div key={line.id} className={`grid gap-1 ${line.outcomes.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`} {...rowAttrs(line)}>
          {line.outcomes.map((outcome) => (
            <LabeledPrice key={outcome.sourceSelectionId ?? outcome.label} label={outcome.label} outcome={outcome} />
          ))}
        </div>
      ))}
    </div>
  );
}

function SelectionGrid({ lines }: { lines: LayoutLine[] }) {
  const outcomes = lines.flatMap((line) => line.outcomes.map((outcome) => ({ line, outcome })));
  return (
    <div className="grid grid-cols-3 gap-1">
      {outcomes.map(({ line, outcome }) => (
        <div key={`${line.id}-${outcome.sourceSelectionId ?? outcome.label}`} data-market-id={outcome.externalMarketId ?? ''} data-period-id={line.periodId ?? ''}>
          <LabeledPrice label={outcome.label} outcome={outcome} />
        </div>
      ))}
    </div>
  );
}

function LabeledPrice({ label, outcome }: { label: string; outcome: LayoutOutcome | null }) {
  return (
    <div data-selection-id={outcome?.sourceSelectionId ?? ''} className="flex min-w-0 items-center justify-between gap-1 rounded-md bg-gray-100 px-2 py-1.5 text-xs dark:bg-gray-700 dark:text-white">
      <span className="truncate font-medium text-gray-600 dark:text-gray-300">{label}</span>
      <strong className="tabular-nums text-[#1A1A1A] dark:text-white">{outcome ? priceText(outcome.odds) : '—'}</strong>
    </div>
  );
}

function LegacyRows({ lines }: { lines: LayoutLine[] }) {
  return (
    <div className="space-y-1">
      {lines.map((line) => (
        <div key={line.id} className="grid grid-cols-[4.5rem_1fr] items-center gap-1.5" {...rowAttrs(line)}>
          <span className="text-xs font-semibold text-gray-500">{line.line || line.title}</span>
          <div className={`grid gap-1 ${line.outcomes.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {line.outcomes.map((outcome) => (
              <LabeledPrice key={outcome.sourceSelectionId ?? outcome.label} label={outcome.label} outcome={outcome} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
