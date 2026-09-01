import { staffError, StaffOnboardingError } from '../staff/errors.js';
import { GAME_NO_STORE_HEADERS, serverTimingHeader } from '../games/httpCache.js';
import {
  livePlayerAuthPorts,
  type PlayerAuthGatewayPorts,
  type PlayerAuthHttpResult,
} from './playerAuthService.js';
import { createPlayerJwtGameRpc, type PlayerGameRpcPort } from './playerGameRpc.js';
import {
  readPlayerCookies,
  serializePlayerCookies,
} from './playerCookies.js';

export interface PlayerGameGatewayPorts extends PlayerAuthGatewayPorts {
  gameRpc?: (accessToken: string) => PlayerGameRpcPort;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function requireText(value: unknown, code: string): string {
  const text = String(value ?? '').trim();
  if (!text) throw staffError(code, 400);
  return text;
}

function requireStake(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw staffError('STAKE_NOT_POSITIVE', 400);
  }
  return Number(n.toFixed(2));
}

function optionsOf(body: Record<string, unknown>): Record<string, unknown> {
  const raw = body.options;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const copy = { ...raw as Record<string, unknown> };
    delete copy.userId;
    delete copy.user_id;
    delete copy.walletId;
    delete copy.wallet_id;
    delete copy.publicId;
    delete copy.public_id;
    delete copy.balance;
    delete copy.payout;
    delete copy.result;
    return copy;
  }
  return {};
}

function isJwtAuthError(error: unknown): boolean {
  if (!(error instanceof StaffOnboardingError)) return false;
  return error.httpStatus === 401
    || error.code === 'JWT_INVALID'
    || error.code === 'JWT_REQUIRED'
    || error.code === 'AUTH_REQUIRED';
}

function withGameHeaders(
  result: PlayerAuthHttpResult,
  timing: { authMs: number; rpcMs: number; totalMs: number; refreshed: boolean },
): PlayerAuthHttpResult {
  return {
    ...result,
    headers: {
      ...GAME_NO_STORE_HEADERS,
      'Server-Timing': serverTimingHeader(timing),
      ...result.headers,
    },
  };
}

async function invokeGame(
  ports: PlayerGameGatewayPorts,
  accessToken: string,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const rpc = ports.gameRpc?.(accessToken) ?? createPlayerJwtGameRpc(accessToken);
  const data = await rpc.invoke(name, args);
  return asRecord(data);
}

export async function runPlayerGameRpc(
  ports: PlayerGameGatewayPorts,
  cookieHeader: string | undefined,
  secure: boolean,
  name: string,
  args: Record<string, unknown>,
): Promise<PlayerAuthHttpResult> {
  const totalStart = Date.now();
  const cookies = readPlayerCookies(cookieHeader);
  if (!cookies.accessToken && !cookies.refreshToken) {
    throw staffError('JWT_REQUIRED', 401);
  }

  let accessToken = cookies.accessToken;
  let setCookies: string[] | undefined;
  let refreshed = false;
  const authStart = Date.now();

  if (!accessToken) {
    if (!cookies.refreshToken) throw staffError('JWT_REQUIRED', 401);
    try {
      const tokens = await ports.refreshSession(cookies.refreshToken);
      accessToken = tokens.accessToken;
      setCookies = serializePlayerCookies(tokens.accessToken, tokens.refreshToken, secure);
      refreshed = true;
    } catch {
      throw staffError('JWT_INVALID', 401);
    }
  }
  const authMs = Date.now() - authStart;

  const rpcStart = Date.now();
  try {
    const payload = await invokeGame(ports, accessToken, name, args);
    return withGameHeaders(
      { status: 200, body: payload, cookies: setCookies },
      { authMs, rpcMs: Date.now() - rpcStart, totalMs: Date.now() - totalStart, refreshed },
    );
  } catch (error) {
    if (!isJwtAuthError(error) || refreshed || !cookies.refreshToken) {
      throw error;
    }
    const refreshStart = Date.now();
    let tokens;
    try {
      tokens = await ports.refreshSession(cookies.refreshToken);
    } catch {
      throw staffError('JWT_INVALID', 401);
    }
    refreshed = true;
    setCookies = serializePlayerCookies(tokens.accessToken, tokens.refreshToken, secure);
    const retryStart = Date.now();
    const payload = await invokeGame(ports, tokens.accessToken, name, args);
    return withGameHeaders(
      { status: 200, body: payload, cookies: setCookies },
      {
        authMs: authMs + (Date.now() - refreshStart),
        rpcMs: Date.now() - retryStart,
        totalMs: Date.now() - totalStart,
        refreshed,
      },
    );
  }
}

export async function startPlayerGame(
  ports: PlayerGameGatewayPorts,
  cookieHeader: string | undefined,
  body: Record<string, unknown>,
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  return runPlayerGameRpc(ports, cookieHeader, secure, 'player_game_start', {
    p_game_code: requireText(body.gameCode ?? body.game_code, 'GAME_CODE_REQUIRED'),
    p_stake: requireStake(body.stake),
    p_idempotency_key: requireText(body.idempotencyKey ?? body.idempotency_key, 'IDEMPOTENCY_KEY_REQUIRED'),
    p_options: optionsOf(body),
  });
}

export async function actPlayerGame(
  ports: PlayerGameGatewayPorts,
  cookieHeader: string | undefined,
  roundId: string,
  body: Record<string, unknown>,
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  return runPlayerGameRpc(ports, cookieHeader, secure, 'player_game_action', {
    p_round_id: requireText(roundId, 'GAME_ROUND_NOT_FOUND'),
    p_action: requireText(body.action ?? body.p_action, 'ACTION_REQUIRED'),
    p_idempotency_key: requireText(body.idempotencyKey ?? body.idempotency_key, 'IDEMPOTENCY_KEY_REQUIRED'),
    p_options: optionsOf(body),
  });
}

export async function getPlayerGame(
  ports: PlayerGameGatewayPorts,
  cookieHeader: string | undefined,
  roundId: string,
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  return runPlayerGameRpc(ports, cookieHeader, secure, 'player_game_get', {
    p_round_id: requireText(roundId, 'GAME_ROUND_NOT_FOUND'),
  });
}

export async function getPlayerGameSession(
  ports: PlayerGameGatewayPorts,
  cookieHeader: string | undefined,
  gameCode: string,
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  return runPlayerGameRpc(ports, cookieHeader, secure, 'player_game_session_get', {
    p_game_code: requireText(gameCode, 'GAME_CODE_REQUIRED'),
  });
}

export function livePlayerGamePorts(): PlayerGameGatewayPorts {
  return {
    ...livePlayerAuthPorts(),
    gameRpc: createPlayerJwtGameRpc,
  };
}

export function playerGameHttpError(error: unknown, _secure: boolean): PlayerAuthHttpResult {
  if (error instanceof StaffOnboardingError) {
    return {
      status: error.httpStatus,
      body: { ok: false, error: error.code, ...error.payload },
      headers: GAME_NO_STORE_HEADERS,
    };
  }
  return {
    status: 500,
    body: { ok: false, error: 'INTERNAL_ERROR' },
    headers: GAME_NO_STORE_HEADERS,
  };
}
