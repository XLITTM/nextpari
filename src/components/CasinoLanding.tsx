import { ChevronRight, Dices } from 'lucide-react';
import { SectionHeader } from './SectionHeader';
import { IconCasino } from './SectionIcons';
import type { Screen } from '../types';

interface CasinoLandingProps {
  onNavigate: (screen: Screen) => void;
}

const ENTRIES: { label: string; desc: string; screen: Screen; icon: 'slots' | 'live' }[] = [
  {
    label: 'Слоты',
    desc: 'Игры появятся после подключения провайдера',
    screen: { name: 'slots' },
    icon: 'slots',
  },
  {
    label: 'Лайв казино',
    desc: 'Столы появятся после подключения провайдера',
    screen: { name: 'live-casino' },
    icon: 'live',
  },
];

export function CasinoLanding({ onNavigate }: CasinoLandingProps) {
  return (
    <div className="space-y-3 pt-2">
      <SectionHeader title="Казино" />
      <div className="flex flex-col gap-2 px-4">
        {ENTRIES.map((entry) => (
          <button
            key={entry.screen.name}
            type="button"
            onClick={() => onNavigate(entry.screen)}
            className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm active:scale-[0.98] transition-transform dark:bg-gray-800"
          >
            {entry.icon === 'slots' ? (
              <Dices className="h-6 w-6 shrink-0 text-[#4ade80]" strokeWidth={1.5} />
            ) : (
              <IconCasino className="h-6 w-6 shrink-0" strokeWidth={1.5} />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-gray-900 dark:text-white">{entry.label}</p>
              <p className="mt-0.5 text-xs font-semibold text-gray-500 dark:text-gray-200">{entry.desc}</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" />
          </button>
        ))}
      </div>
      <p className="px-4 pb-2 text-sm text-gray-500 dark:text-gray-400">
        Казино-провайдеры появятся после подключения
      </p>
    </div>
  );
}
