import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCommunityHub } from '../../../src/features/community/adapters/communityAdapter.js';
import { graphqlRequest } from '../../../src/api/graphql.js';
import { TransportError } from '../../../src/errors/types.js';
import good from '../../fixtures/wire/community/directory-good.json';

vi.mock('../../../src/api/graphql.js', () => ({ graphqlRequest: vi.fn() }));

const directoryMembers = Array.from({ length: 201 }, (_, index) => ({
  ...good.entries[1],
  memberId: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
  handle: `member-${index}`,
  displayName: `Member ${index}`,
  isDm: index === 200,
  roles: index === 200 ? ['dm', 'player'] : ['player'],
  availableDays: index === 200 ? ['Sun'] : [],
}));
const response = (entries: typeof directoryMembers, total: number) => ({
  communityDirectory: { entries, total },
});

describe('loadCommunityHub roster split', () => {
  beforeEach(() => vi.mocked(graphqlRequest).mockReset());

  it('splits dms and players', async () => {
    vi.mocked(graphqlRequest).mockResolvedValueOnce({ communityDirectory: good });
    const hub = await loadCommunityHub();
    expect(hub.dms).toHaveLength(1);
    expect(hub.players).toHaveLength(1);
  });

  it('keeps a dual-role member in both rosters and preserves declared availability', async () => {
    vi.mocked(graphqlRequest).mockResolvedValueOnce({
      communityDirectory: {
        ...good,
        total: 1,
        entries: [
          { ...good.entries[0], roles: ['dm', 'player'], availableDays: ['sat'] },
        ],
      },
    });
    const hub = await loadCommunityHub();
    expect(hub.dms).toHaveLength(1);
    expect(hub.players).toHaveLength(1);
    expect(hub.memberCount).toBe(1);
    expect(hub.players[0]?.availableDays).toEqual(['sat']);
  });
});

describe('loadCommunityHub complete roster', () => {
  beforeEach(() => vi.mocked(graphqlRequest).mockReset());

  it('enumerates every server page before returning availability and both rosters', async () => {
    vi.mocked(graphqlRequest)
      .mockResolvedValueOnce(response(directoryMembers.slice(0, 100), 201))
      .mockResolvedValueOnce(response(directoryMembers.slice(100, 200), 201))
      .mockResolvedValueOnce(response(directoryMembers.slice(200), 201));
    const controller = new AbortController();
    const hub = await loadCommunityHub(controller.signal);
    expect(hub.memberCount).toBe(201);
    expect(hub.players).toHaveLength(201);
    expect(hub.dms.map((member) => member.handle)).toEqual(['member-200']);
    expect(hub.players.at(-1)?.availableDays).toEqual(['Sun']);
    expect(vi.mocked(graphqlRequest).mock.calls.map((call) => call[1])).toEqual([
      { limit: 100, offset: 0 },
      { limit: 100, offset: 100 },
      { limit: 100, offset: 200 },
    ]);
    for (const call of vi.mocked(graphqlRequest).mock.calls)
      expect(call[2]?.signal).toBe(controller.signal);
  });

  it('returns an honest empty roster without requesting another page', async () => {
    vi.mocked(graphqlRequest).mockResolvedValueOnce(response([], 0));
    await expect(loadCommunityHub()).resolves.toEqual({
      dms: [],
      players: [],
      memberCount: 0,
    });
    expect(graphqlRequest).toHaveBeenCalledTimes(1);
  });

  it('rejects a later-page transport failure instead of publishing the first page', async () => {
    vi.mocked(graphqlRequest)
      .mockResolvedValueOnce(response(directoryMembers.slice(0, 100), 201))
      .mockRejectedValueOnce(new TransportError('NETWORK'));
    await expect(loadCommunityHub()).rejects.toMatchObject({ kind: 'network' });
    expect(graphqlRequest).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['empty intermediate page', response([], 101)],
    ['short intermediate page', response(directoryMembers.slice(0, 99), 101)],
    ['more entries than total', response(directoryMembers.slice(0, 2), 1)],
    ['oversized page', response(directoryMembers.slice(0, 101), 101)],
    ['duplicate member', response([directoryMembers[0], directoryMembers[0]], 2)],
    ['out of range total', response([], 2_147_483_648)],
    [
      'invalid member wire',
      { communityDirectory: { entries: [{ memberId: 'bad' }], total: 1 } },
    ],
  ])('rejects %s without presenting an incomplete roster', async (_, wire) => {
    vi.mocked(graphqlRequest).mockResolvedValueOnce(wire);
    await expect(loadCommunityHub()).rejects.toMatchObject({ kind: 'invalid' });
    expect(graphqlRequest).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: 'changed total',
      total: 201,
      wire: response(directoryMembers.slice(100), 202),
    },
    { name: 'stalled page', total: 201, wire: response([], 201) },
    {
      name: 'member repeated across pages',
      total: 101,
      wire: response([directoryMembers[0]], 101),
    },
  ])('rejects a later $name', async ({ total, wire }) => {
    vi.mocked(graphqlRequest)
      .mockResolvedValueOnce(response(directoryMembers.slice(0, 100), total))
      .mockResolvedValueOnce(wire);
    await expect(loadCommunityHub()).rejects.toMatchObject({ kind: 'invalid' });
    expect(graphqlRequest).toHaveBeenCalledTimes(2);
  });

  it('does not dispatch a request for an already cancelled load', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(loadCommunityHub(controller.signal)).rejects.toBeDefined();
    expect(graphqlRequest).not.toHaveBeenCalled();
  });

  it.each([0, 1])(
    'discards all accumulated pages when cancelled after page %i',
    async (page) => {
      const controller = new AbortController();
      if (page === 1)
        vi.mocked(graphqlRequest).mockResolvedValueOnce(
          response(directoryMembers.slice(0, 100), 101),
        );
      vi.mocked(graphqlRequest).mockImplementationOnce(async () => {
        controller.abort();
        return response(
          page === 0
            ? directoryMembers.slice(0, 100)
            : directoryMembers.slice(100, 101),
          101,
        );
      });
      await expect(loadCommunityHub(controller.signal)).rejects.toBeDefined();
      expect(graphqlRequest).toHaveBeenCalledTimes(page + 1);
    },
  );
});
