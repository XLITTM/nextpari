import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { CRYSTAL_ICONS } from './crystalAssets';
import type { CrystalCell, GemKind } from './crystalMath';

interface CrystalBoardProps {
  board: CrystalCell[];
  exploding: boolean[];
}

const GEM_SRC: Record<GemKind, string> = {
  green: CRYSTAL_ICONS.GREEN,
  cyan: CRYSTAL_ICONS.CYAN,
  blue: CRYSTAL_ICONS.BLUE,
  red: CRYSTAL_ICONS.RED,
  purple: CRYSTAL_ICONS.PURPLE,
  orange: CRYSTAL_ICONS.ORANGE,
  coin: CRYSTAL_ICONS.COIN,
};

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
    <div className="relative mx-auto w-full max-w-[360px]">
      <div className="aspect-square w-full rounded-2xl border border-cyan-500/30 bg-black/40 p-2 shadow-2xl shadow-cyan-950/80 backdrop-blur-md">
        <div className="grid h-full grid-cols-7 gap-1">
          {board.map((cell, index) => {
            const isNew = !prevBoard.has(cell.id);
            const boom = exploding[index];
            return (
              <div key={cell.id} className="relative min-h-0 min-w-0">
                <div className={`h-full w-full ${boom ? 'crystal-pop' : isNew ? 'crystal-drop' : ''}`}>
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
