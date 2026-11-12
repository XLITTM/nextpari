type RegionNames = { of(code: string): string | undefined };
const DisplayNames = (Intl as typeof Intl & {
  DisplayNames?: new (locales: string[], options: { type: 'region'; fallback: 'none' }) => RegionNames;
}).DisplayNames;
const names = DisplayNames ? new DisplayNames(['ru'], { type: 'region', fallback: 'none' }) : null;
const subdivisions: Record<string, { label: string; code: string }> = {
  eng: { label: 'Англия', code: 'gbeng' },
  sco: { label: 'Шотландия', code: 'gbsct' },
  wal: { label: 'Уэльс', code: 'gbwls' },
};

export function sportsRegion(raw: string): string {
  const key = raw.trim().toLowerCase();
  const subdivision = subdivisions[key];
  if (subdivision) {
    const flag = String.fromCodePoint(0x1f3f4, ...[...subdivision.code].map((x) => 0xe0000 + x.charCodeAt(0)), 0xe007f);
    return `${flag} ${subdivision.label}`;
  }
  const label = /^[a-z]{2}$/.test(key) ? names?.of(key.toUpperCase()) : undefined;
  if (!label) return raw.trim();
  const flag = String.fromCodePoint(...[...key].map((x) => 0x1f1e6 + x.charCodeAt(0) - 97));
  return `${flag} ${label}`;
}
