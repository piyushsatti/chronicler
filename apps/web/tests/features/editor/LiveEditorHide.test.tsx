import { QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveEditor } from '../../../src/features/editor/LiveEditor.js';
import { createTestQueryClient } from '../../../src/providers.js';

const loadAudienceMembers = vi.hoisted(() => vi.fn());
vi.mock('../../../src/features/editor/adapters/editorAudienceMembers.js', () => ({
  loadAudienceMembers,
  loadAudienceReader: vi.fn(),
}));

/** Parent with the draft's one-entry-per-change history, as useEditorDraft keeps it. */
function Host({
  initial,
  variant,
  changes,
}: {
  initial: string;
  variant: 'blocks' | 'plain';
  changes: string[];
}): React.JSX.Element {
  const [history, setHistory] = useState([initial]);
  const value = history[history.length - 1];
  return (
    <LiveEditor
      variant={variant}
      value={value}
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

function renderEditor(initial: string, variant: 'blocks' | 'plain' = 'blocks') {
  const changes: string[] = [];
  const client = createTestQueryClient();
  const view = render(
    <QueryClientProvider client={client}>
      <Host initial={initial} variant={variant} changes={changes} />
    </QueryClientProvider>,
  );
  return { changes, ...view };
}

/** Blocks variant: open line `index` for editing and select [start, end) in it. */
function editLine(container: HTMLElement, index: number, start: number, end = start) {
  const rows = container.querySelectorAll('.le-doc > .le-row');
  fireEvent.mouseDown(rows[index].querySelector('.le-read') as Element);
  const input = screen.getByRole('textbox', {
    name: 'Document body',
  }) as HTMLTextAreaElement;
  input.setSelectionRange(start, end);
  return input;
}

/**
 * Focus ends in the editor, and stays there after Base UI has finished
 * returning focus from the closed menu or dialog to its trigger.
 */
async function expectEditorFocused(selected?: string) {
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
  await waitFor(() => {
    const input = screen.getByRole('textbox', {
      name: 'Document body',
    }) as HTMLTextAreaElement;
    expect(document.activeElement).toBe(input);
    if (selected !== undefined) {
      expect(input.value.slice(input.selectionStart, input.selectionEnd)).toBe(
        selected,
      );
    }
  });
}

async function chooseHide(item: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Hide' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: item }));
}

beforeEach(() => {
  loadAudienceMembers.mockReset();
  loadAudienceMembers.mockResolvedValue({
    total: 2,
    entries: [
      {
        memberId: '00000000-0000-4000-8000-000000000001',
        handle: 'Exact-Handle',
        displayName: 'Mortal Reader',
      },
      {
        memberId: '00000000-0000-4000-8000-000000000002',
        handle: 'Space Handle',
        displayName: 'Spaced Out',
      },
    ],
  });
});

describe('LiveEditor Hide menu', () => {
  it('names the button, explains it, and lists the three choices', async () => {
    renderEditor('Text');
    const hide = screen.getByRole('button', { name: 'Hide' });
    expect(hide).toHaveAccessibleDescription('Hide text from players');
    expect(hide.querySelector('[title="Hide text from players"]')).not.toBeNull();
    await userEvent.click(hide);
    expect(
      (await screen.findAllByRole('menuitem')).map((item) => item.textContent),
    ).toEqual(['DMs only', 'Only for a member…', 'Spoiler']);
  });

  it('teaches the three options in a help popover with an example', async () => {
    renderEditor('Text');
    await userEvent.click(screen.getByRole('button', { name: 'How hiding works' }));
    const help = await screen.findByRole('dialog', { name: 'How hiding works' });
    expect(help).toHaveTextContent('DMs only');
    expect(help).toHaveTextContent('Only for a member');
    expect(help).toHaveTextContent('Spoiler');
    expect(help).toHaveTextContent('> [!dm]');
  });

  it.each([
    ['DMs only', '> [!dm]'],
    ['Spoiler', '> [!spoiler]'],
  ])(
    '%s inserts a placeholder quote on an empty line, selected',
    async (item, header) => {
      const { changes, container } = renderEditor('Intro\n\nOutro');
      editLine(container, 1, 0);
      await chooseHide(item);
      expect(changes).toEqual([`Intro\n\n${header}\n> Hidden text\n\nOutro`]);
      await expectEditorFocused('Hidden text');
    },
  );

  it.each([
    ['DMs only', '> [!dm]'],
    ['Spoiler', '> [!spoiler]'],
  ])('%s wraps the current line or its selection', async (item, header) => {
    const { changes, container } = renderEditor(
      'Intro\nThe mayor leads the cult.\nOutro',
    );
    editLine(container, 1, 4, 9);
    await chooseHide(item);
    expect(changes).toEqual([
      `Intro\n\n${header}\n> The mayor leads the cult.\n\nOutro`,
    ]);
    await expectEditorFocused();
  });

  it.each([
    ['DMs only', '> [!dm]'],
    ['Spoiler', '> [!spoiler]'],
  ])('%s wraps a multi-line selection in the plain editor', async (item, header) => {
    const value = 'Intro\nLine one\nLine two\nOutro';
    const { changes } = renderEditor(value, 'plain');
    const input = screen.getByRole('textbox', {
      name: 'Document body',
    }) as HTMLTextAreaElement;
    input.setSelectionRange(value.indexOf('one'), value.indexOf('two'));
    await chooseHide(item);
    expect(changes).toEqual([`Intro\n\n${header}\n> Line one\n> Line two\n\nOutro`]);
    await expectEditorFocused();
  });

  it('Only for a member… writes the picked member’s exact handle', async () => {
    const { changes, container } = renderEditor('Intro\n\nOutro');
    editLine(container, 1, 0);
    await chooseHide('Only for a member…');
    const picker = await screen.findByRole('dialog', { name: 'Only for a member' });
    await userEvent.type(
      within(picker).getByRole('textbox', { name: /Find a member/ }),
      'mor',
    );
    await waitFor(() => expect(loadAudienceMembers).toHaveBeenCalledWith('mor', 0));
    // A handle outside the marker charset would hide the text from everyone.
    expect(
      await within(picker).findByRole('button', { name: 'Choose Spaced Out' }),
    ).toBeDisabled();
    await userEvent.click(
      within(picker).getByRole('button', { name: 'Choose Mortal Reader' }),
    );
    expect(changes).toEqual(['Intro\n\n> [!dm:@Exact-Handle]\n> Hidden text\n\nOutro']);
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Only for a member' })).toBeNull(),
    );
    await expectEditorFocused('Hidden text');
  });

  it('Only for a member… on a selection replaces an existing marker line', async () => {
    const value = '> [!dm@mortal]\n> Secret';
    const { changes } = renderEditor(value, 'plain');
    const input = screen.getByRole('textbox', {
      name: 'Document body',
    }) as HTMLTextAreaElement;
    input.setSelectionRange(value.indexOf('Secret'), value.length);
    await chooseHide('Only for a member…');
    const picker = await screen.findByRole('dialog', { name: 'Only for a member' });
    await userEvent.type(
      within(picker).getByRole('textbox', { name: /Find a member/ }),
      'mor',
    );
    await userEvent.click(
      await within(picker).findByRole('button', { name: 'Choose Mortal Reader' }),
    );
    expect(changes).toEqual(['> [!dm:@Exact-Handle]\n> Secret']);
    await expectEditorFocused();
  });

  it('asks before making hidden text a spoiler, and never doubles the quote', async () => {
    const { changes, container } = renderEditor('> [!dm]\n> Secret\n> More');
    // The callout renders as one widget; clicking it opens its first line.
    fireEvent.mouseDown(container.querySelector('.le-widget') as Element);
    const input = screen.getByRole('textbox', {
      name: 'Document body',
    }) as HTMLTextAreaElement;
    input.setSelectionRange(3, 3);
    await chooseHide('Spoiler');
    let ask = await screen.findByRole('dialog', { name: 'Change hidden text?' });
    expect(ask).toHaveTextContent(
      'This text is currently hidden from players. Make it visible to everyone as a spoiler?',
    );
    await userEvent.click(within(ask).getByRole('button', { name: 'Keep it hidden' }));
    expect(changes).toEqual([]);
    await chooseHide('Spoiler');
    ask = await screen.findByRole('dialog', { name: 'Change hidden text?' });
    await userEvent.click(
      within(ask).getByRole('button', { name: 'Make it a spoiler' }),
    );
    expect(changes).toEqual(['> [!spoiler]\n> Secret\n> More']);
    await expectEditorFocused();
  });

  it('asks before changing who can read member-only text', async () => {
    const value = 'Meet [!dm:@alice] here';
    const { changes } = renderEditor(value, 'plain');
    const input = screen.getByRole('textbox', {
      name: 'Document body',
    }) as HTMLTextAreaElement;
    input.setSelectionRange(2, 2);
    await chooseHide('DMs only');
    const ask = await screen.findByRole('dialog', { name: 'Change hidden text?' });
    expect(ask).toHaveTextContent('Change who can read it to DMs only?');
    await userEvent.click(
      within(ask).getByRole('button', { name: 'Change who can read it' }),
    );
    // The inline handle is gone, so it cannot outrank the new header.
    expect(changes).toEqual(['> [!dm]\n> Meet here']);
    await expectEditorFocused();
  });

  it('is reachable and usable from the keyboard', async () => {
    const { changes } = renderEditor('Plain text', 'plain');
    const input = screen.getByRole('textbox', {
      name: 'Document body',
    }) as HTMLTextAreaElement;
    input.setSelectionRange(0, 0);
    const hide = screen.getByRole('button', { name: 'Hide' });
    act(() => hide.focus());
    await userEvent.keyboard('{Enter}');
    const first = await screen.findByRole('menuitem', { name: 'DMs only' });
    await waitFor(() => expect(first).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(changes).toEqual(['> [!spoiler]\n> Plain text']);
    await expectEditorFocused();
  });

  it('is one change, so a single undo restores the text the editor then builds on', async () => {
    const { changes, container } = renderEditor('Intro\n\nSecret\n\nOutro');
    editLine(container, 2, 0);
    await chooseHide('DMs only');
    expect(changes).toEqual(['Intro\n\n> [!dm]\n> Secret\n\nOutro']);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(container.querySelector('.le-doc')).not.toHaveTextContent('[!dm]'),
    );
    const input = editLine(container, 2, 6);
    expect(input).toHaveValue('Secret');
    fireEvent.change(input, { target: { value: 'Secret!' } });
    expect(changes.at(-1)).toBe('Intro\n\nSecret!\n\nOutro');
  });
});
