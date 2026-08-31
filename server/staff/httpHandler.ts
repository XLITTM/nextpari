import type { IncomingMessage, ServerResponse } from 'node:http';
import { StaffOnboardingError, redactForLog, staffError } from './errors';
import { loadStaffOnboardingEnv } from './env';
import { createLiveStaffPorts } from './staffAuthAdmin';
import { onboardStaff } from './staffOnboardingService';
import type { AuthAdminPort, OwnerStaffPort, StaffLog, StaffOnboardRole } from './types';

export const JSON_BODY_LIMIT = 16 * 1024;

export const OWNER_STAFF_MANAGER_PATH = '/api/owner/staff/manager';
export const OWNER_STAFF_CASHIER_PATH = '/api/owner/staff/cashier';

export interface StaffHttpPortsFactory {
  (accessToken: string): { owner: OwnerStaffPort; admin: AuthAdminPort };
}

export interface StaffHttpResult {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}

export type StaffJsonResponse = {
  writableEnded?: boolean;
  statusCode?: number;
  status?: (code: number) => unknown;
  setHeader: (name: string, value: string) => unknown;
  json?: (body: unknown) => unknown;
  end?: (chunk?: string) => unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function readBearerToken(authorization: string | undefined): string {
  if (!authorization) {
    throw staffError('JWT_REQUIRED', 401);
  }
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  if (!match) {
    throw staffError('JWT_INVALID', 401);
  }
  return match[1];
}

export function routeStaffRole(pathname: string): StaffOnboardRole | null {
  const path = pathname.replace(/\/$/, '') || '/';
  if (path === OWNER_STAFF_MANAGER_PATH) return 'manager';
  if (path === OWNER_STAFF_CASHIER_PATH) return 'cashier';
  return null;
}

function errorBody(error: StaffOnboardingError): Record<string, unknown> {
  return {
    ok: false,
    error: error.code,
    ...error.payload,
  };
}

function resultHeaders(error: StaffOnboardingError): Record<string, string> | undefined {
  if (error.httpStatus === 405) {
    return { Allow: 'POST' };
  }
  return undefined;
}

export function parseJsonPayload(raw: unknown): unknown {
  if (raw == null) return {};
  if (Buffer.isBuffer(raw)) {
    if (raw.length > JSON_BODY_LIMIT) {
      throw staffError('BODY_TOO_LARGE', 413);
    }
    return parseJsonPayload(raw.toString('utf8'));
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    if (Buffer.byteLength(trimmed, 'utf8') > JSON_BODY_LIMIT) {
      throw staffError('BODY_TOO_LARGE', 413);
    }
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      throw staffError('BODY_INVALID', 400);
    }
  }
  if (typeof raw === 'object') {
    let encoded: string;
    try {
      encoded = JSON.stringify(raw);
    } catch {
      throw staffError('BODY_INVALID', 400);
    }
    if (Buffer.byteLength(encoded, 'utf8') > JSON_BODY_LIMIT) {
      throw staffError('BODY_TOO_LARGE', 413);
    }
    return raw;
  }
  throw staffError('BODY_INVALID', 400);
}

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > JSON_BODY_LIMIT) {
      throw staffError('BODY_TOO_LARGE', 413);
    }
    chunks.push(buf);
  }
  return parseJsonPayload(Buffer.concat(chunks).toString('utf8'));
}

export function writeStaffJson(res: StaffJsonResponse, result: StaffHttpResult): void {
  if (res.writableEnded) return;
  if (typeof res.status === 'function') {
    res.status(result.status);
  } else {
    res.statusCode = result.status;
  }
  res.setHeader('Content-Type', 'application/json');
  const headers = { ...result.headers };
  if (result.status === 405 && !headers.Allow) {
    headers.Allow = 'POST';
  }
  for (const [name, value] of Object.entries(headers)) {
    res.setHeader(name, value);
  }
  if (typeof res.json === 'function') {
    res.json(result.body);
    return;
  }
  res.end?.(JSON.stringify(result.body));
}

function structuredLog(event: string, fields: Record<string, unknown>): void {
  console.error(JSON.stringify({
    level: 'error',
    event,
    ts: new Date().toISOString(),
    ...(redactForLog(fields) as Record<string, unknown>),
  }));
}

export const staffHttpLog: StaffLog = {
  error(event, fields) {
    structuredLog(event, fields);
  },
};

export async function handleOwnerStaffRequest(
  input: {
    method: string;
    pathname: string;
    authorization: string | undefined;
    body: unknown;
  },
  portsFactory: StaffHttpPortsFactory,
  log: StaffLog = staffHttpLog,
): Promise<StaffHttpResult> {
  try {
    if (input.method !== 'POST') {
      throw staffError('METHOD_NOT_ALLOWED', 405);
    }
    const role = routeStaffRole(input.pathname);
    if (!role) {
      throw staffError('NOT_FOUND', 404);
    }
    const accessToken = readBearerToken(input.authorization);
    const body = asRecord(input.body);
    const ports = portsFactory(accessToken);
    const result = await onboardStaff(
      {
        role,
        accessToken,
        email: body.email,
        temporaryPassword: body.temporaryPassword,
        managerId: role === 'manager' ? String(body.managerId ?? '') : undefined,
        cashierId: role === 'cashier' ? String(body.cashierId ?? '') : undefined,
      },
      ports,
      log,
    );
    return { status: 200, body: { ...result } };
  } catch (error) {
    if (error instanceof StaffOnboardingError) {
      return {
        status: error.httpStatus,
        body: errorBody(error),
        headers: resultHeaders(error),
      };
    }
    log.error('staff_onboarding_unhandled', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
    });
    return { status: 500, body: { ok: false, error: 'INTERNAL_ERROR' } };
  }
}

export function livePortsFactory(accessToken: string): { owner: OwnerStaffPort; admin: AuthAdminPort } {
  return createLiveStaffPorts(loadStaffOnboardingEnv(), accessToken);
}

export async function attachOwnerStaffHttp(
  req: IncomingMessage,
  res: ServerResponse,
  log: StaffLog = staffHttpLog,
): Promise<boolean> {
  const raw = req.url ?? '';
  const pathname = raw.split('?')[0] ?? '';
  if (!routeStaffRole(pathname)) {
    return false;
  }

  try {
    const body = await readJsonBody(req);
    const header = req.headers.authorization;
    const authorization = Array.isArray(header) ? header[0] : header;
    const result = await handleOwnerStaffRequest(
      {
        method: req.method ?? 'GET',
        pathname,
        authorization,
        body,
      },
      livePortsFactory,
      log,
    );
    writeStaffJson(res, result);
  } catch (error) {
    if (error instanceof StaffOnboardingError) {
      writeStaffJson(res, {
        status: error.httpStatus,
        body: errorBody(error),
        headers: resultHeaders(error),
      });
      return true;
    }
    log.error('staff_onboarding_http_failed', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
    });
    writeStaffJson(res, { status: 500, body: { ok: false, error: 'INTERNAL_ERROR' } });
  }
  return true;
}
