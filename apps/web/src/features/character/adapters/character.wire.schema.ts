import { z } from 'zod';

export const characterWireSchema = z.object({
  id: z.string().uuid(),
  shortCode: z.string().min(1),
  name: z.string().min(1),
  status: z.string(),
  ownerId: z.string().uuid().optional(),
  verificationStatus: z.string().optional(),
  backstoryId: z.string().uuid().nullable(),
  regionId: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
  ddbUrl: z.string().nullable().optional(),
  displayIcon: z.string().nullable().optional(),
});

export const backstoryWireSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  lore: z.string(),
});

export const characterListWireSchema = z.object({
  items: z.array(characterWireSchema),
  total: z.number().int().nonnegative(),
});
