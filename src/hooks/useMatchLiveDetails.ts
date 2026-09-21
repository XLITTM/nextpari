import { useState } from 'react';
import { getCachedLiveSnapshot, type LiveEventSnapshot } from '../lib/betsapi';

export function useMatchLiveDetails(matchId: string, _enabled: boolean) {
  const [snapshot] = useState<LiveEventSnapshot | null>(() => getCachedLiveSnapshot(matchId));
  return snapshot;
}
