export const GAME_NO_STORE_HEADERS: Record<string, string> = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
};

export function serverTimingHeader(input: {
  authMs: number;
  rpcMs: number;
  totalMs: number;
  refreshed: boolean;
}): string {
  const auth = Math.max(0, Number(input.authMs.toFixed(1)));
  const game = Math.max(0, Number(input.rpcMs.toFixed(1)));
  const total = Math.max(0, Number(input.totalMs.toFixed(1)));
  return `auth;dur=${auth}, game;dur=${game}, total;dur=${total}, refresh;desc="${input.refreshed ? '1' : '0'}"`;
}
