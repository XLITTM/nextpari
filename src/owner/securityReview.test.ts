import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  OWNER_SECURITY_ACCOUNT_LABEL,
  OWNER_SECURITY_DOSSIER_LABEL,
  OWNER_SECURITY_REVIEW_LABEL,
  ownerSecurityAccountStatusLabel,
  ownerSecurityAccountToggle,
  requireOwnerSecurityAccountReason,
} from './securityAccountActions.ts';

const here = dirname(fileURLToPath(import.meta.url));
const ui = readFileSync(join(here, 'ManagerDashboardScreen.tsx'), 'utf8');
const actions = readFileSync(join(here, 'securityAccountActions.ts'), 'utf8');
const services = readFileSync(join(here, 'services.ts'), 'utf8');
const http = readFileSync(join(here, '../../server/owner/ownerControlHttp.ts'), 'utf8');
const migrations = readdirSync(join(here, '../../supabase/migrations')).filter((name) => name.endsWith('.sql'));

describe('owner security review vs account control', () => {
  it('REVIEW ACTION ONLY CHANGES FLAG STATUS', () => {
    assert.equal(OWNER_SECURITY_REVIEW_LABEL, 'Отметить просмотренным');
    assert.match(ui, /OWNER_SECURITY_REVIEW_LABEL/);
    assert.equal(ui.includes('>Просмотр<'), false);
    assert.equal(/\n\s+Просмотр\n/.test(ui), false);
    assert.match(ui, /resolveOwnerSecurityFlag\(\{\s*flagId: flag\.id,\s*action: 'review'/);
    assert.match(ui, /action: reasonFor\.action/);
    assert.match(ui, /action: 'resolve'/);
    assert.match(ui, /action: 'dismiss'/);
    const reviewFn = ui.slice(ui.indexOf('const runReview'), ui.indexOf('const submitReason'));
    assert.equal(reviewFn.includes('setOwnerPlayerBlocked'), false);
    assert.equal(reviewFn.includes("action: 'resolve'"), false);
    assert.equal(reviewFn.includes("action: 'dismiss'"), false);
  });

  it('ACTIVE PLAYER SHOWS BLOCK ACTION and BLOCKED PLAYER SHOWS UNBLOCK ACTION', () => {
    assert.equal(ownerSecurityAccountStatusLabel(false), 'Активен');
    assert.equal(ownerSecurityAccountStatusLabel(true), 'Заблокирован');
    const active = ownerSecurityAccountToggle(false);
    assert.equal(active.nextBlocked, true);
    assert.equal(active.buttonLabel, 'Заблокировать аккаунт');
    assert.equal(active.successMessage('000003'), 'Игрок #000003 заблокирован');
    const blocked = ownerSecurityAccountToggle(true);
    assert.equal(blocked.nextBlocked, false);
    assert.equal(blocked.buttonLabel, 'Разблокировать аккаунт');
    assert.equal(blocked.successMessage('000003'), 'Игрок #000003 разблокирован');
    assert.equal(OWNER_SECURITY_ACCOUNT_LABEL, 'Аккаунт');
    assert.match(ui, /OWNER_SECURITY_ACCOUNT_LABEL/);
    assert.match(ui, /ownerSecurityAccountToggle\(accountBlocked\)\.buttonLabel/);
    assert.match(actions, /Заблокировать аккаунт/);
    assert.match(actions, /Разблокировать аккаунт/);
    assert.equal(OWNER_SECURITY_DOSSIER_LABEL, 'Открыть досье безопасности');
    assert.match(ui, /OWNER_SECURITY_DOSSIER_LABEL/);
    assert.match(ui, /setDossierId\(playerId\)/);
  });

  it('BLOCK REQUIRES REASON, UNBLOCK REQUIRES REASON, OWNER BLOCK API REUSED, NEW BLOCK RPC CREATED: NO', () => {
    assert.throws(() => requireOwnerSecurityAccountReason(''), { message: 'REASON_REQUIRED' });
    assert.throws(() => requireOwnerSecurityAccountReason('   '), { message: 'REASON_REQUIRED' });
    assert.equal(requireOwnerSecurityAccountReason('  fraud  '), 'fraud');
    assert.match(ui, /requireOwnerSecurityAccountReason/);
    assert.match(ui, /setOwnerPlayerBlocked\(\{\s*playerId:[\s\S]*blocked:[\s\S]*reason:/);
    assert.match(ui, /fetchOwnerPlayerDossier/);
    assert.match(services, /\/api\/owner\/players\/\$\{encodeURIComponent\(params\.playerId\)\}\/block/);
    assert.match(http, /owner_set_player_blocked/);
    assert.equal(ui.includes('owner_set_player_blocked'), false);
    assert.equal(ui.includes("rpc('owner_set_player_blocked')"), false);
    assert.equal(http.includes('CREATE OR REPLACE FUNCTION public.owner_set_player_blocked'), false);
    assert.equal(actions.includes('CREATE OR REPLACE FUNCTION'), false);
    assert.equal(migrations.some((name) => /_049|_050|account.action|owner.risk/.test(name)), false);
  });

  it('BLOCK ACTION DOES NOT RESOLVE FLAG, UNBLOCK ACTION DOES NOT RESOLVE FLAG, WALLET LEDGER TOUCHED: NO', () => {
    const submitStart = ui.indexOf('const submitAccount');
    const submitAccount = ui.slice(submitStart, ui.indexOf("label: 'Открытые сигналы'", submitStart));
    assert.match(submitAccount, /setOwnerPlayerBlocked/);
    assert.equal(submitAccount.includes('resolveOwnerSecurityFlag'), false);
    assert.equal(submitAccount.includes("action: 'resolve'"), false);
    assert.equal(submitAccount.includes("action: 'dismiss'"), false);
    assert.equal(submitAccount.includes("action: 'review'"), false);
    assert.equal(ui.includes('apply_wallet_entry'), false);
    assert.equal(ui.includes('sports_engine_place_as'), false);
    assert.equal(ui.includes('ingest_provider_transaction'), false);
    assert.match(ui, /fetchOwnerPlayerDossier/);
    assert.match(submitAccount, /await load\(\)/);
    assert.equal(ui.includes('SHARED_DEVICE') && submitAccount.includes('SHARED_DEVICE'), false);
  });

  it('keeps Owner-only same-origin APIs without exposing raw secrets', () => {
    assert.equal(ui.includes('createClient'), false);
    assert.equal(ui.includes('supabase.co'), false);
    assert.equal(ui.includes('SERVICE_ROLE'), false);
    assert.equal(ui.includes('x-forwarded-for'), false);
    assert.equal(ui.includes('device_token'), false);
    assert.match(http, /get_current_owner_context|OWNER_REQUIRED|resolveOwnerSession/);
    assert.equal(services.includes('createServiceRoleClient'), false);
  });
});
