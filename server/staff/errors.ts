export class StaffOnboardingError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly payload: Record<string, unknown>;

  constructor(
    code: string,
    httpStatus: number,
    message?: string,
    payload: Record<string, unknown> = {},
  ) {
    super(message ?? code);
    this.name = 'StaffOnboardingError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.payload = payload;
  }
}

export function staffError(
  code: string,
  httpStatus: number,
  payload: Record<string, unknown> = {},
): StaffOnboardingError {
  return new StaffOnboardingError(code, httpStatus, code, payload);
}

const SENSITIVE_KEY =
  /(password|temporarypassword|token|authorization|secret|service.?role|jwt|pin_hash|encrypted)/i;

export function redactForLog(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(redactForLog);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redactForLog(nested);
    }
    return out;
  }
  return value;
}

export function extractErrorCode(text: string): string | null {
  const match = text.match(/\b([A-Z][A-Z0-9_]{2,})\b/);
  return match?.[1] ?? null;
}

export function rpcMessage(error: { message?: string } | null | undefined): string {
  const raw = error?.message ?? 'ERROR';
  return raw
    .replace(/^.*ERROR:\s*/i, '')
    .replace(/\s+Where:[\s\S]*$/i, '')
    .trim() || raw;
}
