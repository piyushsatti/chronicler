import { describe, expect, it } from 'vitest';
import { formatMemberFor, formatRelativeDate, formatVoiceHours } from '../../../src/features/member/memberFormat.js';

const now = new Date('2026-10-25T12:00:00Z');

describe('memberFormat', () => {
  it('formats member tenure', () => {
    expect(formatMemberFor('2026-10-25T08:00:00Z', now)).toBe('Today');
    expect(formatMemberFor('2026-10-20T12:00:00Z', now)).toBe('5 days');
    expect(formatMemberFor('2026-01-05T10:00:00Z', now)).toBe('9 mo');
    expect(formatMemberFor('2023-10-01T00:00:00Z', now)).toBe('3 yr');
    expect(formatMemberFor(null, now)).toBe('—');
  });

  it('formats relative dates', () => {
    expect(formatRelativeDate('2026-10-23T12:00:00Z', now)).toBe('2 days ago');
    expect(formatRelativeDate('2026-10-25T09:00:00Z', now)).toBe('3 hours ago');
    expect(formatRelativeDate('2026-09-20T12:00:00Z', now)).toBe('5 weeks ago');
    expect(formatRelativeDate('not a date', now)).toBeNull();
  });

  it('formats voice time', () => {
    expect(formatVoiceHours(0)).toBe('0m');
    expect(formatVoiceHours(200)).toBe('3h 20m');
  });
});
