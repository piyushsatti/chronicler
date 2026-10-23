import { describe, expect, it } from 'vitest';
import {
  leDeserialize,
  leKind,
  leLocateInParts,
  leRegions,
  leRenumberOrderedListRun,
  leSerialize,
  leStrip,
  leTypeClass,
} from '../../../src/features/editor/LiveEditor.js';

describe('LiveEditor serializers', () => {
  it('round-trips newlines', () => {
    const raw = 'a\nb\nc';
    expect(leSerialize(leDeserialize(raw))).toBe(raw);
  });

  it('normalizes CRLF', () => {
    expect(leDeserialize('a\r\nb\rc').join('|')).toBe('a|b|c');
  });

  it('renumbers ordered list runs', () => {
    const lines = ['1. one', '2. two', '2. dup', 'not list'];
    expect(leRenumberOrderedListRun(lines, 1, 2)).toEqual([
      '1. one',
      '2. two',
      '3. dup',
      'not list',
    ]);
  });

  it('classifies line kinds', () => {
    expect(leKind('## Heading')).toBe('h2');
    expect(leKind('- item')).toBe('li');
    expect(leKind('1. item')).toBe('ol');
    expect(leKind('> quote')).toBe('quote');
    expect(leKind('---')).toBe('hr');
    expect(leKind('')).toBe('empty');
  });

  it('strips markers', () => {
    expect(leStrip('## Heading', 'h2')).toBe('Heading');
    expect(leStrip('- item', 'li')).toBe('item');
    expect(leStrip('2. item', 'ol')).toBe('item');
  });

  it('locates caret inside multi-line parts', () => {
    expect(leLocateInParts(['aa', 'bbb'], 0)).toEqual({ idx: 0, col: 0 });
    expect(leLocateInParts(['aa', 'bbb'], 3)).toEqual({ idx: 1, col: 0 });
    expect(leLocateInParts(['aa', 'bbb'], 5)).toEqual({ idx: 1, col: 2 });
  });

  it('detects fenced and table regions', () => {
    const lines = [
      'intro',
      '```mermaid',
      'A-->B',
      '```',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
    ];
    expect(leRegions(lines)).toEqual([
      { start: 1, end: 3, kind: 'mermaid' },
      { start: 4, end: 6, kind: 'table' },
    ]);
  });

  it('maps kinds to type classes', () => {
    expect(leTypeClass('## H')).toBe('type-heading');
    expect(leTypeClass('> q')).toBe('type-narrative');
    expect(leTypeClass('plain')).toBe('type-body');
  });
});
