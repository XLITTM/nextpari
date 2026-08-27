import { SectionHeader } from './SectionHeader';
import { casinoGames } from '../data';
import { coverForGame } from '../lib/casinoCovers';
import type { CasinoGame, Screen } from '../types';

interface CasinoCarouselProps {
  onNavigate?: (screen: Screen) => void;
}

function openCasinoGame(game: CasinoGame, onNavigate?: (screen: Screen) => void) {
  if (game.id === 'apples') onNavigate?.({ name: 'apples' });
  if (game.id === 'crystal') onNavigate?.({ name: 'crystal' });
  if (game.id === 'dice') onNavigate?.({ name: 'dice' });
  if (game.id === 'c4') onNavigate?.({ name: 'aviator' });
}

export function CasinoCarousel({ onNavigate }: CasinoCarouselProps) {
  return (
    <div>
      <SectionHeader title="Казино" onSeeAll={() => {}} />
      <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-4 pb-1">
        {casinoGames.map((game) => {
          const isApples = game.id === 'apples';
          const isCrystal = game.id === 'crystal';
          const cover = coverForGame(game.id, game.cover);
          return (
            <button
              key={game.id}
              type="button"
              onClick={() => openCasinoGame(game, onNavigate)}
              className={`group w-32 shrink-0 cursor-pointer overflow-hidden rounded-2xl bg-gray-50 text-left shadow-sm dark:bg-[#1e293b] ${
                isCrystal
                  ? 'relative border border-cyan-500/30 hover:border-cyan-400'
                  : isApples
                    ? 'relative border border-emerald-500/30 hover:border-emerald-400'
                    : 'border border-gray-200 transition-transform duration-200 hover:scale-[1.03] active:scale-95 dark:border-gray-700'
              }`}
            >
              <div
                className="relative flex aspect-[3/4] flex-col items-center justify-center overflow-hidden p-2"
                style={{ background: `linear-gradient(135deg, ${game.color}, ${game.color}99)` }}
              >
                {cover && (
                  <img
                    src={cover}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                {game.hot && (
                  <span
                    className={`absolute top-1.5 left-1.5 z-10 rounded px-1.5 py-0.5 text-[9px] font-extrabold ${
                      isCrystal
                        ? 'bg-amber-400 text-black'
                        : isApples
                          ? 'bg-red-600 text-white shadow-[0_0_12px_#f87171]'
                          : 'bg-red-500 text-white'
                    }`}
                  >
                    {isCrystal ? 'BEST' : isApples ? '🔥 HOT' : 'HOT'}
                  </span>
                )}
                {game.new && !game.hot && (
                  <span className="absolute top-1.5 left-1.5 z-10 rounded bg-brand-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    NEW
                  </span>
                )}
                {!cover && (
                  <>
                    <div className="absolute -right-6 -bottom-6 h-20 w-20 rounded-full bg-white/20" />
                    <span className="relative z-10 text-center text-xs font-extrabold leading-tight text-white drop-shadow">
                      {game.name}
                    </span>
                    <span className="relative z-10 mt-1 text-[9px] font-bold text-white">{game.rtp}</span>
                  </>
                )}
              </div>
              <div className="p-1.5">
                <p className="truncate text-[10px] font-bold text-gray-900 dark:text-white">{game.name}</p>
                <p className="truncate text-[9px] font-bold text-gray-600 dark:text-gray-300">{game.provider}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
