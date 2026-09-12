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
    <nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-[720px] -translate-x-1/2 overflow-visible border-t border-[var(--np-border)] bg-[var(--np-nav)] pb-safe">
      <div className="mx-auto w-full">
        <div className="grid h-16 w-full grid-cols-5">
          {left.map((item) => (
            <NavButton
              key={item.id}
              label={item.label}
              icon={item.icon}
              active={active === item.id}
              onClick={() => onChange(item.screen)}
            />
          ))}

          <div className="relative flex h-16 flex-col items-center justify-center gap-0.5 overflow-visible">
            <button
              type="button"
              aria-label="Купон"
              onClick={() => onChange({ name: 'betslip' })}
              className="np-press absolute -top-5 left-1/2 z-10 flex h-[3.65rem] w-[3.65rem] -translate-x-1/2 items-center justify-center rounded-full bg-[var(--np-accent)] shadow-[var(--np-glow)]"
            >
              <Ticket className="h-6 w-6 text-white" strokeWidth={2.4} />
              {betCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-[var(--np-accent)] bg-white px-1 text-[10px] font-bold leading-none text-[var(--np-accent-ink)]">
                  {betCount}
                </span>
              )}
            </button>
            <span className="h-4 w-4" aria-hidden />
            <span className="text-[10px] font-semibold leading-none text-[var(--np-accent)]">Купон</span>
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
      className={`flex h-16 flex-col items-center justify-center gap-0.5 transition-colors duration-200 ${
        active ? 'text-[var(--np-accent)]' : 'text-[var(--np-text-muted)]'
      }`}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.4 : 2} />
      <span className={`text-[10px] leading-none ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
    </button>
  );
}
