import { z } from 'zod';

const discordDeliveryWireSchema = z.object({
  desiredRevision: z.number().int(),
  appliedRevision: z.number().int(),
  overallStatus: z.string().min(1),
});

const questBoardItemWireSchema = z.object({
  id: z.string().uuid(),
  shortCode: z.string().min(1),
  status: z.string().min(1),
  scheduledAt: z.string().min(1),
  slotsMax: z.number().int(),
  filledCount: z.number().int(),
  displayStatus: z.string().nullable().optional(),
  dm: z
    .object({
      handle: z.string(),
      displayName: z.string(),
    })
    .nullable()
    .optional(),
  briefDocument: z
    .object({
      id: z.string().uuid(),
      slug: z.string(),
      title: z.string(),
    })
    .nullable()
    .optional(),
  discordDelivery: discordDeliveryWireSchema,
});

export const questListWireSchema = z.object({
  items: z.array(questBoardItemWireSchema),
  total: z.number().int().nonnegative(),
});

export const communityEntryWireSchema = z.object({
  memberId: z.string().uuid(),
  handle: z.string(),
  displayName: z.string(),
  acceptingPlayers: z.boolean().nullable().optional(),
  tagline: z.string().nullable().optional(),
  isDm: z.boolean(),
});

export const communityDirectoryWireSchema = z.object({
  entries: z.array(communityEntryWireSchema),
  total: z.number().int().nonnegative(),
});
