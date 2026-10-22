import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Listbox } from '../../../src/components/primitives/Listbox.js';

const options = [
  { value: 'apple', label: 'Apple' },
  { value: 'apricot', label: 'Apricot', disabled: true },
  { value: 'avocado', label: 'Avocado' },
  { value: 'banana', label: 'Banana' },
  { value: 'blueberry', label: 'Blueberry' },
  { value: 'cherry', label: 'Cherry' },
];

function activeOption(): HTMLElement | null {
  const id = screen.getByRole('listbox').getAttribute('aria-activedescendant');
  return id ? document.getElementById(id) : null;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Listbox keyboard (APG single-select listbox)', () => {
  it('has a single tab stop on the listbox with unique, stable option ids', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <>
        <button type="button">before</button>
        <Listbox options={options} defaultValue="banana" aria-label="Fruit" />
        <button type="button">after</button>
      </>,
    );
    const listbox = screen.getByRole('listbox', { name: 'Fruit' });
    await user.click(screen.getByRole('button', { name: 'before' }));
    await user.tab();
    expect(listbox).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();

    const ids = screen.getAllByRole('option').map((option) => option.id);
    expect(new Set(ids).size).toBe(options.length);
    expect(ids.every(Boolean)).toBe(true);
    rerender(
      <>
        <button type="button">before</button>
        <Listbox options={options} defaultValue="banana" aria-label="Fruit" />
        <button type="button">after</button>
      </>,
    );
    expect(screen.getAllByRole('option').map((option) => option.id)).toEqual(ids);
  });

  it('points aria-activedescendant at the selected option and follows arrow selection', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Listbox options={options} defaultValue="apple" onValueChange={onValueChange} />,
    );
    expect(activeOption()).toBe(screen.getByRole('option', { name: 'Apple' }));
    await user.tab();
    await user.keyboard('{ArrowDown}');
    expect(activeOption()).toBe(screen.getByRole('option', { name: 'Avocado' }));
    expect(screen.getByRole('option', { name: 'Avocado' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.keyboard('{ArrowUp}');
    expect(activeOption()).toBe(screen.getByRole('option', { name: 'Apple' }));
    expect(onValueChange.mock.calls).toEqual([['avocado'], ['apple']]);
  });

  it('activates the first enabled option on focus without selecting it when nothing is selected', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const leadingDisabled = [
      { value: 'acai', label: 'Acai', disabled: true },
      ...options,
    ];
    render(<Listbox options={leadingDisabled} onValueChange={onValueChange} />);
    expect(screen.getByRole('listbox')).not.toHaveAttribute('aria-activedescendant');
    await user.tab();
    expect(activeOption()).toBe(screen.getByRole('option', { name: 'Apple' }));
    expect(onValueChange).not.toHaveBeenCalled();
    for (const option of screen.getAllByRole('option')) {
      expect(option).toHaveAttribute('aria-selected', 'false');
    }
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: 'Apple' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(onValueChange.mock.calls).toEqual([['apple']]);
  });

  it('selects the first and last enabled options with Home and End', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const edgesDisabled = [
      { value: 'acai', label: 'Acai', disabled: true },
      ...options,
      { value: 'date', label: 'Date', disabled: true },
    ];
    render(
      <Listbox
        options={edgesDisabled}
        defaultValue="banana"
        onValueChange={onValueChange}
      />,
    );
    await user.tab();
    await user.keyboard('{End}');
    expect(activeOption()).toBe(screen.getByRole('option', { name: 'Cherry' }));
    expect(screen.getByRole('option', { name: 'Cherry' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.keyboard('{Home}');
    expect(activeOption()).toBe(screen.getByRole('option', { name: 'Apple' }));
    expect(screen.getByRole('option', { name: 'Apple' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(onValueChange.mock.calls).toEqual([['cherry'], ['apple']]);
  });

  it('skips disabled options with arrows and clamps without wrapping', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Listbox
        options={options}
        defaultValue="avocado"
        onValueChange={onValueChange}
      />,
    );
    await user.tab();
    await user.keyboard('{ArrowUp}');
    expect(activeOption()).toBe(screen.getByRole('option', { name: 'Apple' }));
    await user.keyboard('{ArrowUp}');
    expect(activeOption()).toBe(screen.getByRole('option', { name: 'Apple' }));
    await user.keyboard('{End}{ArrowDown}');
    expect(activeOption()).toBe(screen.getByRole('option', { name: 'Cherry' }));
    expect(onValueChange.mock.calls.map(([v]) => v)).not.toContain('apricot');
  });

  it('typeahead selects by case-insensitive label prefix, skips disabled and resets after a pause', () => {
    vi.useFakeTimers();
    const onValueChange = vi.fn();
    render(
      <Listbox options={options} defaultValue="cherry" onValueChange={onValueChange} />,
    );
    const listbox = screen.getByRole('listbox');
    listbox.focus();

    // "a" from Cherry wraps to Apple; repeating "a" cycles and skips disabled Apricot.
    fireEvent.keyDown(listbox, { key: 'a' });
    expect(activeOption()).toBe(screen.getByRole('option', { name: 'Apple' }));
    fireEvent.keyDown(listbox, { key: 'A' });
    expect(activeOption()).toBe(screen.getByRole('option', { name: 'Avocado' }));

    // A pause resets the buffer; "bl" then narrows to Blueberry.
    vi.advanceTimersByTime(600);
    fireEvent.keyDown(listbox, { key: 'b' });
    expect(activeOption()).toBe(screen.getByRole('option', { name: 'Banana' }));
    fireEvent.keyDown(listbox, { key: 'l' });
    expect(activeOption()).toBe(screen.getByRole('option', { name: 'Blueberry' }));

    // No match leaves the selection alone; modified keys are not typeahead.
    vi.advanceTimersByTime(600);
    fireEvent.keyDown(listbox, { key: 'z' });
    fireEvent.keyDown(listbox, { key: 'c', ctrlKey: true });
    expect(screen.getByRole('option', { name: 'Blueberry' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(onValueChange.mock.calls).toEqual([
      ['apple'],
      ['avocado'],
      ['banana'],
      ['blueberry'],
    ]);
  });

  it('selects an enabled option on click and ignores clicks on disabled options', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Listbox options={options} defaultValue="apple" onValueChange={onValueChange} />,
    );
    await user.click(screen.getByRole('option', { name: 'Apricot' }));
    expect(screen.getByRole('option', { name: 'Apple' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(screen.getByRole('option', { name: 'Banana' }));
    expect(screen.getByRole('option', { name: 'Banana' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(activeOption()).toBe(screen.getByRole('option', { name: 'Banana' }));
    expect(screen.getByRole('listbox')).toHaveFocus();
    expect(onValueChange.mock.calls).toEqual([['banana']]);
  });

  it('scrolls the active option into view while focused', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      render(<Listbox options={options} defaultValue="apple" />);
      await user.tab();
      await user.keyboard('{End}');
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
      expect(scrollIntoView.mock.contexts.at(-1)).toBe(
        screen.getByRole('option', { name: 'Cherry' }),
      );
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});
