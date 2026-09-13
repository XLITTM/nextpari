import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  OWNER_SECURITY_ACCOUNT_LABEL,
  OWNER_SECURITY_DOSSIER_LABEL,
  OWNER_SECURITY_RESTRICTION_POLICY,
  OWNER_SECURITY_REVIEW_LABEL,
  ownerSecurityAccountStatusLabel,
  ownerSecurityRestrictionToggle,
  requireOwnerSecurityAccountReason,
} from './securityAccountActions.ts';

const here = dirname(fileURLToPath(import.meta.url));
const ui = readFileSync(join(here, 'ManagerDashboardScreen.tsx'), 'utf8');
const actions = readFileSync(join(here, 'securityAccountActions.ts'), 'utf8');
const services = readFileSync(join(here, 'services.ts'), 'utf8');
const http = readFileSync(join(here, '../../server/owner/ownerControlHttp.ts'), 'utf8');
const playersPanel = readFileSync(join(here, 'PlayersPanel.tsx'), 'utf8');
const migrations = readdirSync(join(here, '../../supabase/migrations')).filter((name) => name.endsWith('.sql'));

describe('owner security review vs security restriction', () => {
  it('REVIEW ACTION ONLY CHANGES FLAG STATUS', () => {
    assert.equal(OWNER_SECURITY_REVIEW_LABEL, 'Отметить просмотренным');
    assert.match(ui, /OWNER_SECURITY_REVIEW_LABEL/);
    assert.equal(ui.includes('>Просмотр<'), false);
    assert.match(ui, /resolveOwnerSecurityFlag\(\{\s*flagId: flag\.id,\s*action: 'review'/);
    const reviewFn = ui.slice(ui.indexOf('const runReview'), ui.indexOf('const submitReason'));
    assert.equal(reviewFn.includes('setOwnerPlayerBlocked'), false);
    assert.equal(reviewFn.includes('setOwnerPlayerSecurityRestriction'), false);
    assert.equal(reviewFn.includes("action: 'resolve'"), false);
    assert.equal(reviewFn.includes("action: 'dismiss'"), false);
  });

  it('ACTIVE PLAYER SHOWS RESTRICT ACTION and RESTRICTED PLAYER SHOWS REMOVE ACTION', () => {
    assert.equal(ownerSecurityAccountStatusLabel(false), 'Активен');
    assert.equal(ownerSecurityAccountStatusLabel(true), 'Ограничен службой безопасности');
    const active = ownerSecurityRestrictionToggle(false);
    assert.equal(active.nextRestricted, true);
    assert.equal(active.buttonLabel, 'Ограничить аккаунт');
    assert.equal(active.successMessage('000003'), 'Игрок #000003 ограничен службой безопасности');
    const restricted = ownerSecurityRestrictionToggle(true);
    assert.equal(restricted.nextRestricted, false);
    assert.equal(restricted.buttonLabel, 'Снять ограничения');
    assert.equal(restricted.successMessage('000003'), 'Ограничения игрока #000003 сняты');
    assert.equal(OWNER_SECURITY_ACCOUNT_LABEL, 'Аккаунт');
    assert.match(ui, /OWNER_SECURITY_RESTRICTION_POLICY/);
    assert.equal(OWNER_SECURITY_RESTRICTION_POLICY.some((row) => row.label === 'Спорт' && row.value === 'Разрешён'), true);
    assert.equal(OWNER_SECURITY_RESTRICTION_POLICY.some((row) => row.label === 'Казино/слоты' && row.value === 'Запрещены'), true);
    assert.equal(OWNER_SECURITY_RESTRICTION_POLICY.some((row) => row.label === 'Live Casino' && row.value === 'Запрещено'), true);
    assert.equal(OWNER_SECURITY_RESTRICTION_POLICY.some((row) => row.label === 'Пополнение' && row.value === 'Запрещено'), true);
    assert.equal(OWNER_SECURITY_RESTRICTION_POLICY.some((row) => row.label === 'Вывод' && row.value === 'Запрещён'), true);
    assert.equal(OWNER_SECURITY_DOSSIER_LABEL, 'Открыть досье безопасности');
    assert.match(ui, /setDossierId\(playerId\)/);
    assert.equal(actions.includes('Заблокировать аккаунт'), false);
    assert.equal(actions.includes('Разблокировать аккаунт'), false);
  });

  it('REASON REQUIRED TO APPLY AND REMOVE; HARD BLOCK NOT USED IN FRAUD WORKFLOW', () => {
    assert.throws(() => requireOwnerSecurityAccountReason(''), { message: 'REASON_REQUIRED' });
    assert.throws(() => requireOwnerSecurityAccountReason('   '), { message: 'REASON_REQUIRED' });
    assert.equal(requireOwnerSecurityAccountReason('  fraud  '), 'fraud');
    assert.match(ui, /setOwnerPlayerSecurityRestriction\(\{\s*playerId:[\s\S]*restricted:[\s\S]*reason:/);
    assert.equal(ui.includes('setOwnerPlayerBlocked'), false);
    assert.match(services, /\/api\/owner\/players\/\$\{encodeURIComponent\(params\.playerId\)\}\/security-restriction/);
    assert.match(http, /owner_set_player_security_restriction/);
    assert.match(http, /owner_set_player_blocked/);
    assert.match(playersPanel, /setOwnerPlayerBlocked/);
  });

  it('SECURITY FLAG AUTO-CLOSED: NO', () => {
    const submitStart = ui.indexOf('const submitAccount');
    const submitAccount = ui.slice(submitStart, ui.indexOf("label: 'Открытые сигналы'", submitStart));
    assert.match(submitAccount, /setOwnerPlayerSecurityRestriction/);
    assert.equal(submitAccount.includes('resolveOwnerSecurityFlag'), false);
    assert.equal(submitAccount.includes("action: 'resolve'"), false);
    assert.equal(submitAccount.includes("action: 'dismiss'"), false);
    assert.equal(submitAccount.includes("action: 'review'"), false);
    assert.equal(ui.includes('apply_wallet_entry'), false);
    assert.match(submitAccount, /await load\(\)/);
  });

  it('keeps Owner-only same-origin APIs without exposing raw secrets', () => {
    assert.equal(ui.includes('createClient'), false);
    assert.equal(ui.includes('supabase.co'), false);
    assert.equal(ui.includes('SERVICE_ROLE'), false);
    assert.equal(ui.includes('x-forwarded-for'), false);
    assert.equal(ui.includes('device_token'), false);
    assert.match(http, /get_current_owner_context|OWNER_REQUIRED|resolveOwnerSession/);
    assert.equal(migrations.includes('20260914020000_player_security_restrictions_049.sql'), true);
  });
});
