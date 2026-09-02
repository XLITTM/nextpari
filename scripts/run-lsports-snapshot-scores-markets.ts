import { captureInPlayHeartbeatTimestamp } from '../server/lsports/probe.js';
import {
  LSPORTS_SNAPSHOT_MIN_INTERVAL_MS,
  fetchInPlayFootballFixtureMarkets,
  fetchInPlayFootballScores,
  snapshotWait,
} from '../server/lsports/snapshot.js';

async function main() {
  const flow = String(process.argv[2] ?? '').trim().toLowerCase();
  if (flow !== 'inplay') {
    throw new Error('LSPORTS_SNAPSHOT_INPLAY_ONLY');
  }

  const timestamp = await captureInPlayHeartbeatTimestamp();
  await fetchInPlayFootballScores(timestamp);
  await snapshotWait(LSPORTS_SNAPSHOT_MIN_INTERVAL_MS);
  await fetchInPlayFootballFixtureMarkets(timestamp);
}

main().catch((error) => {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'UNKNOWN';
  console.error(`[lsports] failed=${code}`);
  process.exitCode = 1;
});
