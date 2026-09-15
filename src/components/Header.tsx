import { Search, Plus, Sun, Moon, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTheme } from '../ThemeContext';
import type { Screen } from '../types';
import { HeaderWalletSwitcher } from './HeaderWalletSwitcher';

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
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onNavigate({ name: 'wallet' })}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 shadow-sm transition-transform active:scale-90"
            aria-label="Пополнить"
          >
            <Plus className="h-4 w-4 text-white" strokeWidth={2.5} />
          </button>
          <HeaderWalletSwitcher balanceLabel={balanceLabel} />
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
