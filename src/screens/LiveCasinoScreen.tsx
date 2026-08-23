import { ChevronLeft } from 'lucide-react';
import type { Screen } from '../types';

interface LiveCasinoScreenProps {
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
}

export function LiveCasinoScreen({ onBack }: LiveCasinoScreenProps) {
  return (
    <div className="min-h-full flex flex-col bg-[#0a1128]">
      <div className="bg-[#1e293b] shrink-0 border-b border-gray-800">
        <div className="flex items-center justify-between px-2 h-14">
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center text-gray-300 active:scale-95">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="flex-1 text-center text-lg font-bold text-white">Лайв казино</h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-24 flex items-center justify-center">
        <p className="text-gray-400 text-sm text-center">Скоро здесь появятся столы лайв-казино</p>
      </div>
    </div>
  );
}
