import { QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveEditor } from '../../../src/components/interactive/markdown-editor/LiveEditor.js';
import { createTestQueryClient } from '../../../src/providers.js';
import type { BodySpanAudit } from '../../../src/components/interactive/markdown-editor/types.js';
import type { BodyAudit } from '../../../src/components/interactive/markdown-editor/bodyAuditCopy.js';
import { previewHiddenSummary } from '../../../src/components/interactive/markdown-editor/bodyAuditCopy.js';
import { useBodyAudit } from '../../../src/features/editor/hooks/useBodyAudit.js';

const auditBody = vi.hoisted(() => vi.fn());
vi.mock('../../../src/features/editor/adapters/bodyAudit.js', () => ({ auditBody }));

function span(partial: Partial<BodySpanAudit> & Pick<BodySpanAudit, 'kind'>) {
  return {
    startLine: 1,
    endLine: 1,
    handle: null,
    suggestion: null,
    token: null,
    tokenLine: null,
    tokenColumn: null,
    ...partial,
  } satisfies BodySpanAudit;
}

/** The draft's one-entry-per-change history, as useEditorDraft keeps it. */
function Host({
  initial,
  audit,
  changes,
}: {
  initial: string;
  audit: (body: string) => BodyAudit;
  changes: string[];
}): React.JSX.Element {
  const [history, setHistory] = useState([initial]);
  const value = history[history.length - 1];
  return (
    <LiveEditor
      value={value}
      audit={audit(initial)}
      onChange={(next) => {
        changes.push(next);
        setHistory((old) => [...old, next]);
      }}
      toolbarStart={
        <button
          type="button"
          onClick={() => setHistory((old) => (old.length > 1 ? old.slice(0, -1) : old))}
        >
          Undo
        </button>
      }
    />
  );
}

function renderEditor(initial: string, spans: BodySpanAudit[]) {
  const changes: string[] = [];
  const client = createTestQueryClient();
  const view = render(
    <QueryClientProvider client={client}>
      <Host initial={initial} audit={(body) => ({ body, spans })} changes={changes} />
    </QueryClientProvider>,
  );
  return { changes, ...view };
}

const MARKED = [
  'Intro',
  '',
  '> [!dm]',
  '> The mayor leads the cult.',
  '',
  '> [!dm:@mortal]',
  '> Only you know.',
  '',
  '> [!spoiler]',
  '> The butler did it.',
  '',
  '> [!dm:mortal]',
  '> A typo hides this.',
].join('\n');

const MARKED_SPANS = [
  span({ kind: 'DM', startLine: 3, endLine: 4, token: '[!dm]', tokenLine: 3, tokenColumn: 3 }),
  span({ kind: 'MEMBER', startLine: 6, endLine: 7, handle: 'mortal' }),
  span({ kind: 'SPOILER', startLine: 9, endLine: 10 }),
  span({ kind: 'MALFORMED', startLine: 12, endLine: 13, suggestion: '[!dm:@mortal]' }),
];

function badge(text: string): HTMLElement {
  const el = screen.getByText(text).closest('[data-el="editor.audit.badge"]');
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

describe('editor badges from the server audit', () => {
  it('badges each hidden or special block with text and an icon, and describes the block with it', () => {
    const { container } = renderEditor(MARKED, MARKED_SPANS);
    const dm = badge('DMs only');
    expect(dm).toHaveAttribute('data-kind', 'DM');
    expect(dm).toHaveTextContent('🔒DMs only');
    expect(dm.querySelector('[aria-hidden="true"]')).toHaveTextContent('🔒');
    expect(badge('Only @mortal')).toHaveTextContent('🔒Only @mortal');
    expect(badge('Spoiler — everyone sees it blurred')).toHaveAttribute(
      'data-kind',
      'SPOILER',
    );
    expect(badge('Hidden from everyone (marker not recognised)')).toHaveTextContent(
      '⛔Hidden from everyone (marker not recognised)',
    );
    // Each marked block is a group named by its badge, holding the badge and its lines.
    const dmGroup = screen.getByRole('group', { name: 'DMs only' });
    expect(dmGroup).toContainElement(dm);
    expect(dmGroup.querySelector('.le-widget[data-audit="DM"]')).not.toBeNull();
    // Plain quote lines in a member block are each described by that block's badge.
    const memberRows = container.querySelectorAll('.le-row[data-audit="MEMBER"]');
    expect(memberRows).toHaveLength(2);
    const memberGroup = screen.getByRole('group', { name: 'Only @mortal' });
    memberRows.forEach((row) => expect(memberGroup).toContainElement(row as HTMLElement));
    expect(
      screen.getByRole('group', { name: 'Hidden from everyone (marker not recognised)' }),
    ).toBeInTheDocument();
    expect(container.querySelector('.le-row[data-audit="MALFORMED"]')).not.toBeNull();
    // Unmarked lines get no badge and no tint.
    const rows = container.querySelectorAll('.le-doc > .le-row');
    expect(rows[0]).not.toHaveAttribute('data-audit');
  });

  it('describes the line being typed with its block badge', () => {
    const { container } = renderEditor(MARKED, MARKED_SPANS);
    const memberRow = container.querySelectorAll('.le-row[data-audit="MEMBER"]')[1];
    fireEvent.mouseDown(memberRow.querySelector('.le-read') as Element);
    expect(screen.getByRole('textbox', { name: 'Document body' })).toHaveAccessibleDescription(
      'Only @mortal',
    );
  });

  it('shows nothing when the audit no longer fits the body’s lines', () => {
    const client = createTestQueryClient();
    render(
      <QueryClientProvider client={client}>
        <LiveEditor
          value={MARKED}
          onChange={() => {}}
          audit={{ body: `${MARKED}\nOne more line`, spans: MARKED_SPANS }}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByText('DMs only')).not.toBeInTheDocument();
  });
});

describe('lookalike markers', () => {
  const token = '[!dm@mortal]';
  // Two identical tokens; only the second is the reported one. Non-ASCII text
  // (precomposed letters and an astral emoji) sits before both.
  const line = `> Ünïcødé 🐉 ${token} then ${token} again`;
  const column = 32;

  it('warns on the line and Fix replaces exactly the reported token in one undo step', async () => {
    expect(line.slice(column - 1, column - 1 + token.length)).toBe(token);
    const body = ['Before', line, 'After'].join('\n');
    const { changes } = renderEditor(body, [
      span({
        kind: 'LOOKALIKE',
        startLine: 2,
        endLine: 2,
        token,
        suggestion: '[!dm:@mortal]',
        tokenLine: 2,
        tokenColumn: column,
      }),
    ]);
    const warning = screen
      .getByText(/Not a hiding marker — players will see this\./)
      .closest('[data-el="editor.audit.lookalike"]') as HTMLElement;
    expect(warning).toHaveTextContent(
      'Not a hiding marker — players will see this. Did you mean [!dm:@mortal]?',
    );
    // The warning is announced when it appears.
    expect(warning.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();
    const fix = screen.getByRole('button', { name: 'Fix' });
    expect(fix).toHaveAccessibleDescription(
      /Not a hiding marker — players will see this\. Did you mean \[!dm:@mortal\] ?\?/,
    );
    await userEvent.click(fix);
    await waitFor(() => expect(changes).toHaveLength(1));
    expect(changes[0]).toBe(
      ['Before', `> Ünïcødé 🐉 ${token} then [!dm:@mortal] again`, 'After'].join('\n'),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(document.querySelectorAll('.le-doc > .le-row')[1]).toHaveTextContent(
        `Ünïcødé 🐉 ${token} then ${token} again`,
      ),
    );
  });

  it('warns without Fix when the server has no suggestion', () => {
    renderEditor(['> [!dmnotes] Remember the bell.'].join('\n'), [
      span({
        kind: 'LOOKALIKE',
        token: '[!dmnotes]',
        tokenLine: 1,
        tokenColumn: 3,
      }),
    ]);
    expect(
      screen.getByText('Not a hiding marker — players will see this.', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Did you mean/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fix' })).not.toBeInTheDocument();
  });

  it('offers no Fix once the token is no longer where the server saw it', () => {
    renderEditor(['> [!dm@mortal] moved'].join('\n'), [
      span({
        kind: 'LOOKALIKE',
        token,
        suggestion: '[!dm:@mortal]',
        tokenLine: 1,
        tokenColumn: 5,
      }),
    ]);
    expect(screen.getByText(/Did you mean/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fix' })).not.toBeInTheDocument();
  });
});

describe('list-nested markers', () => {
  it('shows the server warning without offering a token replacement', () => {
    renderEditor('- > [!dm]\n  > secret', [
      span({
        kind: 'LIST_NESTED',
        token: '[!dm]',
        tokenLine: 1,
        tokenColumn: 5,
      }),
    ]);
    expect(
      screen.getByText('This marker does not protect the whole list item.'),
    ).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('button', { name: 'Fix' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'DMs only' })).not.toBeInTheDocument();
  });
});

describe('preview summary line', () => {
  const bars = `> ${'█'.repeat(20)}`;
  /** A server preview body (D45 shape) with `count` redacted placeholders. */
  function projected(count: number): string {
    const parts = ['Intro'];
    for (let i = 0; i < count; i++) parts.push('', '> [!redacted]', bars);
    return parts.join('\n');
  }
  const spans = [
    span({ kind: 'DM', startLine: 1, endLine: 2 }),
    span({ kind: 'MEMBER', startLine: 4, endLine: 5, handle: 'mortal' }),
    span({ kind: 'SPOILER', startLine: 7, endLine: 8 }),
    span({ kind: 'LOOKALIKE', startLine: 10, endLine: 10 }),
  ];

  it('counts the redacted blocks in the server preview and breaks them down for players and DMs', () => {
    expect(previewHiddenSummary(projected(2), { kind: 'player' }, spans)).toBe(
      'Hidden from players: 2 blocks (1 DMs only, 1 only @mortal)',
    );
    expect(previewHiddenSummary(projected(1), { kind: 'dm' }, spans)).toBe(
      'Hidden from DMs: 1 block (1 only @mortal)',
    );
    expect(
      previewHiddenSummary(projected(2), { kind: 'dm' }, [
        ...spans,
        span({ kind: 'MALFORMED', startLine: 12, endLine: 12 }),
      ]),
    ).toBe('Hidden from DMs: 2 blocks (1 only @mortal, 1 hidden from everyone)');
    expect(previewHiddenSummary('Intro', { kind: 'player' }, spans)).toBe(
      'Nothing is hidden from players',
    );
  });

  it('shows only the preview’s total when the audit does not match it or is missing', () => {
    expect(previewHiddenSummary(projected(3), { kind: 'player' }, spans)).toBe(
      'Hidden from players: 3 blocks',
    );
    expect(previewHiddenSummary(projected(1), { kind: 'player' }, null)).toBe(
      'Hidden from players: 1 block',
    );
  });

  it('does not count a literal "> [!redacted]" line the viewer still reads', () => {
    // Line 1 is the author's own literal callout; lines 3-4 are a DMs-only span.
    const raw = ['> [!redacted]', '', '> [!dm]', '> [!redacted]'].join('\n');
    const dmSpan = [span({ kind: 'DM', startLine: 3, endLine: 4 })];
    // The player preview shows the literal line plus one server placeholder.
    const asPlayer = ['> [!redacted]', '', '> [!redacted]', bars].join('\n');
    expect(previewHiddenSummary(asPlayer, { kind: 'player' }, dmSpan, raw)).toBe(
      'Hidden from players: 1 block (1 DMs only)',
    );
    // A DM reads both literal lines and has nothing hidden.
    const asDm = raw;
    expect(previewHiddenSummary(asDm, { kind: 'dm' }, dmSpan, raw)).toBe(
      'Nothing is hidden from DMs',
    );
    expect(
      previewHiddenSummary(asPlayer, { kind: 'member', handle: 'mortal' }, dmSpan, raw),
    ).toBe('Hidden from @mortal: 1 block');
  });

  it('gives a member the total from their preview, without guessing their roles', () => {
    expect(
      previewHiddenSummary(projected(2), { kind: 'member', handle: 'mortal' }, spans),
    ).toBe('Hidden from @mortal: 2 blocks');
    expect(
      previewHiddenSummary(projected(0), { kind: 'member', handle: 'mortal' }, spans),
    ).toBe('Nothing is hidden from @mortal');
  });
});

describe('useBodyAudit', () => {
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
    );
  }

  beforeEach(() => auditBody.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('audits the settled body after a pause and cancels a superseded request', async () => {
    const signals: AbortSignal[] = [];
    auditBody.mockImplementation((body: string, signal: AbortSignal) => {
      signals.push(signal);
      if (body === 'first') return new Promise(() => {});
      return Promise.resolve([span({ kind: 'DM' })]);
    });
    const { result, rerender } = renderHook(({ body }) => useBodyAudit(body), {
      wrapper,
      initialProps: { body: 'first' },
    });
    await waitFor(() => expect(auditBody).toHaveBeenCalledTimes(1));
    rerender({ body: 'second' });
    rerender({ body: 'third' });
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(auditBody).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(result.current.audit).toEqual({ body: 'third', spans: [span({ kind: 'DM' })] }),
    );
    expect(auditBody.mock.calls.map(([body]) => body)).toEqual(['first', 'third']);
    expect(signals[0].aborted).toBe(true);
  });

  it('gives up after the timeout so a hung audit never holds publishing', async () => {
    auditBody.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useBodyAudit('Body', true, { timeoutMs: 40 }), {
      wrapper,
    });
    const started = Date.now();
    await expect(result.current.latest('Body')).resolves.toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('asks again when the shared request is cancelled because the editor moved on', async () => {
    let firstA = true;
    auditBody.mockImplementation((body: string) => {
      if (body === 'A' && firstA) {
        firstA = false;
        return new Promise(() => {});
      }
      return Promise.resolve([span({ kind: 'DM' })]);
    });
    const { result, rerender } = renderHook(({ body }) => useBodyAudit(body), {
      wrapper,
      initialProps: { body: 'A' },
    });
    await waitFor(() => expect(auditBody).toHaveBeenCalledTimes(1));
    const pending = result.current.latest('A');
    // The debounced audit switches to B, which cancels the request for A.
    rerender({ body: 'B' });
    await expect(pending).resolves.toEqual([span({ kind: 'DM' })]);
    expect(auditBody.mock.calls.filter(([body]) => body === 'A')).toHaveLength(2);
  });

  it('degrades to no audit, without console noise, when the request fails', async () => {
    const consoleError = vi.spyOn(console, 'error');
    const consoleWarn = vi.spyOn(console, 'warn');
    auditBody.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useBodyAudit('> [!dm]\n> Secret'), { wrapper });
    await waitFor(() => expect(auditBody).toHaveBeenCalled());
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(result.current.audit).toBeNull();
    await expect(result.current.latest('> [!dm]\n> Secret')).resolves.toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });
});
