import { Flame, Star, Clock, LayoutGrid, Ticket } from 'lucide-react';
import type { Screen } from '../types';

interface BottomNavProps {
  active: Screen['name'];
  onChange: (screen: Screen) => void;
  betCount: number;
}

export function BottomNav({ active, onChange, betCount }: BottomNavProps) {
  const left: { id: Screen['name']; label: string; icon: typeof Flame; screen: Screen }[] = [
    { id: 'home', label: 'Популярное', icon: Flame, screen: { name: 'home' } },
    { id: 'favorites', label: 'Избранное', icon: Star, screen: { name: 'favorites' } },
  ];
  const right: { id: Screen['name']; label: string; icon: typeof Flame; screen: Screen }[] = [
    { id: 'history', label: 'История', icon: Clock, screen: { name: 'history' } },
    { id: 'menu', label: 'Меню', icon: LayoutGrid, screen: { name: 'menu' } },
  ];

  return (
    <nav className="fixed bottom-0 left-0 w-full z-50 bg-white dark:bg-[#1e293b] border-t border-gray-200 dark:border-gray-700 pb-safe overflow-visible">
      <div className="max-w-lg mx-auto">
        <div className="grid grid-cols-5 h-16 w-full">
          {left.map((item) => (
            <NavButton
              key={item.id}
              label={item.label}
              icon={item.icon}
              active={active === item.id}
              onClick={() => onChange(item.screen)}
            />
          ))}

          <div className="relative flex flex-col items-center justify-center gap-0.5 h-16 overflow-visible">
            <button
              type="button"
              aria-label="Купон"
              onClick={() => onChange({ name: 'betslip' })}
              className="absolute -top-4 left-1/2 -translate-x-1/2 h-14 w-14 rounded-full bg-brand-600 shadow-lg shadow-brand-600/35 flex items-center justify-center active:scale-90 transition-transform z-10"
            >
              <Ticket className="w-6 h-6 text-white" strokeWidth={2.4} />
              {betCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-white text-brand-600 text-[10px] font-bold rounded-full flex items-center justify-center border border-brand-600 leading-none">
                  {betCount}
                </span>
              )}
            </button>
            <span className="w-4 h-4" aria-hidden />
            <span
              className={`text-[10px] leading-none ${
                active === 'betslip' ? 'text-brand-600 font-semibold' : 'text-gray-500 dark:text-gray-300 font-medium'
              }`}
            >
              Купон
            </span>
          </div>

          {right.map((item) => (
            <NavButton
              key={item.id}
              label={item.label}
              icon={item.icon}
              active={active === item.id}
              onClick={() => onChange(item.screen)}
            />
          ))}
        </div>
      </div>
    </nav>
  );
}

function NavButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: typeof Flame;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 h-16 transition-colors ${
        active ? 'text-green-500' : 'text-gray-400'
      }`}
    >
      <Icon className="w-4 h-4" strokeWidth={active ? 2.4 : 2} />
      <span className={`text-[10px] leading-none ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
    </button>
  );
}
