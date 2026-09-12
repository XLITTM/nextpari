import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { ParsedMarket } from './odds-parser';
import { acceptSportsSelection } from './sportsOddGuard';
import { createLsportsSelectionProvider } from './lsportsSelectionProvider';
import {
  clickableCardSelection,
  isSportsSelectionValid,
  resolveLiveSportsSelectionProvider,
  resolveSportsEventProvider,
  resolveSportsSelectionAdapter,
} from './sportsSelection';
import {
  createSportsSelectionProviderRegistry,
  SportsSelectionProviderRegistrationError,
} from './sportsSelectionProviderRegistry';
import type { BetSelection, MatchEvent } from '../types';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const TOULOUSE_HOME = '117469638719981248';
const OVER_25 = '46928646919981248';

function match(id: string, overrides: Partial<MatchEvent> = {}): MatchEvent {
  return {
    id,
    sport: 'football',
    league: 'Ligue 1',
    country: 'France',
    team1: 'Toulouse',
    team2: 'Lille',
    team1Color: '#000',
    team2Color: '#fff',
    startTime: 0,
    isLive: true,
    extraMarkets: 4,
    markets: { '1': 2.45, x: 3.2, '2': 3.1 },
    ...overrides,
  };
}

function market1x2(fixtureId: string, homeBet: string): ParsedMarket {
  return {
    key: '1_1',
    bookmaker: '1',
    marketId: '1',
    name: '1X2',
    category: 'main',
    canonicalKey: `${fixtureId}:1:`,
    entries: [{
      id: `lsports-${fixtureId}-1-main`,
      canonicalKey: `${fixtureId}:1:`,
      updatedAt: 1,
      outcomes: [
        { key: 'home', odds: 2.45, raw: '2.45', providerBetId: homeBet },
        { key: 'draw', odds: 3.2, raw: '3.20', providerBetId: `${homeBet}2` },
        { key: 'away', odds: 3.1, raw: '3.10', providerBetId: `${homeBet}3` },
      ],
    }],
  };
}

function marketTotals(fixtureId: string): ParsedMarket {
  return {
    key: '2_2.5',
    bookmaker: '1',
    marketId: '2',
    name: 'Total',
    category: 'main',
    canonicalKey: `${fixtureId}:2:2.5`,
    entries: [{
      id: `lsports-${fixtureId}-2-2.5`,
      canonicalKey: `${fixtureId}:2:2.5`,
      line: '2.5',
      updatedAt: 1,
      outcomes: [
        { key: 'over', odds: 1.9, raw: '1.90', providerBetId: OVER_25 },
        { key: 'under', odds: 1.95, raw: '1.95', providerBetId: `${OVER_25}2` },
      ],
    }],
  };
}

function fakeSelection(provider: string, overrides: Partial<BetSelection> = {}): BetSelection {
  return {
    id: `${provider}-sel`,
    matchId: 'fixture-b',
    matchLabel: 'Home — Away',
    market: 'Winner',
    outcome: 'Home',
    odds: 1.85,
    provider,
    fixtureId: 'fixture-b',
    marketId: '',
    marketKey: '',
    line: '',
    outcomeId: 'opaque-outcome',
    ...overrides,
  };
}

describe('client sports selection provider registry', () => {
  it('keeps the generic registry free of provider-specific imports and literals', () => {
    const source = readFileSync(join(root, 'src/lib/sportsSelectionProviderRegistry.ts'), 'utf8');
    const lower = source.toLowerCase();
    assert.equal(lower.includes('lsports'), false);
    assert.equal(lower.includes('betb2b'), false);
    assert.equal(source.includes('lsportsFeed'), false);
    assert.equal(source.includes('sportsPlaceIdentity'), false);
    assert.equal(source.includes('sportsCardIdentity'), false);
    assert.equal(source.includes('server/'), false);
  });

  it('resolves the live LSports adapter through the registry', () => {
    assert.equal(resolveLiveSportsSelectionProvider('lsports')?.id, 'lsports');
    assert.equal(resolveLiveSportsSelectionProvider('LSports')?.id, 'lsports');
    assert.equal(resolveLiveSportsSelectionProvider('betb2b'), null);
  });

  it('prefers explicit match.provider over legacy tags', () => {
    assert.equal(
      resolveSportsEventProvider(
        { provider: 'provider-a', feedTag: 'lsports' },
        { provider: 'provider-b', our_events: 'lsports' },
      ),
      'provider-a',
    );
  });

  it('uses explicit store event.provider before legacy tags', () => {
    assert.equal(
      resolveSportsEventProvider(
        { feedTag: 'legacy-tag' },
        { provider: 'provider-b', our_events: 'lsports' },
      ),
      'provider-b',
    );
  });

  it('reads legacy LSports feedTag and our_events without hardcoding in generic code', () => {
    assert.equal(resolveSportsEventProvider({ feedTag: 'lsports' }), 'lsports');
    assert.equal(resolveSportsEventProvider({}, { our_events: 'lsports' }), 'lsports');
    assert.equal(resolveSportsEventProvider({ feedTag: '  LSports  ' }), 'lsports');
  });

  it('locks betting when provider is missing', () => {
    const row = match('evt-1', { feedTag: undefined, provider: undefined });
    assert.equal(resolveSportsEventProvider(row), '');
    assert.equal(resolveSportsSelectionAdapter(row, { our_events: undefined }), null);
    const clickable = clickableCardSelection(row, 'П1', '1X2', 2.1);
    assert.equal(clickable.locked, true);
    assert.equal(clickable.selection.provider, undefined);
    assert.equal(isSportsSelectionValid(clickable.selection), false);
    assert.equal(acceptSportsSelection(clickable.selection), null);
  });

  it('locks betting when provider is unknown', () => {
    const row = match('evt-2', { provider: 'provider-not-registered' });
    assert.equal(resolveSportsSelectionAdapter(row), null);
    const clickable = clickableCardSelection(row, 'П1', '1X2', 2.1);
    assert.equal(clickable.locked, true);
    assert.equal(isSportsSelectionValid(clickable.selection), false);
  });

  it('lets a custom provider-a adapter create a provider-a selection', () => {
    const registry = createSportsSelectionProviderRegistry([
      {
        id: 'provider-a',
        create: () => ({
          id: 'provider-a',
          selectionFromOutcome() {
            return fakeSelection('provider-a', { outcomeId: 'a-1', fixtureId: 'fx-a' });
          },
          isSelectionValid(selection) {
            return selection.provider === 'provider-a' && Boolean(selection.outcomeId);
          },
        }),
      },
    ]);
    const adapter = registry.resolve('provider-a');
    const selection = adapter?.selectionFromOutcome(sportsCtx(), {
      marketName: 'Winner',
      outcomeLabel: 'Home',
      odds: 1.85,
    });
    assert.equal(selection?.provider, 'provider-a');
    assert.equal(adapter?.isSelectionValid(selection!), true);
    assert.equal(acceptSportsSelection(selection!), selection);
  });

  it('lets a custom provider-b adapter accept an opaque outcomeId with blank market fields', () => {
    const registry = createSportsSelectionProviderRegistry([
      {
        id: 'provider-b',
        create: () => ({
          id: 'provider-b',
          selectionFromOutcome() {
            return fakeSelection('provider-b');
          },
          isSelectionValid(selection) {
            return selection.provider === 'provider-b'
              && selection.outcomeId === 'opaque-outcome'
              && selection.marketId === ''
              && selection.marketKey === '';
          },
        }),
      },
    ]);
    const adapter = registry.resolve('provider-b');
    const selection = adapter!.selectionFromOutcome(sportsCtx(), {
      marketName: 'Winner',
      outcomeLabel: 'Home',
      odds: 1.85,
    });
    assert.equal(selection.provider, 'provider-b');
    assert.equal(selection.fixtureId, 'fixture-b');
    assert.equal(selection.outcomeId, 'opaque-outcome');
    assert.equal(selection.marketId, '');
    assert.equal(selection.marketKey, '');
    assert.equal(adapter!.isSelectionValid(selection), true);
    assert.equal(acceptSportsSelection(selection)?.provider, 'provider-b');
  });

  it('rejects duplicate normalized client adapter registrations', () => {
    assert.throws(
      () => createSportsSelectionProviderRegistry([
        { id: 'provider-a', create: () => ({ id: 'provider-a', selectionFromOutcome: () => null, isSelectionValid: () => false }) },
        { id: 'PROVIDER-A', create: () => ({ id: 'provider-a', selectionFromOutcome: () => null, isSelectionValid: () => false }) },
      ]),
      (error: unknown) => error instanceof SportsSelectionProviderRegistrationError
        && error.message.includes('SPORTS_SELECTION_PROVIDER_DUPLICATE'),
    );
  });

  it('rejects an adapter whose id does not match the registration', () => {
    const registry = createSportsSelectionProviderRegistry([
      {
        id: 'provider-a',
        create: () => ({
          id: 'provider-b',
          selectionFromOutcome: () => null,
          isSelectionValid: () => false,
        }),
      },
    ]);
    assert.throws(
      () => registry.resolve('provider-a'),
      (error: unknown) => error instanceof SportsSelectionProviderRegistrationError
        && error.message.includes('SPORTS_SELECTION_PROVIDER_ID_MISMATCH'),
    );
  });

  it('keeps MatchCard free of direct LSports selection construction', () => {
    const source = readFileSync(join(root, 'src/components/MatchCard.tsx'), 'utf8');
    assert.equal(source.includes('isLsportsMatch'), false);
    assert.equal(source.includes('extraLsportsMarketRows'), false);
    assert.equal(source.includes('hasCompleteLsportsIdentity'), false);
    assert.equal(source.includes("provider: 'lsports'"), false);
  });

  it('keeps MarketsGrid free of direct LSports selection construction', () => {
    const source = readFileSync(join(root, 'src/components/MarketsGrid.tsx'), 'utf8');
    assert.equal(source.includes('isLsportsDisplayEvent'), false);
    assert.equal(source.includes('hasCompleteLsportsIdentity'), false);
    assert.equal(source.includes('selectionFromProviderBetId'), false);
    assert.equal(source.includes("provider: 'lsports'"), false);
    assert.equal(source.includes('lsports:'), false);
  });

  it('keeps a real LSports 1X2 selection selectable through the adapter', () => {
    const row = match('19981248', { feedTag: 'lsports' });
    const adapter = createLsportsSelectionProvider();
    const ctx = { match: row, markets: [market1x2(row.id, TOULOUSE_HOME)] };
    const clickable = adapter.cardSelection!(ctx, 'П1', '1X2', 2.45);
    assert.equal(clickable.locked, false);
    assert.equal(clickable.selection.provider, 'lsports');
    assert.equal(clickable.selection.outcomeId, TOULOUSE_HOME);
    assert.equal(adapter.isSelectionValid(clickable.selection), true);
  });

  it('keeps a real LSports extra-market selection selectable through the adapter', () => {
    const row = match('19981248', { feedTag: 'lsports' });
    const adapter = createLsportsSelectionProvider();
    const ctx = { match: row, markets: [market1x2(row.id, TOULOUSE_HOME), marketTotals(row.id)] };
    const extras = adapter.extraMarketRows!(ctx);
    const over = extras.flatMap((item) => item.outcomes).find((item) => item.selection?.outcomeId === OVER_25);
    assert.equal(Boolean(over?.selection), true);
    assert.equal(adapter.isSelectionValid(over!.selection!), true);
    assert.equal(over!.selection!.marketId, '2');
  });

  it('locks fake or generated LSports outcome identity', () => {
    const row = match('19981248', { feedTag: 'lsports' });
    const adapter = createLsportsSelectionProvider();
    const clickable = adapter.cardSelection!({ match: row, markets: [] }, 'П1', '1X2', 2.1);
    assert.equal(clickable.locked, true);
    assert.equal(adapter.isSelectionValid(clickable.selection), false);
    assert.equal(acceptSportsSelection(clickable.selection), null);
  });
});

function sportsCtx(): { match: MatchEvent } {
  return { match: match('fixture-b', { provider: 'provider-b' }) };
}
