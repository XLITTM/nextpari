import { LOGO_SOURCES } from './logos.js';
import type { LogoLookup } from './logos.js';
import type { CatalogDefinition } from './types.js';

const leagueId = 'football:eng:premier-league';
const teamId = 'football:eng:arsenal';
const cityId = 'football:eng:manchester-city';
const source = LOGO_SOURCES.theSportsDb;
export const BETSAPI_EVENTS_LOGO_SOURCE = { provider: 'betsapi', namespace: 'events' } as const;
const betsApiEvidence = 'https://betsapi.com/docs/samples/event_view.json';
const fetchedAtMs = Date.parse('2026-11-11T19:32:49Z');

/** Reviewed initial logo links. Runtime consumers opt in when assembling their catalog. */
export const STARTER_LOGO_CATALOG = {
  definition: {
    entities: {
      sport: [{ id: 'football', name: 'Football' }],
      country: [{ id: 'eng', name: 'England' }],
      competition: [{ id: leagueId, name: 'Premier League', sportId: 'football', countryId: 'eng' }],
      participant: [
        { id: teamId, name: 'Arsenal', kind: 'team', sportId: 'football', countryId: 'eng' },
        { id: cityId, name: 'Manchester City', kind: 'team', sportId: 'football', countryId: 'eng' },
      ],
      event: [],
      season: [],
      period: [],
    },
    aliases: [
      {
        kind: 'competition', source, externalId: '4328', canonicalId: leagueId,
        evidence: 'https://www.thesportsdb.com/league/4328-English-Premier-League',
      },
      {
        kind: 'participant', source, externalId: '133604', canonicalId: teamId,
        evidence: 'https://www.thesportsdb.com/team/133604-arsenal',
      },
      {
        kind: 'participant', source, externalId: '133613', canonicalId: cityId,
        evidence: 'https://www.thesportsdb.com/team/133613-manchester-city',
      },
      { kind: 'sport', source: BETSAPI_EVENTS_LOGO_SOURCE, externalId: '1', canonicalId: 'football', evidence: betsApiEvidence },
      { kind: 'competition', source: BETSAPI_EVENTS_LOGO_SOURCE, externalId: '94', canonicalId: leagueId, evidence: betsApiEvidence },
      { kind: 'participant', source: BETSAPI_EVENTS_LOGO_SOURCE, externalId: '17230', canonicalId: teamId, evidence: betsApiEvidence },
      { kind: 'participant', source: BETSAPI_EVENTS_LOGO_SOURCE, externalId: '708', canonicalId: cityId, evidence: betsApiEvidence },
    ],
  },
  lookups: [
    {
      kind: 'competition', source, externalId: '4328', fetchedAtMs,
      payload: { leagues: [{ idLeague: '4328', strBadge: 'https://r2.thesportsdb.com/images/media/league/badge/gasy9d1737743125.png' }] },
    },
    {
      kind: 'participant', source, externalId: '133604', fetchedAtMs,
      payload: { teams: [{ idTeam: '133604', strBadge: 'https://r2.thesportsdb.com/images/media/team/badge/uyhbfe1612467038.png' }] },
    },
  ],
} as const satisfies { definition: CatalogDefinition; lookups: readonly LogoLookup[] };
