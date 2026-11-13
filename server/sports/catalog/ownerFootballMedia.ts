/** Reviewed BetsAPI Events aliases from starterLogos and owner-approved archive assets. */
const assets = {
  competition: {
    '94': { id: 'football:eng:premier-league', file: 'premier-league' },
  },
  participant: {
    '17230': { id: 'football:eng:arsenal', file: 'arsenal' },
    '708': { id: 'football:eng:manchester-city', file: 'manchester-city' },
  },
} as const;

export function ownerFootballLogo(kind: keyof typeof assets, providerId: string | null) {
  const byId: Readonly<Record<string, { id: string; file: string }>> = assets[kind];
  const asset = providerId && Object.hasOwn(byId, providerId) ? byId[providerId] : null;
  return asset ? { canonicalId: asset.id, path: `/images/sports/football/${asset.file}.png` } : null;
}
