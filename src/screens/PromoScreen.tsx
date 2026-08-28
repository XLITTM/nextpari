import { useState } from 'react';
import {
  ShoppingCart, ChevronLeft, Gamepad2, Eye, RotateCcw,
  Award, CircleDollarSign, Gift, ChevronRight, X, Ticket,
} from 'lucide-react';
import { useToast } from '../ToastContext';
import { useProfile } from '../ProfileContext';
import { RestrictionModal } from '../components/RestrictionModal';

import type { Screen } from '../types';

interface PromoScreenProps {
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
}

const promoItems = [
  { icon: Gamepad2, label: 'Бонусные игры', desc: 'Играйте и получайте призы', iconBg: 'bg-amber-500', action: 'games' },
  { icon: Eye, label: 'Проверка промокода', desc: 'Введите промокод для активации', iconBg: 'bg-emerald-600', action: 'check' },
  { icon: RotateCcw, label: 'Кешбэк', desc: 'Возврат до 10% от проигрыша', iconBg: 'bg-amber-500', action: 'cashback' },
  { icon: Award, label: 'VIP кешбэк', desc: 'Эксклюзивный возврат для VIP-игроков', iconBg: 'bg-emerald-600', action: 'vip' },
  { icon: CircleDollarSign, label: 'Участие в акциях', desc: 'Турниры и конкурсы прогнозов', iconBg: 'bg-amber-500', action: 'actions' },
  { icon: Gift, label: 'Бонусы', desc: 'Подарки и поощрения для игроков', iconBg: 'bg-emerald-600', action: 'bonus' },
] as const;

export function PromoScreen({ onBack, onNavigate }: PromoScreenProps) {
  const { showToast } = useToast();
  const { isProfileComplete } = useProfile();
  const [showCheckModal, setShowCheckModal] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [showRestriction, setShowRestriction] = useState(false);

  const handleItemClick = (action: string) => {
    if (action === 'check') {
      setShowCheckModal(true);
      return;
    }
    if (action === 'vip' || action === 'cashback') {
      onNavigate({ name: 'vip-cashback' });
      return;
    }
    if (!isProfileComplete) {
      setShowRestriction(true);
      return;
    }
    showToast('Скоро будет доступно');
  };

  const handleCheckPromo = () => {
    if (!promoCode.trim()) {
      showToast('Введите промокод');
      return;
    }
    showToast('Промокод не найден');
    setPromoCode('');
    setShowCheckModal(false);
  };

  return (
    <div className="pt-2 pb-4">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 pb-3">
        <button
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-white active:scale-90 transition-transform"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Promo</h1>
      </div>

      {/* Main promo banner - solid bright gradient */}
      <div className="mx-3 bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-4 text-white shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm">
            <ShoppingCart className="w-6 h-6 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-xl">Промокоды</h3>
            <p className="font-bold text-white text-sm mt-0.5">Промо баллы: 0 PTS</p>
          </div>
        </div>
      </div>

      {/* Promo list - solid dense cards */}
      <div className="mt-4 px-3">
        <div className="space-y-2">
          {promoItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => handleItemClick(item.action)}
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

      {/* Promo code check modal */}
      {showCheckModal && (
        <div
          className="fixed inset-0 z-[100] bg-black flex items-end sm:items-center justify-center animate-fade-in"
          onClick={() => setShowCheckModal(false)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-3xl p-5 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center">
                  <Ticket className="w-5 h-5 text-white" strokeWidth={2.5} />
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Проверка промокода</h3>
              </div>
              <button
                onClick={() => setShowCheckModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-500 dark:text-gray-300 hover:text-red-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              placeholder="Введите промокод"
              className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-base font-semibold rounded-xl px-4 py-3 mb-4 outline-none border border-gray-300 dark:border-gray-600 focus:border-emerald-600 transition-colors"
            />
            <button
              onClick={handleCheckPromo}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl transition-all active:scale-[0.98]"
            >
              Проверить
            </button>
          </div>
        </div>
      )}
      {/* Restriction modal */}
      <RestrictionModal
        open={showRestriction}
        message="Для получения бонусов необходимо заполнить личные данные"
        buttonText="Заполнить данные"
        onAction={() => { setShowRestriction(false); onNavigate({ name: 'personal-data' }); }}
        onClose={() => setShowRestriction(false)}
      />
    </div>
  );
}
