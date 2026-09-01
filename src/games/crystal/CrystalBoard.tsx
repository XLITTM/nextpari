import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { GEM_SRC } from './crystalAssets';
import { deriveCascadeActors, GRID, type CascadeActor } from './cascade';
import type { CrystalCell, GemKind } from './crystalMath';

export type CrystalMotion = 'idle' | 'explode' | 'fall';

interface CrystalBoardProps {
  board: CrystalCell[];
  exploding: boolean[];
  nextBoard?: CrystalCell[];
  motion: CrystalMotion;
  reducedMotion?: boolean;
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

const CELL_PCT = 100 / GRID;

export const CrystalBoard = memo(function CrystalBoard({
  board,
  exploding,
  nextBoard,
  motion,
  reducedMotion = false,
}: CrystalBoardProps) {
  const actors = useMemo(() => {
    if (motion !== 'fall' || !nextBoard || nextBoard.length !== board.length) return [];
    return deriveCascadeActors(board, exploding, nextBoard);
  }, [board, exploding, motion, nextBoard]);

  return (
    <div
      className="crystal-board mx-auto aspect-square w-full max-w-[360px]"
      data-cascade={motion}
      style={{ maxWidth: 'min(360px, calc(100dvh - 26rem))' }}
    >
      <div className="relative h-full w-full p-2">
        <div className="grid h-full w-full grid-cols-7 gap-1.5">
          {board.map((cell, index) => (
            <div
              key={`slot-${index}`}
              className="relative flex aspect-square items-center justify-center rounded-lg border border-white/15 bg-black/35"
            />
          ))}
        </div>
        {motion === 'fall' && actors.length > 0 ? (
          <div className="pointer-events-none absolute inset-2">
            {actors.map((actor) => (
              <FallingGem
                key={actor.id}
                actor={actor}
                reducedMotion={reducedMotion}
              />
            ))}
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-2 grid h-[calc(100%-0px)] w-full grid-cols-7 gap-1.5">
            {board.map((cell, index) => (
              <GemCell
                key={cell.id}
                cell={cell}
                boom={exploding[index] === true}
                reducedMotion={reducedMotion}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

const GemCell = memo(function GemCell({
  cell,
  boom,
  reducedMotion,
}: {
  cell: CrystalCell;
  boom: boolean;
  reducedMotion: boolean;
}) {
  return (
    <div className="relative flex aspect-square items-center justify-center">
      <div
        className={`flex h-[82%] w-[82%] items-center justify-center ${
          boom ? (reducedMotion ? 'crystal-pop-reduced' : 'crystal-pop') : ''
        }`}
      >
        <img
          src={GEM_SRC[cell.kind]}
          alt=""
          draggable={false}
          className="h-full w-full object-contain"
        />
      </div>
      {boom && !reducedMotion ? <Sparks color={GEM_GLOW[cell.kind]} /> : null}
    </div>
  );
});

function FallingGem({ actor, reducedMotion }: { actor: CascadeActor; reducedMotion: boolean }) {
  const [landed, setLanded] = useState(reducedMotion);
  const nodeRef = useRef<HTMLDivElement>(null);
  const distance = Math.max(0, actor.toRow - actor.fromRow);
  const duration = reducedMotion ? 80 : Math.min(300, 150 + distance * 28);
  const delay = actor.isNew && !reducedMotion ? actor.col * 18 : 0;

  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    const fromY = actor.fromRow * CELL_PCT;
    const toY = actor.toRow * CELL_PCT;
    const x = actor.col * CELL_PCT;
    node.style.transform = `translate3d(${x}%, ${fromY}%, 0)`;
    if (reducedMotion) {
      node.style.transform = `translate3d(${x}%, ${toY}%, 0)`;
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      node.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.85, 0.2, 1) ${delay}ms`;
      node.style.transform = `translate3d(${x}%, ${toY}%, 0)`;
    });
    const done = window.setTimeout(() => setLanded(true), duration + delay + 20);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(done);
    };
  }, [actor.col, actor.fromRow, actor.toRow, delay, duration, reducedMotion]);

  return (
    <div
      ref={nodeRef}
      data-cascade-id={actor.id}
      data-from-row={actor.fromRow}
      data-to-row={actor.toRow}
      data-new={actor.isNew ? '1' : '0'}
      className="absolute left-0 top-0 h-[calc(100%/7)] w-[calc(100%/7)] will-change-transform"
      style={{
        transform: `translate3d(${actor.col * CELL_PCT}%, ${actor.fromRow * CELL_PCT}%, 0)`,
      }}
    >
      <div className="flex h-full w-full items-center justify-center p-[8%]">
        <img
          src={GEM_SRC[actor.kind]}
          alt=""
          draggable={false}
          className={`h-[82%] w-[82%] object-contain ${landed && !reducedMotion ? 'crystal-land' : ''}`}
        />
      </div>
    </div>
  );
}

function Sparks({ color }: { color: string }) {
  const sparks = [
    { sx: '-8px', sy: '-10px' },
    { sx: '9px', sy: '-8px' },
    { sx: '-10px', sy: '7px' },
    { sx: '8px', sy: '9px' },
  ];
  return (
    <div className="pointer-events-none absolute inset-0">
      {sparks.map((spark, index) => (
        <span
          key={index}
          className="crystal-spark absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: color, '--sx': spark.sx, '--sy': spark.sy } as CSSProperties}
        />
      ))}
    </div>
  );
}
