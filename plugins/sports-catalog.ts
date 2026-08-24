import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';
import { getCatalogResponse } from '../api/sports/catalog-cache.js';

function queryType(raw: string): string {
  try {
    return new URL(raw, 'http://localhost').searchParams.get('type') ?? 'inplay';
  } catch {
    return 'inplay';
  }
}

function attachCatalog(server: ViteDevServer) {
  server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const raw = req.url ?? '';
    const path = raw.split('?')[0];
    if (path !== '/api/sports') {
      next();
      return;
    }

    void getCatalogResponse(queryType(raw))
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
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: 1,
          results: [],
          error: error instanceof Error ? error.message : 'Sports catalog failed',
        }));
      });
  });
}

export function sportsCatalogPlugin(): Plugin {
  return {
    name: 'sports-catalog',
    configureServer: attachCatalog,
    configurePreviewServer: attachCatalog,
  };
}
