import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CELL_COUNT,
  GRID,
  deriveCascadeActors,
  overlayPoint,
  restingSlots,
} from '../../src/games/crystal/cascade.js';
import type { CrystalCell } from '../../src/games/crystal/crystalMath.js';

function cell(id: string, kind: CrystalCell['kind'] = 'green'): CrystalCell {
  return { id, kind };
}

function boardFrom(ids: string[]): CrystalCell[] {
  assert.equal(ids.length, CELL_COUNT);
  return ids.map((id, index) => cell(id, index % 2 === 0 ? 'green' : 'red'));
}

describe('crystal resting grid and cascade overlay plan', () => {
  it('maps 49 resting gems to unique integer row/column with no transform', () => {
    const board = boardFrom(Array.from({ length: CELL_COUNT }, (_, i) => `g${i}`));
    const slots = restingSlots(board);
    assert.equal(slots.length, 49);
    assert.equal(GRID, 7);
    const seen = new Set<string>();
    for (const slot of slots) {
      assert.equal(Number.isInteger(slot.row), true);
      assert.equal(Number.isInteger(slot.col), true);
      assert.ok(slot.row >= 0 && slot.row < 7);
      assert.ok(slot.col >= 0 && slot.col < 7);
      assert.equal(slot.transform, 'none');
      assert.equal(slot.index, slot.row * GRID + slot.col);
      const key = `${slot.col},${slot.row}`;
      assert.equal(seen.has(key), false, `duplicate destination ${key}`);
      seen.add(key);
    }
    assert.equal(seen.size, 49);
  });

  it('survivors fall down and new gems start above the board', () => {
    const oldBoard = boardFrom(Array.from({ length: CELL_COUNT }, (_, i) => `old-${i}`));
    const nextBoard = boardFrom(Array.from({ length: CELL_COUNT }, (_, i) => `next-${i}`));
    const exploding = Array.from({ length: CELL_COUNT }, (_, i) => i % GRID === 0 && Math.floor(i / GRID) >= 4);
    const actors = deriveCascadeActors(oldBoard, exploding, nextBoard);
    const dest = new Set<string>();
    for (const actor of actors) {
      const key = `${actor.col},${actor.toRow}`;
      assert.equal(dest.has(key), false, `duplicate overlay destination ${key}`);
      dest.add(key);
      if (actor.isNew) {
        assert.ok(actor.fromRow < 0, `new gem ${actor.id} must start above row 0`);
        assert.ok(actor.toRow >= 0 && actor.toRow < GRID);
      } else {
        assert.ok(actor.toRow >= actor.fromRow, `survivor ${actor.id} must move down or stay`);
      }
    }
    assert.equal(dest.size, CELL_COUNT);
  });

  it('overlay destinations use base-grid metrics, not leftover animation offsets', () => {
    const metrics = {
      cellW: 40,
      cellH: 40,
      strideX: 46,
      strideY: 46,
      originX: 8,
      originY: 8,
    };
    const a = overlayPoint(0, 0, metrics);
    const b = overlayPoint(6, 6, metrics);
    assert.equal(a.x, 8);
    assert.equal(a.y, 8);
    assert.equal(b.x, 8 + 6 * 46);
    assert.equal(b.y, 8 + 6 * 46);
    const above = overlayPoint(2, -3, metrics);
    assert.ok(above.y < metrics.originY);
  });
});
