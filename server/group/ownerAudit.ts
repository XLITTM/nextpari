const CODE = /^[A-Z0-9_]{1,64}$/;
const PATH = /^\/api\/group-owner(?:\/[a-z0-9/-]+)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GroupAuthAudit {
  code: string;
  pathname: string;
  userId: string | null;
}

export function sanitizeAuthAudit(input: {
  code: string;
  pathname: string;
  userId: string | null;
}): GroupAuthAudit | null {
  if (!CODE.test(input.code) || !PATH.test(input.pathname)) return null;
  if (input.userId != null && !UUID.test(input.userId)) return null;
  return {
    code: input.code,
    pathname: input.pathname,
    userId: input.userId == null ? null : input.userId.toLowerCase(),
  };
}

export function logAuthAudit(event: GroupAuthAudit): void {
  const safe = sanitizeAuthAudit(event);
  if (!safe) return;
  console.warn(JSON.stringify({ source: 'group-owner-auth', ...safe }));
}
