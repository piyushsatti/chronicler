import { z } from 'zod';

export const arcIdSchema = z.string().uuid();
export function isSeriesIdentity(value: string): boolean {
  return arcIdSchema.safeParse(value).success;
}
