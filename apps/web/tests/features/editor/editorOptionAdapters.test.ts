import { describe, expect, it } from 'vitest';
import { graphql, HttpResponse } from 'msw';
import { server } from '../../../src/mocks/server.js';
import { loadEditorSeriesOptions } from '../../../src/features/editor/adapters/editorSeriesOptionsAdapter.js';
import {
  loadEditorMapOptions,
  loadEditorMapPlaces,
} from '../../../src/features/editor/adapters/editorPointcrawlOptionsAdapter.js';

const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const author = id(999);

describe('Editor quest options', () => {
  it('loads complete server pages for series, maps and audience-filtered places', async () => {
    const offsets: Record<'series' | 'maps' | 'places', number[]> = {
      series: [],
      maps: [],
      places: [],
    };
    const options = Array.from({ length: 101 }, (_, index) => ({
      id: id(index + 1),
      name: `Place ${index + 1}`,
    }));
    server.use(
      graphql.query('EditorSeriesOptions', ({ variables }) => {
        offsets.series.push(variables.offset);
        return HttpResponse.json({
          data: {
            questArcs: {
              items: options
                .slice(variables.offset, variables.offset + 50)
                .map((option) => ({ ...option, createdBy: author })),
              total: 101,
            },
          },
        });
      }),
      graphql.query('EditorMapOptions', ({ variables }) => {
        offsets.maps.push(variables.offset);
        return HttpResponse.json({
          data: {
            maps: options
              .slice(variables.offset, variables.offset + 50)
              .map((option) => ({ ...option, atlasCode: option.id, canEdit: false })),
          },
        });
      }),
      graphql.query('EditorMapPlaces', ({ variables }) => {
        expect(variables.atlasCode).toBe('actual-atlas');
        offsets.places.push(variables.offset);
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
    expect(await loadEditorSeriesOptions(author)).toHaveLength(101);
    expect(await loadEditorMapOptions()).toHaveLength(101);
    expect(await loadEditorMapPlaces('actual-atlas')).toEqual({
      canEdit: false,
      nodes: options,
    });
    expect(offsets).toEqual({
      series: [0, 50, 100],
      maps: [0, 50, 100],
      places: [0, 100],
    });
  });

  it('rejects malformed or non-advancing option results', async () => {
    server.use(
      graphql.query('EditorSeriesOptions', () =>
        HttpResponse.json({
          data: { questArcs: { items: [], total: 1 } },
        }),
      ),
    );
    await expect(loadEditorSeriesOptions(author)).rejects.toMatchObject({
      kind: 'invalid',
    });
    server.use(
      graphql.query('EditorMapOptions', () =>
        HttpResponse.json({
          data: { maps: [{ id: id(1), name: 'Map', atlasCode: 'actual-atlas' }] },
        }),
      ),
    );
    await expect(loadEditorMapOptions()).rejects.toMatchObject({ kind: 'invalid' });
  });
});
