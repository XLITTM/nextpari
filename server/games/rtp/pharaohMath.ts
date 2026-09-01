export const PHARAOH_MATH_VERSION = 'pharaoh-v2-rtp875';
export const PHARAOH_WEIGHT_TOTAL = 10_000;
export const PHARAOH_HIT_DENOM = 10_000;

export interface PharaohPrize {
  id: string;
  mult: number;
  prizeWeight: number;
  hitBps: number;
}

/** Audited prize classes. RTP = Σ (w/10000)·(hitBps/10000)·mult. */
export const PHARAOH_PRIZES: readonly PharaohPrize[] = [
  { id: 'cat', mult: 10000, prizeWeight: 70, hitBps: 13 },
  { id: 'scroll', mult: 1000, prizeWeight: 80, hitBps: 30 },
  { id: 'nemes', mult: 200, prizeWeight: 100, hitBps: 50 },
  { id: 'pyramid', mult: 100, prizeWeight: 150, hitBps: 80 },
  { id: 'ring', mult: 50, prizeWeight: 250, hitBps: 100 },
  { id: 'ankh', mult: 20, prizeWeight: 350, hitBps: 200 },
  { id: 'canopic', mult: 10, prizeWeight: 500, hitBps: 300 },
  { id: 'lotus', mult: 5, prizeWeight: 800, hitBps: 500 },
  { id: 'cylinder', mult: 4, prizeWeight: 1200, hitBps: 3000 },
  { id: 'harp', mult: 2, prizeWeight: 2500, hitBps: 5000 },
  { id: 'sistrum', mult: 1, prizeWeight: 4000, hitBps: 7063 },
];

export function pharaohExactRtp(): { numerator: number; denominator: number; rtp: number; houseEdge: number } {
  let numerator = 0;
  let weight = 0;
  for (const prize of PHARAOH_PRIZES) {
    numerator += prize.prizeWeight * prize.hitBps * prize.mult;
    weight += prize.prizeWeight;
  }
  const denominator = weight * PHARAOH_HIT_DENOM;
  return {
    numerator,
    denominator,
    rtp: numerator / denominator,
    houseEdge: 1 - numerator / denominator,
  };
}
