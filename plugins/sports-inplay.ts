import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';
import { getInplayResponse } from '../api/sports/inplay-cache.js';

function attachInplay(server: ViteDevServer) {
  server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const raw = req.url ?? '';
    const path = raw.split('?')[0];
    if (path !== '/api/sports/inplay') {
      next();
      return;
    }

    void getInplayResponse()
      .then((result) => {
        if (res.writableEnded) return;
        res.statusCode = result.status;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=4, s-maxage=4');
        res.setHeader('X-Sports-Cache', result.paused ? 'PAUSE' : result.cached ? 'HIT' : 'MISS');
        res.end(result.body);
      })
      .catch((error: unknown) => {
        if (res.writableEnded) return;
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: 0,
          results: [],
          error: error instanceof Error ? error.message : 'Inplay proxy failed',
        }));
      });
  });
}

export function sportsInplayPlugin(): Plugin {
  return {
    name: 'sports-inplay',
    configureServer: attachInplay,
    configurePreviewServer: attachInplay,
  };
}
