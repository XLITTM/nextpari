import { useMemo, useState } from 'react';
import { ChevronDown, List, Pin, Search } from 'lucide-react';
import { layoutLinesFromGroups, marketAccordions, marketTabs } from '@/lib/marketLayout';
import type { MatchEvent } from '@/types';

export function OddsPapiMarketBoard({ match }: { match: MatchEvent }) {
  const lines = useMemo(
    () => layoutLinesFromGroups(match.marketGroups ?? [], match.sport),
    [match.marketGroups, match.sport],
  );
  const tabs = marketTabs(lines, match.sport);
  const [mode, setMode] = useState<'all' | 'players' | 'popular'>('all');
  const [tab, setTab] = useState(tabs[0]?.id ?? 'main');
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState(false);
  const [pinned, setPinned] = useState<string[]>([]);
  const activeTab = mode === 'players' ? 'players' : mode === 'popular' ? 'popular' : (tabs.some((item) => item.id === tab) ? tab : tabs[0]?.id ?? 'main');
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
        <details key={accordion.id} open={pinned.includes(accordion.id) || accordion === accordions[0]} className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold text-[#1A1A1A] dark:text-white">
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
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </summary>
          <div className="space-y-2 px-2 pb-2">
            {accordion.lines.map((line) => (
              <div key={line.id} className="grid grid-cols-[4.5rem_1fr] items-center gap-1.5" data-market-id={line.outcomes[0]?.externalMarketId ?? ''}>
                <span className="text-xs font-semibold text-gray-500">{line.line || line.title}</span>
                <div className={`grid gap-1.5 ${line.outcomes.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {line.outcomes.map((outcome) => (
                    <div
                      key={`${line.id}-${outcome.sourceSelectionId ?? outcome.label}`}
                      data-selection-id={outcome.sourceSelectionId ?? ''}
                      className="flex justify-between rounded-lg border border-gray-200 p-2 text-xs dark:border-gray-600 dark:text-white"
                    >
                      <span>{outcome.label}</span>
                      <strong>{outcome.odds > 1 ? outcome.odds : '—'}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
