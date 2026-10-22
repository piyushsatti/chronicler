import { z } from 'zod';
import type { EditorMeta, FieldSchema } from './types.js';
import { isEditorInstant } from './editorDateTime.js';

export function fieldEmpty(field: FieldSchema, val: unknown): boolean {
  if (field.type === 'toggle') return false;
  if (val == null) return true;
  if (field.type === 'slots') {
    const slots = val as { filled?: number; max?: number };
    return !slots.max || slots.max <= 0;
  }
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === 'string') return val.trim() === '';
  return false;
}

export function schemaErrors(
  schema: FieldSchema[],
  values: EditorMeta,
): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const field of schema) {
    const val = values[field.key];
    if (field.required && fieldEmpty(field, val)) {
      errs[field.key] = 'Required';
      continue;
    }
    if (field.validate) {
      const msg = field.validate(val);
      if (msg) errs[field.key] = msg;
    }
  }
  return errs;
}

const strings = z.array(z.string().min(1));
const questMeta = z.object({
  kinds: strings.min(1),
  regions: strings.min(1),
  genres: strings,
  tags: strings.max(8),
  scheduledAt: z.string().refine(isEditorInstant),
  durationHours: z.coerce.number().positive().finite(),
  slotsMax: z.coerce.number().int().positive(),
  signupType: z.enum(['open', 'application', 'invite']),
  apl: z.union([
    z.literal(''),
    z.null(),
    z.undefined(),
    z.coerce.number().int().positive(),
  ]),
  additionalInfo: z.string().nullish(),
});

export function parseQuestMetadata(value: unknown) {
  return questMeta.safeParse(value);
}

const recovery = z.object({
  meta: z.object({ title: z.string() }).catchall(z.unknown()),
  body: z.string(),
  savedAt: z.string(),
});

export type Snapshot = Pick<z.infer<typeof recovery>, 'meta' | 'body'>;

export function restoreEditorDraft(raw: string | null): Snapshot | null {
  try {
    const parsed = recovery.safeParse(JSON.parse(raw ?? 'null'));
    return parsed.success ? { meta: parsed.data.meta, body: parsed.data.body } : null;
  } catch {
    return null;
  }
}

const summaryRelations = z.object({
  questIds: z.array(z.string().uuid()).min(1),
  characterId: z.string().uuid().nullable().optional().default(null),
});
export function parseSummaryRelations(value: unknown) {
  return summaryRelations.safeParse(value);
}
