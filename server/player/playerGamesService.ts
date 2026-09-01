import { staffError, StaffOnboardingError } from '../staff/errors.js';
import {
  livePlayerAuthPorts,
  resolvePlayerSession,
  type PlayerAuthGatewayPorts,
  type PlayerAuthHttpResult,
} from './playerAuthService.js';
import { createPlayerJwtGameRpc, type PlayerGameRpcPort } from './playerGameRpc.js';

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

export async function startPlayerGame(
  ports: PlayerGameGatewayPorts,
  cookieHeader: string | undefined,
  body: Record<string, unknown>,
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  const resolved = await resolvePlayerSession(ports, cookieHeader, secure);
  const payload = await invokeGame(ports, resolved.accessToken, 'player_game_start', {
    p_game_code: requireText(body.gameCode ?? body.game_code, 'GAME_CODE_REQUIRED'),
    p_stake: requireStake(body.stake),
    p_idempotency_key: requireText(body.idempotencyKey ?? body.idempotency_key, 'IDEMPOTENCY_KEY_REQUIRED'),
    p_options: optionsOf(body),
  });
  return { status: 200, body: payload, cookies: resolved.cookies };
}

export async function actPlayerGame(
  ports: PlayerGameGatewayPorts,
  cookieHeader: string | undefined,
  roundId: string,
  body: Record<string, unknown>,
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  const resolved = await resolvePlayerSession(ports, cookieHeader, secure);
  const payload = await invokeGame(ports, resolved.accessToken, 'player_game_action', {
    p_round_id: requireText(roundId, 'GAME_ROUND_NOT_FOUND'),
    p_action: requireText(body.action ?? body.p_action, 'ACTION_REQUIRED'),
    p_idempotency_key: requireText(body.idempotencyKey ?? body.idempotency_key, 'IDEMPOTENCY_KEY_REQUIRED'),
    p_options: optionsOf(body),
  });
  return { status: 200, body: payload, cookies: resolved.cookies };
}

export async function getPlayerGame(
  ports: PlayerGameGatewayPorts,
  cookieHeader: string | undefined,
  roundId: string,
  secure: boolean,
): Promise<PlayerAuthHttpResult> {
  const resolved = await resolvePlayerSession(ports, cookieHeader, secure);
  const payload = await invokeGame(ports, resolved.accessToken, 'player_game_get', {
    p_round_id: requireText(roundId, 'GAME_ROUND_NOT_FOUND'),
  });
  return { status: 200, body: payload, cookies: resolved.cookies };
}

export function livePlayerGamePorts(): PlayerGameGatewayPorts {
  return {
    ...livePlayerAuthPorts(),
    gameRpc: createPlayerJwtGameRpc,
  };
}

export function playerGameHttpError(error: unknown, secure: boolean): PlayerAuthHttpResult {
  if (error instanceof StaffOnboardingError) {
    return {
      status: error.httpStatus,
      body: { ok: false, error: error.code, ...error.payload },
    };
  }
  return {
    status: 500,
    body: { ok: false, error: 'INTERNAL_ERROR' },
  };
}
