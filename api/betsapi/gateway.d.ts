export const BETSAPI_CACHE_TTL_MS: number;
export function getBetsApiGatewayToken(): string;
export function fetchBetsApi(
  path: string,
  search?: URLSearchParams | Record<string, string>,
  signal?: AbortSignal,
): Promise<{ status: number; body: string; contentType: string; cached: boolean }>;
