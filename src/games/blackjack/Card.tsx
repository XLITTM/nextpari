import { useEffect, useState } from 'react';
import type { CardType } from './types';

export type CardScale = 'lg' | 'md' | 'sm';

interface CardProps {
  card: CardType;
  delay?: number;
  scale?: CardScale;
}

const SCALE_BOX: Record<CardScale, string> = {
  lg: 'h-32 w-20 sm:h-36 sm:w-24',
  md: 'h-26 w-16 sm:h-30 sm:w-20',
  sm: 'h-20 w-13 sm:h-24 sm:w-16',
};

const SCALE_TYPE: Record<CardScale, { rank: string; pip: string; inset: string; suit: string }> = {
  lg: {
    rank: 'text-[15px]',
    pip: 'text-[2.15rem]',
    inset: 'left-1.5 top-1.5',
    suit: 'text-[13px]',
  },
  md: {
    rank: 'text-[13px]',
    pip: 'text-[1.75rem]',
    inset: 'left-1 top-1',
    suit: 'text-[11px]',
  },
  sm: {
    rank: 'text-[11px]',
    pip: 'text-[1.35rem]',
    inset: 'left-1 top-1',
    suit: 'text-[10px]',
  },
};

export function Card({ card, delay = 0, scale = 'lg' }: CardProps) {
  const [entered, setEntered] = useState(false);
  const red = card.suit === '♥' || card.suit === '♦';
  const ink = red ? 'text-red-500' : 'text-slate-900';
  const faceDown = Boolean(card.isHidden);
  const type = SCALE_TYPE[scale];
  const bottomInset = scale === 'lg' ? 'bottom-1.5 right-1.5' : 'bottom-1 right-1';

  useEffect(() => {
    const id = window.setTimeout(() => setEntered(true), delay);
    return () => window.clearTimeout(id);
  }, [delay]);

  return (
    <div className={`shrink-0 ${SCALE_BOX[scale]} transition-all duration-300 ease-out`}>
      <div
        className={`bj-card h-full w-full ${entered ? 'bj-card-in' : 'bj-card-pre'}`}
        style={{ transitionDelay: `${delay}ms` }}
      >
        <div className={`bj-card-inner ${faceDown ? 'bj-is-back' : 'bj-is-face'}`} data-face={faceDown ? 'down' : 'up'}>
          <div className="bj-face bj-front rounded-xl border border-[#d4af37]/45 bg-white shadow-[0_8px_18px_rgba(0,0,0,0.35)]">
            <span
              className={`absolute ${type.inset} ${type.rank} font-black leading-none ${ink}`}
              style={{ textShadow: '0 1px 0 #e4c56a' }}
            >
              {card.rank}
              <span className={`block leading-none ${type.suit}`}>{card.suit}</span>
            </span>
            <span className={`${type.pip} leading-none ${ink}`}>{card.suit}</span>
            <span
              className={`absolute ${bottomInset} rotate-180 ${type.rank} font-black leading-none ${ink}`}
              style={{ textShadow: '0 1px 0 #e4c56a' }}
            >
              {card.rank}
              <span className={`block leading-none ${type.suit}`}>{card.suit}</span>
            </span>
          </div>
          <div className="bj-face bj-back" aria-hidden>
            <div className="bj-back-pattern">
              <span className="bj-back-logo">N</span>
              <span className="bj-back-word">Nextpari</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
