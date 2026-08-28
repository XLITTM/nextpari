import { useEffect, useState } from 'react';
import { fetchMatchWidgetBundle, type MatchWidgetApiBundle } from '../lib/matchWidgetApi';

export function useMatchWidgetExtras(matchId: string, enabled = true) {
  const [data, setData] = useState<MatchWidgetApiBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !matchId || !/^\d+$/.test(matchId.trim())) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = (isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      return fetchMatchWidgetBundle(matchId)
        .then((bundle) => {
          if (cancelled) return;
          if (!bundle) {
            setError('empty');
            return;
          }
          setData(bundle);
          setError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          // Keep previous demo/API data if a refresh times out.
          setError(err instanceof Error ? err.message : 'failed');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    void load(false);
    const refresh = window.setInterval(() => {
      void load(true);
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, [matchId, enabled]);

  return { data, loading, error };
}
