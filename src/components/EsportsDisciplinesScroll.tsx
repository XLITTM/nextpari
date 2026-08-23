import { Gamepad2 } from 'lucide-react';
import { SectionHeader } from './SectionHeader';
import { esportsDisciplines } from '../data';

export function EsportsDisciplinesScroll() {
  return (
    <div>
      <SectionHeader
        title="Дисциплины"
        badge="Esports"
        badgeColor="bg-[#0c1a2e] text-accent-400"
        onSeeAll={() => {}}
      />
      <div className="flex gap-2.5 overflow-x-auto no-scrollbar px-4 pb-1">
        {esportsDisciplines.map((d) => (
          <div
            key={d.id}
            className={`relative shrink-0 w-40 h-56 rounded-2xl bg-gradient-to-br ${d.gradient} overflow-hidden active:scale-95 transition-transform cursor-pointer`}
          >
            <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-[#1e3a5f]" />
            <div className="absolute -left-6 bottom-10 w-24 h-24 rounded-full bg-[#1e3a5f]" />

            {/* Game icon placeholder */}
            <div className="absolute inset-0 flex items-center justify-center">
              <Gamepad2 className="w-12 h-12 text-[#4ade80]/50 hover:scale-105 transition-transform" strokeWidth={1.5} />
            </div>

            {/* Game name at bottom */}
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
              <span className="text-white font-extrabold text-base drop-shadow-lg">{d.name}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
