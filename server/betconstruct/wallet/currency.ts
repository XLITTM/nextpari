export function providerDisplayCurrency(code: string): string | null {
  const raw = String(code ?? '').trim().toUpperCase();
  if (raw === 'TMTM' || raw === 'TMT') return 'TMT';
  if (raw === 'USD' || raw === 'TRY' || raw === 'UZS' || raw === 'RUB' || raw === 'KZT') return raw;
  return null;
}

export function walletStorageCurrency(display: string): string | null {
  const mapped = providerDisplayCurrency(display);
  if (!mapped) return null;
  return mapped === 'TMT' ? 'TMTM' : mapped;
}

export function money2(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function assertCurrencyMatch(bound: string, incoming: string | null | undefined): void {
  const left = providerDisplayCurrency(bound);
  const right = incoming == null || String(incoming).trim() === ''
    ? left
    : providerDisplayCurrency(String(incoming));
  if (!left || !right || left !== right) {
    throw new Error('CURRENCY_MISMATCH');
  }
}
