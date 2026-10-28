import { createElement, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { graphql, HttpResponse } from 'msw';
import { expect, it } from 'vitest';
import { server } from '../../../src/mocks/server.js';
import { createTestQueryClient } from '../../../src/providers.js';
import { useEditorPublish } from '../../../src/features/editor/hooks/useEditorPublish.js';
import type { EditorLoadResult } from '../../../src/features/editor/adapters/editorLoad.js';

const sourceTime = '2030-01-01T18:00:19.123456+05:30';
const id = '11111111-1111-4111-8111-111111111111';
function initialQuest(mode: 'new' | 'edit'): EditorLoadResult {
  return {
    meta: { title: 'Quest', scheduledAt: sourceTime },
    body: 'Source',
    canEditBody: true,
    canEditMetadata: true,
    status: 'published',
    visibility: 'public',
    policy: null,
    readerIds: [],
    authorId: 'actor',
    frontmatter: {},
    recordId: mode === 'new' ? 'new' : id,
    documentId: 'brief-id',
    redirectHint: 'Q-ONE',
    briefPublished: true,
    updatedAt: '2026-10-20T00:00:00Z',
    documentVersion: 7,
  };
}
function questMeta(scheduledAt: string) {
  return {
    title: 'Quest',
    scheduledAt,
    durationHours: '3',
    slotsMax: '4',
    kinds: ['standard'],
    regions: ['region-id'],
    genres: [],
    tags: [],
    signupType: 'dm_pick',
    additionalInfo: 'Retained note',
  };
}

it.each([
  ['new', sourceTime],
  ['edit', sourceTime],
  ['edit', '2030-01-01T18:00:00Z'],
] as const)(
  'saves a %s Quest at %s with one owning command and no delivery-mode or extra sync request',
  async (mode, scheduledAt) => {
    const operations: string[] = [];
    const operation = mode === 'new' ? 'CreateQuest' : 'UpdateQuest';
    const field = mode === 'new' ? 'createQuest' : 'updateQuest';
    server.use(
      graphql.operation(({ operationName, variables }) => {
        operations.push(operationName);
        if (operationName === operation) {
          expect(variables.input.briefBody).toBe('Edited brief');
          expect(variables.input.additionalInfo).toBe('Retained note');
          if (mode === 'new' || scheduledAt !== sourceTime) {
            expect(variables.input.scheduledAt).toBe(scheduledAt);
          } else {
            expect(variables.input).not.toHaveProperty('scheduledAt');
          }
        }
        return HttpResponse.json({
          data: {
            [field]: { id, shortCode: 'Q-ONE', updatedAt: '2030-01-01T00:00:00Z' },
          },
        });
      }),
    );
    const initial = initialQuest(mode);
    const client = createTestQueryClient();
    const { result } = renderHook(
      () =>
        useEditorPublish({
          typeKey: 'quest',
          mode,
          initial,
          meta: questMeta(scheduledAt),
          body: 'Edited brief',
          onInvalidTitle: () => {},
          onSuccess: () => {},
        }),
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(QueryClientProvider, { client }, children),
      },
    );
    await act(async () => {
      await result.current.mutateAsync(true);
    });
    expect(operations).toEqual([operation]);
  },
);

it.each(['2026-03-08T02:30', '2026-11-01T01:30', '', '2026-02-30T12:00:00Z'])(
  'blocks a directly invoked save of unresolved/invalid session %s before any API command',
  async (scheduledAt) => {
    const operations: string[] = [];
    server.use(
      graphql.operation(({ operationName }) => {
        operations.push(operationName);
        return HttpResponse.json({ data: {} });
      }),
    );
    const client = createTestQueryClient();
    const { result } = renderHook(
      () =>
        useEditorPublish({
          typeKey: 'quest',
          mode: 'edit',
          initial: initialQuest('edit'),
          meta: questMeta(scheduledAt),
          body: 'Edited brief',
          onInvalidTitle: () => {},
          onSuccess: () => {},
        }),
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(QueryClientProvider, { client }, children),
      },
    );
    await act(async () => {
      await expect(result.current.mutateAsync(false)).rejects.toMatchObject({
        userMessage: 'Check the highlighted properties.',
      });
    });
    expect(operations).toEqual([]);
  },
);

const nodeA = '22222222-2222-4222-8222-222222222222';
const nodeB = '33333333-3333-4333-8333-333333333333';
const arcA = '44444444-4444-4444-8444-444444444444';
const arcB = '55555555-5555-4555-8555-555555555555';

async function saveEdit(
  saved: Record<string, unknown>,
  changed: Record<string, unknown>,
) {
  const operations: string[] = [];
  const inputs: Record<string, { input: Record<string, unknown> }> = {};
  server.use(
    graphql.operation(({ operationName, variables }) => {
      operations.push(operationName);
      inputs[operationName] = variables as { input: Record<string, unknown> };
      return HttpResponse.json({
        data: {
          updateQuest: { id, shortCode: 'Q-ONE', updatedAt: '2030-01-01T00:00:00Z' },
          setQuestPointcrawlLinks: [],
        },
      });
    }),
  );
  const initial = { ...initialQuest('edit'), meta: { ...initialQuest('edit').meta, ...saved } };
  const client = createTestQueryClient();
  const { result } = renderHook(
    () =>
      useEditorPublish({
        typeKey: 'quest',
        mode: 'edit',
        initial,
        meta: { ...questMeta(sourceTime), ...changed },
        body: 'Edited brief',
        onInvalidTitle: () => {},
        onSuccess: () => {},
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
  await act(async () => {
    await result.current.mutateAsync(true);
  });
  return { operations, inputs };
}

it('saves a changed series and destinations of an edited Quest, places first', async () => {
  const { operations, inputs } = await saveEdit(
    { arcId: arcA, pointcrawlLinks: [{ pointcrawlNodeId: nodeA, role: 'visited' }] },
    {
      arcId: arcB,
      pointcrawlLinks: [
        { pointcrawlNodeId: nodeA, role: 'visited' },
        { pointcrawlNodeId: nodeB, role: 'expected' },
      ],
    },
  );
  expect(operations).toEqual(['EditorSetQuestPlaces', 'UpdateQuest']);
  expect(inputs.UpdateQuest.input.arcId).toBe(arcB);
});

it('saves a visited destination for a newly created Quest, places after creation', async () => {
  const operations: string[] = [];
  const inputs: Record<string, Record<string, unknown>> = {};
  server.use(
    graphql.operation(({ operationName, variables }) => {
      operations.push(operationName);
      inputs[operationName] = variables as Record<string, unknown>;
      return HttpResponse.json({
        data: {
          createQuest: { id, shortCode: 'Q-ONE', updatedAt: '2030-01-01T00:00:00Z' },
          setQuestPointcrawlLinks: [],
        },
      });
    }),
  );
  const initial = initialQuest('new');
  const client = createTestQueryClient();
  const { result } = renderHook(
    () =>
      useEditorPublish({
        typeKey: 'quest',
        mode: 'new',
        initial,
        meta: {
          ...questMeta(sourceTime),
          pointcrawlLinks: [{ pointcrawlNodeId: nodeA, role: 'visited' }],
        },
        body: 'Edited brief',
        onInvalidTitle: () => {},
        onSuccess: () => {},
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
  await act(async () => {
    await result.current.mutateAsync(true);
  });
  expect(operations).toEqual(['CreateQuest', 'EditorSetQuestPlaces']);
  expect(inputs.EditorSetQuestPlaces.links).toEqual([
    { pointcrawlNodeId: nodeA, role: 'visited' },
  ]);
});

it('takes an edited Quest out of its series when the series is cleared', async () => {
  const { inputs } = await saveEdit({ arcId: arcA }, { arcId: '' });
  expect(inputs.UpdateQuest.input.arcId).toBeNull();
});

/** Saves one edited Quest repeatedly while every quest update fails, recording each places write. */
function failingQuestUpdates() {
  const placeWrites: { links: unknown; key: string }[] = [];
  server.use(
    graphql.operation(({ operationName, variables }) => {
      if (operationName === 'EditorSetQuestPlaces') {
        placeWrites.push({
          links: variables.links,
          key: (variables.meta as { idempotencyKey: string }).idempotencyKey,
        });
        return HttpResponse.json({ data: { setQuestPointcrawlLinks: [] } });
      }
      return HttpResponse.json({ errors: [{ message: 'Temporary failure' }] });
    }),
  );
  const initial = initialQuest('edit');
  initial.meta = { ...initial.meta, pointcrawlLinks: [] };
  const client = createTestQueryClient();
  const { result, rerender } = renderHook(
    ({ links }: { links: { pointcrawlNodeId: string; role: string }[] }) =>
      useEditorPublish({
        typeKey: 'quest',
        mode: 'edit',
        initial,
        meta: { ...questMeta(sourceTime), pointcrawlLinks: links },
        body: 'Edited brief',
        onInvalidTitle: () => {},
        onSuccess: () => {},
      }),
    {
      initialProps: { links: [] as { pointcrawlNodeId: string; role: string }[] },
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
  const save = async (links: { pointcrawlNodeId: string; role: string }[]) => {
    rerender({ links });
    await act(async () => {
      await expect(result.current.mutateAsync(false)).rejects.toBeDefined();
    });
  };
  return { placeWrites, save };
}

it('clears destinations the server stored before a failed quest update, though the loaded Quest had none', async () => {
  const { placeWrites, save } = failingQuestUpdates();
  await save([{ pointcrawlNodeId: nodeA, role: 'expected' }]);
  await save([]);
  expect(placeWrites.map((write) => write.links)).toEqual([
    [{ pointcrawlNodeId: nodeA, role: 'expected' }],
    [],
  ]);
});

it('writes destinations A, B, then A again with a fresh key each time', async () => {
  const a = [{ pointcrawlNodeId: nodeA, role: 'expected' }];
  const b = [{ pointcrawlNodeId: nodeB, role: 'expected' }];
  const { placeWrites, save } = failingQuestUpdates();
  await save(a);
  await save(b);
  await save(a);
  expect(placeWrites.map((write) => write.links)).toEqual([a, b, a]);
  expect(new Set(placeWrites.map((write) => write.key)).size).toBe(3);
});

it('leaves series and destinations alone when an edited Quest did not change them', async () => {
  const link = { pointcrawlNodeId: nodeA, role: 'expected' };
  const { operations, inputs } = await saveEdit(
    { arcId: arcA, pointcrawlLinks: [link] },
    { arcId: arcA, pointcrawlLinks: [link] },
  );
  expect(operations).toEqual(['UpdateQuest']);
  expect(inputs.UpdateQuest.input).not.toHaveProperty('arcId');
});
