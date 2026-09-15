export const PLAYER_DISPLAY_CURRENCIES = ['TMT', 'USD', 'TRY', 'UZS', 'RUB', 'KZT'] as const;
export type PlayerDisplayCurrency = (typeof PLAYER_DISPLAY_CURRENCIES)[number];

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

export function walletCurrenciesMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = storagePlayerCurrency(left);
  const b = storagePlayerCurrency(right);
  return Boolean(a) && a === b;
}
