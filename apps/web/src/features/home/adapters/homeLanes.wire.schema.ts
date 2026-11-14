import { z } from 'zod';

const discordDeliveryWireSchema = z.object({
  desiredRevision: z.number().int(),
  appliedRevision: z.number().int(),
  overallStatus: z.string().min(1),
});

export const participantWireSchema = z.object({
  memberId: z.string().uuid(),
  characterId: z.string().uuid(),
  characterName: z.string(),
  memberHandle: z.string(),
  memberAvatarUrl: z.string().nullable().optional(),
  status: z.string().min(1),
});

const questBoardItemWireSchema = z.object({
  id: z.string().uuid(),
  shortCode: z.string().min(1),
  status: z.string().min(1),
  scheduledAt: z.string().min(1),
  slotsMax: z.number().int(),
  filledCount: z.number().int(),
  displayStatus: z.string().nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
  regions: z.array(z.string().uuid()).optional().default([]),
  dm: z
    .object({
      handle: z.string(),
      displayName: z.string(),
      avatarUrl: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  briefDocument: z
    .object({
      id: z.string().uuid(),
      slug: z.string(),
      title: z.string(),
      effectiveBody: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  participants: z.array(participantWireSchema).optional().default([]),
  discordDelivery: discordDeliveryWireSchema,
});

export const questListWireSchema = z.object({
  items: z.array(questBoardItemWireSchema),
  total: z.number().int().nonnegative(),
});

export const recentlyClosedTotalWireSchema = z.object({
  total: z.number().int().nonnegative(),
});

export const upcomingQuestWireSchema = z.object({
  id: z.string().uuid(),
  scheduledAt: z.string().datetime({ offset: true }),
});

export const upcomingPageWireSchema = z.object({
  items: z.array(upcomingQuestWireSchema),
  total: z.number().int().nonnegative(),
});

const communityEntryWireSchema = z.object({
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

export const regionCatalogWireSchema = z.array(
  z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
  }),
);
