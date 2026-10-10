import { z } from 'zod';

export const CODE_CATEGORIES = [
  'Entities',
  'Locations',
  'Feature',
  'Rules',
  'Lore',
] as const;

/** CodexDirectoryResult.items are DocumentType. */
export const codexDocumentWireSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  title: z.string().min(1),
  category: z.string().nullable().optional(),
});

export const codexDirectoryWireSchema = z.object({
  items: z.array(codexDocumentWireSchema),
  total: z.number().int().nonnegative(),
});
