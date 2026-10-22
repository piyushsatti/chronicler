import { createElement } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { graphql, HttpResponse } from 'msw';
import { expect, it } from 'vitest';
import { server } from '../../../src/mocks/server.js';
import { createTestQueryClient } from '../../../src/providers.js';
import { useEditorPublish } from '../../../src/features/editor/hooks/useEditorPublish.js';
import type { EditorLoadResult } from '../../../src/features/editor/adapters/editorLoad.js';

it.each([
  {
    label: 'an existing draft restored to its original body',
    isNew: false,
    bodies: ['First edit', 'Original source'],
  },
  {
    label: 'a newly created draft cleared after publication fails',
    isNew: true,
    bodies: ['First edit', ''],
  },
  {
    label: 'further edits after several acknowledged saves',
    isNew: false,
    bodies: ['First edit', 'Second edit', 'Original source'],
  },
])('publishes the displayed body for $label', async ({ isNew, bodies }) => {
  const initial: EditorLoadResult = {
    meta: { title: 'Guide', category: 'guide', kind: 'rule', slug: 'guide' },
    body: isNew ? '' : 'Original source',
    canEditBody: true,
    canEditMetadata: true,
    status: 'draft',
    visibility: 'public',
    policy: [],
    readerIds: [],
    authorId: 'actor',
    frontmatter: {},
    recordId: isNew ? 'new' : 'doc',
    documentId: isNew ? null : 'doc',
    redirectHint: 'guide',
    briefPublished: false,
    updatedAt: null,
    documentVersion: isNew ? null : 1,
  };
  let storedBody = initial.body;
  let version = isNew ? 0 : 1;
  let createCount = 0;
  let publishes = 0;
  const updatedBodies: unknown[] = [];
  server.use(
    graphql.mutation('CreateDocument', ({ variables }) => {
      createCount++;
      storedBody = variables.input.body;
      version = 1;
      return HttpResponse.json({
        data: { createDocument: { id: 'doc', slug: 'guide', version } },
      });
    }),
    graphql.mutation('UpdateDocument', ({ variables }) => {
      expect(variables.input.expectedRevision).toBe(version);
      updatedBodies.push(variables.input.body);
      if ('body' in variables.input) storedBody = variables.input.body;
      version++;
      return HttpResponse.json({
        data: { updateDocument: { id: 'doc', slug: 'guide', version } },
      });
    }),
    graphql.mutation('PublishDocument', ({ variables }) => {
      expect(variables.expectedRevision).toBe(version);
      publishes++;
      if (publishes < bodies.length)
        return HttpResponse.json({
          errors: [{ message: 'Publication temporarily failed' }],
        });
      version++;
      return HttpResponse.json({
        data: { publishDocument: { id: 'doc', slug: 'guide', version } },
      });
    }),
  );
  const client = createTestQueryClient();
  const { result, rerender } = renderHook(
    ({ body }) =>
      useEditorPublish({
        typeKey: 'guide',
        mode: isNew ? 'new' : 'edit',
        initial,
        meta: initial.meta,
        body,
        onInvalidTitle: () => {},
        onSuccess: () => {},
      }),
    {
      initialProps: { body: bodies[0] },
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
  for (const [index, body] of bodies.entries()) {
    rerender({ body });
    await act(async () => {
      if (index < bodies.length - 1)
        await expect(result.current.mutateAsync(true)).rejects.toBeDefined();
      else await result.current.mutateAsync(true);
    });
    expect(storedBody).toBe(body);
  }
  expect(updatedBodies).toEqual(isNew ? bodies.slice(1) : bodies);
  expect(createCount).toBe(isNew ? 1 : 0);
});

it('omits an unchanged imported category from a metadata-only edit', async () => {
  const initial: EditorLoadResult = {
    meta: {
      title: 'Imported',
      slug: 'imported',
      kind: 'codex_entry',
      category: 'Entities',
    },
    body: 'Source',
    canEditBody: true,
    canEditMetadata: true,
    status: 'published',
    visibility: 'public',
    policy: [],
    readerIds: [],
    authorId: 'actor',
    frontmatter: {},
    recordId: 'doc',
    documentId: 'doc',
    redirectHint: 'imported',
    briefPublished: true,
    updatedAt: null,
    documentVersion: 1,
  };
  server.use(
    graphql.mutation('EditPublishedDocument', ({ variables }) => {
      expect(variables.input).toEqual({
        expectedRevision: 1,
        title: 'Renamed imported',
      });
      return HttpResponse.json({
        data: { editPublishedDocument: { id: 'doc', slug: 'imported', version: 2 } },
      });
    }),
  );
  const client = createTestQueryClient();
  const { result } = renderHook(
    () =>
      useEditorPublish({
        typeKey: 'codex',
        mode: 'edit',
        initial,
        meta: { ...initial.meta, title: 'Renamed imported' },
        body: 'Source',
        onInvalidTitle: () => {},
        onSuccess: () => {},
      }),
    {
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
  await act(async () => {
    await result.current.mutateAsync(true);
  });
});

it('compares category changes against the latest acknowledged create/save stage', async () => {
  const initial: EditorLoadResult = {
    meta: { title: 'Entry', kind: 'codex_entry', category: 'Artifact' },
    body: '',
    canEditBody: true,
    canEditMetadata: true,
    status: 'draft',
    visibility: 'public',
    policy: [],
    readerIds: [],
    authorId: 'actor',
    frontmatter: {},
    recordId: 'new',
    documentId: null,
    redirectHint: null,
    briefPublished: false,
    updatedAt: null,
    documentVersion: null,
  };
  let category = 'Artifact';
  let version = 0;
  let publishes = 0;
  const categories: string[] = [];
  server.use(
    graphql.mutation('CreateDocument', ({ variables }) => {
      category = variables.input.category;
      version = 1;
      return HttpResponse.json({
        data: { createDocument: { id: 'doc', slug: 'entry', version } },
      });
    }),
    graphql.mutation('UpdateDocument', ({ variables }) => {
      expect(variables.input.expectedRevision).toBe(version);
      expect(variables.input).not.toHaveProperty('body');
      category = variables.input.category;
      categories.push(category);
      version++;
      return HttpResponse.json({
        data: { updateDocument: { id: 'doc', slug: 'entry', version } },
      });
    }),
    graphql.mutation('PublishDocument', () => {
      publishes++;
      return publishes < 3
        ? HttpResponse.json({ errors: [{ message: 'Temporary failure' }] })
        : HttpResponse.json({
            data: { publishDocument: { id: 'doc', slug: 'entry', version: ++version } },
          });
    }),
  );
  const client = createTestQueryClient();
  const { result, rerender } = renderHook(
    ({ category }) =>
      useEditorPublish({
        typeKey: 'codex',
        mode: 'new',
        initial,
        meta: { ...initial.meta, category },
        body: 'Saved source',
        onInvalidTitle: () => {},
        onSuccess: () => {},
      }),
    {
      initialProps: { category },
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
  for (const [index, next] of ['Artifact', 'Event', 'Artifact'].entries()) {
    rerender({ category: next });
    await act(async () => {
      if (index < 2)
        await expect(result.current.mutateAsync(true)).rejects.toBeDefined();
      else await result.current.mutateAsync(true);
    });
    expect(category).toBe(next);
  }
  expect(categories).toEqual(['Event', 'Artifact']);
});
