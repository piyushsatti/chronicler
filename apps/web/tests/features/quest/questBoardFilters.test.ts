import { describe, expect, it } from 'vitest';
import type { QuestBoardItemView } from '../../../src/features/quest/adapters/questAdapter.js';
import { filterQuestBoardItems } from '../../../src/features/quest/questBoardFilters.js';

function quest(
  cardStatus: QuestBoardItemView['cardStatus'],
  scheduledAt: string,
  status: string = cardStatus,
): QuestBoardItemView {
  return {
    id: cardStatus + scheduledAt,
    shortCode: `Q-${cardStatus}`,
    title: cardStatus,
    hookText: null,
    status,
    machineStatus: cardStatus,
    cardStatus,
    scheduledAt,
    slotsMax: 4,
    filledCount: 1,
    tags: [],
    regionName: null,
    dmHandle: null,
    dmName: null,
    participants: [],
    waitlistCount: 0,
    discordDelivery: {
      desiredRevision: 0,
      appliedRevision: 0,
      overallStatus: 'applied',
      isTerminal: true,
    },
  };
}

describe('quest board filters', () => {
  it('maps Open to open, filling and scheduled, Live to live, and All to every status', () => {
    const statuses: QuestBoardItemView['cardStatus'][] = [
      'open', 'filling', 'scheduled', 'live', 'closed', 'cancelled',
    ];
    const items = statuses.map((status, index) =>
      quest(status, `2026-10-${String(index + 1).padStart(2, '0')}T12:00:00Z`),
    );

    items.push(quest('open', '2026-10-09T12:00:00Z', 'draft'));
    expect(filterQuestBoardItems(items, 'Open', 'All', '', null, new Date('2026-10-23T12:00:00Z')).map((item) => item.cardStatus)).toEqual([
      'open', 'filling', 'scheduled',
    ]);
    expect(filterQuestBoardItems(items, 'Live', 'All', '', null, new Date('2026-10-23T12:00:00Z')).map((item) => item.cardStatus)).toEqual(['live']);
    expect(filterQuestBoardItems(items, 'All', 'All', '', null, new Date('2026-10-23T12:00:00Z'))).toHaveLength(7);
  });

  it('uses local calendar days for Today and Tomorrow', () => {
    const reference = new Date(2026, 9, 23, 12);
    const items = [
      quest('open', new Date(2026, 9, 23, 0).toISOString()),
      quest('open', new Date(2026, 9, 24, 0).toISOString()),
      quest('open', new Date(2026, 9, 25, 0).toISOString()),
    ];

    expect(filterQuestBoardItems(items, 'All', 'Today', '', null, reference)).toEqual([items[0]]);
    expect(filterQuestBoardItems(items, 'All', 'Tomorrow', '', null, reference)).toEqual([items[1]]);
  });

  it('starts This week on Monday and includes Sunday', () => {
    const sunday = new Date(2026, 10, 1, 12);
    const items = [
      quest('open', new Date(2026, 9, 26, 0).toISOString()),
      quest('open', new Date(2026, 10, 1, 23, 59).toISOString()),
      quest('open', new Date(2026, 10, 2, 0).toISOString()),
    ];

    expect(filterQuestBoardItems(items, 'All', 'This week', '', null, sunday)).toEqual(items.slice(0, 2));
  });

  it('uses the viewer zone for Today and Tomorrow across the UTC new year', () => {
    const reference = new Date('2026-01-01T00:30:00Z');
    const items = [
      quest('open', '2025-12-31T23:00:00Z'),
      quest('open', '2026-01-01T09:00:00Z'),
    ];

    expect(filterQuestBoardItems(items, 'All', 'Today', '', 'America/Los_Angeles', reference)).toEqual([items[0]]);
    expect(filterQuestBoardItems(items, 'All', 'Tomorrow', '', 'America/Los_Angeles', reference)).toEqual([items[1]]);
    expect(filterQuestBoardItems(items, 'All', 'Today', '', 'UTC', reference)).toEqual([items[1]]);
  });

  it('changes weeks at viewer-zone Monday midnight, including the DST Sunday', () => {
    const items = [
      quest('open', '2026-03-02T07:59:59Z'),
      quest('open', '2026-03-02T08:00:00Z'),
      quest('open', '2026-03-09T06:59:59Z'),
      quest('open', '2026-03-09T07:00:00Z'),
      quest('open', '2026-03-16T07:00:00Z'),
    ];
    const filterAt = (reference: string) => filterQuestBoardItems(
      items, 'All', 'This week', '', 'America/Los_Angeles', new Date(reference),
    );

    expect(filterAt('2026-03-09T06:59:59Z')).toEqual(items.slice(1, 3));
    expect(filterAt('2026-03-09T07:00:00Z')).toEqual([items[3]]);
  });
});
