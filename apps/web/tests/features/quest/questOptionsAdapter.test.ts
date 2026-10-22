import { describe, expect, it } from 'vitest';
import { graphql, HttpResponse } from 'msw';
import { server } from '../../../src/mocks/server.js';
import {
  loadQuestArcOptions,
  loadQuestAuthoringAuthority,
  loadQuestMapOptions,
  loadQuestNodeOptions,
} from '../../../src/features/quest/adapters/questOptionsAdapter.js';

const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

describe('Quest authoring options', () => {
  it('loads complete server pages for arcs, maps and audience-filtered nodes', async () => {
    const offsets: Record<'arcs' | 'maps' | 'nodes', number[]> = {
      arcs: [],
      maps: [],
      nodes: [],
    };
    const options = Array.from({ length: 101 }, (_, index) => ({
      id: id(index + 1),
      name: `Place ${index + 1}`,
    }));
    server.use(
      graphql.query('QuestArcOptions', ({ variables }) => {
        offsets.arcs.push(variables.offset);
        return HttpResponse.json({
          data: {
            questArcs: {
              items: options.slice(variables.offset, variables.offset + 50),
              total: 101,
            },
          },
        });
      }),
      graphql.query('QuestMapOptions', ({ variables }) => {
        offsets.maps.push(variables.offset);
        return HttpResponse.json({
          data: {
            maps: options
              .slice(variables.offset, variables.offset + 50)
              .map((option) => ({ ...option, atlasCode: option.id, canEdit: false })),
          },
        });
      }),
      graphql.query('QuestNodeOptions', ({ variables }) => {
        expect(variables.atlasCode).toBe('actual-atlas');
        offsets.nodes.push(variables.offset);
        return HttpResponse.json({
          data: {
            map: {
              canEdit: false,
              pointcrawlNodes: options.slice(variables.offset, variables.offset + 100),
            },
          },
        });
      }),
    );
    expect(await loadQuestArcOptions()).toHaveLength(101);
    expect(await loadQuestMapOptions()).toHaveLength(101);
    expect(await loadQuestNodeOptions('actual-atlas')).toEqual({
      canEdit: false,
      nodes: options,
    });
    expect(offsets).toEqual({
      arcs: [0, 50, 100],
      maps: [0, 50, 100],
      nodes: [0, 100],
    });
  });

  it('rejects malformed or non-advancing authoring results', async () => {
    server.use(
      graphql.query('QuestArcOptions', () =>
        HttpResponse.json({
          data: { questArcs: { items: [], total: 1 } },
        }),
      ),
    );
    await expect(loadQuestArcOptions()).rejects.toMatchObject({ kind: 'invalid' });
    server.use(
      graphql.query('QuestMapOptions', () =>
        HttpResponse.json({
          data: { maps: [{ id: id(1), name: 'Map', atlasCode: 'actual-atlas' }] },
        }),
      ),
    );
    await expect(loadQuestMapOptions()).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('requires current approved DM authority rather than a held role alone', async () => {
    let status = 'pending';
    server.use(
      graphql.query('QuestAuthoringAuthority', () =>
        HttpResponse.json({
          data: {
            memberProfile: {
              member: { id: id(1), roles: ['dm'], status: 'active' },
              dmProfile: { status },
            },
          },
        }),
      ),
    );
    expect(await loadQuestAuthoringAuthority('actual-handle')).toEqual({
      memberId: id(1),
      canCreate: false,
    });
    status = 'approved';
    expect(await loadQuestAuthoringAuthority('actual-handle')).toEqual({
      memberId: id(1),
      canCreate: true,
    });
  });
});
