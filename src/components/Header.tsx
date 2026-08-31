import { Search, Plus, Sun, Moon, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTheme } from '../ThemeContext';
import type { Screen } from '../types';

interface HeaderProps {
  balanceLabel: string;
  onSearchClick: () => void;
  onNavigate: (screen: Screen) => void;
  children?: ReactNode;
}

export function Header({ balanceLabel, onSearchClick, onNavigate, children }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 w-full rounded-b-2xl bg-white shadow-sm dark:bg-zinc-900">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-100 py-1 pl-1 pr-2.5 dark:border-gray-700 dark:bg-[#1e293b]">
          <button className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 shadow-sm transition-transform active:scale-90">
            <Plus className="h-4 w-4 text-white" strokeWidth={2.5} />
          </button>
          <span className="whitespace-nowrap text-sm font-bold tabular-nums text-gray-900 dark:text-white">
            {balanceLabel}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onNavigate({ name: 'home' })}
          className="flex select-none items-center transition-transform active:scale-95"
          aria-label="NextPari — на главную"
        >
          <img
            src="/assets/logo-black.png"
            alt="NextPari"
            className="block h-7 w-auto object-contain drop-shadow-sm dark:hidden sm:h-8"
            draggable={false}
          />
          <img
            src="/assets/logo-white.png"
            alt=""
            aria-hidden
            className="hidden h-7 w-auto object-contain drop-shadow-[0_0_10px_rgba(74,255,118,0.2)] dark:block sm:h-8"
            draggable={false}
          />
        </button>

        <div className="flex items-center gap-0.5">
          <button
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center text-gray-800 transition-transform active:scale-90 dark:text-gray-200"
            aria-label="Переключить тему"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" strokeWidth={2.2} /> : <Moon className="h-5 w-5" strokeWidth={2.2} />}
          </button>
          <button
            onClick={() => onNavigate({ name: 'settings' })}
            className="flex h-9 w-9 items-center justify-center text-gray-800 transition-transform active:scale-90 dark:text-gray-200"
            aria-label="Настройки"
          >
            <Settings className="h-5 w-5" strokeWidth={2.2} />
          </button>
          <button
            onClick={onSearchClick}
            className="flex h-9 w-9 items-center justify-center text-gray-800 transition-transform active:scale-90 dark:text-gray-200"
            aria-label="Поиск"
          >
            <Search className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>
      </div>
      {children}
    </header>
  );
}
