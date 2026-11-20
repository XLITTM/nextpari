import { useMemo, useState } from 'react';
import { layoutLinesFromGroups, marketAccordions, marketTabs } from '@/lib/marketLayout';
import type { MatchEvent } from '@/types';

export function OddsPapiMarketBoard({ match }: { match: MatchEvent }) {
  const lines = useMemo(
    () => layoutLinesFromGroups(match.marketGroups ?? [], match.sport),
    [match.marketGroups, match.sport],
  );
  const tabs = marketTabs(lines, match.sport);
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const activeTab = tabs.some((item) => item.id === tab) ? tab : 'all';
  const accordions = marketAccordions(lines, activeTab, query, match.sport);

  return (
    <div className="relative z-10 -mt-4 space-y-2 rounded-t-3xl bg-[#F5F5F5] px-2 pb-24 pt-3 shadow-[0_-8px_20px_rgba(0,0,0,0.12)] dark:bg-gray-900">
      <p className="px-2 py-1 text-sm text-gray-600 dark:text-gray-300">Приём ставок временно закрыт</p>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Поиск рынка"
        aria-label="Поиск рынка"
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-[#1A1A1A] dark:border-gray-600 dark:bg-gray-800 dark:text-white"
      />
      {tabs.length > 1 && (
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
      {accordions.map((accordion, index) => (
        <details key={accordion.id} open={index === 0} className="rounded-xl border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800">
          <summary className="cursor-pointer px-1 pb-2 text-sm font-semibold text-[#1A1A1A] dark:text-white">
            {accordion.title}
            <span className="ml-2 text-xs font-medium text-gray-500">{accordion.lines.length}</span>
          </summary>
          <div className="space-y-2">
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
    </div>
  );
}
