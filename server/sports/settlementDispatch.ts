import { timingSafeEqual } from 'node:crypto';
import {
  normalizeSettlementProviderId,
  uniformSettlementProvider,
  type SportsSettlementNotice,
} from './settlement.js';

export function readSettlementWebhookUrl(env: NodeJS.ProcessEnv = process.env): string {
  return String(env.NEXTPARI_SPORTS_SETTLE_URL ?? env.LSPORTS_SETTLEMENT_WEBHOOK_URL ?? '')
    .trim()
    .replace(/\/$/, '');
}

export function readSettlementSecret(env: NodeJS.ProcessEnv = process.env): string {
  return String(env.NEXTPARI_SPORTS_SETTLEMENT_SECRET ?? env.LSPORTS_SETTLEMENT_SECRET ?? '').trim();
}

export function settlementSecretsEqual(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (!expected || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export interface SettlementDispatchPorts {
  fetch?: typeof fetch;
  log?: (parts: Record<string, string | number | boolean | null | undefined>) => void;
}

export async function dispatchSettlementNotices(
  notices: SportsSettlementNotice[],
  env: NodeJS.ProcessEnv = process.env,
  ports: SettlementDispatchPorts = {},
): Promise<void> {
  if (!notices.length) return;
  const log = ports.log ?? (() => {});
  const batch = uniformSettlementProvider(notices);
  if (!batch.ok) {
    log({
      action: 'settlement-webhook-rejected',
      reason: batch.error,
      items: notices.length,
    });
    return;
  }
  const url = readSettlementWebhookUrl(env);
  const secret = readSettlementSecret(env);
  if (!url || !secret) {
    log({
      action: 'settlement-webhook-disabled',
      items: notices.length,
    });
    return;
  }
  const fetchImpl = ports.fetch ?? fetch;
  const provider = batch.provider;
  const body = {
    source: provider,
    items: notices.map((row) => ({
      provider: normalizeSettlementProviderId(row.provider),
      fixtureId: String(row.fixtureId),
      marketId: row.marketId,
      marketKey: row.marketKey,
      outcomeId: row.outcomeId,
      settlement: row.settlement,
      fingerprint: row.fingerprint,
      lastUpdate: row.lastUpdate,
    })),
  };
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
    });
    log({
      action: 'settlement-webhook',
      status: response.status,
      items: notices.length,
      fixtureId: notices[0]?.fixtureId ?? null,
      provider,
    });
  } catch (error) {
    log({
      action: 'settlement-webhook-failed',
      items: notices.length,
      message: error instanceof Error ? error.message : 'UNHANDLED',
    });
  }
}
