export interface PlayerGameRound {
  ok: true;
  isDuplicate: boolean;
  roundId: string;
  gameCode: string;
  state: string;
  stake: number;
  totalStake: number;
  payout: number;
  balanceAfter: number;
  serverSeedHash: string;
  serverSeed: string | null;
  nonce: number;
  publicResult: Record<string, unknown>;
  allowedActions: string[];
  createdAt?: string;
  settledAt?: string | null;
}

export class PlayerGameError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = 'PlayerGameError';
    this.code = code;
    this.status = status;
  }
}

export function newGameIdempotencyKey(): string {
  return crypto.randomUUID();
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const body = await res.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function mapRound(body: Record<string, unknown>): PlayerGameRound {
  const roundId = String(body.roundId ?? body.round_id ?? '');
  const balanceAfter = Number(body.balanceAfter ?? body.balance_after);
  if (!roundId || body.ok === false || !Number.isFinite(balanceAfter)) {
    throw new PlayerGameError(String(body.error ?? 'GAME_RPC_FAILED'), 500);
  }
  return {
    ok: true,
    isDuplicate: body.isDuplicate === true || body.is_duplicate === true,
    roundId,
    gameCode: String(body.gameCode ?? body.game_code ?? ''),
    state: String(body.state ?? ''),
    stake: Number(body.stake),
    totalStake: Number(body.totalStake ?? body.total_stake),
    payout: Number(body.payout ?? 0),
    balanceAfter,
    serverSeedHash: String(body.serverSeedHash ?? body.server_seed_hash ?? ''),
    serverSeed: body.serverSeed == null && body.server_seed == null
      ? null
      : String(body.serverSeed ?? body.server_seed),
    nonce: Number(body.nonce ?? 0),
    publicResult: asRecord(body.publicResult ?? body.public_result),
    allowedActions: asStringArray(body.allowedActions ?? body.allowed_actions),
    createdAt: body.createdAt == null && body.created_at == null
      ? undefined
      : String(body.createdAt ?? body.created_at),
    settledAt: body.settledAt == null && body.settled_at == null
      ? null
      : String(body.settledAt ?? body.settled_at),
  };
}

async function requestRound(url: string, init?: RequestInit): Promise<PlayerGameRound> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw new PlayerGameError(String(body.error ?? 'GAME_RPC_FAILED'), res.status);
  }
  return mapRound(body);
}

export async function startGame(input: {
  gameCode: string;
  stake: number;
  idempotencyKey?: string;
  options?: Record<string, unknown>;
}): Promise<PlayerGameRound> {
  return requestRound('/api/player/games/start', {
    method: 'POST',
    body: JSON.stringify({
      gameCode: input.gameCode,
      stake: input.stake,
      idempotencyKey: input.idempotencyKey ?? newGameIdempotencyKey(),
      options: input.options ?? {},
    }),
  });
}

export async function gameAction(input: {
  roundId: string;
  action: string;
  idempotencyKey?: string;
  options?: Record<string, unknown>;
}): Promise<PlayerGameRound> {
  return requestRound(`/api/player/games/${encodeURIComponent(input.roundId)}/action`, {
    method: 'POST',
    body: JSON.stringify({
      action: input.action,
      idempotencyKey: input.idempotencyKey ?? newGameIdempotencyKey(),
      options: input.options ?? {},
    }),
  });
}

export async function getGameRound(roundId: string): Promise<PlayerGameRound> {
  return requestRound(`/api/player/games/${encodeURIComponent(roundId)}`);
}
