import { ChevronLeft } from 'lucide-react';
import type { Screen } from '../types';

interface PromoDetailsScreenProps {
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
}

export function PromoDetailsScreen({ onBack }: PromoDetailsScreenProps) {
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
          style={{ backgroundImage: 'url(/promo-tiger.png)' }}
        />

        <article className="px-4 py-5 text-gray-200">
          <h2 className="text-white text-xl font-black uppercase leading-snug tracking-tight">
            100%-й бонус на первый депозит
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-300">
            Зарегистрируйся на платформе Nextpari и получи 100%-й бонус за первое пополнение!
          </p>

          <h3 className="mt-6 text-white text-base font-bold">Как получить бонус?</h3>
          <ol className="mt-2 list-decimal list-inside space-y-1.5 text-sm leading-relaxed text-gray-300">
            <li>Зарегистрируйтесь на сайте Nextpari.</li>
            <li>Заполните все поля с персональными данными в личном кабинете.</li>
            <li>Пополните свой баланс.</li>
            <li>Бонус автоматически начисляется после пополнения.</li>
          </ol>

          <h3 className="mt-6 text-white text-base font-bold">Правила и условия</h3>
          <ul className="mt-2 list-disc list-inside space-y-2 text-sm leading-relaxed text-gray-300">
            <li>Пользователь имеет право получить только 1 бонус.</li>
            <li>Перед пополнением счета необходимо дать согласие на получение бонуса в настройках.</li>
            <li>
              Проставьте сумму бонуса в 5-ти кратном размере ставками типа экспресс. В каждом экспрессе должно быть
              не менее 3-х событий с коэффициентом не ниже 1.40.
            </li>
            <li>До выполнения условий акции вывод денежных средств невозможен.</li>
            <li>Бонус полностью адаптирован и доступен для депозитов в криптовалюте.</li>
            <li>
              Nextpari оставляет за собой право отменить акцию или заморозить счет при подозрении на мошенничество
              (мультиаккаунтинг).
            </li>
          </ul>
        </article>
      </div>
    </div>
  );
}
