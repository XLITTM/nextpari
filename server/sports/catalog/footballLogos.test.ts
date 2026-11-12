import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BETSAPI_EVENTS_LOGO_SOURCE, FootballLogoService, LOGO_SOURCES, STARTER_LOGO_CATALOG,
} from './index.js';
import type { CatalogDefinition, FootballLogoRefs, LogoPublicationApproval } from './index.js';

const source = BETSAPI_EVENTS_LOGO_SOURCE;
const tsdb = LOGO_SOURCES.theSportsDb;
const apiSports = LOGO_SOURCES.apiSportsFootball;
const base = STARTER_LOGO_CATALOG.definition;
const arsenal = base.entities.participant[0];
const league = base.entities.competition[0];
const leagueUrl = 'https://r2.thesportsdb.com/images/media/league/badge/gasy9d1737743125.png';
const arsenalUrl = 'https://r2.thesportsdb.com/images/media/team/badge/uyhbfe1612467038.png';
const fallbackUrl = 'https://media.api-sports.io/football/teams/42.png';
const empty = { competitionId: league.id, competition: null, home: null, away: null };

const event: FootballLogoRefs = { source, sportId: '1', competitionId: '94', homeId: '17230', awayId: '708' };

const arsenalApproval: LogoPublicationApproval = {
  kind: 'participant', canonicalId: arsenal.id, source: tsdb, externalId: '133604', url: arsenalUrl, evidence: 'test permission',
};
const leagueApproval: LogoPublicationApproval = {
  kind: 'competition', canonicalId: league.id, source: tsdb, externalId: '4328', url: leagueUrl, evidence: 'test permission',
};
const fallbackApproval: LogoPublicationApproval = {
  ...arsenalApproval, source: apiSports, externalId: '42', url: fallbackUrl,
};
const withFallback: CatalogDefinition = {
  ...base,
  aliases: [...base.aliases, { ...fallbackApproval }],
};

function response(id = '133604', url = arsenalUrl) {
  return Response.json({ teams: [{ idTeam: id, strBadge: url }] });
}

test('separates reviewed identities from exact image rights and provider credentials', async () => {
  let requests = 0;
  const unexpected: typeof fetch = async () => { requests++; return new Response(null, { status: 500 }); };
  const options = {
    seeds: STARTER_LOGO_CATALOG.lookups, now: () => Date.parse('2026-11-12T00:00:00Z'),
    theSportsDbKey: '', apiSportsKey: '', fetcher: unexpected,
  };
  const noApproval = new FootballLogoService(base, { ...options, theSportsDbKey: 'unit-key' });
  assert.deepEqual(await noApproval.forEvent(event), empty);
  const noKey = new FootballLogoService(base, { ...options, approvals: [arsenalApproval], seeds: [] });
  assert.deepEqual(await noKey.forEvent(event), empty);
  assert.equal(requests, 0);
  const service = new FootballLogoService(base, { ...options, approvals: [arsenalApproval, leagueApproval] });
  assert.deepEqual(await service.forEvent(event), { ...empty, competition: leagueUrl, home: arsenalUrl });
  assert.deepEqual(await service.forEvent({ ...event, source: { ...source, namespace: 'bet365' } }),
    { ...empty, competitionId: null });
  assert.deepEqual(await service.forEvent({ ...event, awayId: event.homeId }), { ...empty, competition: leagueUrl });
  assert.deepEqual(await service.forEvent({ ...event, homeId: 'Arsenal', awayId: 'Arsenal Women' }),
    { ...empty, competition: leagueUrl });
});

test('same-name academy, reserve and women teams require their own reviewed aliases', async () => {
  const teams = ['academy', 'reserve', 'women'].map((squad) => ({ ...arsenal, id: arsenal.id + ':' + squad }));
  const ambiguous: CatalogDefinition = {
    ...base, entities: { ...base.entities, participant: [...base.entities.participant, ...teams] },
    aliases: [
      ...base.aliases,
      ...teams.map(({ id }, index) => ({
        kind: 'participant' as const, source, externalId: String(index + 101), canonicalId: id, evidence: 'different squad ID',
      })),
      { kind: 'participant', source, externalId: '17230', canonicalId: teams[0].id, evidence: 'conflicting reviewed alias' },
    ],
  };
  const service = new FootballLogoService(ambiguous, {
    approvals: [arsenalApproval], theSportsDbKey: 'unit-key', fetcher: async () => assert.fail('ambiguous lookup'),
  });
  assert.deepEqual(await service.forEvent(event), empty);
  for (const homeId of ['101', '102', '103']) assert.deepEqual(await service.forEvent({ ...event, homeId }), empty);
});

test('uses verified ID-only TheSportsDB reads and shares pending and cached results', async () => {
  const requests: string[] = [];
  let finish: (value: Response) => void = () => assert.fail('no pending request');
  const service = new FootballLogoService(base, {
    approvals: [arsenalApproval], theSportsDbKey: 'unit-key',
    fetcher: async (input, init) => {
      requests.push(String(input));
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.signal?.aborted, false);
      return new Promise((resolve) => { finish = resolve; });
    },
  });
  assert.deepEqual(await service.forEvent(event, 'cache-only'), empty);
  assert.equal(requests.length, 0);
  const results = Promise.all([service.forEvent(event), service.forEvent(event)]);
  assert.deepEqual(requests, ['https://www.thesportsdb.com/api/v1/json/unit-key/lookupteam.php?id=133604']);
  finish(response());
  assert.deepEqual(await results, [{ ...empty, home: arsenalUrl }, { ...empty, home: arsenalUrl }]);
  assert.deepEqual(await service.forEvent(event, 'cache-only'), { ...empty, home: arsenalUrl });
  assert.equal(requests.length, 1);
});

test('uses an authorized API-Sports fallback after an unapproved preferred asset', async () => {
  const requests: string[] = [];
  const service = new FootballLogoService(withFallback, {
    approvals: [arsenalApproval, fallbackApproval], theSportsDbKey: 'unit-key', apiSportsKey: 'fallback-key',
    fetcher: async (input, init) => {
      const url = new URL(String(input));
      requests.push(url.hostname);
      if (url.hostname === 'www.thesportsdb.com') return response('133604', arsenalUrl.replace('uyhbfe', 'changed'));
      assert.equal(url.href, 'https://v3.football.api-sports.io/teams?id=42');
      assert.equal(new Headers(init?.headers).get('x-apisports-key'), 'fallback-key');
      return Response.json({ errors: [], response: [{ team: { id: 42, logo: fallbackUrl } }] });
    },
  });
  assert.deepEqual(await service.forEvent(event), { ...empty, home: fallbackUrl });
  assert.deepEqual(requests, ['www.thesportsdb.com', 'v3.football.api-sports.io']);
});

test('honors provider backoff across IDs and never caches an unexpected ID as a valid badge', async () => {
  let now = 1_800_000_000_000;
  let requests = 0;
  const service = new FootballLogoService(base, {
    approvals: [arsenalApproval, leagueApproval], theSportsDbKey: 'unit-key', now: () => now,
    fetcher: async () => ++requests === 1
      ? new Response(null, { status: 429, headers: { 'retry-after': '120' } })
      : response('133613'),
  });
  const withoutLeague = { ...event, competitionId: null };
  assert.equal((await service.forEvent(withoutLeague)).home, null);
  now += 119_999;
  assert.deepEqual(await service.forEvent(event), empty);
  assert.equal(requests, 1);
  now++;
  assert.equal((await service.forEvent(withoutLeague)).home, null);
  assert.equal((await service.forEvent(withoutLeague)).home, null);
  assert.equal(requests, 2);
});

test('bounds rolling request rates across distinct verified IDs', async () => {
  const teams = Array.from({ length: 15 }, (_, i) => ({ ...arsenal, id: 'test:' + i }));
  const permissions = teams.map(({ id }, i) => ({
    ...arsenalApproval, canonicalId: id, externalId: String(900 + i),
  }));
  const definition: CatalogDefinition = {
    ...base,
    entities: { ...base.entities, participant: [...base.entities.participant, ...teams] },
    aliases: [
      ...base.aliases, ...permissions,
      ...permissions.map((approval) => ({ ...approval, source })),
    ],
  };
  let count = 0;
  let now = 1_800_000_000_000;
  const service = new FootballLogoService(definition, {
    approvals: permissions, theSportsDbKey: 'unit-key', now: () => now,
    fetcher: async (input) => {
      count++;
      return response(new URL(String(input)).searchParams.get('id') ?? '');
    },
  });
  for (const { externalId } of permissions) await service.forEvent({ ...event, homeId: externalId });
  assert.equal(count, 12);
  now += 60_000;
  assert.equal((await service.forEvent({ ...event, homeId: '912' })).home, arsenalUrl);
  assert.equal(count, 13);
});
