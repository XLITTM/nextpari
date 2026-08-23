import { ChevronRight } from 'lucide-react';

interface SectionHeaderProps {
  title: string;
  onFilterClick?: () => void;
  onSeeAll?: () => void;
  filterLabel?: string;
  badge?: string;
  badgeColor?: string;
}

export function SectionHeader({ title, onFilterClick, onSeeAll, filterLabel, badge, badgeColor }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h2>
        {badge && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-2xl ${badgeColor || 'bg-[#0c1a2e] text-brand-400'}`}>
            {badge}
          </span>
        )}
        {onFilterClick && (
          <button
            onClick={onFilterClick}
            className="flex items-center gap-1 text-xs text-gray-900 dark:text-white bg-gray-100 dark:bg-[#1e293b] px-2 py-1 rounded-2xl border border-gray-200 dark:border-gray-700 font-bold"
          >
            {filterLabel || 'Спорт'}
            <ChevronRight className="w-3 h-3" strokeWidth={2.2} />
          </button>
        )}
      </div>
      {onSeeAll && (
        <button
          onClick={onSeeAll}
          className="text-xs font-bold text-brand-600 flex items-center gap-0.5"
        >
          Все <ChevronRight className="w-3 h-3" strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}
