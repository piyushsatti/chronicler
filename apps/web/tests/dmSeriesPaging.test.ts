import { graphql, HttpResponse, type GraphQLResponseResolver } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { loadDmDashboard } from '../src/features/admin/adapters/dmDashboardAdapter.js';
import { loadProfileDmDetails } from '../src/features/profile/adapters/profileDmAdapter.js';
import { server } from '../src/mocks/server.js';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const memberId = id(1000);
const arcs = Array.from({ length: 101 }, (_, index) => ({
  id: id(index + 1),
  name: `Series ${index + 1}`,
  createdBy: index === 0 || index === 100 ? memberId : id(1001),
  questCount: index,
}));
const empty = { dmStats: { sessionCount: 3 }, quests: { items: [], total: 0 }, documents: { items: [], total: 0 } };
const request = { token: 'test-session', assertCurrent: () => undefined };

describe.each([
  { operation: 'DmDashboard', load: async () => (await loadDmDashboard(memberId, 25, 50, request)).series },
  { operation: 'ProfileDmDetails', load: async () => (await loadProfileDmDetails(memberId, 20)).questArcs.items },
])('$operation series pagination', ({ operation, load }) => {
  it.each([0, 2])('makes only the initial request when it contains all %i arcs', async (total) => {
    const initial = vi.fn<GraphQLResponseResolver>(() => HttpResponse.json({ data: { ...empty, questArcs: { total, items: arcs.slice(0, total) } } }));
    const followup = vi.fn<GraphQLResponseResolver>(() => HttpResponse.json({ data: { questArcs: { total, items: [] } } }));
    server.use(graphql.query(operation, initial), graphql.query('QuestArcsPage', followup));
    expect(await load()).toEqual(total === 0 ? [] : [arcs[0]]);
    expect(initial).toHaveBeenCalledTimes(1);
    expect(followup).not.toHaveBeenCalled();
  });

  it('requests only arc fields after the first page and stops at the advertised total', async () => {
    const initial = vi.fn<GraphQLResponseResolver>(() => HttpResponse.json({ data: { ...empty, questArcs: { total: arcs.length, items: arcs.slice(0, 50) } } }));
    const offsets: number[] = [];
    server.use(
      graphql.query(operation, initial),
      graphql.query('QuestArcsPage', ({ query, variables }) => {
        expect(query).not.toMatch(/\b(dmStats|documents|quests)\b/);
        expect(Object.keys(variables)).toEqual(['offset']);
        offsets.push(variables.offset);
        return HttpResponse.json({ data: { questArcs: { total: arcs.length, items: arcs.slice(variables.offset, variables.offset + 50) } } });
      }),
    );
    expect(await load()).toEqual([arcs[0], arcs[100]]);
    expect(initial).toHaveBeenCalledTimes(1);
    expect(offsets).toEqual([50, 100]);
  });

  it.each([
    { problem: 'stalled', total: 2, items: [] },
    { problem: 'changed total', total: 3, items: [arcs[1]] },
    { problem: 'duplicate arc', total: 2, items: [arcs[0]] },
    { problem: 'too many arcs', total: 2, items: [arcs[1], arcs[2]] },
  ])('rejects $problem pagination', async ({ total, items }) => {
    server.use(
      graphql.query(operation, () => HttpResponse.json({ data: { ...empty, questArcs: { total: 2, items: [arcs[0]] } } })),
      graphql.query('QuestArcsPage', () => HttpResponse.json({ data: { questArcs: { total, items } } })),
    );
    await expect(load()).rejects.toMatchObject({ kind: 'invalid' });
  });
});
