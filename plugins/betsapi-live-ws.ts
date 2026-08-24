import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { Plugin } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import { fetchBetsApi } from '../api/betsapi/gateway.js';

export const LIVE_WS_PATH = '/api/live-ws';

const VIEW_PATH = '/v1/event/view';
const ODDS_PATH = '/v2/event/odds';
const TICK_MS = 12_000;
const BACKOFF_MS = 60_000;

async function betsapiGet(_token: string, path: string, params: Record<string, string>): Promise<unknown> {
  const result = await fetchBetsApi(path, params);
  if (result.status === 429) {
    const error = new Error('BetsAPI 429') as Error & { status: number };
    error.status = 429;
    throw error;
  }
  if (result.status < 200 || result.status >= 300) throw new Error(`BetsAPI HTTP ${result.status}`);
  return JSON.parse(result.body) as unknown;
}

function unwrapView(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return null;
  const results = (payload as { results?: unknown }).results;
  if (Array.isArray(results)) return results[0] ?? null;
  return results ?? payload;
}

function unwrapOdds(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return null;
  const results = (payload as { results?: { odds?: unknown } }).results;
  return results?.odds ?? results ?? null;
}

function attachLiveWs(server: { httpServer?: { on: (event: 'upgrade', listener: (req: IncomingMessage, socket: Duplex, head: Buffer) => void) => unknown } | null }, token: string) {
  const wss = new WebSocketServer({ noServer: true });

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== LIVE_WS_PATH) return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  };

  server.httpServer?.on('upgrade', onUpgrade);

  wss.on('connection', (ws, req: IncomingMessage) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const eventId = url.searchParams.get('event_id')?.trim() ?? '';
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastOdds: unknown = null;

    const stop = () => {
      closed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    ws.on('close', stop);
    ws.on('error', stop);

    if (!eventId || !token) {
      ws.close(1008, 'event_id or token missing');
      return;
    }

    const loop = async () => {
      if (closed || ws.readyState !== WebSocket.OPEN) return;
      try {
        const viewJson = await betsapiGet(token, VIEW_PATH, { event_id: eventId });
        try {
          const oddsJson = await betsapiGet(token, ODDS_PATH, {
            event_id: eventId,
          });
          lastOdds = unwrapOdds(oddsJson) ?? lastOdds;
        } catch (oddsErr) {
          if ((oddsErr as { status?: number }).status === 429) throw oddsErr;
        }
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'update', event_id: eventId, view: unwrapView(viewJson), odds: lastOdds }));
        }
        timer = setTimeout(() => {
          void loop();
        }, TICK_MS);
      } catch (err) {
        const pause = (err as { status?: number }).status === 429 ? BACKOFF_MS : 2000;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', pause }));
        }
        timer = setTimeout(() => {
          void loop();
        }, pause);
      }
    };

    void loop();
  });
}

export function betsapiLiveWsPlugin(token: string): Plugin {
  return {
    name: 'betsapi-live-ws',
    configureServer(server) {
      attachLiveWs(server, token);
    },
    configurePreviewServer(server) {
      attachLiveWs(server, token);
    },
  };
}
