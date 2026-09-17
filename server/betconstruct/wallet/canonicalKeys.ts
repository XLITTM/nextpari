/** UTF-16 code-unit order. Never localeCompare for financial canonicalization. */
export function ordinalKeySort(keys: string[]): string[] {
  return [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
