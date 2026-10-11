import { describe, expect, it } from 'vitest';
import { parseHomeLanesWire } from '../../../src/features/home/adapters/homeLanesAdapter.js';
import good from '../../fixtures/wire/home/lanes-good.json';
import bad from '../../fixtures/wire/home/lanes-bad-board.json';
import recruitment from '../../fixtures/wire/home/lanes-recruitment.json';

describe('homeLanesAdapter', () => {
  it('parses recruiting, upcoming, closed, and DMs from wire', () => {
    const result = parseHomeLanesWire(good);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.recruiting[0]?.title).toBe('Siege of Kraghold');
    expect(result.data.dmsAccepting[0]?.handle).toBe('mira');
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
    expect(result.data.recentlyClosed).toEqual(original.data.recentlyClosed);
    expect(result.data.dmsAccepting).toEqual(original.data.dmsAccepting);
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
