import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { TEST_FIXTURE_OWNER_SUBJECT, authorizeBrandStaff, authorizeStaffSubject } from './access.js';
import { handleGroupControlRequest } from './api.js';
import { CentralPlayerIdAllocator } from './allocator.js';
import { GROUP_BRANDS } from './catalog.js';
import { GroupControlError } from './errors.js';
import { collectLegacyPublicIds, formatGlobalPlayerId, loginAcceptsPublicId, NEXTPARI_LOGIN_TODAY, planGroupCounter } from './ids.js';
import { aggregateGroupReport, sumMoney } from './reporting.js';
import type { BrandOperationalSnapshot } from './reporting.js';
import type { BrandStaffGrant } from './access.js';
import type { GroupControlState } from './api.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const NEXTPARI_MANAGER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RYXO_CASHIER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const LEGACY_IDS = ['000001', '645912', '110790'];
const OPEN_GATES = { nextpariUsesCentralAllocator: true, ryxoRegistrationEnabled: true };
const SHARED_STAFF_UUID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function issue(
  allocator: CentralPlayerIdAllocator,
  brand: '001' | '002',
  idempotencyKey: string,
  login: { minDigits: number; maxDigits: number } = NEXTPARI_LOGIN_TODAY,
): Promise<string> {
  return allocator.allocate({ brandCode: brand, idempotencyKey, gates: OPEN_GATES, login });
}

function productionSnapshot(): { counter: number; ids: string[] } {
  return { counter: 48, ids: [...LEGACY_IDS] };
}

async function seededAllocator(available: () => boolean = () => true): Promise<CentralPlayerIdAllocator> {
  const allocator = new CentralPlayerIdAllocator(available);
  await allocator.reserveLegacy(LEGACY_IDS, '001');
  await allocator.seedCounter({
    productionNextValue: 48,
    legacyPublicIds: LEGACY_IDS,
  });
  return allocator;
}

describe('group player id allocator', () => {
  it('reserves legacy NextPari ids and does not issue them again', async () => {
    const production = productionSnapshot();
    const allocator = await seededAllocator();
    const issued = await issue(allocator, '002', 'ryxo-first-001');
    assert.equal(issued, '645913');
    assert.equal(LEGACY_IDS.includes(issued), false);
    assert.deepEqual(production, { counter: 48, ids: [...LEGACY_IDS] });
    assert.equal(planGroupCounter({
      productionNextValue: production.counter,
      legacyPublicIds: production.ids,
    }), 645913n);
    assert.equal(planGroupCounter({
      productionNextValue: 700000,
      legacyPublicIds: production.ids,
    }), 700000n);
  });

  it('keeps ids unique when two brands register at the same time', async () => {
    const allocator = await seededAllocator();
    const ids = await Promise.all(
      Array.from({ length: 40 }, (_, index) => issue(
        allocator,
        index % 2 === 0 ? '001' : '002',
        `concurrent-${index.toString().padStart(8, '0')}`,
      )),
    );
    assert.equal(new Set(ids).size, 40);
    for (const legacy of LEGACY_IDS) assert.equal(ids.includes(legacy), false);
    assert.equal(ids.every((id) => /^[0-9]{6,}$/.test(id)), true);
  });

  it('returns the same id for an idempotent retry and rejects a cross-brand reuse of the key', async () => {
    const allocator = await seededAllocator();
    const first = await issue(allocator, '002', 'ryxo-retry-001');
    const second = await issue(allocator, '002', 'ryxo-retry-001');
    assert.equal(first, second);
    assert.equal(allocator.snapshotNextValue(), 645914n);
    await assert.rejects(
      () => issue(allocator, '001', 'ryxo-retry-001'),
      (error: unknown) => error instanceof GroupControlError && error.code === 'IDEMPOTENCY_CONFLICT',
    );
  });

  it('issues ids longer than six digits after 999999', () => {
    assert.equal(formatGlobalPlayerId(999999n), '999999');
    assert.equal(formatGlobalPlayerId(1000000n), '1000000');
    assert.equal(formatGlobalPlayerId(1000000n).length > 6, true);
  });

  it('does not seed from 1 and does not fall back when the central allocator is down', async () => {
    let available = true;
    let localFallbackCalls = 0;
    const localFallback = () => {
      localFallbackCalls += 1;
      return '000001';
    };
    const allocator = new CentralPlayerIdAllocator(() => available);
    await assert.rejects(
      () => issue(allocator, '002', 'before-seed-01'),
      (error: unknown) => error instanceof GroupControlError && error.code === 'COUNTER_NOT_SEEDED',
    );
    await allocator.reserveLegacy(LEGACY_IDS, '001');
    await allocator.seedCounter({ productionNextValue: 48, legacyPublicIds: LEGACY_IDS });
    available = false;
    await assert.rejects(
      () => issue(allocator, '002', 'while-down-0001'),
      (error: unknown) => error instanceof GroupControlError && error.code === 'CENTRAL_ALLOCATOR_UNAVAILABLE',
    );
    void localFallback;
    assert.equal(localFallbackCalls, 0);
    assert.equal(allocator.snapshotNextValue(), 645913n);
  });

  it('keeps the group counter monotonic when a later import has a lower floor', async () => {
    const allocator = await seededAllocator();
    const next = await allocator.synchronizeLegacy({
      brandCode: '001',
      publicIds: ['000001'],
      productionNextValue: 1,
    });
    assert.equal(next, 645913n);
    assert.equal(allocator.snapshotNextValue(), 645913n);
    assert.equal(allocator.reservedIds().includes('645912'), true);
  });
});

describe('group authorization and owner report', () => {
  const grants: BrandStaffGrant[] = [
    { brandCode: '001', role: 'manager', staffSubject: NEXTPARI_MANAGER },
    { brandCode: '002', role: 'cashier', staffSubject: RYXO_CASHIER },
  ];

  it('denies a manager access to another brand', () => {
    const nextpari = grants[0];
    assert.throws(
      () => authorizeBrandStaff(nextpari, '002', 'balances'),
      (error: unknown) => error instanceof GroupControlError && error.code === 'CROSS_BRAND_ACCESS_DENIED',
    );
    assert.equal(authorizeBrandStaff(nextpari, '001', 'players'), '001');
  });

  it('aggregates brand counts without personal data', () => {
    const snapshots: BrandOperationalSnapshot[] = [
      {
        brandCode: '001',
        playerCount: 10,
        operationalStatus: 'active',
        financials: { currency: 'TMTM', deposits: '100.00', withdrawals: '20.00', ggr: '5.50' },
      },
      {
        brandCode: '002',
        playerCount: 3,
        operationalStatus: 'registered',
        financials: { currency: 'TMTM', deposits: '0', withdrawals: '0', ggr: '0' },
      },
    ];
    const report = aggregateGroupReport(snapshots, grants);
    assert.equal(report.brands.length, 3);
    assert.equal(report.brands[2]?.code, '003');
    assert.equal(report.brands[2]?.operationalStatus, 'planned');
    assert.equal(report.totals.playerCount, 13);
    assert.equal(report.totals.managerCount, 1);
    assert.equal(report.totals.cashierCount, 1);
    assert.equal(report.brands[0]?.staffSubjects[0]?.staffSubject, NEXTPARI_MANAGER);
    const encoded = JSON.stringify(report);
    assert.equal(encoded.includes('email'), false);
    assert.equal(encoded.includes('phone'), false);
    assert.equal(encoded.includes('passport'), false);
    assert.equal(encoded.includes('@'), false);
  });
});

describe('internal group API', () => {
  const token = 'group-service-token-test-value';

  function stateFor(allocator: CentralPlayerIdAllocator): GroupControlState {
    return {
      allocator,
      available: true,
      grants: [
        { brandCode: '001', role: 'manager', staffSubject: NEXTPARI_MANAGER },
        { brandCode: '002', role: 'cashier', staffSubject: RYXO_CASHIER },
      ],
      owners: [{ id: TEST_FIXTURE_OWNER_SUBJECT, permissions: ['brands.read', 'reports.read', 'brands.register', 'staff.map', 'ids.reserve'] }],
      gates: OPEN_GATES,
      loginByBrand: {
        '001': NEXTPARI_LOGIN_TODAY,
        '002': NEXTPARI_LOGIN_TODAY,
        '003': NEXTPARI_LOGIN_TODAY,
      },
      snapshots: [
        {
          brandCode: '001',
          playerCount: 4,
          operationalStatus: 'active',
          financials: { currency: 'TMTM', deposits: '10.00', withdrawals: '1.00', ggr: '0.50' },
        },
      ],
    };
  }

  it('rejects Android and browser callers before allocation', async () => {
    const allocator = await seededAllocator();
    const state = stateFor(allocator);
    const android = await handleGroupControlRequest({
      caller: { kind: 'android', serviceToken: token },
      expectedServiceToken: token,
      action: 'allocate',
      body: { brandCode: '002', idempotencyKey: 'android-must-fail' },
    }, state);
    assert.equal(android.status, 403);
    assert.equal(android.body.error, 'CREDENTIALS_NOT_FOR_CLIENT');
    assert.equal(allocator.snapshotNextValue(), 645913n);

    const browser = await handleGroupControlRequest({
      caller: { kind: 'browser', serviceToken: token },
      expectedServiceToken: token,
      action: 'report',
    }, state);
    assert.equal(browser.status, 403);
  });

  it('allocates, registers a known brand, denies cross-brand staff, and reports', async () => {
    const allocator = await seededAllocator();
    const state = stateFor(allocator);
    const allocated = await handleGroupControlRequest({
      caller: { kind: 'internal-service', serviceToken: token },
      expectedServiceToken: token,
      action: 'allocate',
      body: { brandCode: '002', idempotencyKey: 'service-ryxo-001' },
    }, state);
    assert.equal(allocated.status, 200);
    assert.equal(allocated.body.publicId, '645913');

    const registered = await handleGroupControlRequest({
      caller: { kind: 'internal-service', serviceToken: token },
      expectedServiceToken: token,
      action: 'register-brand',
      body: { code: '002' },
    }, state);
    assert.equal(registered.body.slug, 'ryxo');

    const denied = await handleGroupControlRequest({
      caller: { kind: 'internal-service', serviceToken: token },
      expectedServiceToken: token,
      action: 'authorize',
      body: { staffSubject: NEXTPARI_MANAGER, brandCode: '002', resource: 'players' },
    }, state);
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error, 'CROSS_BRAND_ACCESS_DENIED');

    const report = await handleGroupControlRequest({
      caller: { kind: 'internal-service', serviceToken: token },
      expectedServiceToken: token,
      action: 'report',
      body: { ownerId: TEST_FIXTURE_OWNER_SUBJECT },
    }, state);
    assert.equal(report.status, 200);
    const body = report.body.report as { brands: Array<{ code: string }>; totals: { brandCount: number } };
    assert.equal(body.totals.brandCount, 3);
    assert.deepEqual(GROUP_BRANDS.map((brand) => brand.code), ['001', '002', '003']);
  });

  it('returns 503 when the central allocator is unavailable and does not issue an id', async () => {
    let available = true;
    const allocator = new CentralPlayerIdAllocator(() => available);
    await allocator.reserveLegacy(LEGACY_IDS, '001');
    await allocator.seedCounter({ productionNextValue: 48, legacyPublicIds: LEGACY_IDS });
    available = false;
    const result = await handleGroupControlRequest({
      caller: { kind: 'internal-service', serviceToken: token },
      expectedServiceToken: token,
      action: 'allocate',
      body: { brandCode: '002', idempotencyKey: 'down-service-01' },
    }, stateFor(allocator));
    assert.equal(result.status, 503);
    assert.equal(result.body.error, 'CENTRAL_ALLOCATOR_UNAVAILABLE');
    assert.equal(allocator.reservedIds().includes('645913'), false);
  });
});

describe('legacy import, cutover gates, login width, and currency', () => {
  it('reserves a wallet-only id that is absent from profiles and app_users', () => {
    const ids = collectLegacyPublicIds({
      profiles: ['110790', '   '],
      wallets: ['110790', '979426'],
      appUsers: [null, ''],
    });
    assert.deepEqual(ids, ['110790', '979426']);
    assert.equal(ids.includes('979426'), true);
  });

  it('imports the same legacy set twice and then advances after a higher wallet id appears', async () => {
    const allocator = new CentralPlayerIdAllocator();
    const first = await allocator.synchronizeLegacy({
      brandCode: '001',
      publicIds: ['979426'],
      productionNextValue: 48,
    });
    assert.equal(first, 979427n);
    const second = await allocator.synchronizeLegacy({
      brandCode: '001',
      publicIds: ['979426'],
      productionNextValue: 48,
    });
    assert.equal(second, 979427n);
    const issued = await issue(allocator, '001', 'nextpari-after-import');
    assert.equal(issued, '979427');
    const third = await allocator.synchronizeLegacy({
      brandCode: '001',
      publicIds: ['979426', '979500'],
      productionNextValue: 48,
    });
    assert.equal(third, 979501n);
    assert.equal(allocator.reservedIds().includes('979427'), true);
    await assert.rejects(
      () => allocator.synchronizeLegacy({
        brandCode: '001',
        publicIds: ['979427'],
        productionNextValue: 48,
      }),
      (error: unknown) => error instanceof GroupControlError && error.code === 'PUBLIC_ID_ALREADY_RESERVED',
    );
    assert.equal(allocator.snapshotNextValue(), 979501n);
  });

  it('refuses RYXO allocation until NextPari uses the central allocator', async () => {
    const allocator = await seededAllocator();
    await assert.rejects(
      () => allocator.allocate({
        brandCode: '002',
        idempotencyKey: 'ryxo-too-early-1',
        gates: { nextpariUsesCentralAllocator: false, ryxoRegistrationEnabled: true },
        login: NEXTPARI_LOGIN_TODAY,
      }),
      (error: unknown) => error instanceof GroupControlError && error.code === 'RYXO_BEFORE_NEXTPARI_CUTOVER',
    );
    await assert.rejects(
      () => allocator.allocate({
        brandCode: '002',
        idempotencyKey: 'ryxo-still-closed',
        gates: { nextpariUsesCentralAllocator: true, ryxoRegistrationEnabled: false },
        login: NEXTPARI_LOGIN_TODAY,
      }),
      (error: unknown) => error instanceof GroupControlError && error.code === 'RYXO_REGISTRATION_DISABLED',
    );
    const nextpari = await allocator.allocate({
      brandCode: '001',
      idempotencyKey: 'nextpari-central-01',
      gates: { nextpariUsesCentralAllocator: true, ryxoRegistrationEnabled: false },
      login: NEXTPARI_LOGIN_TODAY,
    });
    assert.equal(nextpari, '645913');
  });

  it('does not issue a seven-digit id while login accepts only six digits', async () => {
    const allocator = new CentralPlayerIdAllocator();
    await allocator.synchronizeLegacy({
      brandCode: '001',
      publicIds: ['979426'],
      productionNextValue: 1000000,
    });
    assert.equal(loginAcceptsPublicId('979426', NEXTPARI_LOGIN_TODAY), true);
    assert.equal(loginAcceptsPublicId('1000000', NEXTPARI_LOGIN_TODAY), false);
    assert.equal(loginAcceptsPublicId('1000000', { minDigits: 6, maxDigits: 7 }), true);
    await assert.rejects(
      () => issue(allocator, '001', 'seven-digit-blocked'),
      (error: unknown) => error instanceof GroupControlError && error.code === 'SEVEN_DIGIT_LOGIN_UNSUPPORTED',
    );
    assert.equal(allocator.snapshotNextValue(), 1000000n);
    const issued = await issue(allocator, '001', 'seven-digit-allowed', { minDigits: 6, maxDigits: 7 });
    assert.equal(issued, '1000000');
  });

  it('keeps the same staff uuid isolated to the brand on its grant', () => {
    const grants = [
      { brandCode: '001' as const, role: 'manager' as const, staffSubject: SHARED_STAFF_UUID },
      { brandCode: '002' as const, role: 'cashier' as const, staffSubject: SHARED_STAFF_UUID },
    ];
    assert.equal(authorizeStaffSubject(grants, '001', SHARED_STAFF_UUID, 'players'), '001');
    assert.equal(authorizeStaffSubject(grants, '002', SHARED_STAFF_UUID, 'balances'), '002');
    assert.throws(
      () => authorizeStaffSubject(
        [{ brandCode: '001', role: 'manager', staffSubject: SHARED_STAFF_UUID }],
        '002',
        SHARED_STAFF_UUID,
        'transactions',
      ),
      (error: unknown) => error instanceof GroupControlError && error.code === 'CROSS_BRAND_ACCESS_DENIED',
    );
  });

  it('does not add financial totals across currencies', () => {
    const report = aggregateGroupReport([
      {
        brandCode: '001',
        playerCount: 42,
        operationalStatus: 'active',
        financials: { currency: 'TMTM', deposits: '10.00', withdrawals: '1.00', ggr: '2.00' },
      },
      {
        brandCode: '001',
        playerCount: 42,
        operationalStatus: 'active',
        financials: { currency: 'USD', deposits: '4.00', withdrawals: '0', ggr: '1.00' },
      },
    ], []);
    assert.equal(report.brands[0]?.financials.length, 2);
    assert.equal(report.totals.playerCount, 42);
    assert.equal('deposits' in report.totals, false);
    assert.throws(
      () => sumMoney(report.brands[0]?.financials ?? [], 'deposits'),
      (error: unknown) => error instanceof GroupControlError && error.code === 'MIXED_CURRENCY_TOTAL',
    );
    assert.equal(sumMoney([report.brands[0]!.financials[0]!], 'deposits'), '10.00');
  });

  it('rejects a display-name owner subject', async () => {
    const result = await handleGroupControlRequest({
      caller: { kind: 'internal-service', serviceToken: 'group-service-token-test-value' },
      expectedServiceToken: 'group-service-token-test-value',
      action: 'report',
      body: { ownerId: 'group-owner' },
    }, {
      allocator: new CentralPlayerIdAllocator(),
      available: true,
      grants: [],
      owners: [{ id: TEST_FIXTURE_OWNER_SUBJECT, permissions: ['reports.read'] }],
      snapshots: [],
      gates: OPEN_GATES,
      loginByBrand: {
        '001': NEXTPARI_LOGIN_TODAY,
        '002': NEXTPARI_LOGIN_TODAY,
        '003': NEXTPARI_LOGIN_TODAY,
      },
    });
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'OWNER_SUBJECT_INVALID');
  });
});

describe('production isolation of the group scaffold', () => {
  it('keeps drafts out of production migrations and leaves the NextPari allocator unchanged', () => {
    const migrations = readdirSync(join(root, 'supabase/migrations'));
    assert.equal(migrations.some((name) => name.toLowerCase().includes('group')), false);
    const draftDir = join(root, 'server/group/sql/drafts');
    const drafts = readdirSync(draftDir);
    assert.deepEqual(drafts, [
      '001_group_control_plane.sql',
      '002_nextpari_id_reservation_cutover.sql',
    ]);
    const controlPlane = readFileSync(join(draftDir, drafts[0]), 'utf8');
    const cutover = readFileSync(join(draftDir, drafts[1]), 'utf8');
    assert.match(controlPlane, /DO NOT APPLY/);
    assert.match(controlPlane, /COUNTER_NOT_SEEDED/);
    assert.match(cutover, /DO NOT APPLY/);
    assert.match(cutover, /app_users/);
    assert.match(cutover, /v_current < v_floor/);
    assert.equal(cutover.includes('COUNTER_REGRESSION'), false);
    assert.match(controlPlane, /SEVEN_DIGIT_LOGIN_UNSUPPORTED/);
    assert.match(controlPlane, /RYXO_BEFORE_NEXTPARI_CUTOVER/);
    assert.match(readFileSync(join(root, 'docs/group/GROUP_CONTROL.md'), 'utf8'), /public\.app_users/);
    assert.equal(cutover.includes('UPDATE private.player_public_id_counter'), false);
    assert.equal(cutover.includes('UPDATE public.wallets'), false);
    assert.equal(cutover.includes('UPDATE public.profiles'), false);

    const currentAllocator = readFileSync(join(root, 'server/player/playerPublicId.ts'), 'utf8');
    const login = readFileSync(join(root, 'server/player/playerValidators.ts'), 'utf8');
    const sql = readFileSync(
      join(root, 'supabase/migrations/20260913181000_player_identity_email_verification_044.sql'),
      'utf8',
    );
    assert.match(currentAllocator, /current <= 999999/);
    assert.match(login, /\^\[0-9\]\{6\}\$/);
    assert.match(sql, /next_value BETWEEN 1 AND 1000000/);
    assert.match(sql, /pg_catalog\.lpad\(v_next::TEXT, 6, '0'\)/);

    const allocatorSource = readFileSync(join(root, 'server/group/allocator.ts'), 'utf8');
    const apiSource = readFileSync(join(root, 'server/group/api.ts'), 'utf8');
    assert.equal(allocatorSource.includes('allocateSequentialPlayerId'), false);
    assert.equal(allocatorSource.includes('next_player_public_id'), false);
    assert.equal(apiSource.includes('@supabase/supabase-js'), false);
    assert.equal(apiSource.includes('playerAuthService'), false);
    const vercel = readFileSync(join(root, 'vercel.json'), 'utf8');
    assert.equal(vercel.includes('group_control'), false);
    assert.equal(vercel.includes('/api/group'), false);
  });
});
