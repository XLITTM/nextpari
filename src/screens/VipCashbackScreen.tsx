import { ChevronLeft, Gift, Star, Trophy } from 'lucide-react';
import type { Screen } from '../types';

export const VIP_LEVELS = [
  { id: 1, name: 'Медный' },
  { id: 2, name: 'Бронзовый' },
  { id: 3, name: 'Серебряный' },
  { id: 4, name: 'Золотой' },
  { id: 5, name: 'Рубиновый' },
  { id: 6, name: 'Сапфировый' },
  { id: 7, name: 'Бриллиантовый' },
  { id: 8, name: 'Статус VIP' },
];

interface VipCashbackScreenProps {
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
}

function CopperMedal() {
  return (
    <div className="relative mx-auto h-36 w-36">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle at 35% 30%, #f0a070 0%, #c45c2a 45%, #8b3a14 100%)',
          boxShadow: '0 12px 28px rgba(0,0,0,0.35), inset 0 2px 8px rgba(255,220,180,0.45)',
        }}
      />
      <div className="absolute inset-[14%] flex items-center justify-center rounded-full border-[3px] border-[#f0c090]/70 bg-gradient-to-b from-[#d4783c] to-[#9a4018]">
        <Star className="h-14 w-14 fill-[#ffe7c2] text-[#ffe7c2] drop-shadow" strokeWidth={1.5} />
      </div>
      <div className="absolute -bottom-1 left-1/2 h-4 w-16 -translate-x-1/2 rounded-full bg-black/20 blur-sm" />
    </div>
  );
}

export function VipCashbackScreen({ onBack }: VipCashbackScreenProps) {
  return (
    <div className="min-h-full bg-[#f0f4fa] pb-8">
      <div className="bg-gradient-to-b from-[#194bb8] to-[#12388e] px-4 pb-8 pt-3 text-white">
        <div className="mb-5 flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 active:scale-90"
            aria-label="Назад"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 pr-9 text-center text-lg font-bold">VIP и кешбэк</h1>
        </div>
        <CopperMedal />
        <p className="mt-5 text-center text-sm font-semibold text-white/80">Программа в разработке</p>
        <p className="mt-1 text-center text-[22px] font-bold leading-tight">VIP-программа и кешбэк</p>
      </div>

      <div className="space-y-3 px-4 py-4">
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold leading-relaxed text-gray-700">
            VIP-программа и кешбэк появятся после подключения бонусной системы.
          </p>
          <p className="mt-2 text-xs font-medium leading-relaxed text-gray-500">
            Сейчас это предварительный просмотр уровней. Личный статус, опыт и награды ещё не начисляются.
          </p>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-center text-base font-bold text-gray-900">Уровни программы</h2>
          <ul className="space-y-2">
            {VIP_LEVELS.map((level) => (
              <li
                key={level.id}
                className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#194bb8]/10 text-[#194bb8]">
                  {level.id === 1 ? <Star className="h-4 w-4" /> : <Trophy className="h-4 w-4" />}
                </span>
                <span className="text-sm font-bold text-gray-900">{level.name}</span>
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-gray-400">
                  Превью
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-center text-base font-bold text-gray-900">Как это будет работать</h2>
          <p className="text-center text-sm font-medium leading-relaxed text-gray-600">
            После запуска бонусной системы игроки смогут повышать уровень и получать кешбэк.
            Пока награды не начисляются и баланс не изменяется.
          </p>
          <div className="mt-4 flex justify-center text-[#194bb8]">
            <Gift className="h-8 w-8" />
          </div>
        </section>
      </div>
    </div>
  );
}
