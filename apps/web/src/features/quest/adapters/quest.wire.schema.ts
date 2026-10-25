import { z } from 'zod';

const discordDeliveryWireSchema = z.object({
  desiredRevision: z.number().int(),
  appliedRevision: z.number().int(),
  overallStatus: z.string().min(1),
  nextRetryAt: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
});

export const questParticipantWireSchema = z.object({
  memberId: z.string().uuid(),
  characterId: z.string().uuid(),
  characterName: z.string(),
  memberHandle: z.string(),
  memberDisplayName: z.string().optional(),
  memberAvatarUrl: z.string().nullable().optional(),
  status: z.string(),
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
  participants: z.array(questParticipantWireSchema).optional().default([]),
  discordDelivery: discordDeliveryWireSchema,
});

export const questBoardWireSchema = z.object({
  items: z.array(questBoardItemWireSchema),
  total: z.number().int().nonnegative(),
});

export const questDetailWireSchema = questBoardItemWireSchema.extend({
  dmId: z.string().uuid(),
  updatedAt: z.string().min(1),
  arcId: z.string().uuid().nullable(),
  arc: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  pointcrawlLinks: z.array(
    z.object({
      pointcrawlNodeId: z.string().uuid(),
      role: z.enum(['expected', 'visited']),
    }),
  ),
  durationHours: z.number(),
  genres: z.array(z.string()).optional().default([]),
});

export const questRegionCatalogWireSchema = z.array(
  z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
  }),
);

export const questBoardChromeWireSchema = z.object({
  total: z.number().int().nonnegative(),
  entries: z.array(
    z.object({
      memberId: z.string().uuid(),
      handle: z.string(),
      displayName: z.string().nullable().optional(),
      acceptingPlayers: z.boolean().nullable().optional(),
      isDm: z.boolean(),
    }),
  ),
});
