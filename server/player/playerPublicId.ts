export function formatPlayerPublicId(value: number): string {
  return String(value).padStart(6, '0');
}

export function allocateSequentialPlayerId(
  nextValue: number,
  occupied: Iterable<string>,
): { id: string; nextValue: number } {
  const taken = new Set(occupied);
  let current = nextValue;
  while (current <= 999999) {
    const id = formatPlayerPublicId(current);
    if (!taken.has(id)) {
      return { id, nextValue: current + 1 };
    }
    current += 1;
  }
  throw new Error('PUBLIC_ID_SPACE_EXHAUSTED');
}
