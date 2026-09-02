import { fetchInPlayFootballFixtures } from '../server/lsports/snapshot.js';

async function main() {
  const flow = String(process.argv[2] ?? '').trim().toLowerCase();
  if (flow !== 'inplay') {
    throw new Error('LSPORTS_SNAPSHOT_INPLAY_ONLY');
  }
  await fetchInPlayFootballFixtures();
}

main().catch((error) => {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'UNKNOWN';
  console.error(`[lsports] failed=${code}`);
  process.exitCode = 1;
});
