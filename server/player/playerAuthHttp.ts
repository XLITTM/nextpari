import type { StaffLog } from '../staff/types.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { StaffOnboardingError, redactForLog, staffError } from '../staff/errors.js';
import {
  parseJsonPayload,
  readJsonBody,
  staffHttpLog,
  writeStaffJson,
  type StaffHttpResult,
  type StaffJsonResponse,
} from '../staff/httpHandler.js';
import {
  changePlayerPassword,
  livePlayerAuthPorts,
  loginPlayerWithPassword,
  logoutPlayerSession,
  readPlayerProfileSession,
  readPlayerSession,
  registerPlayerWithPassword,
  resolvePlayerSession,
  updatePlayerProfileSession,
  type PlayerAuthGatewayPorts,
  type PlayerAuthHttpResult,
} from './playerAuthService.js';
import type { PlayerEmailPorts } from '../email/playerEmailService.js';
import {
  livePlayerEmailPorts,
  startPlayerEmailBinding,
  verifyPlayerEmailBinding,
  PLAYER_EMAIL_START_PATH,
  PLAYER_EMAIL_VERIFY_PATH,
} from '../email/playerEmailService.js';
import { ensurePlayerDeviceCookie, requestIsSecure } from './playerCookies.js';
import {
  createPlayerSecurityObserver,
  livePlayerSecurityPorts,
  type PlayerSecurityPorts,
} from './playerSecurityService.js';
import { trustedClientAddressFromNode, trustedClientAddressFromVercel } from './playerSecurityNetwork.js';
import { presentedLoginIdentifier, presentedRegisterIdentifier } from './playerSecuritySignals.js';
import type { PlayerPasswordRecoveryPorts } from '../email/playerPasswordRecoveryService.js';
import {
  livePlayerPasswordRecoveryPorts,
  resetPlayerPasswordWithTicket,
  startPlayerPasswordRecovery,
  verifyPlayerPasswordRecovery,
  PLAYER_PASSWORD_RECOVERY_RESET_PATH,
  PLAYER_PASSWORD_RECOVERY_START_PATH,
  PLAYER_PASSWORD_RECOVERY_VERIFY_PATH,
} from '../email/playerPasswordRecoveryService.js';
import {
  PLAYER_VERIFICATION_NOTICE_PATH,
  deliverPendingManualVerificationInstructions,
  readPlayerManualVerificationNotice,
  type PlayerManualVerificationNotice,
} from '../email/playerManualVerificationService.js';

export const PLAYER_AUTH_REGISTER_PATH = '/api/player/auth/register';
export const PLAYER_AUTH_LOGIN_PATH = '/api/player/auth/login';
export const PLAYER_AUTH_LOGOUT_PATH = '/api/player/auth/logout';
export const PLAYER_AUTH_CHANGE_PASSWORD_PATH = '/api/player/auth/change-password';
export const PLAYER_ME_PATH = '/api/player/me';
export const PLAYER_WALLET_PATH = '/api/player/wallet';
export const PLAYER_PROFILE_PATH = '/api/player/profile';
export { PLAYER_EMAIL_START_PATH, PLAYER_EMAIL_VERIFY_PATH };
export {
  PLAYER_PASSWORD_RECOVERY_START_PATH,
  PLAYER_PASSWORD_RECOVERY_VERIFY_PATH,
  PLAYER_PASSWORD_RECOVERY_RESET_PATH,
};
export { PLAYER_VERIFICATION_NOTICE_PATH };

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

export function isPlayerAuthPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return (
    path === PLAYER_AUTH_REGISTER_PATH
    || path === PLAYER_AUTH_LOGIN_PATH
    || path === PLAYER_AUTH_LOGOUT_PATH
    || path === PLAYER_AUTH_CHANGE_PASSWORD_PATH
    || path === PLAYER_ME_PATH
    || path === PLAYER_WALLET_PATH
    || path === PLAYER_PROFILE_PATH
    || path === PLAYER_EMAIL_START_PATH
    || path === PLAYER_EMAIL_VERIFY_PATH
    || path === PLAYER_PASSWORD_RECOVERY_START_PATH
    || path === PLAYER_PASSWORD_RECOVERY_VERIFY_PATH
    || path === PLAYER_PASSWORD_RECOVERY_RESET_PATH
    || path === PLAYER_VERIFICATION_NOTICE_PATH
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toStaffResult(result: PlayerAuthHttpResult): StaffHttpResult {
  return {
    status: result.status,
    body: result.body,
    headers: result.headers,
    cookies: result.cookies,
  };
}

export async function handlePlayerAuthRequest(
  input: {
    method: string;
    pathname: string;
    cookie?: string;
    cookieSecure?: boolean;
    body?: unknown;
    trustedNetworkAddress?: string | null;
    forwardedFor?: string;
    realIp?: string;
    userAgent?: string;
  },
  ports: PlayerAuthGatewayPorts,
  log: StaffLog = staffHttpLog,
  emailPorts?: PlayerEmailPorts,
  securityPorts?: PlayerSecurityPorts,
  recoveryPorts?: PlayerPasswordRecoveryPorts,
  verificationPorts?: {
    readNotice: (accessToken: string) => Promise<PlayerManualVerificationNotice>;
    deliverInstructions: (playerUserId: string) => Promise<unknown>;
  },
): Promise<PlayerAuthHttpResult> {
  const path = normalizePath(input.pathname);
  const method = input.method.toUpperCase();
  const secure = input.cookieSecure === true;
  const device = ensurePlayerDeviceCookie(input.cookie, secure);
  void input.forwardedFor;
  void input.realIp;
  const boundary = {
    cookieHeader: input.cookie,
    cookieSecure: secure,
    trustedNetworkAddress: input.trustedNetworkAddress ?? null,
    userAgent: input.userAgent,
    device,
  };

  const finish = (result: PlayerAuthHttpResult): PlayerAuthHttpResult => ({
    ...result,
    cookies: [...(result.cookies ?? []), device.setCookie],
  });

  try {
    if (path === PLAYER_AUTH_REGISTER_PATH) {
      if (method !== 'POST') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      const body = asRecord(parseJsonPayload(input.body));
      const security = createPlayerSecurityObserver(
        boundary,
        presentedRegisterIdentifier(body),
        securityPorts,
        log,
      );
      return finish(await registerPlayerWithPassword(ports, {
        method: String(body.method ?? ''),
        email: String(body.email ?? ''),
        password: String(body.password ?? ''),
        phone: String(body.phone ?? ''),
        ageConfirmed: body.ageConfirmed,
      }, secure, security));
    }
    if (path === PLAYER_AUTH_LOGIN_PATH) {
      if (method !== 'POST') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      const body = asRecord(parseJsonPayload(input.body));
      const security = createPlayerSecurityObserver(
        boundary,
        presentedLoginIdentifier(body),
        securityPorts,
        log,
      );
      return finish(await loginPlayerWithPassword(
        ports,
        {
          mode: String(body.mode ?? ''),
          email: String(body.email ?? ''),
          identifier: String(body.identifier ?? ''),
          phone: String(body.phone ?? ''),
          password: String(body.password ?? ''),
        },
        secure,
        security,
      ));
    }
    if (path === PLAYER_AUTH_LOGOUT_PATH) {
      if (method !== 'POST') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      return finish(await logoutPlayerSession(ports, input.cookie, secure));
    }
    if (path === PLAYER_AUTH_CHANGE_PASSWORD_PATH) {
      if (method !== 'POST') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      const body = asRecord(parseJsonPayload(input.body));
      const security = createPlayerSecurityObserver(boundary, '', securityPorts, log);
      return finish(await changePlayerPassword(
        ports,
        input.cookie,
        {
          currentPassword: String(body.currentPassword ?? ''),
          newPassword: String(body.newPassword ?? ''),
        },
        secure,
        security,
      ));
    }
    if (path === PLAYER_ME_PATH || path === PLAYER_WALLET_PATH) {
      if (method !== 'GET') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      return finish(await readPlayerSession(ports, input.cookie, secure));
    }
    if (path === PLAYER_PROFILE_PATH) {
      if (method === 'GET') {
        return finish(await readPlayerProfileSession(ports, input.cookie, secure));
      }
      if (method === 'PUT') {
        return finish(await updatePlayerProfileSession(ports, input.cookie, asRecord(parseJsonPayload(input.body)), secure));
      }
      throw staffError('METHOD_NOT_ALLOWED', 405);
    }
    if (path === PLAYER_EMAIL_START_PATH) {
      if (method !== 'POST') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      const body = asRecord(parseJsonPayload(input.body));
      const email = emailPorts ?? livePlayerEmailPorts(ports);
      return finish(await startPlayerEmailBinding(
        email,
        input.cookie,
        { email: String(body.email ?? '') },
        secure,
      ));
    }
    if (path === PLAYER_EMAIL_VERIFY_PATH) {
      if (method !== 'POST') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      const body = asRecord(parseJsonPayload(input.body));
      const email = emailPorts ?? livePlayerEmailPorts(ports);
      const security = createPlayerSecurityObserver(boundary, '', securityPorts, log);
      return finish(await verifyPlayerEmailBinding(
        email,
        input.cookie,
        { code: String(body.code ?? '') },
        secure,
        security,
      ));
    }
    if (path === PLAYER_PASSWORD_RECOVERY_START_PATH) {
      if (method !== 'POST') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      const body = asRecord(parseJsonPayload(input.body));
      const recovery = recoveryPorts ?? livePlayerPasswordRecoveryPorts();
      const security = createPlayerSecurityObserver(
        boundary,
        String(body.identifier ?? ''),
        securityPorts,
        log,
      );
      return finish(await startPlayerPasswordRecovery(
        recovery,
        { identifier: String(body.identifier ?? '') },
        security,
      ));
    }
    if (path === PLAYER_PASSWORD_RECOVERY_VERIFY_PATH) {
      if (method !== 'POST') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      const body = asRecord(parseJsonPayload(input.body));
      const recovery = recoveryPorts ?? livePlayerPasswordRecoveryPorts();
      const security = createPlayerSecurityObserver(boundary, '', securityPorts, log);
      return finish(await verifyPlayerPasswordRecovery(
        recovery,
        { challengeId: String(body.challengeId ?? ''), code: String(body.code ?? '') },
        security,
      ));
    }
    if (path === PLAYER_PASSWORD_RECOVERY_RESET_PATH) {
      if (method !== 'POST') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      const body = asRecord(parseJsonPayload(input.body));
      const recovery = recoveryPorts ?? livePlayerPasswordRecoveryPorts();
      const security = createPlayerSecurityObserver(boundary, '', securityPorts, log);
      return finish(await resetPlayerPasswordWithTicket(
        recovery,
        {
          resetTicket: String(body.resetTicket ?? ''),
          newPassword: String(body.newPassword ?? ''),
          confirmPassword: String(body.confirmPassword ?? ''),
        },
        secure,
        security,
      ));
    }
    if (path === PLAYER_VERIFICATION_NOTICE_PATH) {
      if (method !== 'GET') {
        throw staffError('METHOD_NOT_ALLOWED', 405);
      }
      const resolved = await resolvePlayerSession(ports, input.cookie, secure);
      try {
        const user = await ports.getAuthUser(resolved.accessToken);
        const deliver = verificationPorts?.deliverInstructions ?? deliverPendingManualVerificationInstructions;
        await deliver(user.id);
      } catch {
        /* notice still returns; delivery is best-effort after a stored request */
      }
      const read = verificationPorts?.readNotice ?? readPlayerManualVerificationNotice;
      const notice = await read(resolved.accessToken);
      return finish({
        status: 200,
        body: { ok: true, authenticated: true, ...notice },
        cookies: resolved.cookies,
      });
    }
    throw staffError('NOT_FOUND', 404);
  } catch (error) {
    if (error instanceof StaffOnboardingError) {
      return finish({
        status: error.httpStatus,
        body: { ok: false, authenticated: false, error: error.code, ...error.payload },
        headers: error.httpStatus === 405
          ? {
            Allow: path === PLAYER_PROFILE_PATH
              ? 'GET, PUT'
              : path === PLAYER_ME_PATH || path === PLAYER_WALLET_PATH || path === PLAYER_VERIFICATION_NOTICE_PATH
                ? 'GET'
                : 'POST',
          }
          : undefined,
      });
    }
    log.error('player_auth_unhandled', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
    });
    return finish({ status: 500, body: { ok: false, authenticated: false, error: 'INTERNAL_ERROR' } });
  }
}

function headerValue(
  headers: IncomingMessage['headers'],
  name: string,
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function attachPlayerAuthHttp(
  req: IncomingMessage,
  res: ServerResponse,
  log: StaffLog = staffHttpLog,
): Promise<boolean> {
  const pathname = (req.url ?? '').split('?')[0] ?? '';
  if (!isPlayerAuthPath(pathname)) return false;
  try {
    const method = req.method ?? 'GET';
    const body = method === 'GET' || method === 'HEAD' ? {} : await readJsonBody(req);
    const result = await handlePlayerAuthRequest(
      {
        method,
        pathname,
        cookie: headerValue(req.headers, 'cookie'),
        cookieSecure: requestIsSecure(req.headers),
        body,
        trustedNetworkAddress: trustedClientAddressFromNode(req),
        userAgent: headerValue(req.headers, 'user-agent'),
      },
      livePlayerAuthPorts(),
      log,
      undefined,
      livePlayerSecurityPorts(log),
    );
    writeStaffJson(res, toStaffResult(result));
  } catch (error) {
    log.error('player_auth_http_failed', {
      message: error instanceof Error ? error.message : 'UNHANDLED',
      extra: redactForLog({}),
    });
    writeStaffJson(res, { status: 500, body: { ok: false, authenticated: false, error: 'INTERNAL_ERROR' } });
  }
  return true;
}

export async function handleVercelPlayerAuth(
  req: {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
  },
  res: StaffJsonResponse,
  pathname: string,
  ports?: PlayerAuthGatewayPorts,
  log: StaffLog = staffHttpLog,
): Promise<void> {
  const cookie = req.headers.cookie;
  const userAgent = req.headers['user-agent'];
  const result = await handlePlayerAuthRequest(
    {
      method: req.method ?? 'GET',
      pathname,
      cookie: Array.isArray(cookie) ? cookie.join('; ') : cookie,
      cookieSecure: requestIsSecure(req.headers),
      body: req.body,
      trustedNetworkAddress: trustedClientAddressFromVercel(req.headers),
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    },
    ports ?? livePlayerAuthPorts(),
    log,
    undefined,
    livePlayerSecurityPorts(log),
  );
  writeStaffJson(res, toStaffResult(result));
}
