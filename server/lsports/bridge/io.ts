import { resolveLsportsTransport } from '../sdk/mode.js';
import { fetchSnapshotBodyViaSdk } from '../sdk/snapshotIo.js';
import { fetchInPlaySnapshotBody, fetchPreMatchSnapshotBody, snapshotWait } from '../snapshot.js';
import type { LsportsRecoveryIo } from '../state/coordinator.js';

export function createLsportsRecoveryIo(env: NodeJS.ProcessEnv = process.env): LsportsRecoveryIo {
  const httpFetch = (item: Parameters<LsportsRecoveryIo['fetchSnapshot']>[0]) => fetchInPlaySnapshotBody(item, env);
  if (resolveLsportsTransport(env).transport !== 'sdk') {
    return { sleep: snapshotWait, fetchSnapshot: httpFetch };
  }
  return {
    sleep: snapshotWait,
    fetchSnapshot: async (item) => {
      try {
        return await fetchSnapshotBodyViaSdk('inplay', item, env);
      } catch {
        return httpFetch(item);
      }
    },
  };
}

export function createLsportsPrematchRecoveryIo(env: NodeJS.ProcessEnv = process.env): LsportsRecoveryIo {
  const httpFetch = (item: Parameters<LsportsRecoveryIo['fetchSnapshot']>[0]) => fetchPreMatchSnapshotBody(item, env);
  if (resolveLsportsTransport(env).transport !== 'sdk') {
    return { sleep: snapshotWait, fetchSnapshot: httpFetch };
  }
  return {
    sleep: snapshotWait,
    fetchSnapshot: async (item) => {
      try {
        return await fetchSnapshotBodyViaSdk('prematch', item, env);
      } catch {
        return httpFetch(item);
      }
    },
  };
}
