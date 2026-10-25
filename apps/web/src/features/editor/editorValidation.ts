import { z } from 'zod';
import type { EditorMeta, FieldSchema } from './types.js';
import { isEditorInstant } from './editorDateTime.js';
import { QUEST_KINDS } from './editorConstants.js';

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
  /** Optional series for a new quest; '' means none. */
  arcId: z.union([z.literal(''), z.string().uuid()]).nullish(),
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

/** Earlier builds saved quest kinds in an older vocabulary. A recovered draft keeps
 * only kinds the API accepts, renaming the one that changed spelling, so the chips
 * show what will be sent. */
const RENAMED_QUEST_KINDS: Record<string, string> = { oneshot: 'one_shot' };
const QUEST_KIND_VALUES = new Set(QUEST_KINDS.map(([value]) => value));
function currentQuestKinds(kinds: unknown): unknown {
  if (!Array.isArray(kinds)) return kinds;
  const mapped = kinds
    .map((kind) => (typeof kind === 'string' ? (RENAMED_QUEST_KINDS[kind] ?? kind) : kind))
    .filter((kind): kind is string => typeof kind === 'string' && QUEST_KIND_VALUES.has(kind));
  return [...new Set(mapped)];
}

export function restoreEditorDraft(raw: string | null): Snapshot | null {
  try {
    const parsed = recovery.safeParse(JSON.parse(raw ?? 'null'));
    if (!parsed.success) return null;
    const meta = parsed.data.meta;
    return {
      meta: 'kinds' in meta ? { ...meta, kinds: currentQuestKinds(meta.kinds) } : meta,
      body: parsed.data.body,
    };
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
