import {
  User, Settings, Mail, Wallet, ChevronDown, Plus,
  Flame, Trophy, LayoutGrid, Sparkles,
  Ticket, Headphones, ShieldCheck, ChevronRight,
  Dices, Zap, Video, CheckCircle, Flag,
  Heart, Gift, Boxes, KeyRound, Target, TrendingUp, Wrench,
  ScanLine, Bell, Info, Star, LogOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { IconCasino, IconEsports, IconGames, IconSport } from '../components/SectionIcons';
import type { Screen } from '../types';

interface MenuScreenProps {
  balance: number;
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
}

const subTabs = [
  { id: 'top', label: 'Топ', icon: Flame },
  { id: 'sport', label: 'Спорт', icon: IconSport },
  { id: 'casino', label: 'Казино', icon: IconCasino },
  { id: 'games', label: 'Games', icon: IconGames },
  { id: 'misc', label: 'Разное', icon: Sparkles },
] as const;

type SubTabId = typeof subTabs[number]['id'];

type SpecialType = 'teal' | 'security' | 'orange';

type MenuIcon = LucideIcon | ((props: { className?: string; strokeWidth?: number }) => JSX.Element);

interface CardItem {
  icon: MenuIcon;
  label: string;
  desc: string;
  iconBg: string;
  iconColor: string;
  special?: SpecialType;
  route?: Screen;
}

const grayIcon = { iconBg: '', iconColor: 'text-[#4ade80]' };

const sections: Record<SubTabId, CardItem[]> = {
  top: [
    { icon: Flame, label: 'LIVE', desc: 'Ставь на события в прямом эфире', iconBg: '', iconColor: 'text-red-500', route: { name: 'sports', mode: 'live' } },
    { icon: Trophy, label: 'Линия', desc: 'Ставь на предстоящие события', ...grayIcon, route: { name: 'sports', mode: 'line' } },
    { icon: IconEsports, label: 'Киберспорт', desc: 'CS2, Dota 2, LoL и другие', ...grayIcon, route: { name: 'sports', mode: 'cybers' } },
    { icon: LayoutGrid, label: 'Слоты', desc: 'Более 2000 азартных игр', ...grayIcon, route: { name: 'slots' } },
    { icon: IconCasino, label: 'Лайв казино', desc: 'Рулетка, блэкджек с дилером', ...grayIcon, route: { name: 'live-casino' } },
    { icon: IconGames, label: 'Games', desc: 'Мини-игры и аркады', ...grayIcon, route: { name: 'games' } },
    { icon: Ticket, label: 'Промокоды', desc: 'Промо баллы: 0 PTS', iconBg: '', iconColor: 'text-white', special: 'teal', route: { name: 'promo' } },
    { icon: Trophy, label: 'Непобедимый', desc: 'Экспрессы — розыгрыш $9,000', ...grayIcon, route: { name: 'promo-unbeatable' } },
    { icon: Headphones, label: 'Поддержка', desc: 'Чат с оператором 24/7', ...grayIcon, route: { name: 'info' } },
    { icon: ShieldCheck, label: 'Аутентификатор', desc: 'Защити свой аккаунт', ...grayIcon },
  ],
  sport: [
    { icon: Flame, label: 'LIVE', desc: 'Ставь на события в прямом эфире', iconBg: '', iconColor: 'text-red-500', route: { name: 'sports', mode: 'live' } },
    { icon: Trophy, label: 'Линия', desc: 'Ставь на предстоящие события', ...grayIcon, route: { name: 'sports', mode: 'line' } },
    { icon: Zap, label: 'Экспресс дня', desc: 'Ставки на выгодные экспрессы', ...grayIcon },
    { icon: Video, label: 'Стрим', desc: 'Игры с онлайн-трансляцией', ...grayIcon },
    { icon: IconEsports, label: 'Киберспорт', desc: 'Лучшие киберспортивные события', ...grayIcon, route: { name: 'sports', mode: 'cybers' } },
    { icon: CheckCircle, label: 'Результаты', desc: 'Итоги прошедших событий', ...grayIcon },
    { icon: Flag, label: 'Ставь на своих', desc: 'События любимых стран', ...grayIcon },
  ],
  casino: [
    { icon: IconCasino, label: 'Лайв казино', desc: 'Рулетка, блэкджек с дилером', ...grayIcon, route: { name: 'live-casino' } },
    { icon: Dices, label: 'Слоты', desc: 'Pragmatic, EGT, Spinomenal', ...grayIcon, route: { name: 'slots' } },
    { icon: Heart, label: 'My casino', desc: 'Личные акции, турниры, избранное', ...grayIcon, route: { name: 'live-casino' } },
    { icon: LayoutGrid, label: 'Категории', desc: 'Игры казино на любой вкус', ...grayIcon },
    { icon: Trophy, label: 'Турниры', desc: 'Все турниры казино', ...grayIcon },
    { icon: Gift, label: 'Промо', desc: 'Подарки, бонусы и акции', ...grayIcon, route: { name: 'promo' } },
    { icon: Boxes, label: 'Провайдеры', desc: 'Лучшие провайдеры в одном месте', ...grayIcon },
  ],
  games: [
    { icon: IconGames, label: 'Games', desc: 'Мини-игры и аркады', ...grayIcon, route: { name: 'games' } },
    { icon: Flame, label: 'Crash-игры', desc: 'Aviator, JetX', iconBg: '', iconColor: 'text-red-500' },
  ],
  misc: [
    { icon: ShieldCheck, label: 'Повысьте безопасность!', desc: 'Получите надежную защиту вашего аккаунта!', iconBg: '', iconColor: 'text-white', special: 'security' },
    { icon: Star, label: 'Акции', desc: 'Участвуй и выигрывай призы', iconBg: '', iconColor: 'text-white', special: 'orange', route: { name: 'promo-unbeatable' } },
    { icon: Wallet, label: 'Управление счетом', desc: 'Пополнение, вывод, история', ...grayIcon },
    { icon: Ticket, label: 'Promo', desc: 'Промо баллы и бонусы', ...grayIcon, route: { name: 'promo' } },
    { icon: KeyRound, label: 'Аутентификатор', desc: 'Двухфакторная аутентификация', ...grayIcon },
    { icon: Target, label: 'ТОТО', desc: 'Тотализатор и джекпоты', ...grayIcon },
    { icon: TrendingUp, label: 'Финставки', desc: 'Ставки на финансовые рынки', ...grayIcon },
    { icon: Wrench, label: 'Бетконструктор', desc: 'Создай свою ставку', ...grayIcon },
    { icon: ScanLine, label: 'Сканер купонов', desc: 'Проверь билет по коду', ...grayIcon },
    { icon: Bell, label: 'Уведомления', desc: 'Настройки оповещений', ...grayIcon },
    { icon: Headphones, label: 'Поддержка', desc: 'Чат с оператором 24/7', ...grayIcon, route: { name: 'info' } },
    { icon: Info, label: 'Инфо', desc: 'О компании, правила, помощь', ...grayIcon, route: { name: 'info' } },
  ],
};

const specialStyles: Record<SpecialType, string> = {
  teal: 'bg-gradient-to-r from-teal-400 to-teal-500',
  security: 'bg-gradient-to-r from-orange-400 to-amber-500',
  orange: 'bg-orange-500',
};

export function MenuScreen({ balance, onNavigate, onLogout }: MenuScreenProps) {
  const [activeTab, setActiveTab] = useState<SubTabId>('top');

  return (
    <div className="min-h-full bg-gray-100 dark:bg-gray-900 overflow-y-auto pb-28">
      {/* 1. Profile header */}
      <div className="bg-white dark:bg-[#1e293b] px-4 pt-4 pb-4 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-gray-200 dark:bg-[#1e293b] flex items-center justify-center shrink-0">
            <User className="w-7 h-7 text-gray-500 dark:text-gray-200" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-gray-900 dark:text-white truncate">Wiktoriya Sarkisyan</p>
            <button
              onClick={() => onNavigate({ name: 'personal-data' })}
              className="text-xs text-brand-600 dark:text-brand-400 mt-0.5 font-semibold active:scale-95 transition-transform"
            >
              Личные данные →
            </button>
          </div>
          <button className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-[#1e293b] flex items-center justify-center text-gray-600 dark:text-gray-200 hover:text-gray-800 dark:hover:text-white transition-colors">
            <Mail className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'settings' })}
            className="relative w-9 h-9 rounded-xl bg-gray-100 dark:bg-[#1e293b] flex items-center justify-center text-gray-600 dark:text-gray-200 hover:text-gray-800 dark:hover:text-white transition-colors"
            aria-label="Настройки"
          >
            <Settings className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white dark:border-gray-800" />
          </button>
        </div>
      </div>

      {/* 2. Balance + deposit */}
      <div className="bg-white dark:bg-[#1e293b] px-4 pb-4 transition-colors">
        <div className="flex items-center gap-3">
          <button className="flex-1 flex items-center gap-2.5 bg-gray-100 dark:bg-[#1e293b] rounded-xl px-3 py-2.5 active:scale-[0.98] transition-transform">
            <Wallet className="w-5 h-5 text-gray-600 dark:text-gray-200 shrink-0" />
            <div className="flex-1 text-left min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-200 leading-tight font-semibold">Баланс</p>
              <p className="text-sm font-extrabold text-gray-900 dark:text-white tabular-nums leading-tight">
                {balance.toLocaleString('ru-RU')} TMTM
              </p>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-200 shrink-0" />
          </button>
          <button
            onClick={() => onNavigate({ name: 'wallet' })}
            className="flex items-center gap-1.5 bg-brand-600 text-white font-bold rounded-2xl py-2.5 px-4 active:scale-95 transition-transform"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm">Пополнить</span>
          </button>
        </div>
      </div>

      {/* 3. Sub-navigation tabs */}
      <div className="bg-white dark:bg-[#1e293b] border-t border-gray-100 dark:border-gray-700 transition-colors">
        <div className="flex w-full justify-between scrollbar-hide border-b border-gray-200 dark:border-gray-700 px-2 pb-2">
          {subTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center justify-center w-full text-center gap-1 pt-2 pb-1 border-b-2 -mb-2 transition-colors ${
                  isActive
                    ? 'border-[#4ade80] text-[#4ade80]'
                    : 'border-transparent text-[#4ade80]/70'
                }`}
              >
                <Icon className="w-6 h-6 hover:scale-105 transition-transform" strokeWidth={1.5} />
                <span className="text-xs font-bold">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Menu cards */}
      <div className="flex flex-col gap-2 mt-4 px-4">
        {sections[activeTab].map((item) => {
          const Icon = item.icon;
          if (item.special) {
            return (
              <button
                key={item.label}
                onClick={() => item.route && onNavigate(item.route)}
                className={`w-full flex items-center gap-3 ${specialStyles[item.special]} rounded-2xl p-4 active:scale-[0.98] transition-transform text-left`}
              >
                <Icon className="w-6 h-6 text-white hover:scale-105 transition-transform shrink-0" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{item.label}</p>
                  <p className="text-xs text-white/90 mt-0.5">{item.desc}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-white/85 shrink-0" />
              </button>
            );
          }
          if (item.label === 'Управление счетом') {
            return (
              <button
                key={item.label}
                onClick={() => onNavigate({ name: 'wallet' })}
                className="w-full flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm active:scale-[0.98] transition-transform text-left"
              >
                <Icon className={`w-6 h-6 ${item.iconColor} hover:scale-105 transition-transform shrink-0`} strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-extrabold text-gray-900 dark:text-white">{item.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-200 mt-0.5 font-semibold">{item.desc}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500 shrink-0" />
              </button>
            );
          }
          return (
            <button
              key={item.label}
              onClick={() => {
                if (item.route) onNavigate(item.route);
              }}
              className="w-full flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm active:scale-[0.98] transition-transform text-left"
            >
              <Icon className={`w-6 h-6 ${item.iconColor} hover:scale-105 transition-transform shrink-0`} strokeWidth={1.5} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold text-gray-900 dark:text-white">{item.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-200 mt-0.5 font-semibold">{item.desc}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500 shrink-0" />
            </button>
          );
        })}
      </div>

      {/* Logout button */}
      <div className="px-4 mt-4">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-2xl p-4 active:scale-[0.98] transition-transform text-left"
        >
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center shrink-0">
            <LogOut className="w-5 h-5 text-red-500" />
          </div>
          <span className="flex-1 text-sm font-bold text-red-500">Выйти из аккаунта</span>
          <ChevronRight className="w-5 h-5 text-red-400 dark:text-red-500/60 shrink-0" />
        </button>
      </div>

      <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">nextpari v2.0.1 · © 2026</p>
    </div>
  );
}