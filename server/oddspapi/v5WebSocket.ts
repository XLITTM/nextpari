/**
 * Transport login and status classification for a dedicated long-running worker.
 * Do not create a persistent WebSocket inside a short-lived Vercel HTTP function.
 */
import { V5_SPORT_IDS, V5_BOOKMAKER, type V5SportId } from './v5TrialClient.js';

/**
 * Vercel request functions are not a durable stream host.
 * REST preview remains the bootstrap until a separate worker exists.
 */
export const V5_STREAM_WORKER_DEPENDENCY =
  'OddsPapi V5 WebSocket ingestion is not running in this change. It needs a durable worker outside Vercel HTTP functions, with REST bootstrap, cursor replay, snapshot_required handling, and bounded reconnect.';

export const ODDSPAPI_V5_WS_URL = 'wss://v5.oddspapi.io/ws';
export const ODDSPAPI_V5_WS_CHANNELS = [
  'fixtures', 'scores', 'odds', 'bookmakers', 'settlements',
] as const;

export function makeV5Login(apiKey: string, sportIds: readonly V5SportId[] = Object.values(V5_SPORT_IDS)) {
  if (!apiKey || apiKey.trim().length < 20) throw new Error('ODDSPAPI_V5_API_KEY is missing');
  return {
    type: 'login' as const,
    apiKey,
    receiveType: 'json' as const,
    channels: [...ODDSPAPI_V5_WS_CHANNELS],
    bookmakers: [V5_BOOKMAKER],
    sportIds: [...sportIds],
  };
}

export interface V5StreamFrame {
  type?: string;
  channel?: string;
  payload?: unknown;
  error?: string;
}

export type V5StreamDecision = 'authenticated' | 'snapshot_required' | 'pause_quotes' | 'data' | 'ignore';

/** Never assume unknown frames imply valid active quotes. */
export function decideV5StreamFrame(frame: V5StreamFrame): V5StreamDecision {
  if (frame.type === 'login_ok') return 'authenticated';
  if (frame.type === 'snapshot_required') return 'snapshot_required';
  if (frame.type === 'error' || frame.type === 'login_failed') return 'pause_quotes';
  if (frame.type === 'UPDATE' && ODDSPAPI_V5_WS_CHANNELS.includes(frame.channel as typeof ODDSPAPI_V5_WS_CHANNELS[number])) return 'data';
  return 'ignore';
}
