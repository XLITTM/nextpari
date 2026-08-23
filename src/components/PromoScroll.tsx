import type { Screen } from '../types';

interface Promo {
  title: string;
  image: string;
  route: Screen;
}

const promos: Promo[] = [
  {
    title: 'Марафон Экспрессов',
    image: '/promo-marathon.png',
    route: { name: 'promo-marathon' },
  },
  {
    title: '100% Бонус на депозит',
    image: '/promo-tiger.png',
    route: { name: 'promo-details' },
  },
  {
    title: 'Приветственный пакет',
    image: '/promo-welcome.png',
    route: { name: 'promo-welcome' },
  },
  {
    title: 'Непобедимый',
    image: '/promo-unbeatable.png',
    route: { name: 'promo-unbeatable' },
  },
];

interface PromoScrollProps {
  onNavigate: (screen: Screen) => void;
}

const CARD_CLASS =
  'w-[110px] h-[60px] shrink-0 rounded-2xl bg-cover bg-center cursor-pointer overflow-hidden';

export function PromoScroll({ onNavigate }: PromoScrollProps) {
  return (
    <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="flex flex-nowrap overflow-x-auto gap-2 pb-2 snap-x scrollbar-hide">
        {promos.map((promo) => (
          <div key={promo.title} className="flex flex-col items-center gap-1 shrink-0">
            <button
              type="button"
              aria-label={promo.title}
              onClick={() => onNavigate(promo.route)}
              className={CARD_CLASS}
              style={{ backgroundImage: `url(${promo.image})` }}
            />
            <p className="text-[10px] text-gray-500 font-medium text-center line-clamp-2 w-[110px]">
              {promo.title}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
