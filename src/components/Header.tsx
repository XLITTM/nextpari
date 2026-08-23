import { Search, Plus, Sun, Moon, Settings } from 'lucide-react';
import { useTheme } from '../ThemeContext';
import type { Screen } from '../types';

interface HeaderProps {
  balance: number;
  onSearchClick: () => void;
  onNavigate: (screen: Screen) => void;
}

export function Header({ balance, onSearchClick, onNavigate }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 safe-bottom transition-colors">
      <div className="flex items-center justify-between px-4 h-14">
        {/* Balance pill (left) */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-[#1e293b] rounded-full pl-1 pr-2.5 py-1 border border-gray-200 dark:border-gray-700">
          <button className="w-6 h-6 rounded-full bg-brand-600 flex items-center justify-center shrink-0 active:scale-90 transition-transform shadow-sm">
            <Plus className="w-4 h-4 text-white" strokeWidth={2.5} />
          </button>
          <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums whitespace-nowrap">
            {balance.toLocaleString('ru-RU')}
          </span>
        </div>

        {/* Logo (center) */}
        <button type="button" className="flex items-center justify-center gap-2">
          <img src="/logo.png" alt="Nextpari" className="w-10 h-10 object-cover rounded-xl shrink-0" />
          <div className="font-black italic text-2xl leading-none tracking-tighter">
            <span className="text-gray-900 dark:text-white">Next</span><span className="text-brand-600">pari</span>
          </div>
        </button>

        {/* Theme toggle + Search (right) */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={toggleTheme}
            className="w-9 h-9 flex items-center justify-center text-gray-800 dark:text-gray-200 active:scale-90 transition-transform"
            aria-label="Переключить тему"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" strokeWidth={2.2} /> : <Moon className="w-5 h-5" strokeWidth={2.2} />}
          </button>
          <button
            onClick={() => onNavigate({ name: 'settings' })}
            className="w-9 h-9 flex items-center justify-center text-gray-800 dark:text-gray-200 active:scale-90 transition-transform"
            aria-label="Настройки"
          >
            <Settings className="w-5 h-5" strokeWidth={2.2} />
          </button>
          <button
            onClick={onSearchClick}
            className="w-9 h-9 flex items-center justify-center text-gray-800 dark:text-gray-200 active:scale-90 transition-transform"
            aria-label="Поиск"
          >
            <Search className="w-5 h-5" strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </header>
  );
}
