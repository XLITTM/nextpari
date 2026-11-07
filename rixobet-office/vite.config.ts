import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect, PreviewServer, ViteDevServer } from 'vite';
import { defineConfig } from 'vitest/config';
import { isOfficeApiPath, serveOfficeApi } from './server/vercel';

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function attachOfficeApi(middlewares: Connect.Server): void {
  middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    if (!isOfficeApiPath(req.url ?? '')) {
      next();
      return;
    }
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readJson(req);
    await serveOfficeApi({ method: req.method, url: req.url, headers: req.headers, body }, res);
  });
}

function officeApiRoute() {
  return {
    name: 'rixo-office-api',
    configureServer(server: ViteDevServer) {
      attachOfficeApi(server.middlewares);
    },
    configurePreviewServer(server: PreviewServer) {
      attachOfficeApi(server.middlewares);
    },
  };
}

export default defineConfig({
  plugins: [react(), officeApiRoute()],
  css: {
    postcss: {
      plugins: [],
    },
  },
  server: {
    port: 5178,
    strictPort: false,
  },
  build: {
    sourcemap: false,
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.html',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'server/**/*.test.ts'],
  },
});
