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
  pcxp: z.number().int().optional(),
  verificationSubmittedAt: z.string().nullable().optional(),
  ddbMirror: z
    .object({
      level: z.number().int().nullable(),
      xp: z.number().int().nullable(),
      classes: z.string().nullable(),
      species: z.string().nullable(),
      background: z.string().nullable(),
      syncedAt: z.string().nullable(),
    })
    .nullable()
    .optional(),
  ddbUrl: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  displayIcon: z.string().nullable().optional(),
  updatedAt: z.string().min(1).optional(),
});

export const characterListWireSchema = z.object({
  items: z.array(characterWireSchema),
  total: z.number().int().nonnegative(),
});
