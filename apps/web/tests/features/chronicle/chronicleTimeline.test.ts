import { describe, expect, it } from 'vitest';
import {
  filterChroniclesByRange,
  groupChroniclesByPublicationDate,
  sortChroniclesByPublicationDate,
} from '../../../src/features/chronicle/chronicleTimeline.js';
import type { ChronicleListItemView } from '../../../src/features/chronicle/adapters/chronicleAdapter.js';

function entry(id: string, publishedAt: string | null): ChronicleListItemView {
  return {
    id,
    slug: id,
    title: id,
    category: 'session',
    visibility: 'public',
    authorHandle: null,
    authorDisplayName: null,
    excerpt: null,
    tags: [],
    region: null,
    regionIds: [],
    arc: null,
    occurredAt: null,
    gameDay: null,
    gameDate: null,
    updatedAt: null,
    publishedAt,
  };
}

describe('Chronicle publication timeline', () => {
  const entries = [
    entry('before-week', '2026-10-18T23:59:00Z'),
    entry('monday', '2026-10-19T00:00:00Z'),
    entry('sunday', '2026-10-25T23:59:00Z'),
    entry('next-week', '2026-10-26T00:00:00Z'),
    entry('undated', null),
  ];

  it('filters Monday through Sunday in the viewer’s local calendar week', () => {
    const visible = filterChroniclesByRange(
      entries,
      'week',
      new Date('2026-10-25T12:00:00Z'),
      'UTC',
    );
    expect(visible.map(({ id }) => id)).toEqual(['sunday', 'monday']);
  });

  it('filters a calendar month and keeps all mode inclusive', () => {
    expect(
      filterChroniclesByRange(
        entries,
        'month',
        new Date('2026-10-25T12:00:00Z'),
        'UTC',
      ).map(({ id }) => id),
    ).toEqual(['next-week', 'sunday', 'monday', 'before-week']);
    expect(filterChroniclesByRange(entries, 'all', new Date('2026-10-25T12:00:00Z'), 'UTC'))
      .toHaveLength(5);
  });

  it('sorts and groups by publication date with undated entries last', () => {
    expect(sortChroniclesByPublicationDate(entries).map(({ id }) => id)).toEqual([
      'next-week',
      'sunday',
      'monday',
      'before-week',
      'undated',
    ]);
    expect(groupChroniclesByPublicationDate(entries, 'UTC').map(({ date, entries: group }) => [
      date,
      group.map(({ id }) => id),
    ])).toEqual([
      ['2026-10-26', ['next-week']],
      ['2026-10-25', ['sunday']],
      ['2026-10-19', ['monday']],
      ['2026-10-18', ['before-week']],
      [null, ['undated']],
    ]);
  });
});
