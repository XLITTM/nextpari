import { BRAND } from '../brand';
import type { FormSpec, OfficeRoute } from '../access/model';
import { parseSession, type OfficeSession, type ParsedSession } from '../access/session';
import { OfficeFailure, officeRequest, type FailureReason } from './http';
import { parseAcceptance, parseMfaChallenge, parsePage, type Acceptance, type PageData } from './parsers';

export type OfficeCall<T> = { ok: true; data: T } | { ok: false; reason: FailureReason };

function failure(error: unknown): FailureReason {
  if (error instanceof OfficeFailure) return error.reason;
  return 'disconnected';
}

export async function restoreSession(): Promise<OfficeCall<OfficeSession> & { empty?: boolean }> {
  try {
    const body = await officeRequest('/auth/session', { method: 'GET', action: 'auth.session.read' });
    const parsed: ParsedSession = parseSession(body);
    if (!parsed.ok) return { ok: false, reason: 'invalid' };
    return { ok: true, data: parsed.session };
  } catch (error) {
    return { ok: false, reason: failure(error) };
  }
}

export async function requestLogin(email: string, password: string): Promise<OfficeCall<{ challengeId: string }>> {
  try {
    const body = await officeRequest('/auth/login', {
      method: 'POST',
      action: 'auth.login',
      body: { brandCode: BRAND.code, email, password },
    });
    const challenge = parseMfaChallenge(body);
    if (!challenge) return { ok: false, reason: 'invalid' };
    return { ok: true, data: challenge };
  } catch (error) {
    return { ok: false, reason: failure(error) };
  }
}

export async function confirmMfa(challengeId: string, code: string): Promise<OfficeCall<OfficeSession>> {
  try {
    const body = await officeRequest('/auth/mfa', {
      method: 'POST',
      action: 'auth.mfa',
      body: { brandCode: BRAND.code, challengeId, code },
    });
    const parsed = parseSession(body);
    if (!parsed.ok) return { ok: false, reason: 'invalid' };
    return { ok: true, data: parsed.session };
  } catch (error) {
    return { ok: false, reason: failure(error) };
  }
}

export async function requestLogout(): Promise<FailureReason | null> {
  try {
    await officeRequest('/auth/logout', {
      method: 'POST',
      action: 'auth.logout',
      body: { brandCode: BRAND.code },
    });
    return null;
  } catch (error) {
    return failure(error);
  }
}

export async function readPage(route: OfficeRoute): Promise<OfficeCall<PageData>> {
  try {
    const body = await officeRequest(route.readPath, { method: 'GET', action: route.readAction });
    const data = parsePage(route.data, body);
    if (!data) return { ok: false, reason: 'invalid' };
    return { ok: true, data };
  } catch (error) {
    return { ok: false, reason: failure(error) };
  }
}

export async function submitForm(
  form: FormSpec,
  values: Readonly<Record<string, string>>,
): Promise<OfficeCall<Acceptance>> {
  const idempotencyKey = crypto.randomUUID();
  const requestedAt = new Date().toISOString();
  try {
    const body = await officeRequest(form.path, {
      method: 'POST',
      action: form.action,
      idempotencyKey,
      body: {
        brandCode: BRAND.code,
        ...form.fixed,
        ...values,
        audit: {
          brandCode: BRAND.code,
          action: form.action,
          idempotencyKey,
          requestedAt,
        },
      },
    });
    const acceptance = parseAcceptance(body, idempotencyKey);
    if (!acceptance) return { ok: false, reason: 'invalid' };
    return { ok: true, data: acceptance };
  } catch (error) {
    return { ok: false, reason: failure(error) };
  }
}
