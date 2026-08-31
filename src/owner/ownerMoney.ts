export function ownerCapitalFingerprint(amount: number, note: string): string {
  return `capital|${amount}|${note}`;
}

export function ownerFundFingerprint(
  targetType: 'manager' | 'cashier' | 'player',
  targetId: string,
  amount: number,
  note: string,
): string {
  return `fund|${targetType}|${targetId}|${amount}|${note}`;
}
