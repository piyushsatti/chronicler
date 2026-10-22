import { createElement } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { graphql, HttpResponse } from 'msw';
import { expect, it } from 'vitest';
import { server } from '../../../src/mocks/server.js';
import { createTestQueryClient } from '../../../src/providers.js';
import { useEditorPublish } from '../../../src/features/editor/hooks/useEditorPublish.js';
import {
  loadEditorRecord,
  parseDocumentLoad,
  type EditorLoadResult,
} from '../../../src/features/editor/adapters/editorLoad.js';

const q1 = '11111111-1111-4111-8111-111111111111';
const q2 = '22222222-2222-4222-8222-222222222222';
const character = '33333333-3333-4333-8333-333333333333';
const id = '44444444-4444-4444-8444-444444444444';
function initial(isNew = false): EditorLoadResult {
  return {
    meta: { title: 'Summary', kind: 'summary', questIds: [q1], characterId: character },
    body: isNew ? '' : 'Original source',
    canEditBody: true,
    canEditMetadata: true,
    status: isNew ? 'draft' : 'published',
    visibility: 'dm_only',
    policy: null,
    readerIds: [],
    authorId: 'actor',
    frontmatter: { kept: 'metadata' },
    recordId: isNew ? 'new-context' : id,
    documentId: isNew ? null : id,
    redirectHint: 'summary-slug',
    briefPublished: !isNew,
    updatedAt: null,
    documentVersion: isNew ? null : 7,
    summary: {
      authoring: { questIds: [q1], characterId: character, complete: true },
      quests: [{ id: q1, shortCode: 'Q-1', title: 'First quest' }],
    },
  };
}
function harness() {
  const client = createTestQueryClient();
  return {
    wrapper: ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  };
}
it('reads source attribution rather than roster players and retains incomplete associations', () => {
  const parsed = parseDocumentLoad({
    id,
    slug: 'summary',
    kind: 'summary',
    title: 'Summary',
    status: 'published',
    version: 7,
    effectiveBody: 'Source',
    canEditBody: true,
    canEditMetadata: true,
    summaryDerived: {
      authoring: { questIds: [q1, q2], characterId: character, complete: false },
      quests: [{ id: q1, shortCode: 'Q-1', title: 'Visible' }],
      players: [{ characterId: 'unrelated-roster-character' }],
    },
  });
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.data.meta.questIds).toEqual([q1, q2]);
  expect(parsed.data.meta.characterId).toBe(character);
  expect(parsed.data.summary?.authoring?.complete).toBe(false);
});
it('validates the Quest context and isolates new recovery identity by Quest and character', async () => {
  server.use(
    graphql.query('EditorSummaryQuest', ({ variables }) =>
      HttpResponse.json({
        data: {
          quest: {
            id: variables.id,
            shortCode: variables.id === q1 ? 'Q-1' : 'Q-2',
            briefDocument: { title: 'Quest' },
          },
        },
      }),
    ),
  );
  const first = await loadEditorRecord({
    typeKey: 'summary',
    mode: 'new',
    questId: q1,
    characterId: character,
  });
  const other = await loadEditorRecord({
    typeKey: 'summary',
    mode: 'new',
    questId: q2,
    characterId: character,
  });
  const dm = await loadEditorRecord({ typeKey: 'summary', mode: 'new', questId: q1 });
  expect(first.meta.characterId).toBe(character);
  expect(first.meta.questIds).toEqual([q1]);
  expect(new Set([first.recordId, other.recordId, dm.recordId]).size).toBe(3);
  await expect(
    loadEditorRecord({ typeKey: 'summary', mode: 'new', questId: 'Q-1' }),
  ).rejects.toBeDefined();
  await expect(
    loadEditorRecord({ typeKey: 'summary', mode: 'new', characterId: character }),
  ).rejects.toBeDefined();
});
it('saves current linked source and links after a create succeeded but publication failed', async () => {
  const source = initial(true);
  let version = 0;
  let body = '';
  let savedQuests: string[] = [];
  let publishes = 0;
  const requests: Record<string, unknown>[] = [];
  server.use(
    graphql.mutation('EditorUpsertQuestSummary', ({ variables }) => {
      requests.push(variables.input);
      const input = variables.input;
      if (version === 0) {
        expect(input).not.toHaveProperty('documentId');
        expect(input).not.toHaveProperty('expectedRevision');
      } else {
        expect(input.documentId).toBe(id);
        expect(input.expectedRevision).toBe(version);
      }
      expect(input.characterId).toBe(character);
      expect(input.frontmatter).toEqual({ kept: 'metadata' });
      expect(input.visibility).toBe('dm_only');
      body = input.body;
      savedQuests = input.questIds;
      version++;
      return HttpResponse.json({
        data: { upsertQuestSummary: { id, slug: 'summary-slug', version } },
      });
    }),
    graphql.mutation('PublishDocument', ({ variables }) => {
      expect(variables.expectedRevision).toBe(version);
      if (++publishes === 1)
        return HttpResponse.json({ errors: [{ message: 'Temporary failure' }] });
      version++;
      return HttpResponse.json({
        data: { publishDocument: { id, slug: 'summary-slug', version } },
      });
    }),
    graphql.mutation('CreateDocument', () => {
      throw Error('Linked summary must use owned upsert');
    }),
  );
  const { result, rerender } = renderHook(
    ({ text, questIds }) =>
      useEditorPublish({
        typeKey: 'summary',
        mode: 'new',
        initial: source,
        meta: { ...source.meta, questIds },
        body: text,
        onInvalidTitle: () => {},
        onSuccess: () => {},
      }),
    { ...harness(), initialProps: { text: 'First source', questIds: [q1] } },
  );
  await act(async () => {
    await expect(result.current.mutateAsync(true)).rejects.toBeDefined();
  });
  rerender({ text: '', questIds: [q1, q2] });
  await act(async () => {
    await result.current.mutateAsync(true);
  });
  expect(requests).toHaveLength(2);
  expect(body).toBe('');
  expect(savedQuests).toEqual([q1, q2]);
  expect(version).toBe(3);
});
it('updates a published linked summary with its actual subject, associations and version', async () => {
  const source = initial();
  let input: Record<string, unknown> | undefined;
  server.use(
    graphql.mutation('EditorUpsertQuestSummary', ({ variables }) => {
      input = variables.input;
      return HttpResponse.json({
        data: { upsertQuestSummary: { id, slug: 'summary-slug', version: 8 } },
      });
    }),
    graphql.mutation('EditPublishedDocument', () => {
      throw Error('Linked body must use upsert');
    }),
  );
  const { result } = renderHook(
    () =>
      useEditorPublish({
        typeKey: 'summary',
        mode: 'edit',
        initial: source,
        meta: source.meta,
        body: 'Edited source',
        onInvalidTitle: () => {},
        onSuccess: () => {},
      }),
    harness(),
  );
  await act(async () => {
    await result.current.mutateAsync(true);
  });
  expect(input).toMatchObject({
    documentId: id,
    expectedRevision: 7,
    questIds: [q1],
    characterId: character,
    body: 'Edited source',
    frontmatter: { kept: 'metadata' },
  });
});
it.each([
  { label: 'hidden body', body: null, canEditBody: false, complete: true, text: '' },
  {
    label: 'incomplete links',
    body: 'Original source',
    canEditBody: true,
    complete: false,
    text: 'New allowed source',
  },
])(
  'preserves links for $label using the separately authorized Document seam',
  async ({ body, canEditBody, complete, text }) => {
    const source = initial();
    source.body = body;
    source.canEditBody = canEditBody;
    source.summary!.authoring!.complete = complete;
    let input: Record<string, unknown> | undefined;
    server.use(
      graphql.mutation('EditorUpsertQuestSummary', () => {
        throw Error('Incomplete source cannot replace relations');
      }),
      graphql.mutation('EditPublishedDocument', ({ variables }) => {
        input = variables.input;
        return HttpResponse.json({
          data: { editPublishedDocument: { id, slug: 'summary-slug', version: 8 } },
        });
      }),
    );
    const { result } = renderHook(
      () =>
        useEditorPublish({
          typeKey: 'summary',
          mode: 'edit',
          initial: source,
          meta: { ...source.meta, title: 'Metadata edit' },
          body: text,
          onInvalidTitle: () => {},
          onSuccess: () => {},
        }),
      harness(),
    );
    await act(async () => {
      await result.current.mutateAsync(true);
    });
    expect(input).toEqual({
      title: 'Metadata edit',
      expectedRevision: 7,
      ...(canEditBody ? { body: text } : {}),
    });
  },
);
it('omits unchanged linked body and relationships for metadata-only saves', async () => {
  const source = initial();
  let input: Record<string, unknown> | undefined;
  server.use(
    graphql.mutation('EditorUpsertQuestSummary', () => {
      throw Error('Unchanged relationships must not be rewritten');
    }),
    graphql.mutation('EditPublishedDocument', ({ variables }) => {
      input = variables.input;
      return HttpResponse.json({
        data: { editPublishedDocument: { id, slug: 'summary-slug', version: 8 } },
      });
    }),
  );
  const { result } = renderHook(
    () =>
      useEditorPublish({
        typeKey: 'summary',
        mode: 'edit',
        initial: source,
        meta: { ...source.meta, title: 'New title' },
        body: 'Original source',
        onInvalidTitle: () => {},
        onSuccess: () => {},
      }),
    harness(),
  );
  await act(async () => {
    await result.current.mutateAsync(true);
  });
  expect(input).toEqual({ title: 'New title', expectedRevision: 7 });
});
it('rejects an empty linked Quest choice before saving', async () => {
  const source = initial();
  const { result } = renderHook(
    () =>
      useEditorPublish({
        typeKey: 'summary',
        mode: 'edit',
        initial: source,
        meta: { ...source.meta, questIds: [] },
        body: 'Original source',
        onInvalidTitle: () => {},
        onSuccess: () => {},
      }),
    harness(),
  );
  await act(async () => {
    await expect(result.current.mutateAsync(true)).rejects.toMatchObject({
      userMessage: 'Choose at least one Quest and a valid character.',
    });
  });
});
