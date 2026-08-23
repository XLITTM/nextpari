export interface MatchLiveSocket {
  close: () => void;
}

export type MatchLivePacket =
  | { type: 'update'; event_id?: string; view: unknown; odds: unknown }
  | { type: 'error'; pause?: number };

function socketUrl(eventId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/live-ws?event_id=${encodeURIComponent(eventId)}`;
}

export function openMatchLiveSocket(
  eventId: string,
  onPacket: (packet: MatchLivePacket) => void,
): MatchLiveSocket {
  let socket: WebSocket | null = null;
  let closed = false;
  let reconnectTimer: number | null = null;
  let attempt = 0;

  const clearReconnect = () => {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const connect = () => {
    if (closed) return;
    clearReconnect();
    const next = new WebSocket(socketUrl(eventId));
    socket = next;

    next.onopen = () => {
      attempt = 0;
    };

    next.onmessage = (event) => {
      try {
        const packet = JSON.parse(String(event.data)) as MatchLivePacket;
        if (packet && (packet.type === 'update' || packet.type === 'error')) onPacket(packet);
      } catch (err) {
        console.error('Live socket packet failed:', err);
      }
    };

    next.onerror = () => {
      next.close();
    };

    next.onclose = () => {
      if (closed) return;
      const delay = Math.min(15_000, 700 * 2 ** attempt);
      attempt += 1;
      reconnectTimer = window.setTimeout(connect, delay);
    };
  };

  connect();

  return {
    close() {
      closed = true;
      clearReconnect();
      if (socket) {
        socket.close();
        socket = null;
      }
    },
  };
}
