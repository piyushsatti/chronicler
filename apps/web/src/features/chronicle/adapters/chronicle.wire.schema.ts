import { z } from 'zod';

const chronicleGameDateWireSchema = z.object({
  eraAbbrev: z.string(),
  year: z.number().int(),
  periodName: z.string(),
  periodIndex: z.number().int(),
  periodType: z.string(),
  day: z.number().int(),
});

const chronicleSummaryDerivedWireSchema = z
  .object({
    regions: z.array(z.object({ id: z.string(), name: z.string() })),
    dms: z.array(z.object({ id: z.string(), displayName: z.string() })).optional(),
    occurredAt: z.string().nullable().optional(),
    arc: z.string().nullable().optional(),
    gameDay: z.number().int().nullable().optional(),
    gameDate: chronicleGameDateWireSchema.nullable().optional(),
  })
  .nullable()
  .optional();

export const chronicleDocumentWireSchema = z.object({
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
      title: true,
      frontmatter: true,
      author: true,
      updatedAt: true,
      summaryDerived: true,
    }),
  ),
  total: z.number().int().nonnegative(),
});
