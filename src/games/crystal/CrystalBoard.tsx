import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { GEM_SRC } from './crystalAssets';
import {
  deriveCascadeActors,
  overlayPoint,
  type CascadeActor,
  type GridMetrics,
  GRID,
} from './cascade';
import type { CrystalCell, GemKind } from './crystalMath';

export type CrystalMotion = 'idle' | 'highlight' | 'explode' | 'fall';

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

function readGridMetrics(boardEl: HTMLElement | null): GridMetrics | null {
  if (!boardEl) return null;
  const slots = boardEl.querySelectorAll<HTMLElement>('[data-slot]');
  if (slots.length < GRID + 1) return null;
  const first = slots[0];
  const right = slots[1];
  const down = slots[GRID];
  if (!first || !right || !down) return null;
  const boardBox = boardEl.getBoundingClientRect();
  const a = first.getBoundingClientRect();
  const b = right.getBoundingClientRect();
  const c = down.getBoundingClientRect();
  return {
    cellW: a.width,
    cellH: a.height,
    strideX: b.left - a.left,
    strideY: c.top - a.top,
    originX: a.left - boardBox.left,
    originY: a.top - boardBox.top,
  };
}

export const CrystalBoard = memo(function CrystalBoard({
  board,
  exploding,
  nextBoard,
  motion,
  reducedMotion = false,
}: CrystalBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<GridMetrics | null>(null);
  const overlayActive = motion === 'fall' && Boolean(nextBoard);
  const actors = useMemo(() => {
    if (!overlayActive || !nextBoard) return [];
    return deriveCascadeActors(board, exploding, nextBoard);
  }, [board, exploding, nextBoard, overlayActive]);

  useLayoutEffect(() => {
    setMetrics(readGridMetrics(boardRef.current));
  }, [board, motion, overlayActive]);

  return (
    <div
      ref={boardRef}
      className="crystal-board relative mx-auto aspect-square w-full max-w-[360px] overflow-visible"
      data-cascade={motion}
      data-base-grid="7x7"
      style={{ maxWidth: 'min(360px, calc(100dvh - 26rem))' }}
    >
      <div className="grid h-full w-full grid-cols-7 gap-1.5 p-2">
        {board.map((cell, index) => {
          const col = index % GRID;
          const row = Math.floor(index / GRID);
          const boom = exploding[index] === true;
          const hideGem = overlayActive;
          return (
            <div
              key={`slot-${index}`}
              data-slot={index}
              data-slot-col={col}
              data-slot-row={row}
              className="relative flex aspect-square items-center justify-center rounded-lg border border-white/15 bg-black/35 shadow-inner"
            >
              {hideGem ? null : (
                <GemCell
                  cell={cell}
                  col={col}
                  row={row}
                  boom={boom}
                  motion={motion}
                  reducedMotion={reducedMotion}
                />
              )}
            </div>
          );
        })}
      </div>
      {overlayActive && metrics && actors.length > 0 ? (
        <div className="pointer-events-none absolute inset-0 overflow-visible" data-cascade-overlay="1">
          {actors.map((actor) => (
            <FallingGem
              key={actor.id}
              actor={actor}
              metrics={metrics}
              reducedMotion={reducedMotion}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
});

const GemCell = memo(function GemCell({
  cell,
  col,
  row,
  boom,
  motion,
  reducedMotion,
}: {
  cell: CrystalCell;
  col: number;
  row: number;
  boom: boolean;
  motion: CrystalMotion;
  reducedMotion: boolean;
}) {
  const highlight = boom && motion === 'highlight';
  const explode = boom && motion === 'explode';
  return (
    <div
      data-gem-id={cell.id}
      data-col={col}
      data-row={row}
      data-resting-transform="none"
      className="relative flex h-full w-full items-center justify-center"
      style={{ transform: 'none' }}
    >
      <div
        className={`flex h-[82%] w-[82%] items-center justify-center ${
          explode ? (reducedMotion ? 'crystal-pop-reduced' : 'crystal-pop') : ''
        } ${highlight ? (reducedMotion ? 'crystal-highlight-reduced' : 'crystal-highlight') : ''}`}
      >
        <img
          src={GEM_SRC[cell.kind]}
          alt=""
          draggable={false}
          className="h-full w-full object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
        />
      </div>
      {explode && !reducedMotion ? <Sparks color={GEM_GLOW[cell.kind]} /> : null}
    </div>
  );
});

function FallingGem({
  actor,
  metrics,
  reducedMotion,
}: {
  actor: CascadeActor;
  metrics: GridMetrics;
  reducedMotion: boolean;
}) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [landed, setLanded] = useState(reducedMotion);
  const dest = overlayPoint(actor.col, actor.toRow, metrics);
  const from = overlayPoint(actor.col, actor.fromRow, metrics);
  const dy = from.y - dest.y;
  const duration = reducedMotion ? 80 : 260;

  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    node.style.transition = 'none';
    node.style.transform = `translate3d(0, ${dy}px, 0)`;
    if (reducedMotion) {
      node.style.transform = 'translate3d(0, 0, 0)';
      setLanded(true);
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      node.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.85, 0.2, 1)`;
      node.style.transform = 'translate3d(0, 0, 0)';
    });
    const done = window.setTimeout(() => setLanded(true), duration);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(done);
    };
  }, [dy, duration, reducedMotion]);

  return (
    <div
      ref={nodeRef}
      data-cascade-id={actor.id}
      data-col={actor.col}
      data-from-row={actor.fromRow}
      data-to-row={actor.toRow}
      data-new={actor.isNew ? '1' : '0'}
      className="absolute will-change-transform"
      style={{
        left: dest.x,
        top: dest.y,
        width: metrics.cellW,
        height: metrics.cellH,
        transform: `translate3d(0, ${dy}px, 0)`,
      }}
    >
      <div className="flex h-full w-full items-center justify-center">
        <img
          src={GEM_SRC[actor.kind]}
          alt=""
          draggable={false}
          className={`h-[82%] w-[82%] object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${
            landed && !reducedMotion ? 'crystal-land' : ''
          }`}
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
