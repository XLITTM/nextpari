export type LsportsTransportKind = 'direct' | 'sdk';

export interface LsportsTransportMode {
  transport: LsportsTransportKind;
  /** In-process SDK classification of already-consumed JSON. Never opens a second RMQ consumer. */
  shadow: boolean;
}

function readFlag(env: NodeJS.ProcessEnv, key: string): string {
  return String(env[key] ?? '').trim().toLowerCase();
}

export function resolveLsportsTransport(env: NodeJS.ProcessEnv = process.env): LsportsTransportMode {
  const raw = readFlag(env, 'LSPORTS_TRANSPORT');
  const transport: LsportsTransportKind = raw === 'sdk' ? 'sdk' : 'direct';
  const shadowRaw = readFlag(env, 'LSPORTS_SDK_SHADOW');
  const shadowDisabled = shadowRaw === '0' || shadowRaw === 'false' || shadowRaw === 'off';
  const shadowForced = shadowRaw === '1' || shadowRaw === 'true' || shadowRaw === 'on';
  return {
    transport,
    shadow: shadowDisabled ? false : shadowForced || transport === 'direct',
  };
}

export function transportWritesCanonicalState(
  mode: LsportsTransportMode,
  candidate: LsportsTransportKind,
): boolean {
  return mode.transport === candidate;
}
