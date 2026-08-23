import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import type { ProxyOptions } from 'vite';
import { betsapiLiveWsPlugin } from './plugins/betsapi-live-ws';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const betsToken = env.BETSAPI_TOKEN || env.VITE_BETSAPI_TOKEN || '';

  const betsapiProxy: ProxyOptions = {
    target: 'https://api.betsapi.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/betsapi/, ''),
    configure(proxy) {
      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.setHeader('Accept', 'application/json');
        proxyReq.setHeader('Accept-Encoding', 'identity');
        if (!betsToken) return;
        const current = proxyReq.path;
        if (/[?&]token=/.test(current) && !/[?&]token=&/.test(current) && !/[?&]token=$/.test(current)) return;
        const cleaned = current.replace(/[?&]token=([^&]*)/, '').replace(/\?$/, '');
        proxyReq.path = `${cleaned}${cleaned.includes('?') ? '&' : '?'}token=${encodeURIComponent(betsToken)}`;
      });
    },
  };

  return {
    plugins: [react(), betsapiLiveWsPlugin(betsToken)],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    appType: 'spa',
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api/betsapi': betsapiProxy,
      },
    },
    preview: {
      host: '127.0.0.1',
      port: 4173,
      proxy: {
        '/api/betsapi': betsapiProxy,
      },
    },
  };
});
