export const ODDSPAPI_DEMO_HASH = '#/oddspapi-demo';
export const ODDSPAPI_DEMO_PATH = '/api/internal/oddspapi-v5-demo';

export function isOddsPapiDemoEntry(hash: string): boolean {
  const value = hash.trim().toLowerCase();
  return value === ODDSPAPI_DEMO_HASH || value.startsWith(`${ODDSPAPI_DEMO_HASH}?`);
}

export function oddspapiDemoUrl(query: Record<string, string>): string {
  const params = new URLSearchParams(query);
  return `${ODDSPAPI_DEMO_PATH}?${params.toString()}`;
}
