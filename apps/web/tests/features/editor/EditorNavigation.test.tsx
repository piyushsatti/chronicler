import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  createMemoryRouter,
  Link,
  Route,
  RouterProvider,
  Routes,
} from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { createTestQueryClient } from '../../../src/providers.js';
import { useEditorWorkspace } from '../../../src/features/editor/hooks/useEditorWorkspace.js';
import { EditorDocumentControls } from '../../../src/features/editor/EditorDocumentControls.js';
import type { EditorLoadResult } from '../../../src/features/editor/adapters/editorLoad.js';
const initial: EditorLoadResult = {
  meta: { title: 'Guide', slug: 'guide', category: 'guide' },
  body: 'Source',
  canEditBody: true,
  canEditMetadata: true,
  status: 'draft',
  visibility: 'public',
  policy: [],
  readerIds: [],
  authorId: 'actor',
  frontmatter: {},
  recordId: 'navigation-doc',
  documentId: 'navigation-doc',
  redirectHint: 'guide',
  briefPublished: false,
  updatedAt: null,
  documentVersion: 1,
};
function EditorProbe() {
  const view = useEditorWorkspace({
    typeKey: 'guide',
    mode: 'edit',
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
            <Route path="/before" element={<p>Before reader</p>} />
            <Route path="/after" element={<p>After reader</p>} />
          </Routes>
        ),
      },
    ],
    { initialEntries: ['/before', '/editor'], initialIndex: 1 },
  );
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
describe('editor navigation in the production wildcard data-router shape', () => {
  it('blocks links, keeps focus in the decision, and stays or leaves explicitly', async () => {
    const router = setup();
    fireEvent.change(screen.getByLabelText('Body'), {
      target: { value: 'Unsaved body' },
    });
    fireEvent.click(screen.getByRole('link', { name: 'Go after' }));
    const leave = await screen.findByRole('dialog', {
      name: 'Leave with unsaved changes?',
    });
    // Plain words, no "recovery copy", "revision" or "this device" (loop 3 L8).
    expect(leave).toHaveTextContent(
      'Your unsaved changes are kept as a draft in this browser. You can come back to them.',
    );
    expect(leave).not.toHaveTextContent(/recovery copy|revision|this device/);
    expect(router.state.location.pathname).toBe('/editor');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Body')).toHaveValue('Unsaved body');
    fireEvent.click(screen.getByRole('link', { name: 'Go after' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave page' }));
    expect(await screen.findByText('After reader')).toBeInTheDocument();
  });
  it('blocks Back and permits it after the user chooses Leave', async () => {
    const router = setup();
    fireEvent.change(screen.getByLabelText('Body'), {
      target: { value: 'Unsaved body' },
    });
    await act(async () => {
      await router.navigate(-1);
    });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/editor');
    fireEvent.click(screen.getByRole('button', { name: 'Leave page' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/before'));
    expect(screen.getByText('Before reader')).toBeInTheDocument();
  });
});
