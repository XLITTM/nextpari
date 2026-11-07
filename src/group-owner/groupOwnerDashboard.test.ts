import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { authenticateGroupOwner, authorizeStaffSubject } from '../../server/group/access.ts';
import { GroupControlError } from '../../server/group/errors.ts';
import { sumMoney } from '../../server/group/reporting.ts';
import { DEMO_AUDIT, DEMO_GRANTS, DEMO_PLAYERS, DEMO_SNAPSHOTS } from './demoData.ts';
import { GroupOwnerApp, type GroupDashboardData } from './GroupOwnerApp.tsx';
import { readRecoveryCallback, recoveryFailureView } from './recoveryCallback.ts';
import {
  employeeDraftReceipt,
  financeLines,
  assignedBrandViews,
  countLabel,
  playerIdsLeakAcrossBrands,
  totalPlayers,
  playersForBrand,
  publicIdsAreGloballyUnique,
  buildGroupReport,
} from './viewModel.ts';

const session = { ownerId: '00000000-0000-4000-8000-0000000000aa', permissions: ['brands.read', 'reports.read', 'staff.map'] };
const brands = [
  { code: '001' as const, displayName: 'NextPari', status: 'active' as const },
  { code: '002' as const, displayName: 'RYXO', status: 'registered' as const },
  { code: '003' as const, displayName: 'Future brand', status: 'planned' as const },
];
const snapshot: GroupDashboardData = {
  brands,
  brandOwners: [
    { ownerId: session.ownerId, brandCode: '001' },
    { ownerId: session.ownerId, brandCode: '002' },
    { ownerId: session.ownerId, brandCode: '003' },
  ],
  grants: DEMO_GRANTS,
  players: DEMO_PLAYERS.map((player) => ({
    brandCode: player.brandCode,
    publicId: player.publicId,
    label: player.label,
    source: player.state,
  })),
  operational: DEMO_SNAPSHOTS,
  audit: DEMO_AUDIT,
  permissions: session.permissions,
  schemaError: null,
  nextpariReason: null,
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const PAGES = ['overview', 'brands', 'employees', 'players', 'finance', 'access', 'audit'] as const;

function html(page: (typeof PAGES)[number], brand: 'all' | '001' | '002' | '003' = 'all'): string {
  return renderToStaticMarkup(createElement(GroupOwnerApp, {
    initialPage: page,
    initialBrand: brand,
    initialSession: session,
    initialSnapshot: snapshot,
  }));
}

describe('group owner dashboard', () => {
  it('asks for group owner sign-in before showing any figures', () => {
    const markup = renderToStaticMarkup(createElement(GroupOwnerApp));
    assert.match(markup, /Вход владельца группы/);
    assert.match(markup, /Забыли пароль\?/);
    assert.doesNotMatch(markup, /900001/);
    assert.doesNotMatch(markup, /120\.00/);
    const expired = readRecoveryCallback('#error_code=otp_expired&error_description=access_token%3Dsecret-token&type=recovery');
    assert.deepEqual(expired, { kind: 'invalid' });
    assert.equal(JSON.stringify(expired).includes('secret-token'), false);
    const ready = readRecoveryCallback('#access_token=header.payload.sig&refresh_token=refresh-secret&type=recovery');
    assert.equal(ready.kind, 'ready');
    assert.equal(readRecoveryCallback('').kind, 'none');
    assert.equal(readRecoveryCallback('#type=signup&access_token=header.payload.sig&refresh_token=refresh-secret').kind, 'invalid');
    const ssl = recoveryFailureView('GROUP_DATABASE_SSL');
    assert.equal(ssl.mode, 'unavailable');
    assert.equal(ssl.code, 'GROUP_DATABASE_SSL');
    assert.match(ssl.message, /не отклонена/);
    const missing = recoveryFailureView('OWNER_UNKNOWN');
    assert.equal(missing.mode, 'unavailable');
    assert.equal(missing.code, 'OWNER_UNKNOWN');
    const expiredLink = recoveryFailureView('RECOVERY_LINK_INVALID');
    assert.equal(expiredLink.mode, 'invalid');
    assert.equal(expiredLink.code, null);
    const leaked = recoveryFailureView('postgres://group_control_reader:pw@db.example/postgres');
    assert.equal(leaked.mode, 'invalid');
    assert.equal(JSON.stringify(leaked).includes('postgres://'), false);
  });

  it('renders the separate overview from the supplied rows', () => {
    const markup = html('overview');
    assert.match(markup, /Источник: group_control/);
    assert.match(markup, /Кабинет владельца NextPari не заменяется/);
    assert.match(markup, /NextPari/);
    assert.match(markup, /RYXO/);
    assert.match(markup, /Future brand/);
    assert.match(markup, /001 NextPari/);
    assert.match(markup, /002 RYXO/);
    assert.match(markup, /003 Future brand/);
    const views = assignedBrandViews(brands, DEMO_SNAPSHOTS, DEMO_GRANTS);
    assert.equal(views.length, 3);
    assert.equal(views[2]?.playerCount, null);
    assert.equal(totalPlayers(views), null);
    assert.equal(countLabel(totalPlayers(views)), 'Не подключено');
    assert.match(markup, /Бренды<\/span><strong>3<\/strong>/);
    assert.match(markup, /Игроки<\/span><strong>Не подключено<\/strong>/);
    assert.match(markup, />4</);
    assert.match(markup, />2</);
  });

  it('lists assigned brands when report snapshots are empty and does not invent zeros', () => {
    const markup = renderToStaticMarkup(createElement(GroupOwnerApp, {
      initialPage: 'overview',
      initialSession: session,
      initialSnapshot: {
        brands,
        brandOwners: brands.map((item) => ({ ownerId: session.ownerId, brandCode: item.code })),
        grants: [],
        players: [],
        operational: [],
        audit: [],
        permissions: session.permissions,
        schemaError: null,
        nextpariReason: 'NEXTPARI_REPORT_ADAPTER_REQUIRED',
      },
    }));
    assert.match(markup, /001 NextPari/);
    assert.match(markup, /002 RYXO/);
    assert.match(markup, /003 Future brand/);
    assert.match(markup, /Активен/);
    assert.match(markup, /Зарегистрирован/);
    assert.match(markup, /Запланирован/);
    assert.match(markup, /Бренды<\/span><strong>3<\/strong>/);
    assert.match(markup, /Игроки<\/span><strong>Не подключено<\/strong>/);
    assert.match(markup, /Менеджеры<\/span><strong>0<\/strong>/);
    assert.doesNotMatch(markup, /120\.00/);
    assert.doesNotMatch(markup, /900001/);
    const finance = renderToStaticMarkup(createElement(GroupOwnerApp, {
      initialPage: 'finance',
      initialSession: session,
      initialSnapshot: {
        brands,
        brandOwners: brands.map((item) => ({ ownerId: session.ownerId, brandCode: item.code })),
        grants: [],
        players: [],
        operational: [],
        audit: [],
        permissions: session.permissions,
        schemaError: null,
        nextpariReason: 'NEXTPARI_REPORT_ADAPTER_REQUIRED',
      },
    }));
    assert.match(finance, /Не подключено/);
    assert.doesNotMatch(finance, /0\.00/);
    const zeros = assignedBrandViews(brands, brands.map((brand) => ({
      brandCode: brand.code,
      playerCount: 0,
      operationalStatus: brand.status,
      financials: { currency: 'TMT', deposits: '0.00', withdrawals: '0.00', ggr: '0.00' },
    })), []);
    assert.equal(totalPlayers(zeros), 0);
    assert.equal(countLabel(0), '0');
  });

  it('filters players to the selected brand', () => {
    assert.equal(publicIdsAreGloballyUnique(DEMO_PLAYERS), true);
    assert.equal(playerIdsLeakAcrossBrands(DEMO_PLAYERS, '001'), false);
    assert.deepEqual(playersForBrand(DEMO_PLAYERS, '002').map((player) => player.publicId), ['910001', '910002']);
    const nextpari = html('players', '001');
    assert.match(nextpari, /900001/);
    assert.doesNotMatch(nextpari, /910001/);
    const future = html('players', '003');
    assert.match(future, /Число игроков не подключено/);
    assert.doesNotMatch(future, /900001/);
    assert.doesNotMatch(future, /910001/);
  });

  it('keeps finance split by brand and currency', () => {
    const lines = financeLines(buildGroupReport(DEMO_SNAPSHOTS, DEMO_GRANTS), 'all');
    assert.deepEqual(lines.map((line) => `${line.brandCode}:${line.currency}`), ['001:TMT', '002:USD']);
    assert.throws(() => sumMoney(lines, 'deposits'), (error: unknown) => {
      return error instanceof GroupControlError && error.code === 'MIXED_CURRENCY_TOTAL';
    });
    const markup = html('finance', 'all');
    assert.match(markup, /TMT/);
    assert.match(markup, /USD/);
    assert.doesNotMatch(markup, /Итого/);
    assert.equal(financeLines(buildGroupReport(DEMO_SNAPSHOTS, DEMO_GRANTS), '003').length, 0);
    assert.equal(DEMO_SNAPSHOTS[0]?.financials.currency, 'TMT');
  });

  it('validates the employee form and never reports an account was created', () => {
    const empty = employeeDraftReceipt({
      brandCode: '',
      identity: '',
      role: '',
      permissions: [],
      status: '',
    });
    assert.equal(empty.accountCreated, false);
    assert.equal(empty.invitationSent, false);
    assert.deepEqual(empty.errors, ['brandCode', 'identity', 'role', 'permissions', 'status']);

    const email = employeeDraftReceipt({
      brandCode: '001',
      identity: 'owner@nextpari.com',
      role: 'manager',
      permissions: ['players'],
      status: 'active',
    });
    assert.deepEqual(email.errors, ['identity']);

    const valid = employeeDraftReceipt({
      brandCode: '002',
      identity: 'Демо Кассир',
      role: 'cashier',
      permissions: ['balances'],
      status: 'suspended',
    });
    assert.deepEqual(valid.errors, []);
    assert.equal(valid.accountCreated, false);
    const cashierStaff = employeeDraftReceipt({
      brandCode: '001',
      identity: 'Демо Кассир',
      role: 'cashier',
      permissions: ['staff'],
      status: 'active',
    });
    assert.deepEqual(cashierStaff.errors, ['permissions']);
    const securityBalances = employeeDraftReceipt({
      brandCode: '002',
      identity: 'Демо Охрана',
      role: 'security',
      permissions: ['balances'],
      status: 'active',
    });
    assert.deepEqual(securityBalances.errors, ['permissions']);
    const markup = html('employees', '001');
    assert.match(markup, /Отправить приглашение/);
    assert.match(markup, /Приостановить/);
    assert.match(markup, /Отозвать/);
    assert.match(markup, /Статус не указан/);
    assert.match(markup, /на сайте выключены/);
    assert.match(markup, /disabled/);
    assert.doesNotMatch(markup, /Бэкенд не подключён/);
    const ryxo = html('employees', '002');
    assert.match(ryxo, /Бэкенд не подключён/);
    assert.match(ryxo, /Безопасность/);
    const access = html('access', '002');
    assert.match(access, /Безопасность: Игроки/);
    assert.match(access, /Назначения владельца по брендам/);
    assert.match(access, /Бэкенд не подключён/);
    assert.match(access, new RegExp(session.ownerId));
  });

  it('denies cross-brand staff and display-name owner login', () => {
    const subject = DEMO_GRANTS[0]?.staffSubject ?? '';
    assert.equal(authorizeStaffSubject(DEMO_GRANTS, '001', subject, 'players'), '001');
    assert.throws(() => authorizeStaffSubject(DEMO_GRANTS, '002', subject, 'players'), (error: unknown) => {
      return error instanceof GroupControlError && error.code === 'CROSS_BRAND_ACCESS_DENIED';
    });
    const security = DEMO_GRANTS.find((grant) => grant.role === 'security');
    assert.ok(security);
    assert.equal(authorizeStaffSubject(DEMO_GRANTS, security.brandCode, security.staffSubject, 'players'), security.brandCode);
    assert.throws(() => authorizeStaffSubject(DEMO_GRANTS, security.brandCode, security.staffSubject, 'balances'), (error: unknown) => {
      return error instanceof GroupControlError && error.code === 'STAFF_PERMISSION_DENIED';
    });
    const cashier = DEMO_GRANTS.find((grant) => grant.role === 'cashier');
    assert.ok(cashier);
    assert.equal(authorizeStaffSubject(DEMO_GRANTS, cashier.brandCode, cashier.staffSubject, 'transactions'), cashier.brandCode);
    assert.throws(() => authorizeStaffSubject(DEMO_GRANTS, cashier.brandCode, cashier.staffSubject, 'staff'), (error: unknown) => {
      return error instanceof GroupControlError && error.code === 'STAFF_PERMISSION_DENIED';
    });
    assert.throws(() => authenticateGroupOwner([], 'group-owner'), (error: unknown) => {
      return error instanceof GroupControlError && error.code === 'OWNER_SUBJECT_INVALID';
    });
  });

  it('renders every page and keeps writes disabled', () => {
    const expected: Record<(typeof PAGES)[number], RegExp> = {
      overview: /Операционные статусы/,
      brands: /Создать бренд/,
      employees: /Форма назначения/,
      players: /Публичный ID/,
      finance: /Разные валюты не складываются/,
      access: /не содержит обхода прав/,
      audit: /Демонстрационный субъект/,
    };
    for (const page of PAGES) {
      const markup = html(page, '002');
      assert.match(markup, /Источник: group_control/);
      assert.match(markup, expected[page]);
      assert.doesNotMatch(markup, /900001/);
    }
    assert.match(html('players', '002'), /910001/);
    const brands = html('brands');
    assert.match(brands, /disabled/);
    assert.match(brands, /Кнопка не пишет в базу/);
    const ryxoFinance = html('finance', '002');
    assert.match(ryxoFinance, /USD/);
    assert.doesNotMatch(ryxoFinance, /TMT/);
  });

  it('stays off the production owner entry and does not embed a service token', () => {
    const index = readFileSync(join(root, 'index.html'), 'utf8');
    const vercel = readFileSync(join(root, 'vercel.json'), 'utf8');
    const app = readFileSync(join(root, 'src', 'group-owner', 'GroupOwnerApp.tsx'), 'utf8');
    const main = readFileSync(join(root, 'src', 'group-owner', 'main.tsx'), 'utf8');
    assert.match(index, /src\/main\.tsx/);
    assert.doesNotMatch(index, /group-owner/);
    assert.doesNotMatch(vercel, /group-owner|group_control|GROUP_SERVICE/);
    assert.doesNotMatch(`${app}\n${main}`, /service_role|GROUP_SERVICE|VITE_|bypass/i);
    assert.doesNotMatch(app, /src\/owner\//);
  });
});
