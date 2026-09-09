import {
  ShoppingCart, ChevronLeft, Gamepad2, Eye, RotateCcw,
  Award, CircleDollarSign, Gift, ChevronRight,
} from 'lucide-react';
import type { Screen } from '../types';

interface PromoScreenProps {
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
}

const promoItems: {
  icon: typeof Gamepad2;
  label: string;
  desc: string;
  iconBg: string;
  availability?: 'soon';
  route?: Screen;
}[] = [
  { icon: Gamepad2, label: 'Бонусные игры', desc: 'Играйте и получайте призы', iconBg: 'bg-amber-500', availability: 'soon' },
  { icon: Eye, label: 'Проверка промокода', desc: 'Промокоды появятся после подключения бонусной системы', iconBg: 'bg-emerald-600', availability: 'soon' },
  { icon: RotateCcw, label: 'Кешбэк', desc: 'Информация о будущей программе кешбэка', iconBg: 'bg-amber-500', route: { name: 'vip-cashback' } },
  { icon: Award, label: 'VIP кешбэк', desc: 'Информация о VIP-программе', iconBg: 'bg-emerald-600', route: { name: 'vip-cashback' } },
  { icon: CircleDollarSign, label: 'Участие в акциях', desc: 'Турниры и конкурсы прогнозов', iconBg: 'bg-amber-500', availability: 'soon' },
  { icon: Gift, label: 'Бонусы', desc: 'Подарки и поощрения для игроков', iconBg: 'bg-emerald-600', availability: 'soon' },
];

export function PromoScreen({ onBack, onNavigate }: PromoScreenProps) {
  return (
    <div className="pt-2 pb-4">
      <div className="flex items-center gap-3 px-3 pb-3">
        <button
          type="button"
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-white active:scale-90 transition-transform"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Promo</h1>
      </div>

      <div className="mx-3 bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-4 text-white shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm">
            <ShoppingCart className="w-6 h-6 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-xl">Промо</h3>
            <p className="font-bold text-white text-sm mt-0.5">
              Акции и бонусы появятся после подключения бонусной системы
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 px-3">
        <div className="space-y-2">
          {promoItems.map((item) => {
            const Icon = item.icon;
            const route = item.route;
            const soon = item.availability === 'soon' || !route;
            if (soon || !route) {
              return (
                <div
                  key={item.label}
                  className="w-full flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-300 dark:border-gray-700 shadow-sm text-left"
                >
                  <div className={`w-11 h-11 rounded-full ${item.iconBg} flex items-center justify-center shrink-0 shadow-sm`}>
                    <Icon className="w-5 h-5 text-white" strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 dark:text-white font-bold text-base">{item.label}</p>
                    <p className="text-gray-500 dark:text-gray-300 mt-0.5 font-semibold text-xs">{item.desc}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    Скоро
                  </span>
                </div>
              );
            }
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => onNavigate(route)}
                className="w-full flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-300 dark:border-gray-700 shadow-sm active:scale-[0.98] transition-transform text-left"
              >
                <div className={`w-11 h-11 rounded-full ${item.iconBg} flex items-center justify-center shrink-0 shadow-sm`}>
                  <Icon className="w-5 h-5 text-white" strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 dark:text-white font-bold text-base">{item.label}</p>
                  <p className="text-gray-500 dark:text-gray-300 mt-0.5 font-semibold text-xs">{item.desc}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-400 shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
