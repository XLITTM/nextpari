import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';

const SHADOW_ORIGIN = 'http://127.0.0.1:8787';

function attachShadowProxy(server: ViteDevServer) {
  server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = (req.url ?? '').split('?')[0] ?? '';
    if (!path.startsWith('/api/lsports')) {
      next();
      return;
    }

    void fetch(`${SHADOW_ORIGIN}${path}`, {
      headers: { Accept: req.headers.accept ?? 'application/json' },
      signal: AbortSignal.timeout(8_000),
    }).then(async (upstream) => {
      if (res.writableEnded) return;
      const contentType = upstream.headers.get('content-type') ?? 'application/json';
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-store');
      if (contentType.includes('text/event-stream')) {
        res.setHeader('Connection', 'keep-alive');
        if (!upstream.body) {
          res.end();
          return;
        }
        const reader = upstream.body.getReader();
        const pump = async () => {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) res.write(value);
          }
          res.end();
        };
        req.on('close', () => {
          void reader.cancel();
        });
        await pump();
        return;
      }
      res.end(Buffer.from(await upstream.arrayBuffer()));
    }).catch(() => {
      if (res.writableEnded) return;
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        source: 'lsports',
        health: 'UNKNOWN',
        matches: [],
        error: 'lsports-shadow-offline',
      }));
    });
  });
}

export function lsportsShadowPlugin(): Plugin {
  return {
    name: 'lsports-shadow',
    configureServer: attachShadowProxy,
    configurePreviewServer: attachShadowProxy,
  };
}
