import { createServiceRoleClient } from '../supabase/admin.js';
import { loadStaffOnboardingEnv } from '../staff/env.js';
import { staffHttpLog } from '../staff/httpHandler.js';
import type { StaffLog } from '../staff/types.js';

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function invokeServiceRole(name: string, args: Record<string, unknown>, log: StaffLog): Promise<void> {
  try {
    const staff = loadStaffOnboardingEnv();
    const client = createServiceRoleClient(staff.supabaseUrl, staff.supabaseServiceRoleKey);
    const { error } = await client.rpc(name, args);
    if (error) {
      log.error('win_pattern_evaluate_failed', { extra: { rpc: name, message: error.message } });
    }
  } catch (error) {
    log.error('win_pattern_evaluate_failed', {
      extra: { rpc: name, message: error instanceof Error ? error.message : 'UNHANDLED' },
    });
  }
}

export async function safeEvaluateWinPatternAfterSportsFixtures(
  fixtureIds: Array<string | number>,
  log: StaffLog = staffHttpLog,
): Promise<void> {
  const ids = [...new Set(fixtureIds.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0))];
  if (!ids.length) return;
  await invokeServiceRole('player_win_pattern_evaluate_after_sports_fixtures', { p_fixture_ids: ids }, log);
}

export function settledGameRoundId(payload: unknown): string | null {
  const rec = asRecord(payload);
  const nested = asRecord(rec.round);
  const state = String(rec.state ?? nested.state ?? '');
  if (state !== 'settled') return null;
  const id = String(rec.roundId ?? rec.round_id ?? rec.id ?? nested.id ?? '');
  return UUID_RE.test(id) ? id : null;
}

export async function safeEvaluateWinPatternAfterGameRound(
  payload: unknown,
  log: StaffLog = staffHttpLog,
): Promise<void> {
  const roundId = settledGameRoundId(payload);
  if (!roundId) return;
  await invokeServiceRole('player_win_pattern_evaluate_after_game_round', { p_round_id: roundId }, log);
}
