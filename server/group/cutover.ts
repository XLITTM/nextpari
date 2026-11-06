import type { BrandCode } from './catalog.js';
import { GroupControlError } from './errors.js';

/**
 * Feature gates for a later cutover. Both default closed.
 * RYXO registration cannot open until NextPari registration uses this allocator.
 */
export interface CutoverGates {
  nextpariUsesCentralAllocator: boolean;
  ryxoRegistrationEnabled: boolean;
}

export const CUTOVER_GATES_CLOSED: CutoverGates = {
  nextpariUsesCentralAllocator: false,
  ryxoRegistrationEnabled: false,
};

export function assertBrandAllocationGate(brand: BrandCode, gates: CutoverGates): void {
  if (brand === '003') throw new GroupControlError('BRAND_REGISTRATION_DISABLED');
  if (!gates.nextpariUsesCentralAllocator) {
    throw new GroupControlError(
      brand === '002' ? 'RYXO_BEFORE_NEXTPARI_CUTOVER' : 'NEXTPARI_CENTRAL_ALLOCATION_DISABLED',
    );
  }
  if (brand === '002' && !gates.ryxoRegistrationEnabled) {
    throw new GroupControlError('RYXO_REGISTRATION_DISABLED');
  }
}
