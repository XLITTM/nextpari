import { runLsportsType31Type35Capture } from '../server/lsports/probe.js';

async function main() {
  const flow = String(process.argv[2] ?? '').trim().toLowerCase();
  if (flow !== 'inplay') {
    throw new Error('LSPORTS_OBSERVE_INPLAY_ONLY');
  }
  await runLsportsType31Type35Capture('inplay');
}

main().catch((error) => {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'UNKNOWN';
  console.error(`[lsports] failed=${code}`);
  process.exitCode = 1;
});
