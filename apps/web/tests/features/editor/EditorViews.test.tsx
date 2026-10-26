import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
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
  DateTimeField,
} from '../../../src/features/editor/fields/FieldControls.js';
import { LiveEditor } from '../../../src/features/editor/LiveEditor.js';

const error = {
  kind: 'invalid' as const,
  userMessage: 'The server returned data this screen cannot use.',
};
const emptyOptions = {
  regions: { status: 'empty' as const },
  genres: { status: 'empty' as const },
  series: { status: 'empty' as const },
  places: {
    maps: [],
    atlasCode: '',
    setAtlasCode: () => {},
    nodes: undefined,
    loading: false,
    error: null,
    onRetry: () => {},
  },
};
function props(): EditorShellProps {
  return {
    typeKey: 'guide',
    timeZone: 'UTC',
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
  it.each(['demo', 'dm-table', 'summary', 'guide', 'ruling'] as const)(
    'keeps %s formatting beside primary Publish and secondary Save draft in the shared toolbar',
    async (typeKey) => {
      render(
        <MemoryRouter>
          <EditorShell {...props()} typeKey={typeKey} undo={vi.fn()} canUndo />
        </MemoryRouter>,
      );
      const formatting = screen.getByRole('toolbar', { name: 'Markdown formatting' });
      const publish = screen.getByRole('button', { name: 'Publish' });
      expect(formatting.parentElement).toContainElement(publish);
      expect(publish).toHaveAttribute('data-variant', 'primary');
      expect(screen.getByRole('button', { name: 'Save draft' })).toHaveAttribute(
        'data-variant',
        'secondary',
      );
      expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute(
        'title',
        'Bold',
      );
      expect(screen.getByRole('button', { name: 'Undo' })).toHaveAccessibleName('Undo');
      expect(screen.queryByText('Advanced')).not.toBeInTheDocument();
      expect(screen.getByText('Required')).toBeVisible();
      const user = userEvent.setup();
      const write = screen.getByRole('tab', { name: 'Write' });
      await user.click(write);
      await user.keyboard('{End}');
      const preview = screen.getByRole('tab', { name: 'Preview' });
      expect(preview).toHaveFocus();
      expect(preview).toHaveAttribute(
        'aria-selected',
        'true',
      );
    },
  );

  it('shows an existing page address only in Advanced and copies the reader path', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    try {
      render(
        <MemoryRouter>
          <EditorShell
            {...props()}
            slugLocked
            meta={{ title: 'Guide', slug: 'a-guide', kind: 'rule', category: 'guide' }}
          />
        </MemoryRouter>,
      );
      const advanced = screen.getByText('Advanced').closest('details');
      expect(advanced).not.toHaveAttribute('open');
      fireEvent.click(screen.getByText('Advanced'));
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
      expect(writeText).toHaveBeenCalledWith('/rules/guides/a-guide');
      expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
      expect(
        screen.queryByRole('textbox', { name: 'Page address' }),
      ).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows one Quest save action and keeps its keyboard save path', () => {
    const input = { ...props(), typeKey: 'quest' as const, saveLabel: 'Save quest' };
    render(
      <MemoryRouter>
        <EditorShell {...input} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save quest' }));
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(input.onSaveDraft).toHaveBeenCalledTimes(2);
    expect(input.onPublish).not.toHaveBeenCalled();
    expect(screen.queryByText('region ids')).not.toBeInTheDocument();
    expect(
      screen.queryByText('chip tags; free type + suggestions'),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Session')).toHaveAttribute('type', 'datetime-local');
  });

  it.each([
    ['edit', ['standard', 'one_shot']],
    ['new', ['one_shot']],
  ] as const)(
    'in %s mode, picking another kind beside a lone Standard gives %j',
    async (editorMode, expected) => {
      const seen: unknown[] = [];
      function Quest(): React.JSX.Element {
        const [meta, setMeta] = useState<EditorShellProps['meta']>({
          title: 'Saved quest',
          kinds: ['standard'],
        });
        seen.push(meta.kinds);
        return (
          <EditorShell
            {...props()}
            typeKey="quest"
            editorMode={editorMode}
            saveLabel="Save quest"
            meta={meta}
            setMeta={setMeta}
          />
        );
      }
      render(
        <MemoryRouter>
          <Quest />
        </MemoryRouter>,
      );
      await userEvent.click(screen.getByRole('button', { name: 'One-shot' }));
      // A saved quest's Standard was chosen, so only a new quest replaces it (review of L3).
      expect(seen.at(-1)).toEqual(expected);
      expect(screen.getByRole('button', { name: 'Standard' })).toHaveAttribute(
        'aria-pressed',
        editorMode === 'edit' ? 'true' : 'false',
      );
    },
  );

  it('preserves known precision through display changes and requires explicit overlap resolution', () => {
    const changed = vi.fn();
    function Session({ timeZone }: { timeZone: string }): React.JSX.Element {
      const [value, setValue] = useState('2026-11-01T01:30:19.123456-05:00');
      return (
        <DateTimeField
          value={value}
          timeZone={timeZone}
          label="Session"
          onChange={(next) => {
            changed(next);
            setValue(next);
          }}
        />
      );
    }
    const view = render(<Session timeZone="America/New_York" />);
    expect(screen.getByLabelText('Session')).toHaveValue('2026-11-01T01:30');
    fireEvent.change(screen.getByLabelText('Session'), {
      target: { value: '2026-11-01T01:30' },
    });
    view.rerender(<Session timeZone="Asia/Kolkata" />);
    expect(screen.getByLabelText('Session')).toHaveValue('2026-11-01T12:00');
    expect(changed).not.toHaveBeenCalled();
    view.rerender(<Session timeZone="America/New_York" />);
    fireEvent.change(screen.getByLabelText('Session'), {
      target: { value: '2026-03-08T02:30' },
    });
    expect(changed).toHaveBeenLastCalledWith('2026-03-08T02:30');
    expect(screen.getByRole('alert')).toHaveTextContent('does not exist');
    fireEvent.change(screen.getByLabelText('Session'), {
      target: { value: '2026-11-01T01:30' },
    });
    expect(changed).toHaveBeenLastCalledWith('2026-11-01T01:30');
    fireEvent.click(
      screen.getByRole('button', { name: 'Second occurrence (UTC-05:00)' }),
    );
    expect(changed).toHaveBeenLastCalledWith('2026-11-01T06:30:00Z');
    expect(
      screen.queryByRole('group', { name: 'Choose session occurrence' }),
    ).not.toBeInTheDocument();
  });

  it('keeps an unresolved draft uncommitted after a zone change until explicit confirmation', () => {
    const onChange = vi.fn();
    const input = { value: '2026-11-01T01:30', label: 'Session', onChange };
    const view = render(<DateTimeField {...input} timeZone="America/New_York" />);
    expect(
      screen.getByRole('group', { name: 'Choose session occurrence' }),
    ).toBeInTheDocument();
    view.rerender(<DateTimeField {...input} timeZone="Asia/Kolkata" />);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm time in Asia/Kolkata (UTC+05:30)' }),
    );
    expect(onChange).toHaveBeenCalledWith('2026-10-31T20:00:00Z');
  });

  it('keeps an active paragraph fully sized on width changes without losing typing or caret', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    function flushSizing(): void {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(performance.now()));
    }
    const observers: InputObserver[] = [];
    class InputObserver implements ResizeObserver {
      private target: Element | null = null;
      readonly observe = vi.fn((target: Element) => {
        this.target = target;
      });
      readonly unobserve = vi.fn();
      readonly disconnect = vi.fn();
      constructor(private readonly callback: ResizeObserverCallback) {
        observers.push(this);
      }
      resize(width: number, height: number): void {
        if (!this.target) throw new Error('No observed editor input');
        const size = { inlineSize: width, blockSize: height };
        this.callback(
          [
            {
              target: this.target,
              contentRect: new DOMRect(0, 0, width, height),
              borderBoxSize: [size],
              contentBoxSize: [size],
              devicePixelContentBoxSize: [size],
            },
          ],
          this,
        );
      }
    }
    vi.stubGlobal('ResizeObserver', InputObserver);
    const changed = vi.fn();
    function ControlledBody(): React.JSX.Element {
      const [value, setValue] = useState('First paragraph\nSecond paragraph');
      return (
        <LiveEditor
          value={value}
          toolbar={false}
          onChange={(next) => {
            changed(next);
            setValue(next);
          }}
        />
      );
    }
    const view = render(<ControlledBody />);
    try {
      fireEvent.mouseDown(screen.getByText('First paragraph'));
      const input = screen.getByRole('textbox', { name: 'Document body' });
      if (!(input instanceof HTMLTextAreaElement)) {
        throw new Error('Missing body textarea');
      }
      let neededHeight = 170;
      const readHeight = vi.fn(() => neededHeight);
      Object.defineProperty(input, 'scrollHeight', { get: readHeight });
      observers[0].resize(720, 170);
      flushSizing();
      expect(input.style.height).toBe('170px');
      fireEvent.change(input, { target: { value: 'Typed wrapped paragraph' } });
      expect(changed).toHaveBeenLastCalledWith(
        'Typed wrapped paragraph\nSecond paragraph',
      );
      expect(observers).toHaveLength(1);
      input.setSelectionRange(5, 9);
      neededHeight = 436;
      observers[0].resize(328, 170);
      flushSizing();
      expect(input.style.height).toBe('436px');
      expect(input).toHaveFocus();
      expect([input.selectionStart, input.selectionEnd]).toEqual([5, 9]);
      const sizingReads = readHeight.mock.calls.length;
      observers[0].resize(328, 436);
      expect(frames.size).toBe(0);
      expect(readHeight).toHaveBeenCalledTimes(sizingReads);
      neededHeight = 172;
      observers[0].resize(720, 436);
      flushSizing();
      expect(input.style.height).toBe('172px');
      fireEvent.mouseDown(screen.getByText('Second paragraph'));
      expect(observers[0].disconnect).toHaveBeenCalledOnce();
      observers[0].resize(200, 172);
      expect(frames.size).toBe(0);
      expect(input.style.height).toBe('172px');
      const currentInput = screen.getByRole('textbox', { name: 'Document body' });
      expect(currentInput).toHaveValue('Second paragraph');
      expect(currentInput).toHaveFocus();
      observers[1].resize(328, 170);
      expect(frames.size).toBe(1);
      view.unmount();
      expect(observers[1].disconnect).toHaveBeenCalledOnce();
      expect(frames.size).toBe(0);
    } finally {
      view.unmount();
      vi.unstubAllGlobals();
    }
  });

  it('renders controlled route error, loading and explicit empty view states', () => {
    const view = render(<EditorPageView page={{ status: 'error', error }} />, {
      wrapper: MemoryRouter,
    });
    expect(screen.getByRole('alert')).toHaveTextContent(error.userMessage);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Example editor' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
    view.rerender(<EditorPageView page={{ status: 'loading' }} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    // View-contract proof only: the current load adapter never returns an empty edit record.
    view.rerender(<EditorPageView page={{ status: 'empty' }} />);
    expect(screen.getByText('No editor record available.')).toBeInTheDocument();
  });

  it('renders a ready view using only its supplied draft data', () => {
    const view: EditorWorkspaceView = {
      typeKey: 'guide',
      timeZone: 'UTC',
      mode: 'edit',
      editorMode: 'edit',
      recordId: 'doc-id',
      meta: { title: 'Guide title' },
      body: 'Guide body',
      setMeta: vi.fn(),
      setBody: vi.fn(),
      isDirty: true,
      onDiscardDraft: undefined,
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
      errorFocusRequest: 0,
      bodyError: null,
      slugLocked: true,
      entityIndex: [],
      entityIndexError: null,
      mutationError: null,
      mutationNeedsReload: false,
      confirming: null,
      cancelConfirm: vi.fn(),
      acceptConfirm: vi.fn(),
      restoredDraft: null,
      seriesNotice: null,
      saveLabel: 'Save draft',
      publishLabel: 'Publish',
      canEditBody: true,
      denied: false,
      briefMissing: false,
      deniedAction: 'edit',
      schemaAccess: {},
      canEditMetadata: true,
      stale: false,
      draftRecovery: undefined,
      onReload: vi.fn(),
      navigationBlocked: false,
      stay: vi.fn(),
      leave: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      canUndo: false,
      canRedo: false,
      history: {
        error: null,
        loading: false,
        fetching: false,
        items: [],
        total: 0,
        refetch: vi.fn(),
        offset: 0,
        open: false,
        toggle: vi.fn(),
        previous: vi.fn(),
        next: vi.fn(),
      },
      summaryLinks: {
        active: false,
        editable: false,
        hiddenLinks: false,
        search: '',
        setSearch: vi.fn(),
        selected: [],
        add: vi.fn(),
        remove: vi.fn(),
        characterId: null,
        setCharacter: vi.fn(),
        quests: {
          items: [],
          total: 0,
          offset: 0,
          loading: false,
          error: null,
          retry: vi.fn(),
          previous: vi.fn(),
          next: vi.fn(),
        },
        characters: {
          items: [],
          total: 0,
          offset: 0,
          loading: false,
          error: null,
          retry: vi.fn(),
          previous: vi.fn(),
          next: vi.fn(),
        },
      },
      showLifecycle: false,
      lifecycleDisabled: false,
      trashed: false,
      published: true,
      onLifecycle: vi.fn(),
      audience: {
        search: '',
        setSearch: vi.fn(),
        matches: [],
        total: 0,
        offset: 0,
        previous: vi.fn(),
        next: vi.fn(),
        loading: false,
        error: null,
        selected: [],
        add: vi.fn(),
        remove: vi.fn(),
        selectedIds: [],
      },
      saveAudience: vi.fn(),
      visibility: 'public',
      setVisibility: vi.fn(),
      policyMode: 'visibility',
      setPolicyMode: vi.fn(),
      policy: '',
      setPolicy: vi.fn(),
      readerIds: '',
      setReaderIds: vi.fn(),
    };
    render(
      <MemoryRouter>
        <EditorPageView page={{ status: 'ready', view }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Edit guide' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Guide title');
    expect(screen.queryByText('doc-id')).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
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
