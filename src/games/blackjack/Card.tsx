import { useEffect, useState } from 'react';
import type { CardType } from './types';

interface CardProps {
  card: CardType;
  delay?: number;
}

export function Card({ card, delay = 0 }: CardProps) {
  const [entered, setEntered] = useState(false);
  const red = card.suit === '♥' || card.suit === '♦';
  const ink = red ? 'text-red-500' : 'text-slate-900';
  const faceDown = Boolean(card.isHidden);

  useEffect(() => {
    const id = window.setTimeout(() => setEntered(true), delay);
    return () => window.clearTimeout(id);
  }, [delay]);

  return (
    <div
      className={`bj-card h-32 w-20 shrink-0 sm:h-36 sm:w-24 ${entered ? 'bj-card-in' : 'bj-card-pre'}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className={`bj-card-inner ${faceDown ? 'bj-is-back' : 'bj-is-face'}`}>
        <div className="bj-face bj-front rounded-xl border border-[#d4af37]/45 bg-white shadow-[0_8px_18px_rgba(0,0,0,0.35)]">
          <span
            className={`absolute left-1.5 top-1.5 text-[15px] font-black leading-none ${ink}`}
            style={{ textShadow: '0 1px 0 #e4c56a' }}
          >
            {card.rank}
            <span className="block text-[13px] leading-none">{card.suit}</span>
          </span>
          <span className={`text-[2.15rem] leading-none ${ink}`}>{card.suit}</span>
          <span
            className={`absolute bottom-1.5 right-1.5 rotate-180 text-[15px] font-black leading-none ${ink}`}
            style={{ textShadow: '0 1px 0 #e4c56a' }}
          >
            {card.rank}
            <span className="block text-[13px] leading-none">{card.suit}</span>
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
  );
}
