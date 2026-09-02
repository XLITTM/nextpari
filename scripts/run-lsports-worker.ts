import type { Server } from 'node:http';
import { createLsportsDualHttpServer, resolveLsportsHttpOptions } from '../server/lsports/bridge/http.js';
import { resetLsportsShadowRuntimeForTests, runLsportsShadowBridge } from '../server/lsports/bridge/runtime.js';
import { resetLsportsPrematchRuntimeForTests, runLsportsPrematchBridge } from '../server/lsports/prematch/runtime.js';
import { resolveLsportsTransport } from '../server/lsports/sdk/mode.js';
import { LsportsSnapshotRateLimiter } from '../server/lsports/state/rateLimit.js';

process.env.LSPORTS_WORKER_MODE ??= 'remote';

let inplay: Awaited<ReturnType<typeof runLsportsShadowBridge>> | null = null;
let prematch: Awaited<ReturnType<typeof runLsportsPrematchBridge>> | null = null;
let httpServer: Server | null = null;
let stopping = false;

function logWorker(parts: Record<string, string | number | boolean | null | undefined>): void {
  const body = Object.entries(parts)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  console.log(`[lsports] ${body}`);
}

const shutdown = (exitCode = 0) => {
  if (stopping) return;
  stopping = true;
  const closeHttp = httpServer
    ? new Promise<void>((resolve) => {
      httpServer?.close(() => resolve());
      httpServer = null;
    })
    : Promise.resolve();
  const pending = Promise.all([
    closeHttp,
    prematch?.stop() ?? Promise.resolve(),
    inplay?.stop() ?? Promise.resolve(),
  ]);
  void pending.finally(() => process.exit(exitCode));
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

try {
  const limiter = new LsportsSnapshotRateLimiter();
  const transport = resolveLsportsTransport(process.env);
  logWorker({
    action: 'worker-transport',
    transport: transport.transport,
    shadow: transport.shadow,
  });
  const inplayEnv: NodeJS.ProcessEnv = { ...process.env };
  try {
    inplay = await runLsportsShadowBridge(inplayEnv, {
      listenHttp: false,
      limiter,
      onFatal: () => shutdown(1),
    });
  } catch (error) {
    if (transport.transport !== 'sdk') throw error;
    logWorker({ action: 'sdk-inplay-fallback-direct' });
    resetLsportsShadowRuntimeForTests();
    inplay = await runLsportsShadowBridge({ ...inplayEnv, LSPORTS_TRANSPORT: 'direct' }, {
      listenHttp: false,
      limiter,
      onFatal: () => shutdown(1),
    });
  }
  logWorker({ action: 'worker-inplay-ready', consumers: inplay.consumerCount() });

  const liveInplay = inplay;
  if (!liveInplay) throw new Error('inplay-missing');
  const httpOptions = resolveLsportsHttpOptions(process.env);
  httpServer = createLsportsDualHttpServer(
    () => liveInplay.getPayload(),
    () => prematch?.getPayload() ?? null,
    httpOptions,
    (query) => {
      if ((query.feedType === 'prematch' || query.feed_type === 'prematch') && prematch?.lookupQuote) {
        return prematch.lookupQuote(query);
      }
      return liveInplay.lookupQuote(query);
    },
  );
  await new Promise<void>((resolve, reject) => {
    httpServer?.once('error', reject);
    httpServer?.listen(httpOptions.port, httpOptions.host, resolve);
  });
  logWorker({
    action: 'worker-http',
    http: `${httpOptions.host}:${httpOptions.port}`,
    mode: httpOptions.mode,
    inplay: Boolean(inplay.started()),
    prematch: false,
  });

  try {
    prematch = await runLsportsPrematchBridge(process.env, {
      limiter,
      onFatal: (error) => {
        const code = error instanceof Error ? error.message : 'UNKNOWN';
        logWorker({ action: 'prematch-fatal-isolated', code });
        void prematch?.stop();
        prematch = null;
      },
    });
    logWorker({ action: 'worker-prematch-ready', consumers: prematch.consumerCount() });
  } catch (error) {
    const mode = resolveLsportsTransport(process.env);
    if (mode.transport === 'sdk') {
      logWorker({ action: 'sdk-prematch-fallback-direct' });
      resetLsportsPrematchRuntimeForTests();
      try {
        prematch = await runLsportsPrematchBridge({ ...process.env, LSPORTS_TRANSPORT: 'direct' }, {
          limiter,
          onFatal: (fatal) => {
            const code = fatal instanceof Error ? fatal.message : 'UNKNOWN';
            logWorker({ action: 'prematch-fatal-isolated', code });
            void prematch?.stop();
            prematch = null;
          },
        });
        logWorker({ action: 'worker-prematch-ready', consumers: prematch.consumerCount() });
      } catch (fallbackError) {
        const code = fallbackError && typeof fallbackError === 'object' && 'code' in fallbackError
          ? String((fallbackError as { code: unknown }).code)
          : fallbackError instanceof Error ? fallbackError.message : 'UNKNOWN';
        logWorker({ action: 'worker-prematch-failed', code });
        prematch = null;
      }
    } else {
      const code = error && typeof error === 'object' && 'code' in error
        ? String((error as { code: unknown }).code)
        : error instanceof Error ? error.message : 'UNKNOWN';
      logWorker({ action: 'worker-prematch-failed', code });
      prematch = null;
    }
  }
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code: unknown }).code)
    : error instanceof Error ? error.message : 'UNKNOWN';
  console.error(`[lsports] worker-failed=${code}`);
  shutdown(1);
}
