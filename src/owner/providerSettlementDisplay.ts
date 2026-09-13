export function formatNullableProviderMoney(
  value: number | null,
  formatMoney: (amount: number) => string,
): string {
  if (value == null) return '—';
  return formatMoney(value);
}

export function formatProviderCommercialTerms(input: {
  commissionFee: number | null;
  commercialTerms: Record<string, unknown> | null;
  formatMoney: (amount: number) => string;
}): string {
  if (input.commissionFee == null && input.commercialTerms == null) return 'Не настроено';
  if (input.commissionFee == null) return 'Не настроено';
  return input.formatMoney(input.commissionFee);
}
