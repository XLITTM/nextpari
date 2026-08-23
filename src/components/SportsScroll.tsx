import { sports } from '../data';
import type { SportId } from '../types';
import { SportIcon } from './SportIcon';

interface SportsScrollProps {
  selected: SportId;
  onSelect: (id: SportId) => void;
}

export function SportsScroll({ selected, onSelect }: SportsScrollProps) {
  return (
    <div className="flex overflow-x-auto gap-2 scrollbar-hide px-4 pb-2">
      {sports.map((sport) => {
        const isActive = selected === sport.id;
        return (
          <button
            key={sport.id}
            type="button"
            onClick={() => onSelect(sport.id)}
            className={`min-w-[56px] h-[56px] p-1 rounded-xl shadow-sm flex flex-col items-center justify-center gap-1 shrink-0 cursor-pointer ${
              isActive ? 'bg-green-50' : 'bg-white'
            }`}
          >
            <SportIcon sport={sport.id} className="w-5 h-5 text-[#4ade80]" />
            <span className="text-[9px] text-gray-700 font-medium text-center leading-tight line-clamp-2">
              {sport.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
