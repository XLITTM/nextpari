import { useCallback, useEffect, useState } from 'react';
import { isLsportsDisplayFeedEnabled } from '@/lib/lsportsFeed';
import {
  applyLsportsBrowserFeed,
  pollLsportsBrowserFeed,
  type LsportsBrowserFeed,
} from '@/lib/lsportsShadowPublish';

const POLL_MS = 2_000;

export interface LsportsFeedDiagnostics {
  health: 'HEALTHY' | 'STALE' | 'UNKNOWN' | 'ERROR';
  lastSuccessfulFetchAt: number | null;
  matchCount: number;
  marketCount: number;
  outcomeCount: number;
  generatedAt: number;
  stale: boolean;
  failure: string | null;
}

function diagnosticsFromFeed(feed: LsportsBrowserFeed): LsportsFeedDiagnostics {
  let marketCount = 0;
  let outcomeCount = 0;
  for (const match of feed.matches) {
    marketCount += match.markets.length;
    for (const market of match.markets) {
      for (const entry of market.entries) outcomeCount += entry.outcomes.length;
    }
  }
  return {
    health: feed.health,
    lastSuccessfulFetchAt: Date.now(),
    matchCount: feed.matches.length,
    marketCount: feed.diagnostics?.marketCount ?? marketCount,
    outcomeCount,
    generatedAt: feed.generatedAt,
    stale: feed.health !== 'HEALTHY',
    failure: null,
  };
}

export function useLsportsShadowFeed() {
  const enabled = isLsportsDisplayFeedEnabled();
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<LsportsFeedDiagnostics | null>(null);

  const refresh = useCallback(async () => {
    if (!isLsportsDisplayFeedEnabled()) return;
    const feed = await pollLsportsBrowserFeed();
    applyLsportsBrowserFeed(feed);
    setDiagnostics(diagnosticsFromFeed(feed));
    setError(null);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let stopped = false;
    let timer = 0;
    let inTick = false;
    const tick = async () => {
      if (inTick) return;
      inTick = true;
      try {
        await refresh();
        if (!stopped) setLoading(false);
      } catch (err) {
        if (!stopped) {
          const message = err instanceof Error ? err.message : 'LSports shadow feed offline';
          if (message !== 'stale-generation' && (err as { name?: string })?.name !== 'AbortError') {
            setError('LSports shadow feed offline');
            setDiagnostics((prev) => prev
              ? { ...prev, health: 'ERROR', failure: message, stale: true }
              : {
                health: 'ERROR',
                lastSuccessfulFetchAt: null,
                matchCount: 0,
                marketCount: 0,
                outcomeCount: 0,
                generatedAt: 0,
                stale: true,
                failure: message,
              });
          }
        }
      } finally {
        inTick = false;
      }
    };
    void tick();
    timer = window.setInterval(() => {
      void tick();
    }, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [enabled, refresh]);

  return { loading: enabled ? loading : false, error, refresh, diagnostics };
}
