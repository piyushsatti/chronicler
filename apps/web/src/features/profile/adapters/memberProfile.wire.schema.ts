import { z } from 'zod';

export const memberProfileWireSchema = z.object({
  member: z.object({
    id: z.string().uuid(),
    handle: z.string().min(1),
    displayName: z.string().min(1),
    avatarUrl: z.string().nullable().optional(),
    roles: z.array(z.string()),
    status: z.string().min(1),
    joinedAt: z.string().min(1),
  }),
  dmProfile: z
    .object({
      memberId: z.string().uuid(),
      tagline: z.string().nullable().optional(),
      philosophy: z.string().nullable().optional(),
      houseRules: z.string().nullable().optional(),
      acceptingPlayers: z.boolean(),
      status: z.string().min(1),
      reviewRevision: z.number().int(),
    })
    .nullable()
    .optional(),
  availability: z.array(
    z.object({
      day: z.string().min(1),
      startTime: z.string().min(1),
      endTime: z.string().min(1),
      note: z.string().nullable().optional(),
    }),
  ),
  activitySummary: z.object({
    voiceMinutes: z.number(),
    messages: z.number(),
    reactions: z.number(),
  }),
});

export type MemberProfileWire = z.infer<typeof memberProfileWireSchema>;
