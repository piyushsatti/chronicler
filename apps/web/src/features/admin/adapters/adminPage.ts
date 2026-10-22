import { z } from 'zod';
import { toAppError } from '../../../errors/toAppError.js';

export type AdminPageRequest = { limit: number; offset: number };
export type AdminPage<T> = { items: T[] } & (
  { total: number } | { total: null; hasNext: boolean }
);

export function adminPage<T>(items: T[], total: unknown): AdminPage<T> {
  const count = z.number().int().nonnegative().safeParse(total);
  if (!count.success) throw toAppError({ failure: 'InvalidWire' }, 'admin:page-total');
  return { items, total: count.data };
}
