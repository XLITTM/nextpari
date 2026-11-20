type RegionNames = { of(code: string): string | undefined };
const DisplayNames = (Intl as typeof Intl & {
  DisplayNames?: new (locales: string[], options: { type: 'region'; fallback: 'none' }) => RegionNames;
}).DisplayNames;
const names = DisplayNames ? new DisplayNames(['ru'], { type: 'region', fallback: 'none' }) : null;
const subdivisions: Record<string, { label: string; code: string }> = {
  eng: { label: 'Англия', code: 'gbeng' },
  sco: { label: 'Шотландия', code: 'gbsct' },
  wal: { label: 'Уэльс', code: 'gbwls' },
  nir: { label: 'Северная Ирландия', code: 'gbnir' },
};

const noFlag = new Set(['eu', 'int', 'un', 'xx']);

export function sportsRegion(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (!key || noFlag.has(key)) return '';
  const subdivision = subdivisions[key];
  if (subdivision) {
    const flag = String.fromCodePoint(0x1f3f4, ...[...subdivision.code].map((x) => 0xe0000 + x.charCodeAt(0)), 0xe007f);
    return `${flag} ${subdivision.label}`;
  }
  const label = /^[a-z]{2}$/.test(key) ? names?.of(key.toUpperCase()) : undefined;
  if (!label) return '';
  const flag = String.fromCodePoint(...[...key].map((x) => 0x1f1e6 + x.charCodeAt(0) - 97));
  return `${flag} ${label}`;
}

export function approvedFootballLogo(path: string | null | undefined): string | null {
  return path && /^\/images\/sports\/football\/[a-z0-9-]+\.png$/.test(path) ? path : null;
}
