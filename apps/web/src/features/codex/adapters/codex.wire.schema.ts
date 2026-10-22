import { z } from 'zod';
import { CODEX_CATEGORY_VALUES } from '../../../utils/codexCategories.js';

/** Filter order for the Codex directory; categories found in the data are appended. */
export const CODE_CATEGORIES = CODEX_CATEGORY_VALUES;

/** CodexDirectoryResult.items are DocumentType. */
const codexDocumentWireSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  title: z.string().min(1),
  category: z.string().nullable().optional(),
  effectiveBody: z.string().nullable().optional(),
});

export const codexDirectoryWireSchema = z.object({
  items: z.array(codexDocumentWireSchema),
  total: z.number().int().nonnegative(),
});

export const codexCategoriesWireSchema = z.array(
  z.object({
    category: z.string(),
  }),
);

export const codexReferenceWireSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  kind: z.string().min(1),
});
