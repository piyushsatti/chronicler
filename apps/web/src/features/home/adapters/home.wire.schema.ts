import { z } from 'zod';

export const siteStatsWireSchema = z.object({
  totalQuests: z.number().int().nonnegative(),
  activeCharacters: z.number().int().nonnegative(),
});

export type SiteStatsWire = z.infer<typeof siteStatsWireSchema>;

export const recentChroniclesWireSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      slug: z.string().min(1),
      title: z.string().min(1),
      visibility: z.string().min(1),
      author: z.object({ handle: z.string() }).nullable().optional(),
      publishedAt: z.string().nullable().optional(),
      summaryDerived: z
        .object({ occurredAt: z.string().nullable().optional() })
        .nullable()
        .optional(),
    }),
  ),
});
