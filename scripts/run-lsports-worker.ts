import { runLsportsShadowBridge } from '../server/lsports/bridge/runtime.js';

process.env.LSPORTS_WORKER_MODE ??= 'remote';

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
  runtime = await runLsportsShadowBridge(process.env, {
    onFatal: () => shutdown(1),
  });
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code: unknown }).code)
    : error instanceof Error ? error.message : 'UNKNOWN';
  console.error(`[lsports] worker-failed=${code}`);
  shutdown(1);
}
