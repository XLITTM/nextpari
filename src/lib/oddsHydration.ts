import type { MatchEvent } from '../types';

export type OddsHydrationStatus = 'queued' | 'in_flight' | 'priced' | 'unavailable' | 'retryable';

export interface OddsHydrationState {
  status: OddsHydrationStatus;
  retryAt: number;
  attempts: number;
}

export const HYDRATION_BATCH = 40;
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

export interface HydrationMatch {
  id: string;
  isLive: boolean;
  priceState?: MatchEvent['priceState'];
  hasPrices: boolean;
}

export function hasDisplayedMainPrices(match: Pick<MatchEvent, 'markets'>): boolean {
  return match.markets['1'] > 1 && match.markets['2'] > 1;
}

export function isConfirmedUnavailable(state: MatchEvent['priceState']): boolean {
  return state === 'unavailable' || state === 'unrecognized' || state === 'suspended';
}

export function isRetryableQuoteState(state: MatchEvent['priceState']): boolean {
  return state === 'rate_limited' || state === 'upstream' || state === 'deferred';
}

function backoffMs(attempts: number): number {
  return BACKOFF_MS[Math.min(BACKOFF_MS.length - 1, Math.max(0, attempts - 1))];
}

export class OddsHydrationQueue {
  readonly states = new Map<string, OddsHydrationState>();
  readonly visible = new Set<string>();
  readonly featured = new Set<string>();

  syncCatalog(matches: readonly HydrationMatch[], now = Date.now()): void {
    const keep = new Set(matches.map((match) => match.id));
    for (const id of [...this.states.keys()]) {
      if (!keep.has(id)) this.states.delete(id);
    }
    for (const id of [...this.visible]) {
      if (!keep.has(id)) this.visible.delete(id);
    }
    for (const match of matches) {
      const existing = this.states.get(match.id);
      if (match.hasPrices) {
        this.states.set(match.id, { status: 'priced', retryAt: 0, attempts: existing?.attempts ?? 0 });
        continue;
      }
      if (isConfirmedUnavailable(match.priceState)) {
        this.states.set(match.id, { status: 'unavailable', retryAt: 0, attempts: existing?.attempts ?? 0 });
        continue;
      }
      if (existing?.status === 'in_flight' || existing?.status === 'priced' || existing?.status === 'unavailable') {
        continue;
      }
      if (existing?.status === 'retryable' && existing.retryAt > now) continue;
      this.states.set(match.id, { status: 'queued', retryAt: 0, attempts: existing?.attempts ?? 0 });
    }
  }

  markVisible(ids: readonly string[]): void {
    for (const id of ids) {
      if (!id) continue;
      this.visible.add(id);
      const existing = this.states.get(id);
      if (existing?.status === 'priced' || existing?.status === 'unavailable' || existing?.status === 'in_flight') continue;
      this.states.set(id, { status: 'queued', retryAt: 0, attempts: existing?.attempts ?? 0 });
    }
  }

  setFeatured(ids: readonly string[]): void {
    this.featured.clear();
    for (const id of ids) this.featured.add(id);
  }

  markInFlight(ids: readonly string[]): void {
    for (const id of ids) {
      const existing = this.states.get(id);
      this.states.set(id, { status: 'in_flight', retryAt: 0, attempts: existing?.attempts ?? 0 });
    }
  }

  applyQuote(
    id: string,
    quote: { priceState?: MatchEvent['priceState']; hasPrices: boolean },
  ): void {
    if (quote.hasPrices) {
      this.states.set(id, { status: 'priced', retryAt: 0, attempts: this.states.get(id)?.attempts ?? 0 });
      return;
    }
    if (isConfirmedUnavailable(quote.priceState) || quote.priceState === 'open') {
      this.states.set(id, { status: 'unavailable', retryAt: 0, attempts: this.states.get(id)?.attempts ?? 0 });
      return;
    }
    this.markFailed([id], Date.now(), isRetryableQuoteState(quote.priceState) ? backoffMs((this.states.get(id)?.attempts ?? 0) + 1) : undefined);
  }

  markFailed(ids: readonly string[], now = Date.now(), retryAfterMs?: number): void {
    for (const id of ids) {
      const existing = this.states.get(id);
      if (existing?.status === 'priced' || existing?.status === 'unavailable') continue;
      const attempts = (existing?.attempts ?? 0) + 1;
      this.states.set(id, {
        status: 'retryable',
        retryAt: now + (retryAfterMs ?? backoffMs(attempts)),
        attempts,
      });
    }
  }

  takeBatch(matches: readonly HydrationMatch[], batch = HYDRATION_BATCH, now = Date.now()): string[] {
    const ready = (id: string) => {
      const state = this.states.get(id);
      if (!state) return true;
      if (state.status === 'in_flight' || state.status === 'priced' || state.status === 'unavailable') return false;
      if (state.status === 'retryable') return state.retryAt <= now;
      return true;
    };
    const live: string[] = [];
    const prematch: string[] = [];
    for (const match of matches) {
      if (!ready(match.id)) continue;
      (match.isLive ? live : prematch).push(match.id);
    }
    const take = (pool: string[], limit: number, used: Set<string>) => {
      const picked: string[] = [];
      for (const id of pool) {
        if (picked.length >= limit || used.has(id)) continue;
        used.add(id);
        picked.push(id);
      }
      return picked;
    };
    const used = new Set<string>();
    const visibleLive = live.filter((id) => this.visible.has(id));
    const visiblePrematch = prematch.filter((id) => this.visible.has(id));
    const featuredLive = live.filter((id) => this.featured.has(id));
    const featuredPrematch = prematch.filter((id) => this.featured.has(id));
    const picked = [
      ...take(visibleLive, Math.ceil(batch / 4), used),
      ...take(visiblePrematch, Math.ceil(batch / 4), used),
      ...take(featuredLive, Math.ceil(batch / 8), used),
      ...take(featuredPrematch, Math.ceil(batch / 8), used),
    ];
    const otherLive = live.filter((id) => !used.has(id));
    const otherPrematch = prematch.filter((id) => !used.has(id));
    for (let index = 0; picked.length < batch; index += 1) {
      const nextLive = otherLive[index];
      const nextPrematch = otherPrematch[index];
      if (!nextLive && !nextPrematch) break;
      if (nextLive && picked.length < batch) {
        used.add(nextLive);
        picked.push(nextLive);
      }
      if (nextPrematch && picked.length < batch) {
        used.add(nextPrematch);
        picked.push(nextPrematch);
      }
    }
    return picked.slice(0, batch);
  }

  nextRetryAt(now = Date.now()): number | null {
    let soonest: number | null = null;
    for (const state of this.states.values()) {
      if (state.status !== 'retryable' || state.retryAt <= now) continue;
      if (soonest === null || state.retryAt < soonest) soonest = state.retryAt;
    }
    return soonest;
  }
}
