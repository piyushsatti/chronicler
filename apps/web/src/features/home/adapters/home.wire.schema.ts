import { z } from 'zod';

/** Selected home tree — buckets/documents only (no communityStats, no questBoard). */
export const homeWireSchema = z.object({
  recentByCategory: z.array(
    z.object({
      category: z.string(),
      documents: z.array(
        z.object({
          id: z.string().uuid(),
          slug: z.string().min(1),
          title: z.string().min(1),
          category: z.string().nullable().optional(),
        }),
      ),
    }),
  ),
});

export type HomeWire = z.infer<typeof homeWireSchema>;

export const siteStatsWireSchema = z.object({
  totalMembers: z.number().int().nonnegative(),
});

export type SiteStatsWire = z.infer<typeof siteStatsWireSchema>;
