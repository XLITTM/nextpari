export const LSPORTS_HTTP_INPLAY_RATE_MAX = 60;
export const LSPORTS_HTTP_HEALTH_RATE_MAX = 120;
export const LSPORTS_HTTP_RATE_WINDOW_MS = 60_000;

export class LsportsHttpRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly windowMs = LSPORTS_HTTP_RATE_WINDOW_MS,
    private readonly now: () => number = Date.now,
  ) {}

  allow(key: string, max: number): boolean {
    const at = this.now();
    const next = (this.hits.get(key) ?? []).filter((stamp) => at - stamp < this.windowMs);
    if (next.length >= max) {
      this.hits.set(key, next);
      return false;
    }
    next.push(at);
    this.hits.set(key, next);
    return true;
  }
}

export function clientKey(req: { headers: { [key: string]: string | string[] | undefined }; socket?: { remoteAddress?: string } }): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = raw?.split(',')[0]?.trim();
  return first || req.socket?.remoteAddress || 'unknown';
}
