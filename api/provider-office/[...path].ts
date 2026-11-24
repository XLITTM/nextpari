import { writeStaffJson, type StaffJsonResponse } from '../../server/staff/httpHandler.js';
import { handleProviderOfficeRequest, unconfiguredProviderPorts, type ProviderOfficePorts } from '../../server/providerOffice/http.js';
import { liveReportingSource } from '../../server/providerOffice/liveReport.js';
import { requestIsSecure } from '../../server/staff/ownerCookies.js';

type ProviderRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  socket?: { remoteAddress?: string };
};

function header(headers: ProviderRequest['headers'], name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function ports(): ProviderOfficePorts {
  const base = unconfiguredProviderPorts();
  return { ...base, reporting: liveReportingSource() };
}

export async function handleVercelProviderOffice(
  req: ProviderRequest,
  res: StaffJsonResponse,
  officePorts: ProviderOfficePorts = ports(),
): Promise<void> {
  const raw = req.url ?? '/api/provider-office';
  const pathname = raw.split('?')[0] || '/api/provider-office';
  const search = raw.includes('?') ? `?${raw.slice(raw.indexOf('?') + 1)}` : '';
  const result = await handleProviderOfficeRequest({
    method: req.method ?? 'GET',
    pathname,
    search,
    cookie: header(req.headers, 'cookie'),
    secure: requestIsSecure(req.headers),
    body: req.body,
    clientIp: header(req.headers, 'x-forwarded-for')?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
  }, officePorts);
  if (result.contentType?.startsWith('text/csv') && typeof result.body === 'string') {
    res.statusCode = result.status;
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'no-store');
    if (res.end) res.end(result.body);
    return;
  }
  writeStaffJson(res, {
    status: result.status,
    body: typeof result.body === 'string' ? { ok: false, error: 'PROVIDER_OFFICE_FAILED' } : result.body,
    cookies: result.cookies,
    headers: result.headers,
  });
}

export default async function handler(req: ProviderRequest, res: StaffJsonResponse): Promise<void> {
  try {
    await handleVercelProviderOffice(req, res);
  } catch {
    writeStaffJson(res, {
      status: 503,
      body: { ok: false, error: 'REPORTING_SOURCE_UNAVAILABLE' },
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
