import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { staffError } from '../staff/errors.js';
import { OWNER_ACCESS_COOKIE } from '../staff/ownerCookies.js';
import { PLAYER_ACCESS_COOKIE } from '../player/playerCookies.js';
import {
  MemoryExpressAudit,
  handleOwnerExpressRequest,
  handlePlayerExpressRequest,
} from './expressOfDayHttp.js';
import {
  MemoryExpressCatalog,
  MemoryExpressStore,
  type ExpressCatalogEvent,
  type ExpressSelectionInput,
} from './expressOfDay.js';

const ACCESS = 'owner-access';
const PLAYER_ACCESS = 'player-access';
const NOW = '2026-11-23T12:00:00.000Z';

async function ownerAuth(cookie: string | undefined) {
  if (!cookie?.includes(OWNER_ACCESS_COOKIE)) throw staffError('JWT_REQUIRED', 401);
  return { staff: { authUserId: 'owner-uid' } };
}

async function playerAuth(cookie: string | undefined) {
  if (!cookie?.includes(PLAYER_ACCESS_COOKIE)) throw staffError('JWT_REQUIRED', 401);
  return {};
}

function event(id: string, fixtureId: string, label: string, sel: string, odds: number): ExpressCatalogEvent {
  return {
    canonicalEventId: id,
    provider: 'lsports',
    feedType: 'prematch',
    fixtureId,
    matchLabel: label,
    league: 'Premier League',
    sport: 'football',
    markets: [{
      marketId: '1',
      marketKey: '1x2',
      line: '',
      status: 'open',
      outcomes: [{ selectionId: sel, outcomeId: '1', name: 'П1', odds }],
    }],
  };
}

function sel(id: string, fixtureId: string, label: string, selectionId: string, odds: number): ExpressSelectionInput {
  return {
    canonicalEventId: id,
    provider: 'lsports',
    feedType: 'prematch',
    fixtureId,
    marketId: '1',
    marketKey: '1x2',
    selectionId,
    outcomeId: '1',
    line: '',
    oddsSnapshot: odds,
    matchLabel: label,
    league: 'Premier League',
    outcomeName: 'П1',
  };
}

describe('express HTTP authorization', () => {
  it('rejects anonymous staff writes and hides unpublished rows from players', async () => {
    const catalog = new MemoryExpressCatalog([
      event('e1', '1', 'Arsenal — Chelsea', 's1', 1.8),
      event('e2', '2', 'Liverpool — Everton', 's2', 2.1),
    ]);
    const store = new MemoryExpressStore();
    const audit = new MemoryExpressAudit();
    const denied = await handleOwnerExpressRequest({
      method: 'POST',
      pathname: '/api/owner/express',
      body: { title: 'x' },
    }, { store, catalog, audit, now: () => NOW, ownerAuth });
    assert.equal(denied.status, 401);

    const created = await handleOwnerExpressRequest({
      method: 'POST',
      pathname: '/api/owner/express',
      cookie: `${OWNER_ACCESS_COOKIE}=${ACCESS}`,
      body: {
        title: 'Экспресс дня',
        description: 'Команда',
        selections: [
          sel('e1', '1', 'Arsenal — Chelsea', 's1', 1.8),
          sel('e2', '2', 'Liverpool — Everton', 's2', 2.1),
        ],
      },
    }, { store, catalog, audit, now: () => NOW, ownerAuth });
    assert.equal(created.status, 200);
    const id = String((created.body.data as { id: string }).id);

    const playerHidden = await handlePlayerExpressRequest({
      method: 'GET',
      pathname: '/api/player/sports/express',
      cookie: `${PLAYER_ACCESS_COOKIE}=${PLAYER_ACCESS}`,
    }, { store, catalog, playerAuth, now: () => NOW });
    assert.equal(playerHidden.status, 200);
    assert.deepEqual(playerHidden.body.data, []);

    const published = await handleOwnerExpressRequest({
      method: 'POST',
      pathname: `/api/owner/express/${id}/publish`,
      cookie: `${OWNER_ACCESS_COOKIE}=${ACCESS}`,
    }, { store, catalog, audit, now: () => NOW, ownerAuth });
    assert.equal(published.status, 200);
    assert.equal((published.body.data as { combinedOdds: number }).combinedOdds, 3.78);
    assert.equal(audit.events.at(-1)?.action, 'EXPRESS_PUBLISHED');

    const playerSeen = await handlePlayerExpressRequest({
      method: 'GET',
      pathname: '/api/player/sports/express',
      cookie: `${PLAYER_ACCESS_COOKIE}=${PLAYER_ACCESS}`,
    }, { store, catalog, playerAuth, now: () => NOW });
    assert.equal((playerSeen.body.data as unknown[]).length, 1);

    const anonPlayer = await handlePlayerExpressRequest({
      method: 'GET',
      pathname: '/api/player/sports/express',
    }, { store, catalog, playerAuth, now: () => NOW });
    assert.equal(anonPlayer.status, 401);
  });

  it('refuses staff writes until schema 068 is applied and hides unpublished content', async () => {
    const denied = await handleOwnerExpressRequest({
      method: 'POST',
      pathname: '/api/owner/express',
      body: { title: 'x' },
    }, { ownerAuth });
    assert.equal(denied.status, 401);

    const unavailable = await handleOwnerExpressRequest({
      method: 'POST',
      pathname: '/api/owner/express',
      cookie: `${OWNER_ACCESS_COOKIE}=${ACCESS}`,
      body: { title: 'Экспресс дня' },
    }, { ownerAuth });
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.error, 'EXPRESS_SCHEMA_UNAVAILABLE');

    const empty = await handlePlayerExpressRequest({
      method: 'GET',
      pathname: '/api/player/sports/express',
      cookie: `${PLAYER_ACCESS_COOKIE}=${PLAYER_ACCESS}`,
    }, { playerAuth });
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body.data, []);
  });

  it('wires owner and player express routes through the existing staff plugin', () => {
    const plugin = readFileSync(join(process.cwd(), 'plugins/owner-staff-onboarding.ts'), 'utf8');
    assert.match(plugin, /attachOwnerExpressHttp/);
    assert.match(plugin, /attachPlayerExpressHttp/);
    assert.match(plugin, /attachPlayerResultsHttp/);
  });
});
