import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { ownerStaffOnboardingPlugin } from './plugins/owner-staff-onboarding';

function sentryBuildMeta(env: Record<string, string | undefined>): {
  environment: 'production' | 'preview' | 'development';
  release: string;
} {
  const vercelEnv = String(env.VERCEL_ENV || env.VITE_SENTRY_ENVIRONMENT || '').trim();
  const environment =
    vercelEnv === 'production' || vercelEnv === 'preview' || vercelEnv === 'development'
      ? vercelEnv
      : 'development';
  return {
    environment,
    release: String(env.VERCEL_GIT_COMMIT_SHA || env.VITE_SENTRY_RELEASE || '').trim(),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const sentry = sentryBuildMeta({ ...env, ...process.env });

  process.env.VITE_SUPABASE_URL ??= env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
  process.env.VITE_SUPABASE_ANON_KEY ??= env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
  process.env.SUPABASE_URL ??= env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
  process.env.SUPABASE_ANON_KEY ??= env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
  process.env.VITE_SENTRY_ENVIRONMENT = sentry.environment;
  if (sentry.release) process.env.VITE_SENTRY_RELEASE = sentry.release;

  return {
    define: {
      'import.meta.env.VITE_SENTRY_ENVIRONMENT': JSON.stringify(sentry.environment),
      'import.meta.env.VITE_SENTRY_RELEASE': JSON.stringify(sentry.release),
    },
    plugins: [
      react(),
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
