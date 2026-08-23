import { ChevronLeft } from 'lucide-react';
import type { Screen } from '../types';

interface PromoUnbeatableScreenProps {
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
}

const PRIZES = [
  { place: '1 место', amount: '$5,000' },
  { place: '2 место', amount: '$3,000' },
  { place: '3 место', amount: '$1,000' },
];

export function PromoUnbeatableScreen({ onBack }: PromoUnbeatableScreenProps) {
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
        <div className="h-44 bg-[url('/promo-unbeatable.png')] bg-cover bg-center" />

        <article className="px-4 py-5 text-gray-200">
          <h2 className="text-white text-xl font-black uppercase leading-snug tracking-tight">Непобедимый</h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-300">
            Делай экспресс-ставки — участвуй в розыгрыше $9,000!
          </p>

          <h3 className="mt-6 text-white text-base font-bold">Как участвовать</h3>
          <ol className="mt-2 list-decimal list-inside space-y-1.5 text-sm leading-relaxed text-gray-300">
            <li>Делайте ставки типа «Экспресс» в период проведения акции.</li>
            <li>За каждый купон «Экспресс» система автоматически генерирует уникальный 7-значный код.</li>
            <li>Чем больше экспрессов — тем больше кодов и выше шансы на победу!</li>
          </ol>

          <h3 className="mt-6 text-white text-base font-bold">Призовой фонд</h3>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed">
            {PRIZES.map((prize) => (
              <li key={prize.place} className="flex items-center justify-between bg-[#1e293b] rounded-2xl px-3 py-2.5">
                <span className="font-semibold text-white">{prize.place}</span>
                <span className="font-black text-brand-400 tabular-nums">{prize.amount}</span>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-sm leading-relaxed text-gray-300">
            Розыгрыш проводится по окончании трехмесячного цикла.
          </p>
        </article>
      </div>
    </div>
  );
}
