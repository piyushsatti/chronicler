import { InvariantViolation, type AdapterResult } from '../../../errors/types.js';
import { z } from 'zod';

const featureWireSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  summary: z.string(),
  slug: z.string().min(1),
});

const featuresWireSchema = z.array(featureWireSchema).max(4);

export type FeatureView = z.infer<typeof featureWireSchema>;

const MAX_FEATURES = 4;

export function parseHexFeatures(wire: unknown): AdapterResult<FeatureView[]> {
  const parsed = featuresWireSchema.safeParse(wire);
  if (!parsed.success) {
    if (Array.isArray(wire) && wire.length > MAX_FEATURES) {
      return { ok: false, failure: 'InvalidWire', detail: 'max-4-features' };
    }
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return { ok: true, data: parsed.data };
}

/** Throws InvariantViolation when a create would exceed four features. */
export function assertCanAddFeature(currentCount: number): void {
  if (currentCount >= MAX_FEATURES) {
    throw new InvariantViolation('A hex may have at most 4 Features.');
  }
}
