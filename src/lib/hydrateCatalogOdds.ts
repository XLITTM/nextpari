import { fetchEventOdds, pickClockFromOdds, tournamentPriority } from '@/lib/betsapi';
import { parseOdds } from '@/lib/odds-parser';
import { enrichProviderMarkets } from '@/lib/matchOdds';
import { useSportsStore } from '@/stores/sportsStore';

const MAX_LIVE = 16;
const MAX_LINE = 8;
const STALE_MS = 10_000;

/** Home/catalog odds: reuse quotes younger than 10s. placeBet never reads this TTL. */

let running = false;
const lastHydrated = new Map<string, number>();

function hasMainMarket(eventId: string): boolean {
  const markets = useSportsStore.getState().getEvent(eventId)?.markets ?? {};
  return Object.values(markets).some((market) => market.category === 'main' && market.entries.length > 0);
}

export function pickCatalogIds(liveLimit = MAX_LIVE, lineLimit = MAX_LINE): string[] {
  const store = useSportsStore.getState();
  const rank = (id: string) => {
    const event = store.getEvent(id)?.event;
    return tournamentPriority(event?.league.name);
  };
  const live = store
    .getLiveEvents()
    .map((event) => event.id)
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, liveLimit);
  const line = store
    .getUpcomingEvents()
    .map((event) => event.id)
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, lineLimit);
  return [...live, ...line];
}

export async function hydrateCatalogOdds(eventIds: string[], signal?: AbortSignal): Promise<void> {
  if (running || !eventIds.length) return;
  running = true;
  try {
    for (const id of eventIds) {
      if (signal?.aborted) return;
      const state = useSportsStore.getState().getEvent(id);
      if (!state) continue;
      const prevAt = lastHydrated.get(id) ?? 0;
      if (hasMainMarket(id) && Date.now() - prevAt < STALE_MS) continue;

      const { odds, stats, clock } = await fetchEventOdds(id, undefined, signal);
      if (signal?.aborted || !Object.keys(odds).length) continue;

      const markets = enrichProviderMarkets(
        parseOdds(odds, { sportId: state.event.sport_id }),
        odds,
        state.event.sport_id,
      );
      if (!markets.length) continue;

      const first = Object.values(odds)[0]?.[0];
      const ss =
        (stats && typeof stats === 'object' && 'ss' in stats ? String(stats.ss ?? '') : '') ||
        (first && typeof first === 'object' && first && 'ss' in first ? String(first.ss ?? '') : '') ||
        state.score;
      const time = clock || pickClockFromOdds(odds, stats) || state.matchTime;
      if (ss || time) useSportsStore.getState().setScore(id, ss || state.score || '-', time);

      const updateTs = Number(
        first && typeof first === 'object' && first && 'odds_update' in first
          ? first.odds_update
          : Date.now() / 1000,
      );
      useSportsStore.getState().setOdds(id, markets, updateTs);
      lastHydrated.set(id, Date.now());
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    if (error instanceof Error && error.name !== 'AbortError') {
      console.warn('catalog odds', error.message);
    }
  } finally {
    running = false;
  }
}
