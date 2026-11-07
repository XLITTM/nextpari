import { createProductionHandler, type OfficeHandler } from './production';
import type { OfficeRequest } from './handler';

interface OfficeNodeRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface OfficeNodeResponse {
  statusCode?: number;
  status?: (code: number) => OfficeNodeResponse;
  setHeader: (name: string, value: string | string[]) => unknown;
  json?: (body: unknown) => unknown;
  end?: (body?: string) => unknown;
}

function headerValue(headers: OfficeNodeRequest['headers'], name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function requestBody(body: unknown): unknown {
  if (typeof body !== 'string') return body;
  if (!body) return undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

export function isOfficeApiPath(path: string): boolean {
  const pathname = path.split('?')[0] ?? '/';
  return pathname === '/api/rixobet/office/v1' || pathname.startsWith('/api/rixobet/office/v1/');
}

const OFFICE_PREFIX = '/api/rixobet/office/v1';

function officeSuffix(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  if (!/^\/[A-Za-z0-9/_-]+$/.test(value)) return null;
  if (value.split('/').includes('..')) return null;
  return value;
}

export function resolveOfficeApiPath(url: string, headers: OfficeNodeRequest['headers'] = {}): string {
  const raw = url.startsWith('/') ? url : `/${url}`;
  const queryAt = raw.indexOf('?');
  const pathname = (queryAt === -1 ? raw : raw.slice(0, queryAt)) || '/';
  const params = new URLSearchParams(queryAt === -1 ? '' : raw.slice(queryAt + 1));
  if (pathname !== OFFICE_PREFIX && isOfficeApiPath(pathname)) return pathname;
  const fromQuery = officeSuffix(params.get('rixo_path'));
  if (fromQuery) return `${OFFICE_PREFIX}${fromQuery}`;
  for (const name of ['x-forwarded-uri', 'x-vercel-original-url', 'x-invoke-path', 'x-matched-path']) {
    const headerPath = headerValue(headers, name)?.split('?')[0];
    if (headerPath && headerPath !== OFFICE_PREFIX && isOfficeApiPath(headerPath)) return headerPath;
  }
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

let productionHandler: OfficeHandler | null = null;

export async function serveOfficeApi(req: OfficeNodeRequest, res: OfficeNodeResponse): Promise<void> {
  const path = resolveOfficeApiPath(req.url ?? '/', req.headers);
  const officeRequest: OfficeRequest = {
    method: req.method ?? 'GET',
    path,
    headers: {
      cookie: headerValue(req.headers, 'cookie'),
      origin: headerValue(req.headers, 'origin'),
      'sec-fetch-site': headerValue(req.headers, 'sec-fetch-site'),
      'x-forwarded-for': headerValue(req.headers, 'x-forwarded-for'),
    },
    body: requestBody(req.body),
  };
  productionHandler ??= createProductionHandler();
  const response = await productionHandler(officeRequest);
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  if (response.setCookie.length > 0) res.setHeader('set-cookie', response.setCookie);
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    const reply = res.status(response.status);
    if (typeof reply.json === 'function') {
      reply.json(response.body);
      return;
    }
  }
  res.statusCode = response.status;
  res.end?.(JSON.stringify(response.body));
}
