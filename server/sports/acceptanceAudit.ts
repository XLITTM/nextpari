import { createServiceRoleClient } from '../supabase/admin.js';
import { loadStaffOnboardingEnv } from '../staff/env.js';
import { redactForLog } from '../staff/errors.js';

export const SPORTS_ACCEPTANCE_AUDIT_RPC = 'sports_record_acceptance_event';

export interface SportsAcceptanceAuditInput {
  idempotencyKey: string;
  playerUserId: string;
  betId?: string | null;
  providers: string;
  mode: string;
  stake: number;
  potentialPayout?: number | null;
  decision: 'accepted' | 'rejected';
  decisionCode: string;
  oddsSnapshot?: Record<string, unknown>;
}

export function sanitizeSportsAcceptanceSnapshot(value: unknown): Record<string, unknown> {
  const redacted = redactForLog(value);
  if (redacted && typeof redacted === 'object' && !Array.isArray(redacted)) {
    return redacted as Record<string, unknown>;
  }
  return {};
}

export async function recordSportsAcceptanceEvent(
  input: SportsAcceptanceAuditInput,
  clientFactory: typeof createServiceRoleClient = createServiceRoleClient,
): Promise<void> {
  const env = loadStaffOnboardingEnv();
  const client = clientFactory(env.supabaseUrl, env.supabaseServiceRoleKey);
  const { error } = await client.rpc(SPORTS_ACCEPTANCE_AUDIT_RPC, {
    p_idempotency_key: input.idempotencyKey,
    p_player_user_id: input.playerUserId,
    p_bet_id: input.betId ?? null,
    p_providers: input.providers,
    p_mode: input.mode,
    p_stake: input.stake,
    p_potential_payout: input.potentialPayout ?? null,
    p_decision: input.decision,
    p_decision_code: input.decisionCode,
    p_odds_snapshot: sanitizeSportsAcceptanceSnapshot(input.oddsSnapshot ?? {}),
  });
  if (error) throw error;
}
