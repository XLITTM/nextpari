export const PLAYER_DISPLAY_CURRENCIES = ['TMT', 'USD', 'TRY', 'UZS', 'RUB', 'KZT'] as const;
export type PlayerDisplayCurrency = (typeof PLAYER_DISPLAY_CURRENCIES)[number];

export function displayPlayerCurrency(code: string | null | undefined): string {
  const raw = String(code ?? '').trim().toUpperCase();
  if (raw === 'TMTM' || raw === 'TMT') return 'TMT';
  if ((PLAYER_DISPLAY_CURRENCIES as readonly string[]).includes(raw)) return raw;
  return raw || 'TMT';
}

export function storagePlayerCurrency(code: string | null | undefined): string | null {
  const raw = String(code ?? '').trim().toUpperCase();
  if (!raw) return null;
  if (raw === 'TMT' || raw === 'TMTM') return 'TMTM';
  if (raw === 'USD' || raw === 'TRY' || raw === 'UZS' || raw === 'RUB' || raw === 'KZT') return raw;
  return null;
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
