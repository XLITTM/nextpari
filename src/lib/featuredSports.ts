import type { SportId } from '../types';

export const FEATURED_SPORT_IDS: SportId[] = [
  'all',
  'football',
  'tennis',
  'basketball',
  'hockey',
  'esports',
];

export function isFeaturedSport(id: SportId): boolean {
  return FEATURED_SPORT_IDS.includes(id);
}
