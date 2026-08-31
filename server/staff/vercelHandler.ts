import type { IncomingHttpHeaders } from 'node:http';
import { StaffOnboardingError } from './errors.js';
import {
  handleOwnerStaffRequest,
  livePortsFactory,
  parseJsonPayload,
  staffHttpLog,
  writeStaffJson,
  type StaffHttpPortsFactory,
  type StaffJsonResponse,
} from './httpHandler.js';
import { requestIsSecure } from './ownerCookies.js';
import type { StaffLog } from './types.js';

export interface VercelStaffRequest {
  method?: string;
  url?: string;
  headers: IncomingHttpHeaders;
  body?: unknown;
}

function headerValue(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function handleVercelOwnerStaff(
  req: VercelStaffRequest,
  res: StaffJsonResponse,
  pathname: string,
  portsFactory: StaffHttpPortsFactory = livePortsFactory,
  log: StaffLog = staffHttpLog,
): Promise<void> {
  try {
    const body = parseJsonPayload(req.body);
    const result = await handleOwnerStaffRequest(
      {
        method: req.method ?? 'GET',
        pathname,
        authorization: headerValue(req.headers, 'authorization'),
        cookie: headerValue(req.headers, 'cookie'),
        cookieSecure: requestIsSecure(req.headers),
        body,
      },
      portsFactory,
      log,
    );
    writeStaffJson(res, result);
  } catch (error) {
    if (error instanceof StaffOnboardingError) {
      writeStaffJson(res, {
        status: error.httpStatus,
        body: {
          ok: false,
          error: error.code,
          ...error.payload,
        },
        headers: error.httpStatus === 405 ? { Allow: 'POST' } : undefined,
      });
      return;
    }
    log.error('staff_onboarding_vercel_unhandled', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
    });
    writeStaffJson(res, { status: 500, body: { ok: false, error: 'INTERNAL_ERROR' } });
  }
}
