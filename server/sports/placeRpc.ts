import { createServiceRoleClient } from '../supabase/admin.js';
import { loadStaffOnboardingEnv } from '../staff/env.js';
import { mapPlayerGameRpcError } from '../player/playerGameRpc.js';

export const SPORTS_PLACE_SERVER_RPC = 'sports_place_for_player';

export interface SportsPlaceAsPlayerArgs {
  playerUserId: string;
  idempotencyKey: string;
  stake: number;
  mode: 'single' | 'express';
  legs: Array<Record<string, unknown>>;
}

export type SportsPlaceAsPlayer = (
  args: SportsPlaceAsPlayerArgs,
) => Promise<Record<string, unknown>>;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function createSportsPlaceAsPlayerRpc(): SportsPlaceAsPlayer {
  return async (args) => {
    const staff = loadStaffOnboardingEnv();
    const client = createServiceRoleClient(staff.supabaseUrl, staff.supabaseServiceRoleKey);
    const { data, error } = await client.rpc(SPORTS_PLACE_SERVER_RPC, {
      p_player_user_id: args.playerUserId,
      p_idempotency_key: args.idempotencyKey,
      p_stake: args.stake,
      p_mode: args.mode,
      p_legs: args.legs,
    });
    if (error) throw mapPlayerGameRpcError(error);
    return asRecord(data);
  };
}
