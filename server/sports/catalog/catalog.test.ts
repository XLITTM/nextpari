import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LOGO_SOURCES, marketAvailability, selectableOdds, SportsCatalog, SportsLogoCatalog, SportsNormalizationEngine,
  STARTER_LOGO_CATALOG,
} from './index.js';
import type {
  CatalogDefinition, LogoLookup, MarketDefinition, ProviderEvent, ProviderMarket, ProviderMarketRule, ProviderObservation,
  ProviderSource, VerifiedAlias,
} from './index.js';

const betsapi = { provider: 'betsapi', namespace: 'fixtures' };
const other = { provider: 'another-odds-api', namespace: 'football' };
const racing = { provider: 'another-odds-api', namespace: 'racing' };
const book = 'book-a';
const kickoff = 1_800_000_000_000;
const fetched = kickoff + 20_000;
const sourceTime = fetched - 1_000;
const freshness = { live: 5_000, prematch: 60_000 };
const home = { role: 'home', participantId: 'river-town' };
const away = { role: 'away', participantId: 'riverside' };

function alias(source: ProviderSource, kind: VerifiedAlias['kind'], externalId: string, canonicalId: string): VerifiedAlias {
  return { source, kind, externalId, canonicalId, evidence: 'Reviewed provider crosswalk' };
}

const definition: CatalogDefinition = {
  entities: {
    sport: [{ id: 'football', name: 'Football' }, { id: 'racing', name: 'Racing' }],
    country: [{ id: 'eng', name: 'England' }],
    competition: [
      { id: 'league', sportId: 'football', countryId: 'eng', name: 'National League' },
      { id: 'academy', sportId: 'football', countryId: 'eng', name: 'National League' },
      { id: 'racing-cup', sportId: 'racing', name: 'Racing Cup' },
    ],
    season: [{ id: 'league-2026', competitionId: 'league', name: '2026' }],
    participant: [
      { id: home.participantId, sportId: 'football', kind: 'team', name: 'River Town' },
      { id: away.participantId, sportId: 'football', kind: 'team', name: 'Riverside' },
      { id: 'river-youth', sportId: 'football', kind: 'team', name: 'River Town' },
      { id: 'player', sportId: 'football', kind: 'individual', name: 'A. Player' },
      ...['driver-a', 'driver-b', 'driver-c'].map(id => ({ id, sportId: 'racing', kind: 'individual' as const, name: id })),
    ],
    event: [
      {
        id: 'match-1', name: 'League match', sportId: 'football', competitionId: 'league', seasonId: 'league-2026',
        startsAtMs: kickoff, participants: [home, away], eligibleSubjectIds: ['player'],
      },
      {
        id: 'match-replay', name: 'League replay', sportId: 'football', competitionId: 'league', seasonId: 'league-2026',
        startsAtMs: kickoff + 86_400_000, participants: [home, away],
      },
      {
        id: 'race-1', name: 'Race', sportId: 'racing', competitionId: 'racing-cup',
        participants: ['driver-a', 'driver-b', 'driver-c'].map(participantId => ({ role: 'entrant', participantId })),
      },
    ],
    period: [
      { id: 'football:regulation', sportId: 'football', name: 'Regulation' },
      { id: 'football:first-half', sportId: 'football', name: 'First half' },
      { id: 'racing:race', sportId: 'racing', name: 'Race' },
    ],
  },
  aliases: [
    ...[betsapi, other].flatMap((source, i) => [
      alias(source, 'sport', '1', 'football'),
      alias(source, 'country', 'GB-ENG', 'eng'),
      alias(source, 'competition', '100', 'league'),
      alias(source, 'competition', '101', 'academy'),
      alias(source, 'season', '2026', 'league-2026'),
      alias(source, 'participant', '9', home.participantId),
      alias(source, 'participant', '10', away.participantId),
      alias(source, 'participant', '11', 'river-youth'),
      alias(source, 'participant', '12', 'player'),
      alias(source, 'event', i === 0 ? 'fixture-99' : 'event-384', 'match-1'),
    ]),
    alias(racing, 'sport', '1', 'racing'),
    alias(racing, 'competition', '100', 'racing-cup'),
    alias(racing, 'event', 'race-100', 'race-1'),
    alias(racing, 'participant', '9', 'driver-a'),
    alias(racing, 'participant', '10', 'driver-b'),
    alias(racing, 'participant', '11', 'driver-c'),
    alias(LOGO_SOURCES.theSportsDb, 'competition', '100', 'league'),
    alias(LOGO_SOURCES.theSportsDb, 'participant', '9', home.participantId),
    alias(LOGO_SOURCES.theSportsDb, 'participant', '12', 'player'),
    alias(LOGO_SOURCES.apiSportsFootball, 'participant', '42', home.participantId),
  ],
};

function rule(overrides: Partial<ProviderMarketRule> = {}): ProviderMarketRule {
  return {
    source: betsapi, bookmakerId: book, externalPeriodId: 'ft', externalMarketId: 'result',
    periodId: 'football:regulation', marketDefinitionId: '1x2', selectionCodes: { h: 'home', d: 'draw', a: 'away' },
    ...overrides,
  };
}

function event(overrides: Partial<ProviderEvent> = {}): ProviderEvent {
  return {
    source: betsapi, externalId: 'fixture-99', sportId: '1', competitionId: '100', countryId: 'GB-ENG', seasonId: '2026',
    startsAtMs: kickoff, receivedAtMs: fetched, status: 'live',
    participants: [{ role: 'home', participantId: '9' }, { role: 'away', participantId: '10' }],
    ...overrides,
  };
}

function selections(...pairs: [string, number | null][]): ProviderMarket['selections'] {
  return pairs.map(([code, price]) => ({ externalId: `sel:${code}`, code, price, externalOddsId: `quote:${code}` }));
}

function market(overrides: Partial<ProviderMarket> = {}): ProviderMarket {
  return {
    bookmakerId: book, externalMarketId: 'result', externalPeriodId: 'ft', status: 'open', phase: 'live',
    sourceUpdatedAtMs: sourceTime, selections: selections(['h', 1.8], ['d', 3.9], ['a', 4.1]),
    ...overrides,
  };
}

function observation(eventOverrides: Partial<ProviderEvent> = {}, markets = [market()]): ProviderObservation {
  return { event: event(eventOverrides), markets };
}

const normalizer = new SportsNormalizationEngine(definition, [rule()]);

describe('canonical event identity', () => {
  it('deduplicates reviewed provider aliases while retaining separate bookmaker offers and source selectors', () => {
    const engine = new SportsNormalizationEngine(definition, [rule(), rule({ source: other }), rule({ bookmakerId: 'book-b' })]);
    const output = engine.normalizeBatch([
      observation({}, [market(), market(), market({ bookmakerId: 'book-b' })]),
      observation({ source: other, externalId: 'event-384' }),
    ]);
    assert.equal(output.events.length, 1);
    const [entry] = output.events;
    assert.equal(entry.event.id, 'match-1');
    assert.equal(entry.sources.length, 2);
    assert.equal(entry.markets.length, 3);
    assert.equal(new Set(entry.markets.map(item => item.market.id)).size, 1);
    assert.equal(new Set(entry.markets.map(item => item.odds[0].selectionId)).size, 1);
    assert.equal(new Set(entry.markets.map(item => item.odds[0].id)).size, 3);
    assert.deepEqual(entry.markets[0].odds.map(odd => [odd.selection, odd.sourceSelectionId, odd.sourceOddsId, odd.price]), [
      [{ kind: 'code', code: 'home', participantId: home.participantId }, 'sel:h', 'quote:h', 1.8],
      [{ kind: 'code', code: 'draw' }, 'sel:d', 'quote:d', 3.9],
      [{ kind: 'code', code: 'away', participantId: away.participantId }, 'sel:a', 'quote:a', 4.1],
    ]);
  });

  it('leaves a different external fixture unresolved even with the same kickoff, league and teams', () => {
    const output = normalizer.normalizeBatch([observation({ externalId: 'unreviewed' })]);
    assert.equal(output.events.length, 0);
    assert.equal(output.unresolvedEvents[0].issue.reason, 'unmapped');
  });

  it('rejects a same-name team, wrong league, reversed roles, and a reused fixture ID', () => {
    const cases: [Partial<ProviderEvent>, string][] = [
      [{ participants: [{ role: 'home', participantId: '11' }, { role: 'away', participantId: '10' }] }, 'event'],
      [{ competitionId: '101' }, 'competition'],
      [{ participants: [{ role: 'home', participantId: '10' }, { role: 'away', participantId: '9' }] }, 'event'],
      [{ startsAtMs: kickoff + 86_400_000 }, 'event'],
    ];
    for (const [change, kind] of cases) {
      const output = normalizer.normalizeBatch([observation(change)]);
      assert.equal(output.events.length, 0);
      assert.equal(output.unresolvedEvents[0].issue.reason, 'conflict');
      assert.equal(output.unresolvedEvents[0].issue.kind, kind);
    }
  });

  it('keeps conflicting aliases ambiguous even if one candidate appears to match the fixture', () => {
    const engine = new SportsNormalizationEngine({
      ...definition, aliases: [...definition.aliases, alias(betsapi, 'event', 'fixture-99', 'match-replay')],
    }, [rule()]);
    const output = engine.normalizeBatch([observation()]);
    assert.equal(output.events.length, 0);
    assert.equal(output.unresolvedEvents[0].issue.reason, 'ambiguous');
  });

  it('uses a corrected verified alias in a new catalog snapshot and leaves other providers on the original event', () => {
    const updated = definition.aliases.map(entry => entry.kind === 'event' && entry.source === betsapi
      ? { ...entry, canonicalId: 'match-replay', evidence: 'Verified fixture-ID correction' }
      : entry);
    const engine = new SportsNormalizationEngine({ ...definition, aliases: updated }, [rule(), rule({ source: other })]);
    const output = engine.normalizeBatch([
      observation({ startsAtMs: kickoff + 86_400_000 }),
      observation({ source: other, externalId: 'event-384' }),
    ]);
    assert.deepEqual(output.events.map(item => item.event.id), ['match-replay', 'match-1']);
    assert.notEqual(output.events[0].markets[0].id, output.events[1].markets[0].id);
    assert.equal(normalizer.normalizeBatch([observation()]).events[0].event.id, 'match-1');
  });

  it('quarantines a contradictory source event while keeping another verified source', () => {
    const engine = new SportsNormalizationEngine(definition, [rule(), rule({ source: other })]);
    const output = engine.normalizeBatch([
      observation(), observation({ competitionId: '101', receivedAtMs: fetched + 1 }),
      observation({ source: other, externalId: 'event-384' }),
    ]);
    assert.equal(output.events[0].sources.length, 1);
    assert.deepEqual(output.events[0].markets.map(item => item.source), [other]);
  });

  it('retains a canonical event ID across a reviewed schedule correction', () => {
    const events = definition.entities.event.map(item => item.id === 'match-1' ? { ...item, startsAtMs: kickoff + 60_000 } : item);
    const engine = new SportsNormalizationEngine({ ...definition, entities: { ...definition.entities, event: events } }, [rule()]);
    const output = engine.normalizeBatch([observation({ startsAtMs: kickoff + 60_000 })]);
    assert.equal(output.events[0].event.id, 'match-1');
    assert.equal(output.events[0].markets[0].id, normalizer.normalizeBatch([observation()]).events[0].markets[0].id);
  });
});

describe('market normalization', () => {
  it('distinguishes regulation, first half, moneyline, and a period absent from the crosswalk', () => {
    const engine = new SportsNormalizationEngine(definition, [
      rule(), rule({ externalPeriodId: 'h1', periodId: 'football:first-half' }),
      rule({ externalMarketId: 'ml', marketDefinitionId: 'moneyline', selectionCodes: { h: 'home', a: 'away' } }),
    ]);
    const output = engine.normalizeBatch([observation({}, [
      market(), market({ externalPeriodId: 'h1' }), market({ externalPeriodId: 'ot' }),
      market({ externalMarketId: 'ml', selections: selections(['a', 3], ['h', 1.4]) }),
    ])]);
    const markets = output.events[0].markets;
    assert.equal(new Set(markets.map(item => item.market.id)).size, 3);
    assert.deepEqual(markets.map(item => [item.market.periodId, item.market.definitionId]), [
      ['football:regulation', '1x2'], ['football:first-half', '1x2'], ['football:regulation', 'moneyline'],
    ]);
    assert.deepEqual(markets[2].odds.map(odd => odd.price), [1.4, 3]);
    assert.equal(output.unresolvedMarkets[0].issue.reason, 'unmapped-market');
  });

  it('preserves exact total and handicap lines and normalizes an explicitly inverted handicap source', () => {
    const total = (line: string) => market({ line, externalMarketId: 'total', selections: selections(['o', 1.6], ['u', 2.3]) });
    const handicap = (line: string) => market({ line, externalMarketId: 'ah', selections: selections(['h', 1.6], ['a', 2.3]) });
    const handicapRule = rule({
      externalMarketId: 'ah', marketDefinitionId: 'asian_handicap', handicapSign: 'as-provided', selectionCodes: { h: 'home', a: 'away' },
    });
    const engine = new SportsNormalizationEngine(definition, [
      rule({ externalMarketId: 'total', marketDefinitionId: 'over_under', selectionCodes: { o: 'over', u: 'under' } }),
      handicapRule, { ...handicapRule, source: other, handicapSign: 'invert' },
    ]);
    const output = engine.normalizeBatch([
      observation({}, [total('+02.5000'), total('2.5'), total('2.5001'), total('2,2.5'), total('2.50,2'), total('bad'),
        handicap('-0.50,0.0'), handicap('+0.5')]),
      observation({ source: other, externalId: 'event-384' }, [handicap('0,+0.50')]),
    ]);
    const markets = output.events[0].markets;
    assert.equal(markets.length, 6);
    assert.equal(new Set(markets.map(item => item.market.id)).size, 5);
    assert.deepEqual(markets.slice(0, 3).map(item => item.market.line?.components), [['2.5'], ['2.5001'], ['2', '2.5']]);
    assert.deepEqual(markets[3].market.line, { kind: 'handicap', components: ['-0.5', '0'], anchorParticipantId: home.participantId });
    assert.equal(markets[3].market.id, markets[5].market.id);
    assert.equal(output.unresolvedMarkets[0].issue.reason, 'invalid-line');
  });

  it('closes all prices on missing, duplicate, unrecognized, or invalid selections', () => {
    const invalid = [
      selections(['h', 2], ['a', 3]),
      selections(['h', 2], ['h', 3], ['a', 3]),
      selections(['h', 2], ['d', 3], ['wrong', 3]),
      selections(['h', 2], ['d', null], ['a', 3]),
      [{ externalId: 'h', participantExternalId: '9', price: 2 }, ...selections(['d', 3], ['a', 3])],
      [{ externalId: 'h', code: 'h', participantExternalId: '10', price: 2 }, ...selections(['d', 3], ['a', 3])],
    ];
    for (const rows of invalid) {
      const [snapshot] = normalizer.normalizeBatch([observation({}, [market({ selections: rows })])]).events[0].markets;
      assert.equal(snapshot.state, 'incomplete');
      assert.deepEqual(snapshot.odds.map(odd => odd.price), [null, null, null]);
    }
  });

  it('handles participant markets and verified player props without changing the engine', () => {
    const additions: MarketDefinition[] = [
      { id: 'race-winner', line: { kind: 'none' }, subject: 'event', selections: { kind: 'event-participants' } },
      { id: 'player-shots', line: { kind: 'total' }, subject: 'participant', selections: { kind: 'fixed', codes: ['over', 'under'] } },
    ];
    const engine = new SportsNormalizationEngine(definition, [
      rule({ source: racing, periodId: 'racing:race', marketDefinitionId: 'race-winner', selectionCodes: undefined }),
      rule({ externalMarketId: 'shots', marketDefinitionId: 'player-shots', selectionCodes: { o: 'over', u: 'under' } }),
    ], additions);
    const output = engine.normalizeBatch([
      observation({
        source: racing, externalId: 'race-100', countryId: undefined, seasonId: undefined, startsAtMs: undefined,
        participants: ['11', '9', '10'].map(participantId => ({ role: 'entrant', participantId })),
      }, [market({
        selections: [{ externalId: 'runner-C', participantExternalId: '11', price: 4 },
          { externalId: 'runner-A', participantExternalId: '9', price: 1.5 },
          { externalId: 'runner-B', participantExternalId: '10', price: 3 }],
      })]),
      observation({}, ['12', '11'].map(subjectExternalId => market({
        subjectExternalId, externalMarketId: 'shots', line: '1.5', selections: selections(['o', 2], ['u', 2.1]),
      }))),
    ]);
    assert.deepEqual(output.events[0].markets[0].odds.map(odd => [odd.selection, odd.price]), [
      [{ kind: 'participant', participantId: 'driver-a' }, 1.5],
      [{ kind: 'participant', participantId: 'driver-b' }, 3],
      [{ kind: 'participant', participantId: 'driver-c' }, 4],
    ]);
    assert.equal(output.events[1].markets[0].market.subjectId, 'player');
    assert.equal(output.unresolvedMarkets[0].issue.reason, 'invalid-subject');
  });

  it('keeps independent offers for a large set of lines on one event', () => {
    const engine = new SportsNormalizationEngine(definition, [
      rule({ externalMarketId: 'total', marketDefinitionId: 'over_under', selectionCodes: { o: 'over', u: 'under' } }),
    ]);
    const input = Array.from({ length: 300 }, (_, line) => market({
      externalMarketId: 'total', line: String(line) + '.5', selections: selections(['o', 2.1], ['u', 1.9]),
    }));
    const [entry] = engine.normalizeBatch([observation({}, input)]).events;
    assert.equal(entry.markets.length, 300);
    assert.equal(new Set(entry.markets.map(item => item.market.id)).size, 300);
  });

  it('rejects a period from another sport and ambiguous market configuration', () => {
    const engine = new SportsNormalizationEngine(definition, [rule({ periodId: 'racing:race' })]);
    assert.equal(engine.normalizeBatch([observation()]).unresolvedMarkets[0].issue.reason, 'wrong-sport');
    assert.throws(() => new SportsNormalizationEngine(definition, [rule(), rule({ marketDefinitionId: 'moneyline' })]),
      /duplicate provider market rule/);
    assert.throws(() => new SportsNormalizationEngine(definition, [rule({ selectionCodes: { h: 'home', a: 'home', d: 'draw' } })]),
      /one-to-one selection mapping/);
  });
});

describe('freshness and corrections', () => {
  it('ignores an out-of-order reopening and accepts a newer source correction', () => {
    const open = market({ sourceUpdatedAtMs: sourceTime - 100 });
    const suspended = market({ status: 'suspended', selections: [] });
    const oldReplay = observation({ receivedAtMs: fetched + 100 }, [open]);
    const initial = normalizer.normalizeBatch([observation({}, [suspended]), oldReplay]);
    assert.equal(marketAvailability(initial.events[0].markets[0], fetched + 100, freshness), 'suspended');
    const correction = market({ sourceUpdatedAtMs: sourceTime + 100 });
    const [updated] = normalizer.normalizeBatch([observation({}, [correction, suspended, open])]).events[0].markets;
    assert.equal(marketAvailability(updated, fetched, freshness), 'open');
    assert.equal(updated.sourceUpdatedAtMs, sourceTime + 100);
  });

  it('fails closed when equally timed updates disagree, independent of arrival order', () => {
    const open = market();
    const conflict = market({ selections: selections(['h', 1.9], ['d', 3.9], ['a', 4.1]) });
    for (const inputs of [[open, conflict, open], [conflict, open, conflict]]) {
      const [snapshot] = normalizer.normalizeBatch([observation({}, inputs)]).events[0].markets;
      assert.equal(snapshot.state, 'conflict');
      assert.deepEqual(selectableOdds(snapshot, fetched, freshness), []);
    }
  });

  it('expires by source time despite refetches and treats missing and future source clocks as stale', () => {
    const [snapshot] = normalizer.normalizeBatch([observation(), observation({ receivedAtMs: fetched + 10_000 })]).events[0].markets;
    assert.equal(marketAvailability(snapshot, sourceTime + 5_000, freshness), 'open');
    assert.equal(marketAvailability(snapshot, sourceTime + 5_001, freshness), 'stale');
    for (const sourceUpdatedAtMs of [null, fetched + 1, Number.NaN]) {
      const [candidate] = normalizer.normalizeBatch([observation({}, [market({ sourceUpdatedAtMs })])]).events[0].markets;
      assert.equal(marketAvailability(candidate, fetched, freshness), 'stale');
      assert.deepEqual(selectableOdds(candidate, fetched, freshness), []);
    }
  });

  it('does not keep prematch prices on transition to live or allow odds on a finished fixture', () => {
    const prematch = observation({ status: 'prematch', receivedAtMs: fetched - 100 }, [market({ phase: 'prematch' })]);
    const live = observation();
    const finished = observation({ status: 'finished', receivedAtMs: fetched + 100 }, []);
    assert.equal(normalizer.normalizeBatch([live, prematch]).events[0].markets[0].phase, 'live');
    const [marketAfterFinish] = normalizer.normalizeBatch([finished, live]).events[0].markets;
    assert.equal(marketAfterFinish.state, 'closed');
    assert.deepEqual(selectableOdds(marketAfterFinish, fetched + 100, freshness), []);
  });
});

describe('verified logo catalog', () => {
  const url = 'https://r2.thesportsdb.com/images/media/team/badge/team.png';
  const alternate = 'https://media.api-sports.io/football/teams/42.png';
  const logo = (payload: unknown, fetchedAtMs = fetched): LogoLookup =>
    ({ kind: 'participant', source: LOGO_SOURCES.theSportsDb, externalId: '9', fetchedAtMs, payload });
  const fallback: LogoLookup = {
    kind: 'participant', source: LOGO_SOURCES.apiSportsFootball, externalId: '42', fetchedAtMs: fetched,
    payload: { response: [{ team: { id: 42, logo: alternate } }] },
  };
  const team = { idTeam: '9', strBadge: url };

  it('resolves the reviewed Premier League and Arsenal starter assets', () => {
    const starter = new SportsLogoCatalog(new SportsCatalog(STARTER_LOGO_CATALOG.definition), STARTER_LOGO_CATALOG.lookups);
    assert.equal(starter.get('competition', 'football:eng:premier-league')?.externalId, '4328');
    assert.equal(starter.get('participant', 'football:eng:arsenal')?.externalId, '133604');
  });

  it('prefers TheSportsDB and falls back to exact API-Sports IDs when the primary asset is missing', () => {
    const catalog = new SportsCatalog(definition);
    assert.equal(new SportsLogoCatalog(catalog, [fallback, logo({ teams: [team] })]).get('participant', home.participantId)?.url, url);
    assert.equal(new SportsLogoCatalog(catalog, [fallback, logo({ teams: null })]).get('participant', home.participantId)?.url, alternate);
    assert.equal(new SportsLogoCatalog(catalog, [logo({ teams: [team] })]).get('participant', 'river-youth'), undefined);
  });

  it('rejects wrong IDs, untrusted URLs, wrong asset types, and ambiguous matches', () => {
    const catalog = new SportsCatalog(definition);
    const cases = [
      { teams: [{ ...team, idTeam: '11', strTeam: 'River Town' }] },
      { teams: [{ ...team, strBadge: 'https://r2.thesportsdb.com.bad.example/team.png' }] },
      { teams: [{ ...team, strBadge: 'https://r2.thesportsdb.com/images/media/league/badge/league.png' }] },
      { teams: [team, team] },
    ];
    for (const payload of cases) {
      assert.equal(new SportsLogoCatalog(catalog, [logo(payload)]).get('participant', home.participantId), undefined);
    }
    const wrongApiPath = { ...fallback, payload: { response: [{ team: { id: 42, logo: alternate.replace('42.png', '43.png') } }] } };
    assert.equal(new SportsLogoCatalog(catalog, [wrongApiPath]).get('participant', home.participantId), undefined);
    const ambiguous = new SportsCatalog({
      ...definition, aliases: [...definition.aliases, alias(LOGO_SOURCES.theSportsDb, 'participant', '9', 'river-youth')],
    });
    assert.equal(new SportsLogoCatalog(ambiguous, [logo({ teams: [team] })]).get('participant', home.participantId), undefined);
  });

  it('withdraws a missing asset and fails closed on conflicting results from the same instant', () => {
    const catalog = new SportsCatalog(definition);
    const old = logo({ teams: [team] }, fetched - 1);
    const missing = logo({ teams: [] });
    const replacement = logo({ teams: [{ ...team, strBadge: url.replace('team.png', 'new.png') }] });
    assert.equal(new SportsLogoCatalog(catalog, [missing, old]).get('participant', home.participantId), undefined);
    assert.equal(new SportsLogoCatalog(catalog, [old, missing, replacement]).get('participant', home.participantId), undefined);
    assert.equal(new SportsLogoCatalog(catalog, [old, replacement]).get('participant', home.participantId)?.url, url.replace('team.png', 'new.png'));
  });
});
