import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServiceRoleClient } from '../supabase/admin.js';
import {
  ingestProviderTransactionWithServiceRole,
  PROVIDER_INGEST_RPC,
  providerIngestRpcArgs,
} from './index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const sql = read('supabase/migrations/20260913220000_provider_settlement_foundation_046.sql');
const ingest = read('server/providerAccounting/ingest.ts');
const http = read('server/owner/ownerControlHttp.ts');
const services = read('src/owner/services.ts');
const panel = read('src/owner/ProviderSettlementsPanel.tsx');
const dashboard = read('src/owner/ManagerDashboardScreen.tsx');
const display = read('src/owner/providerSettlementDisplay.ts');
const mapping = read('supabase/migrations/20260820033000_providers_mapping_and_write_policies.sql');

describe('provider settlement SQL and owner UI contracts', () => {
  it('creates a private ledger with provider+transaction idempotency and no wallet writes', () => {
    assert.match(sql, /BEGIN;/);
    assert.match(sql, /SET LOCAL statement_timeout = '10min'/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS private\.provider_ledger/);
    assert.match(sql, /UNIQUE \(provider_key, external_transaction_id\)/);
    assert.match(sql, /economic_effect NUMERIC\(20, 2\) NOT NULL/);
    assert.match(sql, /kind IN \('stake', 'bet', 'payout', 'win', 'refund', 'void', 'rollback'\)/);
    assert.match(sql, /product IN \('sports', 'casino'\)/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS private\.provider_settlement_periods/);
    assert.match(sql, /UNIQUE \(provider_key, product, currency, period_start, period_end\)/);
    assert.match(sql, /status IN \('open', 'reconciled', 'invoiced', 'paid', 'dispute'\)/);
    assert.match(sql, /provider_reported_ggr NUMERIC\(20, 2\)/);
    assert.match(sql, /commission_fee NUMERIC\(20, 2\)/);
    assert.match(sql, /amount_due NUMERIC\(20, 2\)/);
    assert.match(sql, /private\.ingest_provider_transaction\(/);
    assert.match(sql, /ON CONFLICT \(provider_key, product, currency, period_start, period_end\)/);
    assert.equal(/CREATE OR REPLACE FUNCTION private\.apply_wallet_entry/.test(sql), false);
    assert.equal(/UPDATE\s+public\.wallets/.test(sql), false);
    assert.equal(/INSERT INTO\s+private\.wallet_ledger/.test(sql), false);
    assert.equal(/UPDATE\s+private\.wallet_ledger/.test(sql), false);
    assert.equal(sql.includes('CREATE TABLE IF NOT EXISTS public.providers_mapping'), false);
    assert.match(mapping, /CREATE TABLE IF NOT EXISTS providers_mapping/);
    assert.match(sql, /private\.sports_bets\.provider/);
    assert.equal(/DEFAULT\s+0\.1[05]|15%|10%|NGR/i.test(sql), false);
    assert.equal(sql.includes('https://'), false);
    assert.equal(sql.includes('BETB2B_'), false);
  });

  it('revokes browser access and keeps ingest off authenticated GRANT', () => {
    assert.match(sql, /REVOKE ALL ON TABLE private\.provider_ledger FROM PUBLIC/);
    assert.match(sql, /REVOKE ALL ON TABLE private\.provider_ledger FROM anon, authenticated/);
    assert.match(sql, /REVOKE ALL ON TABLE private\.provider_settlement_periods FROM anon, authenticated/);
    assert.match(sql, /GRANT SELECT ON TABLE private\.provider_ledger TO service_role/);
    assert.match(sql, /REVOKE ALL ON TABLE private\.provider_ledger FROM service_role/);
    assert.equal(sql.includes('GRANT SELECT, INSERT, UPDATE ON TABLE private.provider_ledger TO service_role'), false);
    assert.equal(/GRANT[^\n]*INSERT[^\n]*private\.provider_ledger/.test(sql), false);
    assert.equal(/GRANT[^\n]*UPDATE[^\n]*private\.provider_ledger/.test(sql), false);
    assert.equal(/GRANT[^\n]*DELETE[^\n]*private\.provider_ledger/.test(sql), false);
    assert.equal(/UPDATE\s+private\.provider_ledger/.test(sql), false);
    assert.equal(/DELETE\s+FROM\s+private\.provider_ledger/.test(sql), false);
    assert.match(sql, /GRANT SELECT, INSERT, UPDATE ON TABLE private\.provider_settlement_periods TO service_role/);
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION private\.ingest_provider_transaction\(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, JSONB\) FROM PUBLIC, anon, authenticated/,
    );
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION private\.ingest_provider_transaction\(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, JSONB\) TO service_role/,
    );
    assert.equal(
      sql.includes('GRANT EXECUTE ON FUNCTION private.ingest_provider_transaction(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, JSONB) TO authenticated'),
      false,
    );
    assert.match(sql, /PERFORM private\.get_current_owner_context\(\)/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.owner_provider_ggr_summary/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.owner_list_provider_settlements/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.owner_provider_ggr_summary[\s\S]*FROM anon/);
    assert.match(sql, /COMMIT;/);
  });

  it('owner HTTP is read-only and the UI is a backoffice section without Pay', () => {
    assert.match(http, /\/api\/owner\/provider-ggr/);
    assert.match(http, /\/api\/owner\/provider-settlements/);
    assert.match(http, /owner_provider_ggr_summary/);
    assert.match(http, /owner_list_provider_settlements/);
    assert.equal(http.includes('private.ingest_provider_transaction'), false);
    assert.equal(http.includes('createServiceRoleClient'), false);
    assert.match(services, /\/api\/owner\/provider-ggr/);
    assert.match(services, /\/api\/owner\/provider-settlements/);
    assert.equal(services.includes('.rpc('), false);
    assert.match(dashboard, /Расчёты с провайдерами/);
    assert.match(dashboard, /ProviderSettlementsPanel/);
    assert.match(panel, /Данные расчётов с провайдерами ещё не подключены/);
    assert.match(panel, /GGR провайдера/);
    assert.match(display, /Не настроено/);
    assert.match(panel, /BetB2B/);
    assert.equal(panel.includes('Pay'), false);
    assert.equal(panel.includes('Оплатить'), false);
    assert.equal(ingest.includes('fetch('), false);
    assert.equal(ingest.includes('BETB2B'), false);
  });

  it('owner UI renders dash, unconfigured commercial terms, and zero-state copy', () => {
    const displaySrc = read('src/owner/providerSettlementDisplay.ts');
    assert.match(displaySrc, /return '—'/);
    assert.match(displaySrc, /Не настроено/);
    assert.match(panel, /Данные расчётов с провайдерами ещё не подключены/);
  });

  it('rejects mismatched replays and partial neutralization in SQL ingest', () => {
    const ingestStart = sql.indexOf('CREATE OR REPLACE FUNCTION private.ingest_provider_transaction(');
    const ingestEnd = sql.indexOf('CREATE OR REPLACE FUNCTION private.provider_ggr_summary_json(');
    const ingestSql = sql.slice(ingestStart, ingestEnd);
    assert.match(ingestSql, /RAISE EXCEPTION 'PROVIDER_TRANSACTION_CONFLICT'/);
    assert.match(ingestSql, /v_stored\.amount IS DISTINCT FROM v_amount/);
    assert.match(ingestSql, /v_stored\.currency IS DISTINCT FROM v_currency/);
    assert.match(ingestSql, /v_stored\.product IS DISTINCT FROM v_product/);
    assert.match(ingestSql, /v_stored\.kind IS DISTINCT FROM v_kind/);
    assert.match(ingestSql, /v_stored\.related_transaction_id IS DISTINCT FROM v_related/);
    assert.match(ingestSql, /v_stored\.occurred_at IS DISTINCT FROM p_occurred_at/);
    assert.match(ingestSql, /RAISE EXCEPTION 'PROVIDER_NEUTRALIZATION_AMOUNT_MISMATCH'/);
    assert.match(ingestSql, /v_effect := ROUND\(-v_related_effect, 2\)/);
    assert.match(ingestSql, /'replayed', true/);
    assert.match(ingestSql, /v_stored\.economic_effect/);
  });

  it('exposes service_role ingest only through public.provider_ingest_transaction', () => {
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.provider_ingest_transaction\(/);
    assert.match(sql, /RETURN private\.ingest_provider_transaction\(/);
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.provider_ingest_transaction\(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, JSONB\) FROM PUBLIC/,
    );
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.provider_ingest_transaction\(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, JSONB\) FROM anon/,
    );
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.provider_ingest_transaction\(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, JSONB\) FROM authenticated/,
    );
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.provider_ingest_transaction\(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, JSONB\) TO service_role/,
    );
    assert.equal(
      sql.includes('GRANT EXECUTE ON FUNCTION public.provider_ingest_transaction(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, JSONB) TO authenticated'),
      false,
    );
    assert.equal(
      sql.includes('GRANT EXECUTE ON FUNCTION public.provider_ingest_transaction(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, JSONB) TO anon'),
      false,
    );
    assert.equal(
      sql.includes('GRANT EXECUTE ON FUNCTION public.provider_ingest_transaction(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, JSONB) TO PUBLIC'),
      false,
    );
  });

  it('does not expose provider ingestion over HTTP and uses the service-role helper for future adapters', async () => {
    function listFiles(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return listFiles(path);
        return [path];
      });
    }
    const apiSrc = listFiles(join(root, 'api'))
      .filter((path) => path.endsWith('.ts'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    assert.equal(apiSrc.includes('provider_ingest_transaction'), false);
    assert.equal(apiSrc.includes('ingest_provider_transaction'), false);
    assert.equal(http.includes('provider_ingest_transaction'), false);
    const helper = read('server/providerAccounting/serviceRoleIngest.ts');
    assert.match(helper, /createServiceRoleClient/);
    assert.match(helper, /provider_ingest_transaction/);
    assert.equal(helper.includes('BETB2B'), false);
    assert.equal(PROVIDER_INGEST_RPC, 'provider_ingest_transaction');
    const rpcCalls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    const data = await ingestProviderTransactionWithServiceRole(
      { supabaseUrl: 'http://n.local', supabaseServiceRoleKey: 'service-role-key' },
      {
        providerKey: 'lsports',
        product: 'sports',
        externalTransactionId: 'rpc-1',
        kind: 'stake',
        amount: 1,
        currency: 'TMTM',
        occurredAt: '2026-09-13T12:00:00.000Z',
      },
      ((url: string, key: string) => {
        assert.equal(url, 'http://n.local');
        assert.equal(key, 'service-role-key');
        return {
          rpc: async (name: string, args?: Record<string, unknown>) => {
            rpcCalls.push({ name, args });
            return { data: { ok: true, inserted: true, replayed: false }, error: null };
          },
        };
      }) as unknown as typeof createServiceRoleClient,
    );
    assert.equal(rpcCalls[0]?.name, 'provider_ingest_transaction');
    assert.equal(rpcCalls[0]?.args?.p_external_transaction_id, 'rpc-1');
    assert.deepEqual(providerIngestRpcArgs({
      providerKey: 'lsports',
      product: 'sports',
      externalTransactionId: 'rpc-1',
      kind: 'stake',
      amount: 1,
      currency: 'TMTM',
      occurredAt: '2026-09-13T12:00:00.000Z',
    }).p_kind, 'stake');
    assert.equal((data as { inserted?: boolean }).inserted, true);
  });
});
