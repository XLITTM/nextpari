const SECRET_KEY = /pass(word)?|user(name)?|secret|token|credential|authorization/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEY.test(key)) return '[redacted]';
  return redactForLog(value);
}

export function redactForLog(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => redactForLog(entry));
  if (!isPlainObject(value)) return value;
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    next[key] = redactValue(key, entry);
  }
  return next;
}

export function serializeDiagnostic(value: unknown): string {
  return JSON.stringify(redactForLog(value));
}

export function containsSecret(haystack: string, secrets: readonly string[]): boolean {
  return secrets.some((secret) => secret.length > 0 && haystack.includes(secret));
}
