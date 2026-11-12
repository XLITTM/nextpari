import type { SportsMatchLogos } from '../types';

/** Name-based routes can contain several competitions. Require a unanimous catalog identity. */
export function sharedCompetitionLogo(matches: readonly { logos?: SportsMatchLogos }[]): string | null {
  const first = matches[0]?.logos;
  if (!first?.competitionId || !first.competition) return null;
  return matches.every(({ logos }) => logos?.competitionId === first.competitionId
    && logos.competition === first.competition) ? first.competition : null;
}
