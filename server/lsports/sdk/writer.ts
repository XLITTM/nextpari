import type { LsportsFlow } from '../config.js';
import type { LsportsTransportKind } from './mode.js';

export class LsportsDualWriterError extends Error {
  readonly flow: LsportsFlow;
  readonly current: LsportsTransportKind;
  readonly attempted: LsportsTransportKind;

  constructor(flow: LsportsFlow, current: LsportsTransportKind, attempted: LsportsTransportKind) {
    super(`LSPORTS_DUAL_WRITER flow=${flow} current=${current} attempted=${attempted}`);
    this.name = 'LsportsDualWriterError';
    this.flow = flow;
    this.current = current;
    this.attempted = attempted;
  }
}

const writers: Record<LsportsFlow, LsportsTransportKind | null> = {
  inplay: null,
  prematch: null,
};

export function claimCanonicalWriter(flow: LsportsFlow, transport: LsportsTransportKind): void {
  const current = writers[flow];
  if (current != null && current !== transport) {
    throw new LsportsDualWriterError(flow, current, transport);
  }
  writers[flow] = transport;
}

export function releaseCanonicalWriter(flow: LsportsFlow, transport: LsportsTransportKind): void {
  if (writers[flow] === transport) writers[flow] = null;
}

export function currentCanonicalWriter(flow: LsportsFlow): LsportsTransportKind | null {
  return writers[flow];
}

export function canonicalWriterSnapshot(): Record<LsportsFlow, LsportsTransportKind | null> {
  return { inplay: writers.inplay, prematch: writers.prematch };
}

export function resetCanonicalWritersForTests(): void {
  writers.inplay = null;
  writers.prematch = null;
}
