import { createElement } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { graphql, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '../../../src/mocks/server.js';
import { createTestQueryClient } from '../../../src/providers.js';
import { useEditorPage } from '../../../src/features/editor/hooks/useEditorPage.js';
import { useEditorPublish } from '../../../src/features/editor/hooks/useEditorPublish.js';
import { schemaForType } from '../../../src/features/editor/editorSchemas.js';
import type { EditorLoadResult } from '../../../src/features/editor/adapters/editorLoad.js';
import { editorHarness, seedEditorSession } from './editor-test-utils.js';
import goodMe from '../../fixtures/wire/me/good.json';

function mockRoles(roles: string[]) {
  server.use(
    graphql.query('MemberMe', () =>
      HttpResponse.json({ data: { memberMe: { ...goodMe, roles } } }),
    ),
  );
}

async function categoryOptions(roles: string[]) {
  mockRoles(roles);
  const { result } = renderHook(
    () => useEditorPage({ typeKey: 'codex', mode: 'new' }),
    editorHarness('/codex/new', '/codex/new'),
  );
  await waitFor(() => {
    if (result.current.status !== 'ready') throw new Error('Expected ready');
    expect(result.current.view.schemaAccess.canAuthorLocations).toBe(
      roles.includes('archon') || roles.includes('admin'),
    );
    expect(result.current.view.schemaAccess.canAuthorFeatures).toBe(
      roles.includes('dm') || roles.includes('admin'),
    );
  });
  if (result.current.status !== 'ready') throw new Error('Expected ready');
  const { view } = result.current;
  return schemaForType('codex', view.meta, view.schemaAccess).find(
    (field) => field.key === 'category',
  )?.options;
}

describe('Codex editor categories', () => {
  beforeEach(seedEditorSession);

  it('offers Entities to a player, without Locations or Feature', async () => {
    const options = await categoryOptions(['player']);
    expect(options).toContain('Entities');
    expect(options).not.toContain('Locations');
    expect(options).not.toContain('Feature');
  });

  it.each([['dm'], ['admin']])('offers Feature to a %s', async (role) => {
    expect(await categoryOptions(['player', role])).toContain('Feature');
  });

  it('keeps a Feature draft read-only for a player who opens one', () => {
    const category = schemaForType(
      'codex',
      { title: 'Old Mill', category: 'Feature' },
      { canAuthorFeatures: false },
      'new',
    ).find((field) => field.key === 'category');
    expect(category?.readOnly).toBe(true);
  });

  it.each([['archon'], ['admin']])('offers Locations to an %s', async (role) => {
    expect(await categoryOptions(['player', role])).toContain('Locations');
  });

  it('creates a Feature entry with that category', async () => {
    const initial: EditorLoadResult = {
      meta: { title: 'Old Mill', category: 'Feature', hex: 'LFR7008' },
      body: '',
      canEditBody: true,
      canEditMetadata: true,
      status: 'draft',
      visibility: 'public',
      policy: [],
      readerIds: [],
      authorId: null,
      frontmatter: {},
      recordId: 'new',
      documentId: null,
      redirectHint: null,
      briefPublished: false,
      updatedAt: null,
      documentVersion: null,
    };
    const created: unknown[] = [];
    server.use(
      graphql.mutation('CreateDocument', ({ variables }) => {
        created.push(variables.input);
        return HttpResponse.json({
          data: { createDocument: { id: 'doc', slug: 'old-mill', version: 1 } },
        });
      }),
    );
    const client = createTestQueryClient();
    const { result } = renderHook(
      () =>
        useEditorPublish({
          typeKey: 'codex',
          mode: 'new',
          initial,
          meta: initial.meta,
          body: 'A mill by the ford.',
          onInvalidTitle: () => {},
          onSuccess: () => {},
        }),
      {
        wrapper: ({ children }) =>
          createElement(QueryClientProvider, { client }, children),
      },
    );
    await act(async () => {
      await result.current.mutateAsync(false);
    });
    expect(created).toEqual([
      expect.objectContaining({
        kind: 'codex_entry',
        category: 'Feature',
        title: 'Old Mill',
        frontmatter: { hex: 'LFR7008' },
      }),
    ]);
  });
});
