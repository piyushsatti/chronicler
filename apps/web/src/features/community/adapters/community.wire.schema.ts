import { z } from 'zod';

export const communityEntryWireSchema = z.object({
  memberId: z.string().uuid(),
  handle: z.string(),
  displayName: z.string(),
  acceptingPlayers: z.boolean().nullable().optional(),
  tagline: z.string().nullable().optional(),
  isDm: z.boolean(),
  roles: z.array(z.string()).optional().default([]),
  status: z.string().optional(),
  availableDays: z.array(z.string()).optional().default([]),
});

export const communityDirectoryWireSchema = z.object({
  entries: z.array(communityEntryWireSchema),
  total: z.number().int().nonnegative(),
});
