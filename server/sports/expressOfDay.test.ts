import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StaffOnboardingError } from '../staff/errors.js';
import {
  MemoryExpressCatalog,
  MemoryExpressStore,
  archiveExpiredExpresses,
  archiveExpress,
  combinedDecimalOdds,
  createExpressDraft,
  listPublishedExpresses,
  publishExpress,
  revalidateExpressForCoupon,
  unpublishExpress,
  updateExpressDraft,
  type ExpressCatalogEvent,
  type ExpressSelectionInput,
} from './expressOfDay.js';

const NOW = '2026-11-23T00:00:00.000Z';

function catalogEvent(overrides: Partial<ExpressCatalogEvent> = {}): ExpressCatalogEvent {
  return {
    canonicalEventId: 'football:eng:event-1',
    provider: 'lsports',
    feedType: 'prematch',
    fixtureId: '1001',
    matchLabel: 'Arsenal — Chelsea',
    league: 'Premier League',
    sport: 'football',
    markets: [{
      marketId: '1',
      marketKey: '1x2',
      line: '',
      status: 'open',
      outcomes: [
        { selectionId: 'sel-home', outcomeId: '1', name: 'П1', odds: 1.85 },
        { selectionId: 'sel-away', outcomeId: '3', name: 'П2', odds: 3.4 },
      ],
    }],
    ...overrides,
  };
}

function secondEvent(status: 'open' | 'suspended' = 'open', odds = 1.85): ExpressCatalogEvent {
  return catalogEvent({
    canonicalEventId: 'e2',
    fixtureId: '2',
    matchLabel: 'A — B',
    markets: [{
      marketId: '1',
      marketKey: '1x2',
      line: '',
      status,
      outcomes: [{ selectionId: 'b', outcomeId: '1', name: 'П1', odds }],
    }],
  });
}

function selection(overrides: Partial<ExpressSelectionInput> = {}): ExpressSelectionInput {
  return {
    canonicalEventId: 'football:eng:event-1',
    provider: 'lsports',
    feedType: 'prematch',
    fixtureId: '1001',
    marketId: '1',
    marketKey: '1x2',
    selectionId: 'sel-home',
    outcomeId: '1',
    line: '',
    oddsSnapshot: 1.85,
    matchLabel: 'Arsenal — Chelsea',
    league: 'Premier League',
    outcomeName: 'П1',
    ...overrides,
  };
}

describe('express of the day', () => {
  it('computes combined decimal odds on the server', () => {
    assert.equal(combinedDecimalOdds([selection(), selection({ oddsSnapshot: 2 })]), 3.7);
  });

  it('refuses to publish fewer than two legs or stale markets', async () => {
    const catalog = new MemoryExpressCatalog([catalogEvent()]);
    const draft = await createExpressDraft({
      title: 'Экспресс дня',
      creatorId: 'owner-1',
      nowIso: NOW,
      catalog,
      selections: [selection()],
    });
    await assert.rejects(
      () => publishExpress(draft, 'owner-1', NOW, catalog),
      (error: unknown) => error instanceof StaffOnboardingError && error.code === 'EXPRESS_REQUIRES_LEGS',
    );
    const twoLegs = await updateExpressDraft(draft, {
      selections: [
        selection(),
        selection({
          canonicalEventId: 'football:eng:event-2',
          fixtureId: '1002',
          selectionId: 'sel-2',
          outcomeId: '1',
          oddsSnapshot: 2,
          matchLabel: 'Liverpool — Everton',
        }),
      ],
    }, NOW, new MemoryExpressCatalog([
      catalogEvent(),
      catalogEvent({
        canonicalEventId: 'football:eng:event-2',
        fixtureId: '1002',
        matchLabel: 'Liverpool — Everton',
        markets: [{
          marketId: '1', marketKey: '1x2', line: '', status: 'suspended',
          outcomes: [{ selectionId: 'sel-2', outcomeId: '1', name: 'П1', odds: 2 }],
        }],
      }),
    ]));
    await assert.rejects(
      () => publishExpress(twoLegs, 'owner-1', NOW, new MemoryExpressCatalog([
        catalogEvent(),
        catalogEvent({
          canonicalEventId: 'football:eng:event-2',
          fixtureId: '1002',
          matchLabel: 'Liverpool — Everton',
          markets: [{
            marketId: '1', marketKey: '1x2', line: '', status: 'suspended',
            outcomes: [{ selectionId: 'sel-2', outcomeId: '1', name: 'П1', odds: 2 }],
          }],
        }),
      ])),
      (error: unknown) => error instanceof StaffOnboardingError && error.code === 'MARKET_SUSPENDED',
    );
  });

  it('hides unpublished and expired expresses from players', async () => {
    const catalog = new MemoryExpressCatalog([catalogEvent(), secondEvent()]);
    const store = new MemoryExpressStore();
    const draft = await createExpressDraft({
      title: 'Черновик',
      creatorId: 'owner-1',
      nowIso: NOW,
      catalog,
      selections: [selection(), selection({ canonicalEventId: 'e2', fixtureId: '2', selectionId: 'b', outcomeId: '1', matchLabel: 'A — B', oddsSnapshot: 1.85 })],
    });
    await store.save(draft);
    const published = await publishExpress(draft, 'owner-1', NOW, catalog);
    published.expiresAt = '2026-11-22T00:00:00.000Z';
    await store.save(published);
    const listed = listPublishedExpresses(await store.list(), NOW);
    assert.deepEqual(listed, []);
    const live = await publishExpress({ ...draft, id: 'live', expiresAt: '2026-11-24T00:00:00.000Z' }, 'owner-1', NOW, catalog);
    await store.save(live);
    assert.equal(listPublishedExpresses(await store.list(), NOW).map((row) => row.id).join(), 'live');
  });

  it('revalidates coupon add against live catalog odds', async () => {
    const catalog = new MemoryExpressCatalog([catalogEvent(), secondEvent()]);
    const published = await publishExpress(
      await createExpressDraft({
        title: 'Live',
        creatorId: 'owner-1',
        nowIso: NOW,
        catalog,
        selections: [
          selection(),
          selection({ canonicalEventId: 'e2', fixtureId: '2', selectionId: 'b', outcomeId: '1', matchLabel: 'A — B', oddsSnapshot: 1.85 }),
        ],
      }),
      'owner-1',
      NOW,
      catalog,
    );
    const ok = await revalidateExpressForCoupon(published, catalog, NOW);
    assert.equal(ok.ok, true);
    const drifted = await revalidateExpressForCoupon(published, new MemoryExpressCatalog([
      catalogEvent({
        markets: [{
          marketId: '1', marketKey: '1x2', line: '', status: 'open',
          outcomes: [{ selectionId: 'sel-home', outcomeId: '1', name: 'П1', odds: 2.1 }],
        }],
      }),
      secondEvent(),
    ]), NOW);
    assert.equal(drifted.ok, false);
    if (!drifted.ok) assert.equal(drifted.issues[0].code, 'ODDS_CHANGED');
  });

  it('archives expired rows and unpublishes live ones', async () => {
    const catalog = new MemoryExpressCatalog([catalogEvent(), secondEvent()]);
    const published = await publishExpress(
      await createExpressDraft({
        title: 'Live',
        creatorId: 'owner-1',
        nowIso: NOW,
        catalog,
        selections: [
          selection(),
          selection({ canonicalEventId: 'e2', fixtureId: '2', selectionId: 'b', outcomeId: '1', matchLabel: 'A — B', oddsSnapshot: 1.85 }),
        ],
      }),
      'owner-1',
      NOW,
      catalog,
    );
    const unpublished = unpublishExpress(published, NOW);
    assert.equal(unpublished.status, 'unpublished');
    const expired = archiveExpiredExpresses([{ ...published, expiresAt: '2026-11-01T00:00:00.000Z' }], NOW);
    assert.equal(expired[0].status, 'archived');
    assert.equal(archiveExpress(unpublished, NOW).status, 'archived');
  });
});
