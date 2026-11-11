import { LOGO_SOURCES } from './logos.js';
import type { LogoLookup } from './logos.js';
import type { CatalogDefinition } from './types.js';

const leagueId = 'football:eng:premier-league';
const teamId = 'football:eng:arsenal';
const source = LOGO_SOURCES.theSportsDb;
const fetchedAtMs = Date.parse('2026-11-11T19:32:49Z');

/** Reviewed initial logo links. Runtime consumers opt in when assembling their catalog. */
export const STARTER_LOGO_CATALOG = {
  definition: {
    entities: {
      sport: [{ id: 'football', name: 'Football' }],
      country: [{ id: 'eng', name: 'England' }],
      competition: [{ id: leagueId, name: 'Premier League', sportId: 'football', countryId: 'eng' }],
      participant: [{ id: teamId, name: 'Arsenal', kind: 'team', sportId: 'football', countryId: 'eng' }],
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
