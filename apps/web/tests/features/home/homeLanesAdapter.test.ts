import { describe, expect, it } from 'vitest';
import {
  mapToQuestCardProps,
  parseHomeLanesWire,
} from '../../../src/features/home/adapters/homeLanesAdapter.js';
import good from '../../fixtures/wire/home/lanes-good.json';
import bad from '../../fixtures/wire/home/lanes-bad-board.json';
import recruitment from '../../fixtures/wire/home/lanes-recruitment.json';

const REGION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
const CHAR_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';
const MEMBER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01';

describe('homeLanesAdapter', () => {
  it('parses recruiting, upcoming, closed, and DMs from wire', () => {
    const result = parseHomeLanesWire(good);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.recruiting[0]?.title).toBe('Siege of Kraghold');
    expect(result.data.dmsAccepting[0]?.handle).toBe('mira');
  });

  it('resolves region names, hook body, participants, and waitlist for the shared quest card', () => {
    const result = parseHomeLanesWire({
      ...good,
      regions: [{ id: REGION_ID, name: 'Ashen Coast' }],
      questBoard: {
        items: [
          {
            ...good.questBoard.items[0],
            tags: ['guild-quest'],
            regions: [REGION_ID],
            briefDocument: {
              ...good.questBoard.items[0].briefDocument,
              effectiveBody: 'Hold the gate until dawn.',
            },
            participants: [
              {
                memberId: MEMBER_ID,
                characterId: CHAR_ID,
                characterName: 'Rook',
                memberHandle: 'rook',
                memberAvatarUrl: null,
                status: 'signed_up',
              },
              {
                memberId: 'dddddddd-dddd-4ddd-8ddd-dddddddddd01',
                characterId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01',
                characterName: 'Waiter',
                memberHandle: 'waiter',
                status: 'waitlisted',
              },
              {
                memberId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
                characterId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02',
                characterName: 'Ghost',
                memberHandle: 'ghost',
                status: 'no_show',
              },
            ],
          },
        ],
        total: 1,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const quest = result.data.recruiting[0];
    expect(quest).toMatchObject({
      regionName: 'Ashen Coast',
      hookText: 'Hold the gate until dawn.',
      waitlistCount: 1,
    });
    const props = mapToQuestCardProps(quest!, {
      memberId: MEMBER_ID,
    });
    expect(props).toMatchObject({
      code: 'Q-101',
      description: 'Hold the gate until dawn.',
      region: 'Ashen Coast',
      gw: true,
      mine: true,
      party: [{ characterName: 'Rook' }],
      totalSlots: 4,
    });
  });

  it('retains the three filling quests in recruiting with their order and labels', () => {
    const result = parseHomeLanesWire(recruitment);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.recruiting.map((item) => item.shortCode)).toEqual([
      'Q-417',
      'Q-419',
      'Q-420',
    ]);
    expect(result.data.recruiting.map((item) => item.status)).toEqual([
      'filling',
      'filling',
      'filling',
    ]);
    expect(result.data.recruiting.map((item) => item.machineStatus)).toEqual([
      'open',
      'open',
      'open',
    ]);
  });

  it('uses only machine-open membership while preserving other lanes', () => {
    const result = parseHomeLanesWire({
      ...good,
      questBoard: {
        ...recruitment.questBoard,
        items: recruitment.questBoard.items.map((item, index) => ({
          ...item,
          status: index === 1 ? 'closed' : 'open',
          displayStatus: index === 1 ? 'open' : 'legacy-custom',
        })),
      },
    });
    const original = parseHomeLanesWire(good);
    expect(result.ok).toBe(true);
    expect(original.ok).toBe(true);
    if (!result.ok || !original.ok) return;
    expect(result.data.recruiting.map((item) => item.shortCode)).toEqual([
      'Q-417',
      'Q-420',
    ]);
    expect(result.data.recruiting.map((item) => item.status)).toEqual([
      'legacy-custom',
      'legacy-custom',
    ]);
    expect(result.data.upcoming).toEqual(original.data.upcoming);
    expect(result.data.totals.recentlyClosed).toBe(original.data.totals.recentlyClosed);
    expect(result.data.dmsAccepting).toEqual(original.data.dmsAccepting);
  });

  it('keeps brief body on board cards and omits it from upcoming', () => {
    const result = parseHomeLanesWire({
      ...good,
      questBoard: {
        items: [
          {
            ...good.questBoard.items[0],
            briefDocument: {
              ...good.questBoard.items[0].briefDocument,
              effectiveBody: 'Hold the gate until dawn.',
            },
          },
        ],
        total: 1,
      },
      quests: {
        items: [
          {
            ...good.quests.items[0],
            briefDocument: {
              id: good.quests.items[0].briefDocument.id,
              slug: good.quests.items[0].briefDocument.slug,
              title: good.quests.items[0].briefDocument.title,
            },
          },
        ],
        total: 1,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mapToQuestCardProps(result.data.recruiting[0]!).description).toBe(
      'Hold the gate until dawn.',
    );
    expect(mapToQuestCardProps(result.data.upcoming[0]!).description).toBeNull();
  });

  it('reads recently closed as a total only', () => {
    const result = parseHomeLanesWire({
      ...good,
      recentlyClosedQuests: { total: 7 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.totals.recentlyClosed).toBe(7);
    expect(result.data).not.toHaveProperty('recentlyClosed');
  });

  it.each(['absent', 'null'] as const)(
    'retains recruitment and falls back for %s display status',
    (display) => {
      const item: Record<string, unknown> = { ...recruitment.questBoard.items[0] };
      if (display === 'absent') delete item.displayStatus;
      else item.displayStatus = null;
      const result = parseHomeLanesWire({
        ...recruitment,
        questBoard: { items: [item], total: 1 },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.recruiting).toHaveLength(1);
      expect(result.data.recruiting[0]).toMatchObject({
        status: 'open',
        machineStatus: 'open',
      });
    },
  );

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['null', null],
    ['non-string', 42],
  ])('rejects %s machine status even with a valid display label', (_label, status) => {
    const item: Record<string, unknown> = {
      ...recruitment.questBoard.items[0],
      displayStatus: 'open',
    };
    if (status === undefined) delete item.status;
    else item.status = status;
    expect(
      parseHomeLanesWire({ ...recruitment, questBoard: { items: [item], total: 1 } }),
    ).toMatchObject({
      ok: false,
      failure: 'InvalidWire',
    });
  });

  it('rejects bad quest board wire', () => {
    const result = parseHomeLanesWire(bad);
    expect(result.ok).toBe(false);
  });
});
