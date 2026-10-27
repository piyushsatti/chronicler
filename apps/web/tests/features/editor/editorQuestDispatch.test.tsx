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
