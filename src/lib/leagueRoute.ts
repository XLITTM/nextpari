export function toLeagueId(country: string, name: string): string {
  const league = name.trim() || 'tournament';
  const region = country.trim();
  return region ? `${region}|${league}` : league;
}

export function fromLeagueId(leagueId: string): { country: string; name: string } {
  const raw = decodeURIComponent(leagueId);
  const sep = raw.indexOf('|');
  if (sep === -1) return { country: '', name: raw || 'Турнир' };
  return { country: raw.slice(0, sep), name: raw.slice(sep + 1) || 'Турнир' };
}

export function leaguePath(leagueId: string): string {
  return `/league/${encodeURIComponent(leagueId)}`;
}
