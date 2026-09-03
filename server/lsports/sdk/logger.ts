function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

function redact(text: string, secrets: readonly string[]): string {
  let next = text.replace(/:[^:@/]+@/g, ':[redacted]@');
  for (const secret of secrets) {
    if (secret) next = next.split(secret).join('[redacted]');
  }
  if (next.length > 240) return `${next.slice(0, 240)}…`;
  return next;
}

/**
 * Duck-typed trade360 ILogger. Never logs credentials or full RMQ payloads.
 */
export function createSdkSafeLogger(secrets: readonly string[] = []) {
  const emit = (level: string, message: string, meta: unknown[]) => {
    const raw = [message, ...meta.map((entry) => (typeof entry === 'string' ? entry : safeJson(entry)))].join(' ');
    console.log(`[lsports-sdk] level=${level} ${redact(raw, secrets)}`);
  };
  return {
    log(level: string, message: string, ...meta: unknown[]) {
      emit(String(level), message, meta);
    },
    debug(message: string, ...meta: unknown[]) {
      emit('debug', message, meta);
    },
    info(message: string, ...meta: unknown[]) {
      emit('info', message, meta);
    },
    warn(message: string, ...meta: unknown[]) {
      emit('warn', message, meta);
    },
    error(message: string, ...meta: unknown[]) {
      emit('error', message, meta);
    },
  };
}
