import { orderLsportsFixtureById, readOrderFixtureArg } from '../server/lsports/sdk/order.js';

const flow = process.argv.includes('prematch') ? 'prematch' : 'inplay';
const fixture = readOrderFixtureArg(process.argv.slice(2));

try {
  const result = await orderLsportsFixtureById(flow, fixture ?? '');
  console.log(
    `[lsports] action=sdk-fixture-order flow=${result.flow} fixtureId=${result.fixtureId} success=${result.success} quotaRemaining=${result.quotaRemaining}`,
  );
  if (result.error) console.log(`[lsports] action=sdk-fixture-order-error fixtureId=${result.fixtureId}`);
  process.exit(result.success === false ? 1 : 0);
} catch (error) {
  const code = error instanceof Error ? error.message : 'UNKNOWN';
  console.error(`[lsports] action=sdk-fixture-order-failed code=${code}`);
  process.exit(1);
}
