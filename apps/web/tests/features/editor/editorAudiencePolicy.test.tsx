import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { graphql, HttpResponse } from 'msw';
import { expect, it } from 'vitest';
import { server } from '../../../src/mocks/server.js';
import { parseDocumentLoad } from '../../../src/features/editor/adapters/editorLoad.js';
import { EditorDocumentControls } from '../../../src/features/editor/EditorDocumentControls.js';
import { useEditorPage } from '../../../src/features/editor/hooks/useEditorPage.js';
import { editorHarness, seedEditorSession } from './editor-test-utils.js';

const id = '99999999-9999-4999-8999-999999999999';
function fixture(policy: string[] | null) {
  return {
    id,
    slug: 'audience-guide',
    kind: 'rule',
    category: 'guide',
    title: 'Audience guide',
    status: 'published',
    version: 1,
    effectiveBody: 'Current source',
    canEditBody: true,
    canEditMetadata: true,
    visibility: 'public',
    policy,
    readerIds: [],
    frontmatter: {},
  };
}
it.each([null, [], ['member:@reader']])(
  'preserves loaded policy %j and omits it from an unrelated audience edit',
  async (policy) => {
    seedEditorSession();
    let document = fixture(policy);
    const writes: unknown[] = [];
    server.use(
      graphql.query('EditorDocumentById', () =>
        HttpResponse.json({ data: { documentById: document } }),
      ),
      graphql.mutation('EditorAudience', ({ variables }) => {
        writes.push(variables.input);
        expect(variables.input).toEqual({ visibility: 'dm_only', readerIds: [] });
        document = { ...document, visibility: 'dm_only', version: 2 };
        return HttpResponse.json({ data: { setDocumentVisibility: document } });
      }),
    );
    const parsed = parseDocumentLoad(document);
    expect(parsed.ok && parsed.data.policy).toEqual(policy);
    const { result } = renderHook(
      () => useEditorPage({ typeKey: 'guide', mode: 'edit' }),
      editorHarness(`/rules/guides/${id}/edit`, '/rules/guides/:id/edit'),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') throw new Error('Expected editor');
    expect(result.current.view.policyMode).toBe(
      policy === null ? 'visibility' : 'custom',
    );
    act(() => {
      if (result.current.status === 'ready')
        result.current.view.setVisibility('dm_only');
    });
    act(() => {
      if (result.current.status === 'ready') result.current.view.saveAudience();
    });
    await waitFor(() => expect(writes).toHaveLength(1));
    await waitFor(() => {
      if (result.current.status !== 'ready') throw new Error('Expected editor');
      expect(result.current.view.lifecycleDisabled).toBe(false);
      expect(result.current.view.policyMode).toBe(
        policy === null ? 'visibility' : 'custom',
      );
    });
    expect(document.policy).toEqual(policy);
    expect(document.effectiveBody).toBe('Current source');
  },
);

it('requires explicit choices when changing deny-all to visibility rules or a named policy', async () => {
  seedEditorSession();
  let document = fixture([]);
  const writes: unknown[] = [];
  server.use(
    graphql.query('EditorDocumentById', () =>
      HttpResponse.json({ data: { documentById: document } }),
    ),
    graphql.mutation('EditorAudience', ({ variables }) => {
      writes.push(variables.input);
      expect(Object.hasOwn(variables.input, 'policy')).toBe(true);
      document = {
        ...document,
        policy: variables.input.policy as string[] | null,
        version: document.version + 1,
      };
      return HttpResponse.json({ data: { setDocumentVisibility: document } });
    }),
  );
  function AudienceEditor() {
    const page = useEditorPage({ typeKey: 'guide', mode: 'edit' });
    return page.status === 'ready' ? <EditorDocumentControls view={page.view} /> : null;
  }
  render(
    <AudienceEditor />,
    editorHarness(`/rules/guides/${id}/edit`, '/rules/guides/:id/edit'),
  );
  const mode = await screen.findByRole('radiogroup', { name: 'Who can read this' });
  const custom = () => within(mode).getByRole('radio', { name: 'Choose readers' });
  expect(custom()).toBeChecked();
  expect(screen.getByText(/An empty list lets\s+no one read this/)).toBeVisible();
  fireEvent.click(within(mode).getByRole('radio', { name: 'Same as visibility' }));
  expect(
    screen.queryByRole('textbox', { name: 'Reader handles' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save readers' }));
  await waitFor(() => expect(document.policy).toBeNull());
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save readers' })).toBeEnabled(),
  );
  fireEvent.click(custom());
  fireEvent.change(screen.getByRole('textbox', { name: 'Reader handles' }), {
    target: { value: '@reader,' },
  });
  expect(screen.getByRole('textbox', { name: 'Reader handles' })).toHaveValue(
    '@reader, ',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save readers' }));
  await waitFor(() => expect(document.policy).toEqual(['member:@reader']));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save readers' })).toBeEnabled(),
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Reader handles' }), {
    target: { value: '' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save readers' }));
  await waitFor(() => expect(document.policy).toEqual([]));
  expect(writes).toEqual([
    { visibility: 'public', policy: null, readerIds: [] },
    { visibility: 'public', policy: ['member:@reader'], readerIds: [] },
    { visibility: 'public', policy: [], readerIds: [] },
  ]);
});
