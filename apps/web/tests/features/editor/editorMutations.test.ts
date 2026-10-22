import { describe, expect, it } from 'vitest';
import { graphql, HttpResponse } from 'msw';
import {
  createDocument,
  parseDocumentMutationResult,
  parseQuestMutationResult,
} from '../../../src/features/editor/adapters/editorMutations.js';
import { server } from '../../../src/mocks/server.js';

describe('editorMutations parsers', () => {
  it('sends a supported Codex kind and returns its reader route after creation', async () => {
    server.use(
      graphql.mutation('CreateDocument', ({ variables }) => {
        expect(variables.input).toMatchObject({
          kind: 'codex_entry',
          category: 'Lore',
          title: 'A new story',
        });
        return HttpResponse.json({
          data: {
            createDocument: { id: 'new-document', slug: 'a-new-story', version: 1 },
          },
        });
      }),
    );
    await expect(
      createDocument({
        kind: 'codex_entry',
        category: 'Lore',
        title: 'A new story',
        body: 'A body',
      }),
    ).resolves.toMatchObject({ redirectPath: '/codex/a-new-story', version: 1 });
  });

  it('parses quest create/update wire', () => {
    const result = parseQuestMutationResult({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      shortCode: 'Q-NEW',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.shortCode).toBe('Q-NEW');
    }
  });

  it('rejects bad quest wire', () => {
    expect(parseQuestMutationResult({ shortCode: 'Q-1' }).ok).toBe(false);
  });

  it('parses document wire', () => {
    const result = parseDocumentMutationResult({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      slug: 'lore-1',
      version: 3,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.slug).toBe('lore-1');
      expect(result.data.version).toBe(3);
    }
  });

  it('rejects document wire without version', () => {
    expect(
      parseDocumentMutationResult({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        slug: 'lore-1',
      }).ok,
    ).toBe(false);
  });
});
