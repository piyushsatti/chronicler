import { graphql, HttpResponse } from 'msw';
import { server } from '../../../src/mocks/server.js';
import { queryKeys } from '../../../src/api/queryKeys.js';
import listGood from '../../fixtures/wire/quest/list-good.json';
import { describe, expect, it } from 'vitest';
import {
  parseQuestBoard,
  parseQuestList,
  loadQuestList,
  loadQuestBoard,
  parseQuestDetail,
} from '../../../src/features/quest/adapters/questAdapter.js';
import boardBad from '../../fixtures/wire/quest/board-bad.json';
import boardGood from '../../fixtures/wire/quest/board-good.json';
import boardRecruitment from '../../fixtures/wire/quest/board-recruitment.json';
import detailBad from '../../fixtures/wire/quest/detail-bad.json';
import detailGood from '../../fixtures/wire/quest/detail-good.json';

describe('parseQuestBoard', () => {
  it('maps board items and delivery', () => {
    const result = parseQuestBoard(boardGood);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0]?.title).toBe('Siege of Kraghold');
      expect(result.data[0]?.discordDelivery.isTerminal).toBe(false);
    }
  });

  it('preserves all six recruiting identities, order, and distinct display labels', () => {
    const result = parseQuestBoard(boardRecruitment);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((item) => item.shortCode)).toEqual([
      'Q-417',
      'Q-419',
      'Q-420',
      'Q-421',
      'Q-422',
      'Q-425',
    ]);
    expect(result.data.map((item) => item.status)).toEqual([
      'filling',
      'filling',
      'filling',
      'filling',
      'open',
      'filling',
    ]);
    expect(result.data.map((item) => item.machineStatus)).toEqual([
      'open',
      'open',
      'open',
      'open',
      'open',
      'open',
    ]);
  });

  it.each(['absent', 'null'] as const)(
    'falls back to machine status for %s display status',
    (display) => {
      const item: Record<string, unknown> = { ...boardRecruitment.items[0] };
      if (display === 'absent') delete item.displayStatus;
      else item.displayStatus = null;
      const result = parseQuestBoard({ items: [item], total: 1 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data[0]).toMatchObject({ status: 'open', machineStatus: 'open' });
    },
  );

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['null', null],
    ['non-string', 42],
  ])('rejects %s machine status even with a valid display label', (_label, status) => {
    const item: Record<string, unknown> = {
      ...boardRecruitment.items[0],
      displayStatus: 'open',
    };
    if (status === undefined) delete item.status;
    else item.status = status;
    expect(parseQuestBoard({ items: [item], total: 1 })).toMatchObject({
      ok: false,
      failure: 'InvalidWire',
    });
  });

  it('rejects bad wire', () => {
    expect(parseQuestBoard(boardBad).ok).toBe(false);
  });
});

describe('parseQuestDetail', () => {
  it('maps participants', () => {
    const result = parseQuestDetail(detailGood);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.participants).toHaveLength(1);
      expect(result.data.discordDelivery.isTerminal).toBe(true);
      expect(result.data.machineStatus).toBe(detailGood.status);
      expect(result.data.status).toBe(detailGood.displayStatus ?? detailGood.status);
    }
  });

  it('rejects bad wire', () => {
    expect(parseQuestDetail(detailBad).ok).toBe(false);
  });
});


describe('generic quest list', () => {
  it('preserves every server item, its order, and the unpaginated total', () => {
    const result = parseQuestList({ ...listGood, total: 80 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(80);
    expect(result.data.items.map((item) => item.shortCode)).toEqual(listGood.items.map((item) => item.shortCode));
    expect(result.data.items.map((item) => item.machineStatus)).toEqual(['draft', 'played', 'cancelled', 'closed', 'open', 'full', 'open', 'full']);
  });

  it.each([undefined, -1, 1.5, '8', null])('rejects invalid total %s', (total) => {
    expect(parseQuestList({ ...listGood, total })).toMatchObject({ ok: false, failure: 'InvalidWire' });
  });

  it('rejects invalid selected item fields', () => {
    expect(parseQuestList(boardBad)).toMatchObject({ ok: false, failure: 'InvalidWire' });
  });

  it('uses the declared generic query with exact filter and paging variables', async () => {
    let body: { query: string; variables: unknown } | undefined;
    server.use(graphql.query('QuestList', ({ query, variables }) => {
      body = { query, variables };
      return HttpResponse.json({ data: { quests: { items: [listGood.items[7]], total: 81 } } });
    }));
    const request = { filters: { displayStatus: 'scheduled' }, limit: 50, offset: 50 };
    expect(await loadQuestList(request)).toMatchObject({ total: 81, items: [{ shortCode: 'Q-202' }] });
    expect(body?.variables).toEqual(request);
    expect(body?.query).toContain('query QuestList($filters: QuestFiltersInput!, $limit: Int!, $offset: Int!)');
    expect(body?.query).toContain('quests(filters: $filters, limit: $limit, offset: $offset)');
    expect(body?.query).toMatch(/total\s+items/);
    expect(body?.query).not.toContain('questBoard');
  });

  it.each([
    { filters: {}, limit: 50, offset: 50 },
    { filters: {}, limit: 0, offset: 0 },
  ])('allows empty offset/count-only reads: %j', async (request) => {
    server.use(graphql.query('QuestList', () => HttpResponse.json({ data: { quests: { items: [], total: 3 } } })));
    await expect(loadQuestList(request)).resolves.toEqual({ items: [], total: 3 });
  });

  it('retains the old board operation for its other consumers', async () => {
    let variables: unknown;
    server.use(graphql.query('QuestBoard', ({ variables: received }) => {
      variables = received;
      return HttpResponse.json({ data: { questBoard: boardGood } });
    }));
    const board = await loadQuestBoard();
    expect(variables).toEqual({ limit: 50 });
    expect(board.map((item) => item.shortCode)).toEqual(boardGood.items.map((item) => item.shortCode));
  });

  it('keys canonical filters and both page arguments independently from the old board', () => {
    expect(queryKeys.questList({}, 50, 0)).toEqual(queryKeys.questList({ status: undefined, displayStatus: undefined }, 50, 0));
    expect(queryKeys.questList({ displayStatus: 'live', status: 'open' }, 50, 0)).toEqual(queryKeys.questList({ status: 'open', displayStatus: 'live' }, 50, 0));
    const keys = [
      queryKeys.questBoard,
      queryKeys.questList({}, 50, 0),
      queryKeys.questList({ status: 'open' }, 50, 0),
      queryKeys.questList({ displayStatus: 'scheduled' }, 50, 0),
      queryKeys.questList({ displayStatus: 'live' }, 50, 0),
      queryKeys.questList({}, 100, 0),
      queryKeys.questList({}, 50, 50),
    ];
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(keys.length);
  });
});
