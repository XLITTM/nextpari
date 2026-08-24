import { Star } from 'lucide-react';
import { SectionHeader } from './SectionHeader';
import { useLiveMatches } from '../LiveMatchesContext';

function colorFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const palette = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4'];
  return palette[hash % palette.length];
}

export function ChampionshipsList() {
  const { liveMatches } = useLiveMatches();
  const fromLive = Object.values(
    liveMatches.reduce<Record<string, { name: string; country: string; count: number; color: string }>>((acc, match) => {
      const key = `${match.country}|${match.league}`;
      const prev = acc[key] ?? {
        name: match.league,
        country: match.country,
        count: 0,
        color: colorFromName(match.league),
      };
      prev.count += 1;
      acc[key] = prev;
      return acc;
    }, {}),
  )
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const leagues = fromLive;
  if (!leagues.length) return null;

  return (
    <div>
      <SectionHeader
        title="Чемпионаты LIVE"
        filterLabel="Спорт"
        onFilterClick={() => {}}
        onSeeAll={() => {}}
      />
      <div className="px-4 space-y-2">
        {leagues.map((ch) => (
          <div
            key={`${ch.country}-${ch.name}`}
            className="flex items-center gap-3 bg-gray-50 dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-3 active:scale-[0.99] transition-transform cursor-pointer"
          >
            <div className="relative shrink-0">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ backgroundColor: ch.color + '30' }}
              >
                <div className="w-5 h-5 rounded-full" style={{ backgroundColor: ch.color }} />
              </div>
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white dark:border-gray-800 animate-pulse-live" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-extrabold text-gray-900 dark:text-white truncate">{ch.name}</p>
              <p className="text-xs text-gray-600 dark:text-gray-300 truncate font-semibold">{ch.country}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-bold text-brand-600 tabular-nums">{ch.count}</span>
              <button className="w-7 h-7 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-brand-600 transition-colors">
                <Star className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
