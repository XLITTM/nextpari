interface Hit {
  key: string;
  at: number;
}

export function createLimiter(limit: number, windowMs: number) {
  const hits: Hit[] = [];
  return {
    allow(key: string, now: number): boolean {
      const fresh = hits.filter((hit) => now - hit.at < windowMs);
      hits.length = 0;
      hits.push(...fresh);
      const count = hits.filter((hit) => hit.key === key).length;
      if (count >= limit) return false;
      hits.push({ key, at: now });
      return true;
    },
  };
}
