import { z } from 'zod';

export const siteStatsWireSchema = z.object({
  totalQuests: z.number().int().nonnegative(),
  activeCharacters: z.number().int().nonnegative(),
});

export type SiteStatsWire = z.infer<typeof siteStatsWireSchema>;
