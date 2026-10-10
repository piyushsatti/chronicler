import { z } from 'zod';

export const discordDeliveryWireSchema = z.object({
  desiredRevision: z.number().int(),
  appliedRevision: z.number().int(),
  overallStatus: z.string().min(1),
  nextRetryAt: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
});

export const questBoardItemWireSchema = z.object({
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

export const questBoardWireSchema = z.object({
  items: z.array(questBoardItemWireSchema),
  total: z.number().int().nonnegative(),
});

export const questParticipantWireSchema = z.object({
  memberId: z.string().uuid(),
  characterId: z.string().uuid(),
  characterName: z.string(),
  memberHandle: z.string(),
  status: z.string(),
});

export const questDetailWireSchema = questBoardItemWireSchema.extend({
  participants: z.array(questParticipantWireSchema).optional().default([]),
  durationHours: z.number(),
  genres: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
});
