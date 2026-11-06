import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { authorizeBrandStaff } from './access.js';
import { handleGroupControlRequest } from './api.js';
import { CentralPlayerIdAllocator } from './allocator.js';
import { GROUP_BRANDS } from './catalog.js';
import { GroupControlError } from './errors.js';
import { formatGlobalPlayerId, planGroupCounter } from './ids.js';
import { aggregateGroupReport } from './reporting.js';
import type { BrandOperationalSnapshot } from './reporting.js';
import type { BrandStaffGrant } from './access.js';
import type { GroupControlState } from './api.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const NEXTPARI_MANAGER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RYXO_CASHIER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const LEGACY_IDS = ['000001', '645912', '110790'];

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
    const issued = await allocator.allocate({ brandCode: '002', idempotencyKey: 'ryxo-first-001' });
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
      Array.from({ length: 40 }, (_, index) => allocator.allocate({
        brandCode: index % 2 === 0 ? '001' : '002',
        idempotencyKey: `concurrent-${index.toString().padStart(8, '0')}`,
      })),
    );
    assert.equal(new Set(ids).size, 40);
    for (const legacy of LEGACY_IDS) assert.equal(ids.includes(legacy), false);
    assert.equal(ids.every((id) => /^[0-9]{6,}$/.test(id)), true);
  });

  it('returns the same id for an idempotent retry and rejects a cross-brand reuse of the key', async () => {
    const allocator = await seededAllocator();
    const first = await allocator.allocate({ brandCode: '002', idempotencyKey: 'ryxo-retry-001' });
    const second = await allocator.allocate({ brandCode: '002', idempotencyKey: 'ryxo-retry-001' });
    assert.equal(first, second);
    assert.equal(allocator.snapshotNextValue(), 645914n);
    await assert.rejects(
      () => allocator.allocate({ brandCode: '001', idempotencyKey: 'ryxo-retry-001' }),
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
      () => allocator.allocate({ brandCode: '002', idempotencyKey: 'before-seed-01' }),
      (error: unknown) => error instanceof GroupControlError && error.code === 'COUNTER_NOT_SEEDED',
    );
    await allocator.reserveLegacy(LEGACY_IDS, '001');
    await allocator.seedCounter({ productionNextValue: 48, legacyPublicIds: LEGACY_IDS });
    available = false;
    await assert.rejects(
      () => allocator.allocate({ brandCode: '002', idempotencyKey: 'while-down-0001' }),
      (error: unknown) => error instanceof GroupControlError && error.code === 'CENTRAL_ALLOCATOR_UNAVAILABLE',
    );
    void localFallback;
    assert.equal(localFallbackCalls, 0);
    assert.equal(allocator.snapshotNextValue(), 645913n);
  });

  it('refuses to lower the group counter beneath the reserved plan', async () => {
    const allocator = await seededAllocator();
    await assert.rejects(
      () => allocator.seedCounter({ productionNextValue: 1, legacyPublicIds: ['000001'] }),
      (error: unknown) => error instanceof GroupControlError && error.code === 'COUNTER_REGRESSION',
    );
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
      owners: [{ id: 'group-owner', permissions: ['brands.read', 'reports.read', 'brands.register', 'staff.map', 'ids.reserve'] }],
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
