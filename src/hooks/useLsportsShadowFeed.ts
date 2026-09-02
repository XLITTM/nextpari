import { useCallback, useEffect, useState } from 'react';
import { isLsportsDisplayFeedEnabled } from '@/lib/lsportsFeed';
import { applyLsportsBrowserFeed, fetchLsportsShadowHealth, fetchLsportsShadowInplay } from '@/lib/lsportsShadowPublish';

const POLL_MS = 1_000;

export function useLsportsShadowFeed() {
  const enabled = isLsportsDisplayFeedEnabled();
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isLsportsDisplayFeedEnabled()) return;
    const [feed] = await Promise.all([
      fetchLsportsShadowInplay(),
      fetchLsportsShadowHealth(),
    ]);
    applyLsportsBrowserFeed(feed);
    setError(null);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      try {
        await refresh();
        if (!stopped) setLoading(false);
      } catch {
        if (!stopped) setError('LSports shadow feed offline');
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

  return { loading: enabled ? loading : false, error, refresh };
}
