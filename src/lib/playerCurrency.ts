export const PLAYER_DISPLAY_CURRENCIES = ['TMT', 'USD', 'TRY', 'UZS', 'RUB', 'KZT'] as const;
export type PlayerDisplayCurrency = (typeof PLAYER_DISPLAY_CURRENCIES)[number];

export const PLAYER_REGISTRATION_CURRENCY_OPTIONS: Array<{
  value: PlayerDisplayCurrency;
  label: string;
}> = [
  { value: 'TMT', label: 'TMT — Манат' },
  { value: 'USD', label: 'USD — Доллар США' },
  { value: 'TRY', label: 'TRY — Турецкая лира' },
  { value: 'UZS', label: 'UZS — Узбекский сум' },
  { value: 'RUB', label: 'RUB — Российский рубль' },
  { value: 'KZT', label: 'KZT — Казахстанский тенге' },
];

export function displayPlayerCurrency(code: string | null | undefined): string {
  const raw = String(code ?? '').trim().toUpperCase();
  if (raw === 'TMTM') return 'TMT';
  return raw || 'TMT';
}

export function storagePlayerCurrency(code: string | null | undefined): string {
  const display = displayPlayerCurrency(code);
  if (display === 'TMT') return 'TMTM';
  return display;
}

export function isPlayerDisplayCurrency(code: string | null | undefined): code is PlayerDisplayCurrency {
  return (PLAYER_DISPLAY_CURRENCIES as readonly string[]).includes(String(code ?? '').trim().toUpperCase());
}

export function normalizeRegistrationCurrency(code: unknown): PlayerDisplayCurrency | null {
  const raw = String(code ?? '').trim().toUpperCase();
  if (!raw || raw === 'TMTM') return null;
  return isPlayerDisplayCurrency(raw) ? raw : null;
}

export function providerFacingCurrency(code: string | null | undefined): string {
  return displayPlayerCurrency(code);
}

export function formatPlayerCurrencyAmount(balance: number, currency: string | null | undefined): string {
  const display = displayPlayerCurrency(currency);
  return `${Number(balance).toLocaleString('ru-RU')} ${display}`;
}
