import { runLsportsProbe, type LsportsFlow } from '../server/lsports/probe.js';

function parseFlow(value: string | undefined): LsportsFlow | 'both' {
  const flow = String(value ?? 'inplay').trim().toLowerCase();
  if (flow === 'inplay' || flow === 'prematch' || flow === 'both') return flow;
  throw new Error('LSPORTS_FLOW_INVALID');
}

async function main() {
  const mode = parseFlow(process.argv[2]);
  const flows: LsportsFlow[] = mode === 'both' ? ['inplay', 'prematch'] : [mode];
  for (const flow of flows) {
    await runLsportsProbe(flow);
  }
}

main().catch((error) => {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'UNKNOWN';
  console.error(`[lsports] failed=${code}`);
  process.exitCode = 1;
});
