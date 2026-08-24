import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';
import { fetchBetsApi } from '../api/betsapi/gateway.js';

function attachGateway(server: ViteDevServer) {
  server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const raw = req.url ?? '';
    if (!raw.startsWith('/api/betsapi')) {
      next();
      return;
    }

    const url = new URL(raw, 'http://127.0.0.1');
    const suffix = url.pathname.replace(/^\/api\/betsapi/, '') || '/';

    void fetchBetsApi(suffix, url.searchParams)
      .then((result) => {
        if (res.writableEnded) return;
        res.statusCode = result.status;
        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Cache-Control', 'public, max-age=4, s-maxage=4');
        if (result.cached) res.setHeader('X-BetsAPI-Cache', 'HIT');
        res.end(result.body);
      })
      .catch((error: unknown) => {
        if (res.writableEnded) return;
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: 0,
          error: error instanceof Error ? error.message : 'BetsAPI proxy failed',
        }));
      });
  });
}

export function betsapiGatewayPlugin(): Plugin {
  return {
    name: 'betsapi-gateway',
    configureServer: attachGateway,
    configurePreviewServer: attachGateway,
  };
}
