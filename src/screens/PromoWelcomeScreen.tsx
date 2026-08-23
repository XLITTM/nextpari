import { ChevronLeft } from 'lucide-react';
import type { Screen } from '../types';

interface PromoWelcomeScreenProps {
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
}

const DEPOSIT_TIERS = [
  { deposit: '1-й депозит', reward: '100% (до 300 EUR) и 30 FS в игре Reliquary of Ra' },
  { deposit: '2-й депозит', reward: '50% (до 350 EUR) и 35 FS в игре Admiral' },
  { deposit: '3-й депозит', reward: '25% (до 400 EUR) и 40 FS в игре Juicy Fruits 27 Ways' },
  { deposit: '4-й депозит', reward: '25% (до 450 EUR) и 45 FS в игре Rich of the Mermaid Hold and Spin' },
];

export function PromoWelcomeScreen({ onBack }: PromoWelcomeScreenProps) {
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
        <div className="h-44 bg-[url('/promo-welcome.png')] bg-cover bg-center" />

        <article className="px-4 py-5 text-gray-200">
          <h2 className="text-white text-xl font-black uppercase leading-snug tracking-tight">
            Приветственный пакет до 1500 € + 150 FS
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-300">
            Вноси депозиты и получай бонусы!
          </p>

          <h3 className="mt-6 text-white text-base font-bold">Как получить бонус?</h3>
          <ol className="mt-2 list-decimal list-inside space-y-1.5 text-sm leading-relaxed text-gray-300">
            <li>Создайте аккаунт, введите все анкетные данные и активируйте номер телефона.</li>
            <li>Внесите депозит (минимум 10 EUR для первого, 15 EUR для 2-4 депозитов).</li>
            <li>Бонус будет начислен автоматически.</li>
          </ol>

          <h3 className="mt-6 text-white text-base font-bold">Бонусы и фриспины</h3>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed">
            {DEPOSIT_TIERS.map((tier) => (
              <li key={tier.deposit} className="flex gap-2 text-gray-300">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                <span>
                  <span className="font-semibold text-white">На {tier.deposit}:</span> {tier.reward}.
                </span>
              </li>
            ))}
          </ul>

          <h3 className="mt-6 text-white text-base font-bold">Правила и условия</h3>
          <ul className="mt-2 list-disc list-inside space-y-2 text-sm leading-relaxed text-gray-300">
            <li>
              Перед пополнением счета необходимо проставить согласие на получение бонуса на казино в Личном кабинете.
            </li>
            <li>
              Если вы переключаетесь между типами бонусов, отказываетесь от них или получаете бонус противоположного
              типа, вы теряете право на участие в бонусных предложениях на последующие депозиты.
            </li>
            <li>Фриспины доступны только после полного отыгрыша денежного бонуса на депозит.</li>
            <li>
              Все бонусы на депозит подлежат отыгрышу х35 размера бонуса в течение 7 дней после активации. При отыгрыше
              запрещено превышать ставку 5 EUR.
            </li>
            <li>
              При активном бонусе ставки из раздела Nextpari Games, идущие в зачет отыгрыша, засчитываются в двойном
              размере (за исключением некоторых игр, список которых доступен на сайте).
            </li>
            <li>Каждый новый бонус доступен после отыгрыша либо завершения предыдущего.</li>
            <li>Вся сумма бонуса должна быть проставлена перед тем, как можно будет вывести все деньги с игрового счета.</li>
          </ul>
        </article>
      </div>
    </div>
  );
}
