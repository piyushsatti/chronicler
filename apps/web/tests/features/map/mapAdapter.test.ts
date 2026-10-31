import { describe, expect, it } from 'vitest';
import { graphql, HttpResponse } from 'msw';
import { server } from '../../../src/mocks/server.js';
import { loadMap, loadMapContainment, loadMapDirectory } from '../../../src/features/map/adapters/mapAdapter.js';
import { graphBounds } from '../../../src/features/map/components/PointcrawlViewport.js';
import bad from '../../fixtures/wire/map/bad-missing-field.json';
import good from '../../fixtures/wire/map/goodMap.js';

describe('pointcrawl reads', () => {
  it('loads parent containment without loading other full maps', async () => {
    const requested: unknown[] = [];
    const nodes = Array.from({ length: 201 }, (_, index) => ({
      submapId: index === 200 ? good.id : null,
    }));
    server.use(
      graphql.query('MapContainment', ({ variables }) => {
        requested.push(variables);
        const offset = Number(variables.offset);
        return HttpResponse.json({
          data: {
            map: {
              id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              pointcrawlNodes: nodes.slice(offset, offset + Number(variables.limit)),
            },
          },
        });
      }),
    );
    const containment = await loadMapContainment('PARENT');
    expect(containment.nodes).toHaveLength(201);
    expect(containment.nodes[200]?.submapId).toBe(good.id);
    expect(requested).toEqual([
      { atlasCode: 'PARENT', limit: 200, offset: 0 },
      { atlasCode: 'PARENT', limit: 200, offset: 200 },
    ]);
  });

  it('validates current atlas metadata and server capability', async () => {
    let map: unknown = good;
    server.use(
      graphql.query('MapAtlas', () => HttpResponse.json({ data: { map } })),
    );
    await expect(loadMap('LFC')).resolves.toMatchObject({
      atlasCode: 'LFC',
      canEdit: false,
    });
    map = bad;
    await expect(loadMap('LFC')).rejects.toMatchObject({ kind: 'invalid' });
    map = { ...good, canEdit: 'yes' };
    await expect(loadMap('LFC')).rejects.toMatchObject({ kind: 'invalid' });
  });
  it('reads later node, edge and linked-entry pages without imposing a feature limit', async () => {
    const node = good.pointcrawlNodes[0]!;
    const entry = {
      mapId: good.id,
      nodeId: node.id,
      documentId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      relation: 'location',
      createdAt: good.createdAt,
      createdBy: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    };
    const nodeOffsets: number[] = [];
    const linkOffsets: number[] = [];
    server.use(
      graphql.query('MapAtlas', ({ variables }) => {
        nodeOffsets.push(variables.offset);
        return HttpResponse.json({
          data: {
            map: {
              ...good,
              pointcrawlNodes:
                variables.offset === 0
                  ? Array.from({ length: 200 }, (_, index) => ({
                      ...node,
                      id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, '0')}`,
                      linkedEntries:
                        index === 0 ? Array.from({ length: 50 }, () => entry) : [],
                    }))
                  : [{ ...node, linkedEntries: [] }],
              pointcrawlEdges:
                variables.offset === 0
                  ? Array.from({ length: 200 }, () => good.pointcrawlEdges[0])
                  : [],
            },
          },
        });
      }),
      graphql.query('MapNodeLinks', ({ variables }) => {
        linkOffsets.push(variables.offset);
        return HttpResponse.json({
          data: {
            map: {
              pointcrawlNodes: [
                { id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000000', linkedEntries: [entry] },
              ],
            },
          },
        });
      }),
    );
    const map = await loadMap('opaque atlas');
    expect(map.nodes).toHaveLength(201);
    expect(map.edges).toHaveLength(200);
    expect(map.nodes[0]?.linkedEntries).toHaveLength(51);
    expect(nodeOffsets).toEqual([0, 200]);
    expect(linkOffsets).toEqual([50]);
  });
  it('reads the complete map and region directory', async () => {
    server.use(
      graphql.query('MapDirectory', ({ variables }) =>
        HttpResponse.json({
          data: {
            maps:
              variables.offset === 0 ? Array.from({ length: 50 }, () => good) : [good],
            regions: [],
          },
        }),
      ),
    );
    expect((await loadMapDirectory()).maps).toHaveLength(51);
  });
  it('rejects an inaccessible map and fits empty or coincident coordinates', async () => {
    await expect(loadMap('not-visible')).rejects.toMatchObject({ kind: 'not_found' });
    const bounds = graphBounds([]);
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
    expect(graphBounds(good.pointcrawlNodes).width).toBeGreaterThan(300);
  });
});
