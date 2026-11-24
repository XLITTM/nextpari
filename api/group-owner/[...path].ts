import { writeStaffJson, type StaffJsonResponse } from '../../server/staff/httpHandler.js';
import { handleGroupOwnerRequest, type GroupOwnerPorts } from '../../server/group/ownerHttp.js';
import { liveGroupOwnerPorts } from '../../server/group/ownerLive.js';
import { liveReportingSource } from '../../server/providerOffice/liveReport.js';
import { requestIsSecure } from '../../server/staff/ownerCookies.js';

type GroupOwnerRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

function header(headers: GroupOwnerRequest['headers'], name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export async function handleVercelGroupOwner(
  req: GroupOwnerRequest,
  res: StaffJsonResponse,
  ports: GroupOwnerPorts = liveGroupOwnerPorts(),
): Promise<void> {
  const raw = req.url ?? '/api/group-owner';
  const pathname = raw.split('?')[0] || '/api/group-owner';
  const search = raw.includes('?') ? `?${raw.slice(raw.indexOf('?') + 1)}` : '';
  const result = await handleGroupOwnerRequest({
    method: req.method ?? 'GET',
    pathname,
    search,
    cookie: header(req.headers, 'cookie'),
    secure: requestIsSecure(req.headers),
    body: req.body,
  }, ports, { reporting: liveReportingSource() });
  writeStaffJson(res, result);
}

export default async function handler(req: GroupOwnerRequest, res: StaffJsonResponse): Promise<void> {
  try {
    await handleVercelGroupOwner(req, res);
  } catch {
    writeStaffJson(res, {
      status: 503,
      body: { ok: false, error: 'GROUP_SCHEMA_UNAVAILABLE' },
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
