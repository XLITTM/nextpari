const PRODUCTION_ORIGINS = ['https://office.rixobet.com', 'https://office.ryxobet.com'];

function allowedOrigin(origin: string): boolean {
  if (PRODUCTION_ORIGINS.includes(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' || url.origin !== origin) return false;
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function requestOriginAllowed(
  headers: Readonly<Record<string, string | undefined>>,
  method: string,
): boolean {
  const site = headers['sec-fetch-site']?.trim().toLowerCase();
  if (site === 'cross-site') return false;
  const origin = headers.origin?.trim() ?? '';
  if (!origin) return method === 'GET' || method === 'HEAD';
  return allowedOrigin(origin);
}
