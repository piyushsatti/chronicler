import { z } from 'zod';

export const calendarEraWireSchema = z.object({
  era: z.object({ abbrev: z.string().trim().min(1) }),
});

export const chronicleAuthorNameWireSchema = z.object({
  memberProfile: z
    .object({
      member: z.object({ handle: z.string(), displayName: z.string() }),
    })
    .nullable(),
});

const chronicleGameDateWireSchema = z.object({
  eraAbbrev: z.string(),
  year: z.number().int(),
  periodName: z.string(),
  periodIndex: z.number().int(),
  periodType: z.string(),
  day: z.number().int(),
});

export const chronicleSummaryDerivedWireSchema = z
  .object({
    quests: z
      .array(
        z.object({
          id: z.string().uuid(),
          shortCode: z.string().trim().min(1),
          title: z.string().nullable(),
        }),
      )
      .optional(),
    regions: z.array(z.object({ id: z.string(), name: z.string() })),
    dms: z.array(z.object({ id: z.string(), displayName: z.string() })).optional(),
    players: z
      .array(
        z.object({
          characterId: z.string(),
          characterShortCode: z.string(),
          characterName: z.string(),
          memberId: z.string(),
          manual: z.boolean(),
        }),
      )
      .optional(),
    occurredAt: z.string().nullable().optional(),
    arc: z.string().nullable().optional(),
    gameDay: z.number().int().nullable().optional(),
    gameDate: chronicleGameDateWireSchema.nullable().optional(),
  })
  .nullable()
  .optional();

const chronicleDocumentWireSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  kind: z.string().min(1).optional(),
  category: z.string().nullable().optional(),
  status: z.string().min(1).optional(),
  visibility: z.string().min(1).optional(),
  title: z.string().min(1),
  effectiveBody: z.string().nullable().optional(),
  frontmatter: z.unknown().optional(),
  updatedAt: z.string().optional(),
  publishedAt: z.string().nullable().optional(),
  author: z
    .object({
      handle: z.string(),
    })
    .nullable()
    .optional(),
  summaryDerived: chronicleSummaryDerivedWireSchema,
});

export const chronicleListWireSchema = z.object({
  items: z.array(
    chronicleDocumentWireSchema.pick({
      id: true,
      slug: true,
      category: true,
      visibility: true,
      title: true,
      effectiveBody: true,
      frontmatter: true,
      author: true,
      updatedAt: true,
      publishedAt: true,
      summaryDerived: true,
    }).extend({ visibility: z.string().min(1) }),
  ),
  total: z.number().int().nonnegative(),
});

export const chronicleDetailWireSchema = chronicleDocumentWireSchema.extend({
  kind: z.literal('summary'),
  canEditBody: z.boolean(),
  canEditMetadata: z.boolean(),
});
