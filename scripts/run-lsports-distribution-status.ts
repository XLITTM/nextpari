import { getDistributionStatus } from '../server/lsports/distribution.js';
import type { LsportsFlow } from '../server/lsports/config.js';

function parseFlow(value: string | undefined): LsportsFlow {
  const flow = String(value ?? 'inplay').trim().toLowerCase();
  if (flow === 'inplay' || flow === 'prematch') return flow;
  throw new Error('LSPORTS_FLOW_INVALID');
}

getDistributionStatus(parseFlow(process.argv[2])).catch((error) => {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'UNKNOWN';
  console.error(`[lsports] failed=${code}`);
  process.exitCode = 1;
});
