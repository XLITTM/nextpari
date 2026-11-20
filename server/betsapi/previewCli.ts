import { BetsApiReadOnlyClient } from './client.js';
import type { NormalizedEvent } from './types.js';

function describe(event: NormalizedEvent | undefined): string {
  if (!event) return 'none';
  const open = event.markets.filter((market) => market.status === 'open').length;
  const closed = event.markets.filter((market) => market.status === 'closed').length;
  const score = event.score ? `${event.score.home}-${event.score.away}` : 'unknown';
  const league = event.league.name ?? 'league unknown';
  return `${league} | ${event.home.name} vs ${event.away.name} | ${event.status} | score ${score} | markets open=${open} closed=${closed}`;
}

export async function runBetsApiPreviewCli(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  if (String(env.VERCEL_ENV ?? '').trim() === 'production') return 2;
  if (String(env.BETSAPI_READONLY_PREVIEW ?? '').trim() !== '1') return 2;
  if (!String(env.BETSAPI_TOKEN || env.BETSAPI_KEY || '').trim()) return 2;

  const client = new BetsApiReadOnlyClient({ env });
  const inplay = await client.getInplay();
  const upcoming = await client.getUpcoming(1);
  const lines = [
    'BetsAPI read-only football preview',
    `inplay: ${inplay.ok ? inplay.feed?.events.length ?? 0 : inplay.error} stale=${Boolean(inplay.feed?.stale)}`,
    `upcoming: ${upcoming.ok ? upcoming.feed?.events.length ?? 0 : upcoming.error} stale=${Boolean(upcoming.feed?.stale)}`,
    `sample: ${describe(inplay.feed?.events[0] ?? upcoming.feed?.events[0])}`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
  return inplay.ok || upcoming.ok ? 0 : 1;
}
