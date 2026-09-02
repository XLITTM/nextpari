import { fetchInPlaySnapshotBody, fetchPreMatchSnapshotBody, snapshotWait } from '../snapshot.js';
import type { LsportsRecoveryIo } from '../state/coordinator.js';

export function createLsportsRecoveryIo(env: NodeJS.ProcessEnv = process.env): LsportsRecoveryIo {
  return {
    sleep: snapshotWait,
    fetchSnapshot: (item) => fetchInPlaySnapshotBody(item, env),
  };
}

export function createLsportsPrematchRecoveryIo(env: NodeJS.ProcessEnv = process.env): LsportsRecoveryIo {
  return {
    sleep: snapshotWait,
    fetchSnapshot: (item) => fetchPreMatchSnapshotBody(item, env),
  };
}
