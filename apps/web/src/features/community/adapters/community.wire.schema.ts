import { z } from 'zod';

const communityEntryWireSchema = z.object({
  memberId: z.string().uuid(),
  handle: z.string(),
  displayName: z.string(),
  acceptingPlayers: z.boolean().nullable().optional(),
  tagline: z.string().nullable().optional(),
  isDm: z.boolean(),
  roles: z.array(z.string()).optional().default([]),
  avatarUrl: z.string().nullable().optional(),
  status: z.string().optional(),
  availableDays: z.array(z.string()).optional().default([]),
});

export const communityCharactersWireSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      shortCode: z.string().min(1),
      name: z.string(),
      status: z.string().min(1),
      displayIcon: z.string().nullable(),
    }),
  ),
  total: z.number().int().nonnegative(),
});

export const communityDirectoryWireSchema = z.object({
  entries: z.array(communityEntryWireSchema),
  total: z.number().int().nonnegative(),
});
