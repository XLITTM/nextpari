import { Flame, Trophy, Gamepad2, Dices } from 'lucide-react';
import { IconGames } from './SectionIcons';
import type { MainTab } from '../types';

interface MainTabsProps {
  active: MainTab;
  onChange: (tab: MainTab) => void;
}

const tabs: { id: MainTab; label: string; icon: typeof Flame }[] = [
  { id: 'top', label: 'Топ', icon: Flame },
  { id: 'sport', label: 'Спорт', icon: Trophy },
  { id: 'esports', label: 'Esports', icon: Gamepad2 },
  { id: 'casino', label: 'Казино', icon: Dices },
  { id: 'games', label: 'Games', icon: IconGames as typeof Flame },
];

export function MainTabs({ active, onChange }: MainTabsProps) {
  return (
    <div className="flex w-full px-4">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className="flex-1 flex flex-col items-center gap-1 cursor-pointer py-2"
          >
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
                isActive
                  ? 'bg-green-500/15 ring-1 ring-green-500/40'
                  : 'bg-gray-100 dark:bg-white/5'
              }`}
            >
              <Icon className="w-6 h-6 text-green-500" strokeWidth={1.5} />
            </span>
            <span
              className={`text-[10px] font-medium text-center leading-tight ${
                isActive ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
