import { ROLE_CEILING, type OfficeRole } from '../access/model';
import { parseSession, type OfficeSession } from '../access/session';

export function fixtureSession(role: OfficeRole): OfficeSession {
  const parsed = parseSession(
    {
      sessionId: `fixture-${role}-session`,
      brandCode: '002',
      role,
      permissions: [...ROLE_CEILING[role]],
      mfaSatisfied: true,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      staffId: `fixture-${role}`,
      displayName: `Fixture ${role}`,
    },
    Date.now(),
  );
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.session;
}

export function htmlResponse(): Response {
  return new Response('<!doctype html>', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
