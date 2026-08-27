import { sports } from '../data';
import type { SportId } from '../types';
import { SportIcon } from './SportIcon';
import { useLiveMatches } from '../LiveMatchesContext';
import { FEATURED_SPORT_IDS } from '../lib/featuredSports';

interface SportsScrollProps {
  selected: SportId;
  onSelect: (id: SportId) => void;
}

export function SportsScroll({ selected, onSelect }: SportsScrollProps) {
  const { liveMatches } = useLiveMatches();
  const counts = liveMatches.reduce<Partial<Record<SportId, number>>>((acc, match) => {
    acc[match.sport] = (acc[match.sport] ?? 0) + 1;
    return acc;
  }, {});

  const ordered = [...sports].sort((a, b) => {
    const ai = FEATURED_SPORT_IDS.indexOf(a.id);
    const bi = FEATURED_SPORT_IDS.indexOf(b.id);
    const ap = ai === -1 ? 100 + sports.findIndex((row) => row.id === a.id) : ai;
    const bp = bi === -1 ? 100 + sports.findIndex((row) => row.id === b.id) : bi;
    return ap - bp;
  });

  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-2 pt-3 scrollbar-hide">
      {ordered.map((sport) => {
        const isActive = selected === sport.id;
        const count = sport.id === 'all' ? liveMatches.length : counts[sport.id] ?? 0;
        return (
          <button
            key={sport.id}
            type="button"
            onClick={() => onSelect(sport.id)}
            className={`flex min-w-[70px] shrink-0 flex-col items-center gap-1 rounded-2xl bg-white p-3 shadow-sm dark:bg-zinc-800 ${
              isActive ? 'shadow-md' : ''
            }`}
          >
            <SportIcon sport={sport.id} className="h-6 w-6 text-[#4ade80]" />
            <span className={`text-center text-[9px] font-medium leading-tight line-clamp-2 ${
              isActive ? 'text-[#c88d3e]' : 'text-gray-700 dark:text-gray-300'
            }`}>
              {sport.name}
            </span>
            {count > 0 && sport.id !== 'all' ? (
              <span className="text-[8px] font-bold tabular-nums text-gray-500 dark:text-gray-400">{count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
