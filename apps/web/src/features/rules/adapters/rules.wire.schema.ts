import { z } from 'zod';

export const ruleDocumentWireSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  kind: z.string().min(1),
  category: z.string().nullable().optional(),
  status: z.string().min(1),
  visibility: z.string().min(1),
  title: z.string().min(1),
  effectiveBody: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  canEditBody: z.boolean().optional(),
  canEditMetadata: z.boolean().optional(),
  author: z
    .object({
      handle: z.string(),
    })
    .nullable()
    .optional(),
});

export const rulesListWireSchema = z.object({
  items: z.array(
    ruleDocumentWireSchema.pick({
      id: true,
      slug: true,
      kind: true,
      category: true,
      title: true,
      effectiveBody: true,
      author: true,
    }),
  ),
  total: z.number().int().nonnegative(),
});
