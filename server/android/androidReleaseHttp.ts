import { StaffOnboardingError } from '../staff/errors.js';
import { liveOwnerAuthPorts, resolveOwnerSession } from '../staff/ownerAuthService.js';
import {
  AndroidReleaseService,
  type AndroidReleasePorts,
} from './androidRelease.js';
import { productionAndroidReleasePorts } from './androidReleaseStore.js';

type AndroidReq = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type AndroidRes = {
  status: (code: number) => unknown;
  setHeader: (name: string, value: string | string[]) => unknown;
  json: (body: unknown) => unknown;
  end: (body?: string | Buffer) => unknown;
};

export type AndroidReleaseHttpDeps = {
  ports?: AndroidReleasePorts;
  authorize?: (cookie: string | undefined, secure: boolean) => Promise<{ actorId: string }>;
};

function header(headers: AndroidReq['headers'], name: string): string {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function secure(headers: AndroidReq['headers']): boolean {
  const proto = header(headers, 'x-forwarded-proto');
  return proto === 'https' || proto === '';
}

async function liveAuthorize(cookie: string | undefined, isSecure: boolean): Promise<{ actorId: string }> {
  const resolved = await resolveOwnerSession(liveOwnerAuthPorts(), cookie, isSecure);
  return { actorId: resolved.staff.authUserId };
}

function sendJson(res: AndroidRes, status: number, body: unknown): void {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.json(body);
}

function fail(res: AndroidRes, error: unknown): void {
  if (error instanceof StaffOnboardingError) {
    sendJson(res, error.httpStatus, { ok: false, error: error.code });
    return;
  }
  const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
  if (code === 'OWNER_REQUIRED' || code === 'STAFF_ACCOUNT_NOT_FOUND') {
    sendJson(res, 403, { ok: false, error: 'OWNER_REQUIRED' });
    return;
  }
  if (code === 'JWT_REQUIRED' || code === 'JWT_INVALID' || code === 'SESSION_EXPIRED') {
    sendJson(res, 401, { ok: false, error: code });
    return;
  }
  sendJson(res, 500, { ok: false, error: 'INTERNAL_ERROR' });
}

export async function handlePublicAndroidRelease(
  req: AndroidReq,
  res: AndroidRes,
  deps: AndroidReleaseHttpDeps = {},
): Promise<void> {
  if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
    return;
  }
  try {
    const service = new AndroidReleaseService(deps.ports ?? productionAndroidReleasePorts());
    sendJson(res, 200, await service.publicRelease());
  } catch {
    sendJson(res, 200, { ok: true, published: false });
  }
}

export async function handlePublicAndroidDownload(
  req: AndroidReq,
  res: AndroidRes,
  deps: AndroidReleaseHttpDeps = {},
): Promise<void> {
  if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
    return;
  }
  try {
    const service = new AndroidReleaseService(deps.ports ?? productionAndroidReleasePorts());
    const redirect = await service.downloadRedirect();
    res.status(302);
    res.setHeader('Location', redirect.location);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.end();
  } catch (error) {
    fail(res, error instanceof StaffOnboardingError ? error : new StaffOnboardingError('ANDROID_RELEASE_UNPUBLISHED', 404));
  }
}

export async function handleOwnerAndroidRelease(
  req: AndroidReq,
  res: AndroidRes,
  pathname: string,
  deps: AndroidReleaseHttpDeps = {},
): Promise<void> {
  try {
    const cookie = header(req.headers, 'cookie');
    const authorize = deps.authorize ?? liveAuthorize;
    const actor = await authorize(cookie, secure(req.headers));
    const service = new AndroidReleaseService(deps.ports ?? productionAndroidReleasePorts());
    const method = (req.method ?? 'GET').toUpperCase();
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (pathname === '/api/owner/android-releases' && method === 'GET') {
      sendJson(res, 200, { ok: true, ...(await service.ownerView()) });
      return;
    }
    if (pathname === '/api/owner/android-releases' && method === 'POST') {
      sendJson(res, 200, { ok: true, release: await service.createDraft(actor.actorId, body) });
      return;
    }
    if (pathname === '/api/owner/android-releases/publish' && method === 'POST') {
      const versionCode = body.versionCode;
      if (typeof versionCode !== 'number') throw new StaffOnboardingError('VERSION_CODE_INVALID', 400);
      sendJson(res, 200, { ok: true, release: await service.publish(actor.actorId, versionCode) });
      return;
    }
    if (pathname === '/api/owner/android-releases/retire' && method === 'POST') {
      const versionCode = body.versionCode;
      if (typeof versionCode !== 'number') throw new StaffOnboardingError('VERSION_CODE_INVALID', 400);
      sendJson(res, 200, { ok: true, release: await service.retire(actor.actorId, versionCode) });
      return;
    }
    if (pathname === '/api/owner/android-releases/rollback' && method === 'POST') {
      sendJson(res, 200, { ok: true, release: await service.rollback(actor.actorId) });
      return;
    }
    if (pathname === '/api/owner/android-releases/banner' && method === 'PUT') {
      sendJson(res, 200, { ok: true, settings: await service.updateBanner(actor.actorId, body) });
      return;
    }
    if (pathname === '/api/owner/android-releases/policy' && method === 'PUT') {
      sendJson(res, 200, { ok: true, settings: await service.updatePolicy(actor.actorId, body) });
      return;
    }
    sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    fail(res, error);
  }
}
