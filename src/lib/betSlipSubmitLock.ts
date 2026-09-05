export function createBetSlipSubmitLock() {
  let busy = false;

  return {
    tryAcquire(): boolean {
      if (busy) return false;
      busy = true;
      return true;
    },
    release() {
      busy = false;
    },
    get pending() {
      return busy;
    },
  };
}
