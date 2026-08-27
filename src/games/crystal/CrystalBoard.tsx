import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { GEM_SRC } from './crystalAssets';
import type { CrystalCell, GemKind } from './crystalMath';

interface CrystalBoardProps {
  board: CrystalCell[];
  exploding: boolean[];
}

const GEM_GLOW: Record<GemKind, string> = {
  green: '#86efac',
  cyan: '#67e8f9',
  blue: '#93c5fd',
  red: '#fca5a5',
  purple: '#d8b4fe',
  orange: '#fdba74',
  coin: '#fde68a',
};

export function CrystalBoard({ board, exploding }: CrystalBoardProps) {
  const seenRef = useRef(new Set<string>());
  const prevBoard = seenRef.current;

  useLayoutEffect(() => {
    seenRef.current = new Set(board.map((cell) => cell.id));
  }, [board]);

  return (
    <div className="mx-auto aspect-square w-full max-w-[360px]" style={{ maxWidth: 'min(360px, calc(100dvh - 26rem))' }}>
      <div className="grid h-full w-full grid-cols-7 gap-1.5 p-2">
        {board.map((cell, index) => {
          const isNew = !prevBoard.has(cell.id);
          const boom = exploding[index];
          return (
            <div
              key={cell.id}
              className="relative flex aspect-square items-center justify-center rounded-lg border border-white/15 bg-black/35 shadow-inner"
            >
              <div className={`flex h-[82%] w-[82%] items-center justify-center ${boom ? 'crystal-pop' : isNew ? 'crystal-drop' : ''}`}>
                <img
                  src={GEM_SRC[cell.kind]}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                />
              </div>
              {boom && <Sparks color={GEM_GLOW[cell.kind]} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Sparks({ color }: { color: string }) {
  const sparks = [
    { sx: '-10px', sy: '-14px' },
    { sx: '12px', sy: '-12px' },
    { sx: '-14px', sy: '8px' },
    { sx: '12px', sy: '12px' },
    { sx: '0px', sy: '-16px' },
    { sx: '8px', sy: '14px' },
  ];
  return (
    <div className="pointer-events-none absolute inset-0">
      {sparks.map((spark, index) => (
        <span
          key={index}
          className="crystal-spark absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: color, '--sx': spark.sx, '--sy': spark.sy } as CSSProperties}
        />
      ))}
    </div>
  );
}
