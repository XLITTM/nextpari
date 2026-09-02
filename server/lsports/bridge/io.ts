import { fetchInPlaySnapshotBody, snapshotWait } from '../snapshot.js';
import type { LsportsRecoveryIo } from '../state/coordinator.js';

export function createLsportsRecoveryIo(env: NodeJS.ProcessEnv = process.env): LsportsRecoveryIo {
  return {
    sleep: snapshotWait,
    fetchSnapshot: (item) => fetchInPlaySnapshotBody(item, env),
  };
}
