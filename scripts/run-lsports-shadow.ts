import { runLsportsShadowBridge } from '../server/lsports/bridge/runtime.js';

let runtime: Awaited<ReturnType<typeof runLsportsShadowBridge>> | null = null;
let stopping = false;

const shutdown = (exitCode = 0) => {
  if (stopping) return;
  stopping = true;
  const pending = runtime?.stop() ?? Promise.resolve();
  void pending.finally(() => process.exit(exitCode));
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

try {
  runtime = await runLsportsShadowBridge();
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code: unknown }).code)
    : error instanceof Error ? error.message : 'UNKNOWN';
  console.error(`[lsports] shadow-failed=${code}`);
  shutdown(1);
}
