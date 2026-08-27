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
    <div className="flex w-full px-2">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex flex-1 flex-col items-center gap-1 border-b-2 py-2.5 ${
              isActive ? 'border-[#c88d3e]' : 'border-transparent'
            }`}
          >
            <Icon
              className={`h-5 w-5 ${isActive ? 'text-[#c88d3e]' : 'text-gray-400 dark:text-gray-500'}`}
              strokeWidth={1.75}
            />
            <span
              className={`text-center text-[11px] font-semibold leading-tight ${
                isActive ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
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
