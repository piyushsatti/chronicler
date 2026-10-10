import { z } from 'zod';

export const documentWireSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  kind: z.string().min(1),
  category: z.string().nullable().optional(),
  status: z.string().min(1),
  visibility: z.string().min(1),
  title: z.string().min(1),
  effectiveBody: z.string().nullable().optional(),
  author: z
    .object({
      handle: z.string(),
    })
    .nullable()
    .optional(),
});
