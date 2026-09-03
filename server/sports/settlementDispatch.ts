import { timingSafeEqual } from 'node:crypto';
import type { LsportsSettlementNotice } from '../lsports/state/store.js';

export function readSettlementWebhookUrl(env: NodeJS.ProcessEnv = process.env): string {
  return String(env.LSPORTS_SETTLEMENT_WEBHOOK_URL ?? env.NEXTPARI_SPORTS_SETTLE_URL ?? '')
    .trim()
    .replace(/\/$/, '');
}

export function readSettlementSecret(env: NodeJS.ProcessEnv = process.env): string {
  return String(env.LSPORTS_SETTLEMENT_SECRET ?? '').trim();
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
  notices: LsportsSettlementNotice[],
  env: NodeJS.ProcessEnv = process.env,
  ports: SettlementDispatchPorts = {},
): Promise<void> {
  if (!notices.length) return;
  const url = readSettlementWebhookUrl(env);
  const secret = readSettlementSecret(env);
  const log = ports.log ?? (() => {});
  if (!url || !secret) {
    log({
      action: 'settlement-webhook-disabled',
      items: notices.length,
    });
    return;
  }
  const fetchImpl = ports.fetch ?? fetch;
  const body = {
    source: 'lsports',
    items: notices.map((row) => ({
      fixtureId: String(row.fixtureId),
      marketId: row.marketId,
      marketKey: row.marketKey,
      outcomeId: row.betId,
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
    });
  } catch (error) {
    log({
      action: 'settlement-webhook-failed',
      items: notices.length,
      message: error instanceof Error ? error.message : 'UNHANDLED',
    });
  }
}
