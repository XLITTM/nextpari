import { ChevronLeft } from 'lucide-react';
import type { Screen } from '../types';

interface PromoMarathonScreenProps {
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
}

const FREEBET_TIERS = [
  { day: '6-й день', reward: 'фрибет 25% от средней суммы ставок (до $5)' },
  { day: '11-й день', reward: 'фрибет 75% от средней суммы ставок (до $10)' },
  { day: '16-й день', reward: 'фрибет 150% от средней суммы ставок (до $25)' },
  { day: '31-й день', reward: 'фрибет 300% от средней суммы ставок за 30 дней (до $75)' },
];

export function PromoMarathonScreen({ onBack }: PromoMarathonScreenProps) {
  return (
    <div className="min-h-full flex flex-col bg-[#0a1128]">
      <div className="bg-[#1e293b] shrink-0 border-b border-gray-800">
        <div className="flex items-center justify-between px-2 h-14">
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center text-gray-300 active:scale-95">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="flex-1 text-center text-lg font-bold text-white">Акции</h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        <div
          className="h-44 bg-cover bg-center"
          style={{ backgroundImage: 'url(/promo-marathon.png)' }}
        />

        <article className="px-4 py-5 text-gray-200">
          <h2 className="text-white text-xl font-black uppercase leading-snug tracking-tight">
            Марафон экспрессов
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-300">
            Готовы проверить свою удачу? Делайте ставки типа «Экспресс» каждый день и получайте фрибеты до $75!
          </p>

          <h3 className="mt-6 text-white text-base font-bold">Как получить бонус</h3>
          <ol className="mt-2 list-decimal list-inside space-y-1.5 text-sm leading-relaxed text-gray-300">
            <li>Зарегистрируйтесь на сайте Nextpari и дайте согласие на участие в акциях.</li>
            <li>
              В течение 30 дней подряд делайте экспресс-ставки. В каждом экспрессе должно быть минимум 4 события с
              коэффициентом от 1.5.
            </li>
            <li>Сумма ставки — не менее $1. Ставку необходимо делать за собственные средства.</li>
          </ol>

          <h3 className="mt-6 text-white text-base font-bold">Механика начисления фрибетов</h3>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed">
            {FREEBET_TIERS.map((tier) => (
              <li key={tier.day} className="flex gap-2 text-gray-300">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                <span>
                  <span className="font-semibold text-white">На {tier.day}:</span> {tier.reward}.
                </span>
              </li>
            ))}
          </ul>

          <h3 className="mt-6 text-white text-base font-bold">Важные условия акции</h3>
          <ul className="mt-2 list-disc list-inside space-y-2 text-sm leading-relaxed text-gray-300">
            <li>
              Если в один из дней вы не делаете ставку или она не соответствует правилам, ваш прогресс обнуляется, и
              отсчет 30 дней начинается заново.
            </li>
            <li>
              В акции не участвуют ставки на форы и тоталы, возвраты, отмененные ставки и ставки с бонусного счета.
            </li>
            <li>
              Условия отыгрыша фрибета: проставьте полученную сумму ставкой типа экспресс (от 4 событий, кэф от 1.5) в
              течение 72 часов.
            </li>
          </ul>
        </article>
      </div>
    </div>
  );
}
