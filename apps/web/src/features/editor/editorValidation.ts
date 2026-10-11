import type { EditorMeta, FieldSchema } from './types.js';

export function fieldEmpty(field: FieldSchema, val: unknown): boolean {
  if (field.type === 'toggle') return false;
  if (val == null) return true;
  if (field.type === 'slots') {
    const slots = val as { filled?: number; max?: number };
    return !slots.max || slots.max <= 0;
  }
  if (field.type === 'datetime') {
    const dt = val as { dt?: string };
    return !dt?.dt;
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
