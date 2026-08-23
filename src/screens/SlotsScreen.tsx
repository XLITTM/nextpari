import { useState } from 'react';
import { ChevronLeft, Search, Filter, Play } from 'lucide-react';
import type { Screen } from '../types';

interface SlotsScreenProps {
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
}

const CATEGORIES = ['Все', 'Популярные', 'Новинки', 'Покупка бонуса', 'Megaways', 'Jackpot'];

const MOCK_SLOTS = [
  { id: '1', name: 'Aviator', provider: 'Spribe', image: 'https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&q=80&w=400', isHot: true },
  { id: '2', name: 'Sweet Bonanza', provider: 'Pragmatic Play', image: 'https://images.unsplash.com/photo-1629204245642-1e9bf4d48f95?auto=format&fit=crop&q=80&w=400', isHot: true },
  { id: '3', name: 'Supreme Hot', provider: 'EGT (Amusnet)', image: 'https://images.unsplash.com/photo-1596838132731-3301c3fd4317?auto=format&fit=crop&q=80&w=400', isHot: false },
  { id: '4', name: 'Gates of Olympus', provider: 'Pragmatic Play', image: 'https://images.unsplash.com/photo-1605870445919-838d190e8e1b?auto=format&fit=crop&q=80&w=400', isHot: true },
  { id: '5', name: '20 Super Hot', provider: 'EGT (Amusnet)', image: 'https://images.unsplash.com/photo-1517423440428-a5a00ad493e8?auto=format&fit=crop&q=80&w=400', isHot: false },
  { id: '6', name: 'The Dog House', provider: 'Pragmatic Play', image: 'https://images.unsplash.com/photo-1516684732162-798a0062be99?auto=format&fit=crop&q=80&w=400', isHot: false },
  { id: '7', name: 'Plinko', provider: 'Spribe', image: 'https://images.unsplash.com/photo-1614294149010-950b698f72c0?auto=format&fit=crop&q=80&w=400', isHot: false },
  { id: '8', name: 'Shining Crown', provider: 'EGT (Amusnet)', image: 'https://images.unsplash.com/photo-1606167668584-78701c57f13d?auto=format&fit=crop&q=80&w=400', isHot: true },
];

export function SlotsScreen({ onBack }: SlotsScreenProps) {
  const [activeCat, setActiveCat] = useState('Все');

  return (
    <div className="min-h-full flex flex-col bg-[#0a1128]">
      {/* Шапка */}
      <div className="bg-[#1e293b] shrink-0 border-b border-gray-800">
        <div className="flex items-center justify-between px-2 h-14">
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center text-gray-300 active:scale-95">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="flex-1 text-center text-lg font-bold text-white">Слоты</h1>
          <div className="flex items-center gap-1">
            <button className="w-9 h-9 flex items-center justify-center text-gray-300">
              <Search className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Фильтры категорий */}
      <div className="shrink-0 bg-[#1e293b] py-3 pl-4 overflow-x-auto scrollbar-hide border-b border-gray-800">
        <div className="flex gap-2">
          <button className="w-10 h-10 shrink-0 rounded-xl bg-[#2a3648] flex items-center justify-center text-gray-300 active:scale-95">
            <Filter className="w-5 h-5" />
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCat(cat)}
              className={`px-4 py-2 shrink-0 rounded-xl text-sm font-bold transition-colors ${
                activeCat === cat ? 'bg-brand-600 text-white' : 'bg-[#2a3648] text-gray-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Сетка слотов */}
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {MOCK_SLOTS.map(slot => (
            <div key={slot.id} className="relative rounded-xl overflow-hidden bg-[#1e293b] group cursor-pointer active:scale-95 transition-transform border border-gray-800 flex flex-col">
              <div className="aspect-square bg-gray-800 relative">
                <img src={slot.image} alt={slot.name} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                
                {/* Кнопка Play по центру (появляется при наведении или всегда на мобилке) */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-10 h-10 bg-brand-500 rounded-full flex items-center justify-center shadow-lg shadow-brand-500/50">
                    <Play className="w-5 h-5 text-white ml-0.5" fill="currentColor" />
                  </div>
                </div>

                {/* Плашка HOT */}
                {slot.isHot && (
                  <div className="absolute top-2 left-2 flex items-center bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">
                    HOT
                  </div>
                )}
              </div>
              
              <div className="p-2.5 flex-1 flex flex-col justify-between">
                <h3 className="text-gray-100 text-xs font-bold truncate">{slot.name}</h3>
                <p className="text-gray-500 text-[10px] uppercase tracking-wider mt-1 truncate">{slot.provider}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}