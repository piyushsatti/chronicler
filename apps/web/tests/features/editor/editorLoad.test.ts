import { describe, expect, it } from 'vitest';
import { graphql, HttpResponse } from 'msw';
import {
  loadEditorRecord,
  parseDocumentLoad,
  parseQuestLoad,
} from '../../../src/features/editor/adapters/editorLoad.js';
import { leDeserialize, leSerialize } from '../../../src/features/editor/LiveEditor.js';
import { server } from '../../../src/mocks/server.js';
import { schemaForType } from '../../../src/features/editor/editorSchemas.js';
import { schemaErrors } from '../../../src/features/editor/editorValidation.js';

describe('qualified Codex category initialization', () => {
  it.each([
    ['artifact', 'Artifact'],
    ['Artifact', 'Artifact'],
    ['event', 'Event'],
    ['Event', 'Event'],
    ['lore', 'Lore'],
    ['Lore', 'Lore'],
    ['npc', 'NPC'],
    ['NPC', 'NPC'],
    ['nPc', 'NPC'],
    ['faction', 'Faction'],
    ['Faction', 'Faction'],
    ['entities', 'Entities'],
    ['Entities', 'Entities'],
    ['feature', 'Feature'],
    ['Feature', 'Feature'],
    ['locations', 'Locations'],
    ['Locations', 'Locations'],
  ])('loads %s as the supported %s authoring category', async (category, expected) => {
    const loaded = await loadEditorRecord({ typeKey: 'codex', mode: 'new', category });
    expect(loaded.meta.category).toBe(expected);
    const meta = {
      ...loaded.meta,
      title: 'Qualified Codex draft',
      ...(expected === 'Feature' ? { hex: 'LFR7008' } : {}),
    };
    expect(schemaErrors(schemaForType('codex', meta), meta)).toEqual({});
  });

  it('requires a Feature to name its hex and fills it from the map link', async () => {
    const blank = await loadEditorRecord({
      typeKey: 'codex',
      mode: 'new',
      category: 'Feature',
    });
    const meta = { ...blank.meta, title: 'Old Mill' };
    expect(schemaErrors(schemaForType('codex', meta), meta)).toHaveProperty('hex');
    const linked = await loadEditorRecord({
      typeKey: 'codex',
      mode: 'new',
      category: 'Feature',
      hex: 'lfr7008',
    });
    expect(linked.meta.hex).toBe('LFR7008');
  });

  it.each(['Rules', 'Unknown', '', undefined])(
    'retains unsupported qualifier %s without guessing',
    async (category) => {
      const loaded = await loadEditorRecord({
        typeKey: 'codex',
        mode: 'new',
        category,
      });
      expect(loaded.meta.category).toBe(category ?? null);
    },
  );

  it.each(['Entities', 'Locations', 'Artifact'])(
    'preserves stored %s when the edit qualifier names another category',
    async (category) => {
      const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      const frontmatter = { aliases: ['Retained alias'], opaque: { value: 7 } };
      const requests: unknown[] = [];
      server.use(
        graphql.query('EditorDocumentById', ({ variables }) => {
          requests.push(variables);
          return HttpResponse.json({
            data: {
              documentById: {
                id,
                slug: 'retained-codex-record',
                kind: 'codex_entry',
                category,
                title: 'Retained record',
                version: 7,
                effectiveBody: 'Retained body',
                frontmatter,
              },
            },
          });
        }),
      );
      const loaded = await loadEditorRecord({
        typeKey: 'codex',
        mode: 'edit',
        id,
        category: 'npc',
      });
      expect(requests).toEqual([{ id }]);
      expect(loaded.recordId).toBe(id);
      expect(loaded.meta.category).toBe(category);
      expect(loaded.body).toBe('Retained body');
      expect(loaded.frontmatter).toEqual(frontmatter);
      expect(
        schemaForType('codex', loaded.meta).find((field) => field.key === 'category'),
      ).toMatchObject({ type: 'text', readOnly: true });
    },
  );
});

describe('Quest editor identifier routing', () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const shortCode = 'quest-fixture-application';
  it.each([
    {
      name: 'long hyphenated shortCode',
      input: { code: shortCode },
      variables: { id: null, shortCode },
    },
    {
      name: 'UUID in the code route parameter',
      input: { code: id },
      variables: { id, shortCode: null },
    },
    {
      name: 'UUID in the id route parameter',
      input: { id },
      variables: { id, shortCode: null },
    },
  ])('sends exact query variables for $name', async ({ input, variables }) => {
    const requests: unknown[] = [];
    server.use(
      graphql.query('EditorQuestLoad', ({ variables }) => {
        requests.push(variables);
        return HttpResponse.json({
          data: {
            quest: {
              id,
              shortCode,
              scheduledAt: '2026-10-22T18:00:37.123456Z',
              durationHours: 3,
              slotsMax: 1,
              updatedAt: '2026-10-20T18:00:00Z',
              briefDocument: {
                id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                title: 'Application quest',
                status: 'published',
                version: 7,
                canEditBody: true,
                canEditMetadata: true,
                effectiveBody: 'Retained brief',
              },
            },
          },
        });
      }),
    );
    const loaded = await loadEditorRecord({ typeKey: 'quest', mode: 'edit', ...input });
    expect(requests).toEqual([variables]);
    expect(loaded.recordId).toBe(id);
    expect(loaded.meta.shortCode).toBe(shortCode);
    expect(loaded.redirectHint).toBe(shortCode);
    expect(loaded.meta.scheduledAt).toBe('2026-10-22T18:00:37.123456Z');
    expect(loaded.body).toBe('Retained brief');
    expect(loaded.documentVersion).toBe(7);
  });
});

describe('editorLoad parsers', () => {
  it('parses quest load with brief body', () => {
    const result = parseQuestLoad({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      shortCode: 'Q-1',
      scheduledAt: '2026-10-15T18:00:00Z',
      durationHours: 3,
      slotsMax: 4,
      updatedAt: '2026-10-15T17:00:00Z',
      briefDocument: {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        title: 'Salt Stair',
        version: 1,
        effectiveBody: 'Body text',
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.meta.title).toBe('Salt Stair');
      expect(result.data.meta.shortCode).toBe('Q-1');
      expect(result.data.body).toBe('Body text');
      expect(result.data.documentId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
      expect(result.data.updatedAt).toBe('2026-10-15T17:00:00Z');
      expect(result.data.documentVersion).toBe(1);
    }
  });

  it('parses document load', () => {
    const result = parseDocumentLoad({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      slug: 'guide-1',
      kind: 'guide',
      title: 'Guide',
      version: 2,
      effectiveBody: 'Rules body',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.redirectHint).toBe('guide-1');
      expect(result.data.body).toBe('Rules body');
      expect(result.data.documentVersion).toBe(2);
    }
  });

  it('rejects bad quest wire', () => {
    expect(parseQuestLoad({ shortCode: 'Q-1' }).ok).toBe(false);
  });
});

describe('LiveEditor serialize', () => {
  it('round-trips lines', () => {
    const src = 'a\nb\nc';
    expect(leSerialize(leDeserialize(src))).toBe(src);
  });
});

it.each([undefined, null, false])(
  'fails closed when canEditBody is %s without manufacturing replacement source',
  (canEditBody) => {
    const result = parseDocumentLoad({
      id: 'doc',
      slug: 'doc',
      kind: 'rule',
      title: 'Rule',
      version: 1,
      effectiveBody: null,
      canEditBody,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.body).toBeNull();
      expect(result.data.canEditBody).toBe(false);
      expect(result.data.canEditMetadata).toBe(false);
    }
  },
);
it('loads Quest additional info from Document frontmatter', () => {
  const result = parseQuestLoad({
    id: 'quest',
    shortCode: 'Q-1',
    scheduledAt: '2026-10-15T18:00:00Z',
    durationHours: 3,
    slotsMax: 4,
    updatedAt: '2026-10-15T17:00:00Z',
    briefDocument: {
      id: 'doc',
      title: 'Brief',
      version: 1,
      canEditMetadata: true,
      canEditBody: true,
      effectiveBody: '',
      frontmatter: { additional_info: 'Author notes' },
    },
  });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.data.meta.additionalInfo).toBe('Author notes');
    expect(result.data.canEditBody).toBe(true);
  }
});
