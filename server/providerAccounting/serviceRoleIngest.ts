import { createServiceRoleClient } from '../supabase/admin.js';
import type { CanonicalProviderEvent } from './types.js';

export const PROVIDER_INGEST_RPC = 'provider_ingest_transaction';

export interface ProviderIngestServiceRoleEnv {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}

export function providerIngestRpcArgs(event: CanonicalProviderEvent): Record<string, unknown> {
  return {
    p_provider_key: event.providerKey,
    p_product: event.product,
    p_external_transaction_id: event.externalTransactionId,
    p_related_transaction_id: event.relatedTransactionId ?? null,
    p_kind: event.kind,
    p_amount: event.amount,
    p_currency: event.currency,
    p_occurred_at: event.occurredAt instanceof Date
      ? event.occurredAt.toISOString()
      : event.occurredAt,
    p_metadata: event.metadata ?? {},
  };
}

export async function ingestProviderTransactionWithServiceRole(
  env: ProviderIngestServiceRoleEnv,
  event: CanonicalProviderEvent,
  clientFactory: typeof createServiceRoleClient = createServiceRoleClient,
): Promise<unknown> {
  const client = clientFactory(env.supabaseUrl, env.supabaseServiceRoleKey);
  const { data, error } = await client.rpc(PROVIDER_INGEST_RPC, providerIngestRpcArgs(event));
  if (error) throw error;
  return data;
}
