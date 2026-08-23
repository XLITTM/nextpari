import { SectionHeader } from './SectionHeader';
import { casinoCategories } from '../data';

export function CasinoCategoriesScroll() {
  return (
    <div>
      <SectionHeader title="Категории Казино" onSeeAll={() => {}} />
      <div className="flex gap-2.5 overflow-x-auto no-scrollbar px-4 pb-1">
        {casinoCategories.map((cat) => (
          <div
            key={cat.id}
            className={`relative shrink-0 w-36 h-36 rounded-2xl bg-gradient-to-br ${cat.gradient} overflow-hidden active:scale-95 transition-transform cursor-pointer`}
          >
            <div className="absolute -right-6 -top-6 w-20 h-20 rounded-full bg-[#1e3a5f]" />
            <div className="absolute -left-4 -bottom-4 w-16 h-16 rounded-full bg-[#1e3a5f]" />
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <span className="text-white font-extrabold text-sm drop-shadow">{cat.name}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
