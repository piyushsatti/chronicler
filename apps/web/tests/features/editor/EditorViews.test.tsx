import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { EditorWorkspaceView } from '../../../src/features/editor/hooks/useEditorWorkspace.js';
import { EditorPageView } from '../../../src/features/editor/EditorRoute.js';
import {
  EditorShell,
  type EditorShellProps,
} from '../../../src/features/editor/EditorShell.js';
import {
  GenreTagsField,
  RegionMultiField,
} from '../../../src/features/editor/fields/FieldControls.js';

const error = {
  kind: 'invalid' as const,
  userMessage: 'The server returned data this screen cannot use.',
};
const emptyOptions = {
  regions: { status: 'empty' as const },
  genres: { status: 'empty' as const },
};
function props(): EditorShellProps {
  return {
    typeKey: 'guide',
    meta: { title: 'Guide title' },
    body: 'PRIVATE LOCAL DRAFT',
    setMeta: vi.fn(),
    setBody: vi.fn(),
    onSaveDraft: vi.fn(),
    onPublish: vi.fn(),
    cancelTo: '/rules',
    preview: { status: 'error', error },
    onPreview: vi.fn(),
    options: emptyOptions,
  };
}

describe('editor props-only views', () => {
  it('renders controlled route error, loading and explicit empty view states', () => {
    const view = render(<EditorPageView page={{ status: 'error', error }} />);
    expect(screen.getByRole('alert')).toHaveTextContent(error.userMessage);
    view.rerender(<EditorPageView page={{ status: 'loading' }} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    // View-contract proof only: the current load adapter never returns an empty edit record.
    view.rerender(<EditorPageView page={{ status: 'empty' }} />);
    expect(screen.getByText('No editor record available.')).toBeInTheDocument();
  });

  it('renders a ready view using only its supplied draft data', () => {
    const view: EditorWorkspaceView = {
      typeKey: 'guide',
      mode: 'edit',
      recordId: 'doc-id',
      meta: { title: 'Guide title' },
      body: 'Guide body',
      setMeta: vi.fn(),
      setBody: vi.fn(),
      isDirty: true,
      onSaveDraft: vi.fn(),
      onPublish: vi.fn(),
      onPreview: vi.fn(),
      preview: { status: 'idle' },
      options: emptyOptions,
      publishDisabled: false,
      saveDisabled: false,
      cancelTo: '/rules',
      statusMessage: null,
      showPropertyErrors: false,
      slugLocked: true,
      entityIndex: [],
      entityIndexError: null,
      mutationError: null,
    };
    render(
      <MemoryRouter>
        <EditorPageView page={{ status: 'ready', view }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'guide — edit' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Guide title')).toBeInTheDocument();
    expect(screen.getByText('Unsaved draft')).toBeInTheDocument();
  });

  it('keeps save, publish, read-preview, retry, cancel and keyboard-save callbacks', () => {
    const input = props();
    render(
      <MemoryRouter>
        <EditorShell {...input} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(input.onSaveDraft).toHaveBeenCalledOnce();
    expect(input.onPublish).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/rules',
    );
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(input.onSaveDraft).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    expect(input.onPreview).toHaveBeenCalledOnce();
    expect(screen.getByRole('region', { name: 'Read preview' })).toHaveTextContent(
      error.userMessage,
    );
    expect(screen.queryByText('PRIVATE LOCAL DRAFT')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));
    expect(input.onPreview).toHaveBeenCalledTimes(2);
  });

  it('retains selected regions during option failure and invokes supplied retry/remove callbacks', () => {
    const onChange = vi.fn();
    const onRetry = vi.fn();
    render(
      <RegionMultiField
        value={['region-id']}
        onChange={onChange}
        options={{ status: 'error', error, onRetry }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(error.userMessage);
    expect(screen.queryByText('No more regions')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Regions unavailable — tap to retry' }),
    );
    expect(onRetry).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Remove region region-id' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('keeps freely entered genres editable during failed suggestions, with no silent defaults', () => {
    const onChange = vi.fn();
    const onRetry = vi.fn();
    const view = render(
      <GenreTagsField
        value={['social']}
        onChange={onChange}
        options={{ status: 'error', error, onRetry }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(error.userMessage);
    expect(view.container.querySelectorAll('datalist option')).toHaveLength(0);
    fireEvent.change(screen.getByRole('combobox', { name: 'Add genre' }), {
      target: { value: 'mystery' },
    });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Add genre' }), {
      key: 'Enter',
    });
    expect(onChange).toHaveBeenCalledWith(['social', 'mystery']);
  });
});
