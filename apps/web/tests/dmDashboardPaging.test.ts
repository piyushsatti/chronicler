import { graphql, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { loadDmDashboard } from '../src/features/admin/adapters/dmDashboardAdapter.js';
import { server } from '../src/mocks/server.js';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const memberId = id(1000);
const request = { token: 'test-session', assertCurrent: () => undefined };
const quest = (value: number) => ({
  id: id(value), shortCode: `Q-${value}`, status: 'open', scheduledAt: null,
  slotsMax: 5, filledCount: 0, briefDocument: { title: `Quest ${value}` },
});
const data = {
  dmStats: null,
  questArcs: { total: 0, items: [] },
  documents: { total: 0, items: [] },
};

describe('DM overview complete quest reads', () => {
  it.each([
    { problem: 'stalled page', total: 2, items: [] },
    { problem: 'changed total', total: 3, items: [quest(2)] },
    { problem: 'duplicate quest', total: 2, items: [quest(1)] },
    { problem: 'too many quests', total: 2, items: [quest(2), quest(3)] },
  ])('rejects a $problem instead of presenting an incomplete count', async ({ total, items }) => {
    server.use(graphql.query('DmDashboard', ({ variables }) => HttpResponse.json({ data: {
      ...data,
      quests: variables.questOffset === 0 ? { total: 2, items: [quest(1)] } : { total, items },
    } })));
    await expect(loadDmDashboard(memberId, 0, 0, request, 'all')).rejects.toMatchObject({ kind: 'invalid' });
  });
});
