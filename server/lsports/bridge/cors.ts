export const LSPORTS_DEFAULT_REMOTE_ORIGINS = [
  'https://nextpari.net',
  'https://www.nextpari.net',
] as const;

const VERCEL_PREVIEW = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

export function parseAllowedOrigins(raw: string | undefined): string[] {
  return String(raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry !== '*' && !entry.includes('*'));
}

export function resolveAllowedOrigins(
  env: NodeJS.ProcessEnv = process.env,
  mode: 'local' | 'remote' = 'local',
): string[] {
  const listed = parseAllowedOrigins(env.LSPORTS_ALLOWED_ORIGINS);
  if (listed.length) return listed;
  if (mode === 'remote') return [...LSPORTS_DEFAULT_REMOTE_ORIGINS];
  return ['http://127.0.0.1:5173'];
}

export function allowVercelPreviewOrigins(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.LSPORTS_ALLOW_VERCEL_PREVIEWS ?? '') === '1';
}

export function corsOriginForRequest(
  requestOrigin: string | undefined,
  allowed: readonly string[],
  allowVercelPreviews = false,
): string | null {
  if (!requestOrigin) return null;
  if (allowed.includes(requestOrigin)) return requestOrigin;
  if (allowVercelPreviews && VERCEL_PREVIEW.test(requestOrigin)) return requestOrigin;
  return null;
}
