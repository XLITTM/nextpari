import { useEffect, useRef, useState } from 'react';
import { getCachedLiveSnapshot, liveSnapshotFromPacket, tickLiveSnapshotClock, type LiveEventSnapshot } from '../lib/betsapi';
import { openMatchLiveSocket } from '../lib/matchLiveSocket';

function isBetsApiEventId(matchId: string): boolean {
  return /^\d+$/.test(matchId.trim());
}

export function useMatchLiveDetails(matchId: string, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<LiveEventSnapshot | null>(() => getCachedLiveSnapshot(matchId));
  const lastPacketAt = useRef(0);
  const clockRunning = Boolean(snapshot?.clockRunning);

  useEffect(() => {
    if (!enabled || !matchId || !isBetsApiEventId(matchId)) return;
    let cancelled = false;
    const cached = getCachedLiveSnapshot(matchId);
    if (cached) setSnapshot(cached);

    const socket = openMatchLiveSocket(matchId, (packet) => {
      if (cancelled || packet.type !== 'update') return;
      const next = liveSnapshotFromPacket(packet.view, packet.odds);
      if (!next) return;
      lastPacketAt.current = Date.now();
      setSnapshot(next);
    });

    return () => {
      cancelled = true;
      socket.close();
    };
  }, [matchId, enabled]);

  useEffect(() => {
    if (!clockRunning) return;
    const timer = window.setTimeout(() => {
      setSnapshot((prev) => {
        if (!prev?.clockRunning) return prev;
        if (Date.now() - lastPacketAt.current < 1600) return prev;
        return tickLiveSnapshotClock(prev);
      });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [clockRunning, snapshot?.clock, snapshot?.period]);

  return snapshot;
}
