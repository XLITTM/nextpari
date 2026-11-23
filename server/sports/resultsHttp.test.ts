import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { staffError } from '../staff/errors.js';
import { PLAYER_ACCESS_COOKIE } from '../player/playerCookies.js';
import { handlePlayerResultsRequest } from './resultsHttp.js';

describe('player results HTTP', () => {
  it('requires a player session and stays empty until a provider is configured', async () => {
    const anon = await handlePlayerResultsRequest({
      method: 'GET',
      pathname: '/api/player/sports/results',
    }, {
      playerAuth: async () => { throw staffError('JWT_REQUIRED', 401); },
    });
    assert.equal(anon.status, 401);

    const ok = await handlePlayerResultsRequest({
      method: 'GET',
      pathname: '/api/player/sports/results',
      search: '?window=yesterday&sport=football',
      cookie: `${PLAYER_ACCESS_COOKIE}=player`,
    }, {
      playerAuth: async (cookie) => {
        if (!cookie) throw staffError('JWT_REQUIRED', 401);
        return {};
      },
    });
    assert.equal(ok.status, 200);
    const data = ok.body.data as { configured: boolean; events: unknown[]; notice: string; window: string };
    assert.equal(data.configured, false);
    assert.deepEqual(data.events, []);
    assert.equal(data.window, 'yesterday');
    assert.match(data.notice, /не подключён/);
  });
});
