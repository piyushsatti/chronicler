import { describe, expect, it } from 'vitest';
import {
  editorTimeZone,
  isEditorInstant,
  resolveSessionTime,
  sessionLocalValue,
} from '../../../src/features/editor/editorDateTime.js';

describe('Quest session civil time resolution', () => {
  it('rejects a New York gap and requires a choice between both overlap instants', () => {
    expect(resolveSessionTime('2026-03-08T02:30', 'America/New_York')).toEqual({
      status: 'gap',
    });
    expect(resolveSessionTime('2026-11-01T01:30', 'America/New_York')).toEqual({
      status: 'ambiguous',
      candidates: [
        { instant: '2026-11-01T05:30:00Z', offset: '-04:00' },
        { instant: '2026-11-01T06:30:00Z', offset: '-05:00' },
      ],
    });
    expect(sessionLocalValue('2026-11-01T06:30:19.123456Z', 'America/New_York')).toBe(
      '2026-11-01T01:30',
    );
  });

  it('resolves half-hour transitions and a skipped civil date without hour assumptions', () => {
    expect(resolveSessionTime('2026-10-04T02:15', 'Australia/Lord_Howe')).toEqual({
      status: 'gap',
    });
    expect(resolveSessionTime('2026-04-05T01:45', 'Australia/Lord_Howe')).toEqual({
      status: 'ambiguous',
      candidates: [
        { instant: '2026-04-04T14:45:00Z', offset: '+11:00' },
        { instant: '2026-04-04T15:15:00Z', offset: '+10:30' },
      ],
    });
    expect(resolveSessionTime('2011-12-30T12:00', 'Pacific/Apia')).toEqual({
      status: 'gap',
    });
  });

  it('uses the saved zone or device fallback and handles midnight rollover', () => {
    expect(editorTimeZone('Asia/Kolkata')).toBe('Asia/Kolkata');
    expect(editorTimeZone(null)).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(resolveSessionTime('2026-10-20T00:15', 'Asia/Kolkata')).toEqual({
      status: 'unique',
      candidate: { instant: '2026-10-19T18:45:00Z', offset: '+05:30' },
    });
    expect(sessionLocalValue('2026-10-19T18:45:00Z', 'Asia/Kolkata')).toBe(
      '2026-10-20T00:15',
    );
  });

  it.each([
    '2026-02-30T12:00',
    '2026-02-29T12:00',
    '2026-10-20T25:00',
    '',
    '2026-10-20',
  ])('rejects invalid civil input %s', (value) => {
    expect(resolveSessionTime(value, 'UTC')).toEqual({ status: 'invalid' });
  });

  it('accepts leap days and validates exact transport precision without rewriting input', () => {
    expect(resolveSessionTime('2028-02-29T12:00', 'UTC')).toMatchObject({
      status: 'unique',
    });
    const source = '2026-11-01T01:30:19.123456-05:00';
    expect(isEditorInstant(source)).toBe(true);
    expect(sessionLocalValue(source, 'America/New_York')).toBe('2026-11-01T01:30');
    expect(source).toBe('2026-11-01T01:30:19.123456-05:00');
    expect(isEditorInstant('2026-10-20T12:00:00.123456001Z')).toBe(false);
    expect(isEditorInstant('2026-10-20T12:00:00.123456000Z')).toBe(true);
    expect(isEditorInstant('2026-02-30T12:00:00Z')).toBe(false);
    expect(isEditorInstant('2026-10-20T12:00:60Z')).toBe(false);
    expect(isEditorInstant('2026-11-01T01:30')).toBe(false);
  });
});
