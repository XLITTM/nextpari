import { useEffect, useState } from 'react';
import type { MatchWidgetApiBundle } from '../lib/matchWidgetApi';

export function useMatchWidgetExtras(_matchId: string, _enabled = true) {
  const [data] = useState<MatchWidgetApiBundle | null>(null);
  const [loading] = useState(false);
  const [error] = useState<string | null>(null);

  useEffect(() => {
    return undefined;
  }, []);

  return { data, loading, error };
}
