import { tournamentPriority } from '@/lib/betsapi';
import { isLsportsDisplayEvent } from '@/lib/lsportsFeed';
import { useSportsStore } from '@/stores/sportsStore';

const MAX_LIVE = 16;
const MAX_LINE = 8;

export function pickCatalogIds(liveLimit = MAX_LIVE, lineLimit = MAX_LINE): string[] {
  const store = useSportsStore.getState();
  const rank = (id: string) => {
    const event = store.getEvent(id)?.event;
    return tournamentPriority(event?.league.name);
  };
  const live = store
    .getLiveEvents()
    .filter((event) => !isLsportsDisplayEvent(event))
    .map((event) => event.id)
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, liveLimit);
  const line = store
    .getUpcomingEvents()
    .filter((event) => !isLsportsDisplayEvent(event))
    .map((event) => event.id)
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, lineLimit);
  return [...live, ...line];
}

export async function hydrateCatalogOdds(_eventIds?: string[], _signal?: AbortSignal): Promise<void> {
  return;
}
