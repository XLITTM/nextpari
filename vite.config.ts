import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { betsapiGatewayPlugin } from './plugins/betsapi-gateway';
import { betsapiLiveWsPlugin } from './plugins/betsapi-live-ws';
import { ownerStaffOnboardingPlugin } from './plugins/owner-staff-onboarding';
import { lsportsShadowPlugin } from './plugins/lsports-shadow';
import { sportsCatalogPlugin } from './plugins/sports-catalog';
import { sportsInplayPlugin } from './plugins/sports-inplay';

function betsApiToken(env: Record<string, string>): string {
  return env.BETSAPI_KEY || env.BETSAPI_TOKEN || env.VITE_BETSAPI_KEY || env.VITE_BETSAPI_TOKEN || '';
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const token = betsApiToken(env);

  process.env.BETSAPI_KEY ??= env.BETSAPI_KEY || '';
  process.env.BETSAPI_TOKEN ??= env.BETSAPI_TOKEN || env.BETSAPI_KEY || '';
  process.env.VITE_BETSAPI_KEY ??= env.VITE_BETSAPI_KEY || '';
  process.env.VITE_BETSAPI_TOKEN ??= env.VITE_BETSAPI_TOKEN || env.VITE_BETSAPI_KEY || '';
  process.env.VITE_SUPABASE_URL ??= env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
  process.env.VITE_SUPABASE_ANON_KEY ??= env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
  process.env.SUPABASE_URL ??= env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
  process.env.SUPABASE_ANON_KEY ??= env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= env.SUPABASE_SERVICE_ROLE_KEY;
  }

  return {
    plugins: [
      react(),
      sportsCatalogPlugin(),
      sportsInplayPlugin(),
      lsportsShadowPlugin(env.VITE_LSPORTS_FEED_BASE_URL),
      betsapiGatewayPlugin(),
      betsapiLiveWsPlugin(token),
      ownerStaffOnboardingPlugin(),
    ],
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
    },
    preview: {
      host: '127.0.0.1',
      port: 4173,
    },
  };
});
