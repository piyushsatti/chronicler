import { InvariantViolation } from '../../../errors/types.js';

const MAX_FEATURES = 4;

/** Throws InvariantViolation when a create would exceed four features. */
export function assertCanAddFeature(currentCount: number): void {
  if (currentCount >= MAX_FEATURES) {
    throw new InvariantViolation('A hex may have at most 4 Features.');
  }
}
