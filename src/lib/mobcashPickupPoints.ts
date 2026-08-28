export interface MobcashPickupPoint {
  id: string;
  city: string;
  label: string;
}

export const MOBCASH_PICKUP_POINTS: MobcashPickupPoint[] = [
  { id: 'bayram-akava', city: 'Байрам-Али', label: 'кафе Акава (24/7)' },
  { id: 'bayram-tazhir', city: 'Байрам-Али', label: 'тажир маркет (24/7)' },
  { id: 'ashgabat-berkarar', city: 'Ашхабад', label: 'ТЦ Беркарар (10:00 - 22:00)' },
  { id: 'ashgabat-mkr4', city: 'Ашхабад', label: '1-й микрорайон, касса №4' },
  { id: 'ashgabat-russian', city: 'Ашхабад', label: 'Русский базар (24/7)' },
  { id: 'mary-mollanepes', city: 'Мары', label: 'ул. Молланепеса, касса №1' },
  { id: 'mary-green', city: 'Мары', label: 'Зеленый базар (24/7)' },
  { id: 'turkmen-kala-central', city: 'Туркмен-Кала', label: 'Центральный маркет (24/7)' },
  { id: 'turkmenabat-lebap', city: 'Туркменабад', label: 'ТЦ Лебап (09:00 - 21:00)' },
  { id: 'turkmenabat-rail', city: 'Туркменабад', label: 'Ж/Д вокзал, касса №2 (24/7)' },
];

export const MOBCASH_CITIES = Array.from(
  new Set(MOBCASH_PICKUP_POINTS.map((point) => point.city)),
).sort((a, b) => a.localeCompare(b, 'ru'));

export const MOBCASH_MIN_WITHDRAWAL = 40;

export function pointsForCity(city: string): MobcashPickupPoint[] {
  return MOBCASH_PICKUP_POINTS.filter((point) => point.city === city);
}

export function formatMobcashWithdrawalLabel(city: string, pointLabel: string): string {
  return `Наличные (Mobcash) · ${city} · ${pointLabel}`;
}
