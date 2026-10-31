import { fireEvent, render, screen } from '@testing-library/react';
import {
  createMemoryRouter,
  Link,
  Route,
  RouterProvider,
  Routes,
} from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestQueryClient } from '../../../src/providers.js';
import { useEditorWorkspace } from '../../../src/features/editor/hooks/useEditorWorkspace.js';
import { draftStorageKey } from '../../../src/features/editor/hooks/useEditorDraft.js';
import { EditorDocumentControls } from '../../../src/features/editor/EditorDocumentControls.js';
import type { EditorLoadResult } from '../../../src/features/editor/adapters/editorLoad.js';

const initial: EditorLoadResult = {
  meta: { title: '', category: 'guide' },
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
const key = draftStorageKey('guide', 'new', 'actor', 'new');

function EditorProbe() {
  const view = useEditorWorkspace({
    typeKey: 'guide',
    mode: 'new',
    initial,
    enabled: true,
    timeZone: 'UTC',
    actorId: 'actor',
  });
  return (
    <>
      <input
        aria-label="Body"
        value={view.body}
        onChange={(event) => view.setBody(event.target.value)}
      />
      <p>{view.isDirty ? 'Has draft' : 'No draft'}</p>
      <Link to="/after">Go after</Link>
      <EditorDocumentControls view={view} />
    </>
  );
}

function setup() {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <Routes>
            <Route path="/editor" element={<EditorProbe />} />
            <Route path="/after" element={<p>After reader</p>} />
          </Routes>
        ),
      },
    ],
    { initialEntries: ['/editor'] },
  );
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('a new record opened with a recovered draft', () => {
  beforeEach(() => {
    localStorage.setItem(
      key,
      JSON.stringify({
        meta: { title: 'Draft from another tab', category: 'guide' },
        body: 'Recovered body',
        savedAt: '2026-10-25T10:00:00Z',
      }),
    );
  });

  it('leaves without a warning while the form is untouched', async () => {
    setup();
    expect(screen.getByLabelText('Body')).toHaveValue('Recovered body');
    expect(screen.getByText('Has draft')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Go after' }));
    expect(await screen.findByText('After reader')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    // The recovered copy stays on the device.
    expect(localStorage.getItem(key)).toContain('Recovered body');
  });

  it('warns once the form is edited here', async () => {
    const router = setup();
    fireEvent.change(screen.getByLabelText('Body'), {
      target: { value: 'Edited here' },
    });
    fireEvent.click(screen.getByRole('link', { name: 'Go after' }));
    expect(
      await screen.findByRole('dialog', { name: 'Leave with unsaved changes?' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/editor');
  });
});
