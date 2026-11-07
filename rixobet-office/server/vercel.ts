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

let productionHandler: OfficeHandler | null = null;

export async function serveOfficeApi(req: OfficeNodeRequest, res: OfficeNodeResponse): Promise<void> {
  const path = req.url?.startsWith('/') ? req.url : `/${req.url ?? ''}`;
  const officeRequest: OfficeRequest = {
    method: req.method ?? 'GET',
    path,
    headers: { cookie: headerValue(req.headers, 'cookie') },
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
