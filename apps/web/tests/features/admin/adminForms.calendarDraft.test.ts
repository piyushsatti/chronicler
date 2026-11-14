import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { newCalendarPeriodDraft } from '../../../src/features/admin/adapters/adminForms.js';

describe('newCalendarPeriodDraft', () => {
  it('gives two drafts distinct UUID ids without a module counter', () => {
    const first = newCalendarPeriodDraft();
    const second = newCalendarPeriodDraft();
    expect(first.id).not.toBe(second.id);
    expect(z.string().uuid().safeParse(first.id).success).toBe(true);
    expect(z.string().uuid().safeParse(second.id).success).toBe(true);
  });
});
