import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

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
    assert.match(sql, /GRANT SELECT, INSERT, UPDATE ON TABLE private\.provider_ledger TO service_role/);
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
    const display = read('src/owner/providerSettlementDisplay.ts');
    assert.match(display, /return '—'/);
    assert.match(display, /Не настроено/);
    assert.match(panel, /Данные расчётов с провайдерами ещё не подключены/);
  });
});
