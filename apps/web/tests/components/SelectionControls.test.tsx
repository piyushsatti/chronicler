import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Listbox, type ListboxOption } from '../../src/components/primitives/Listbox.js';
import { SegmentedControl } from '../../src/components/primitives/SegmentedControl.js';

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta', disabled: true },
  { value: 'c', label: 'Gamma' },
];

describe('Listbox', () => {
  it('updates an uncontrolled selection and keeps it when the default changes', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { rerender } = render(
      <Listbox options={options} defaultValue="a" onValueChange={onValueChange}
        className="custom-list" size="lg" aria-label="Letters" />,
    );
    const listbox = screen.getByRole('listbox', { name: 'Letters' });
    expect(listbox.tagName).toBe('UL');
    expect(listbox).toHaveClass('listbox', 'custom-list');
    expect(listbox).toHaveAttribute('data-component', 'Listbox');
    expect(listbox).toHaveAttribute('data-size', 'lg');
    expect(listbox).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('option', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('option', { name: 'Gamma' }));
    expect(screen.getByRole('option', { name: 'Gamma' })).toHaveClass('listbox__opt');
    expect(screen.getByRole('option', { name: 'Gamma' })).toHaveAttribute('aria-selected', 'true');
    expect(onValueChange.mock.calls).toEqual([['c']]);
    rerender(<Listbox options={options} defaultValue="b" onValueChange={onValueChange} />);
    expect(screen.getByRole('option', { name: 'Gamma' })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps the controlled selection until the parent rerenders and reports repeated choices', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { rerender } = render(
      <Listbox options={options} value="a" defaultValue="c" onValueChange={onValueChange} />,
    );
    await user.click(screen.getByRole('option', { name: 'Gamma' }));
    await user.click(screen.getByRole('option', { name: 'Alpha' }));
    expect(screen.getByRole('option', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Gamma' })).toHaveAttribute('aria-selected', 'false');
    expect(onValueChange.mock.calls).toEqual([['c'], ['a']]);
    rerender(<Listbox options={options} value="c" defaultValue="a" onValueChange={onValueChange} />);
    expect(screen.getByRole('option', { name: 'Gamma' })).toHaveAttribute('aria-selected', 'true');
  });

  it('selects a controlled null value without falling back to its default', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const nullableOptions: ListboxOption<string | null>[] = [
      { value: null, label: 'None' },
      { value: 'a', label: 'Alpha' },
    ];
    const { rerender } = render(
      <Listbox<string | null> options={nullableOptions} value={null}
        defaultValue="a" onValueChange={onValueChange} />,
    );
    expect(screen.getByRole('option', { name: 'None' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'false');
    await user.click(screen.getByRole('option', { name: 'Alpha' }));
    expect(screen.getByRole('option', { name: 'None' })).toHaveAttribute('aria-selected', 'true');
    expect(onValueChange.mock.calls).toEqual([['a']]);
    rerender(<Listbox<string | null> options={nullableOptions} value={undefined}
      defaultValue="a" onValueChange={onValueChange} />);
    expect(screen.getByRole('option', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('option', { name: 'None' }));
    expect(screen.getByRole('option', { name: 'None' })).toHaveAttribute('aria-selected', 'true');
    expect(onValueChange.mock.calls).toEqual([['a'], [null]]);
  });

  it('skips disabled options and clamps arrow selection at either end', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Listbox options={options} defaultValue="a" onValueChange={onValueChange} />);
    const listbox = screen.getByRole('listbox');
    await user.click(screen.getByRole('option', { name: 'Beta' }));
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Gamma' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    fireEvent.keyDown(listbox, { key: 'ArrowUp' });
    fireEvent.keyDown(listbox, { key: 'ArrowUp' });
    fireEvent.keyDown(listbox, { key: 'Enter' });
    expect(onValueChange.mock.calls).toEqual([['c'], ['c'], ['a'], ['a']]);
    expect(screen.getByRole('option', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Beta' })).toBeDisabled();
  });

  it('leaves an initially unselected control idle when every option is disabled', () => {
    const onValueChange = vi.fn();
    render(<Listbox options={options.map((option) => ({ ...option, disabled: true }))}
      onValueChange={onValueChange} />);
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowUp' });
    expect(screen.getAllByRole('option')).toHaveLength(3);
    for (const option of screen.getAllByRole('option')) {
      expect(option).toHaveAttribute('aria-selected', 'false');
      expect(option).toBeDisabled();
    }
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('preserves the children-only fallback wrapper', () => {
    render(<Listbox options={[]} className="fallback" size="sm">Choose a letter</Listbox>);
    const wrapper = screen.getByText('Choose a letter');
    expect(wrapper.tagName).toBe('DIV');
    expect(wrapper).toHaveClass('fallback');
    expect(wrapper).toHaveAttribute('data-component', 'Listbox');
    expect(wrapper).toHaveAttribute('data-size', 'sm');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('SegmentedControl', () => {
  it('updates an uncontrolled choice and keeps it when the default changes', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { rerender } = render(
      <SegmentedControl options={options} defaultValue="a" onValueChange={onValueChange}
        className="custom-seg" size="sm" aria-label="Letters" />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Letters' });
    expect(group.tagName).toBe('DIV');
    expect(group).toHaveClass('seg', 'custom-seg');
    expect(group).toHaveAttribute('data-component', 'SegmentedControl');
    expect(group).toHaveAttribute('data-size', 'sm');
    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: 'Gamma' }));
    const selected = screen.getByRole('radio', { name: 'Gamma' });
    expect(selected).toHaveClass('seg__opt');
    expect(selected).toHaveAttribute('aria-checked', 'true');
    expect(selected).toHaveAttribute('data-active', '1');
    expect(onValueChange.mock.calls).toEqual([['c']]);
    rerender(<SegmentedControl options={options} defaultValue="b" onValueChange={onValueChange} />);
    expect(selected).toHaveAttribute('aria-checked', 'true');
  });

  it('keeps the controlled choice until parent rerender and reports repeated choices', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { rerender } = render(
      <SegmentedControl options={options} value="a" defaultValue="c" onValueChange={onValueChange} />,
    );
    await user.click(screen.getByRole('radio', { name: 'Gamma' }));
    await user.click(screen.getByRole('radio', { name: 'Alpha' }));
    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Gamma' })).toHaveAttribute('aria-checked', 'false');
    expect(onValueChange.mock.calls).toEqual([['c'], ['a']]);
    rerender(<SegmentedControl options={options} value="c" onValueChange={onValueChange} />);
    expect(screen.getByRole('radio', { name: 'Gamma' })).toHaveAttribute('aria-checked', 'true');
  });

  it('wraps arrow selection in both directions while skipping disabled choices', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<SegmentedControl options={options} defaultValue="a" onValueChange={onValueChange} />);
    const alpha = screen.getByRole('radio', { name: 'Alpha' });
    const gamma = screen.getByRole('radio', { name: 'Gamma' });
    await user.click(screen.getByRole('radio', { name: 'Beta' }));
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.keyDown(alpha, { key: 'ArrowRight' });
    expect(gamma).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(gamma, { key: 'ArrowDown' });
    expect(alpha).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(alpha, { key: 'ArrowLeft' });
    expect(gamma).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(gamma, { key: 'ArrowUp' });
    fireEvent.keyDown(alpha, { key: 'Enter' });
    expect(onValueChange.mock.calls).toEqual([['c'], ['a'], ['c'], ['a']]);
    expect(screen.getByRole('radio', { name: 'Beta' })).toBeDisabled();
  });

  it('starts with no choice when value and defaultValue are undefined', async () => {
    const user = userEvent.setup();
    render(<SegmentedControl options={options} />);
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveAttribute('aria-checked', 'false');
      expect(radio).not.toHaveAttribute('data-active');
    }
    await user.click(screen.getByRole('radio', { name: 'Gamma' }));
    expect(screen.getByRole('radio', { name: 'Gamma' })).toHaveAttribute('aria-checked', 'true');
  });

  it('does not change a choice when every option is disabled', () => {
    const onValueChange = vi.fn();
    render(<SegmentedControl options={options.map((option) => ({ ...option, disabled: true }))}
      defaultValue="a" onValueChange={onValueChange} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Alpha' }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Alpha' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute('aria-checked', 'true');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('preserves the children-only fallback group', () => {
    render(<SegmentedControl options={[]} className="fallback" size="sm"
      aria-label="Letters">Choose a letter</SegmentedControl>);
    const group = screen.getByRole('group', { name: 'Letters' });
    expect(group.tagName).toBe('DIV');
    expect(group).toHaveClass('fallback');
    expect(group).toHaveAttribute('data-component', 'SegmentedControl');
    expect(group).toHaveAttribute('data-size', 'sm');
    expect(group).toHaveTextContent('Choose a letter');
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });
});

it('integrates both control consumers with parent-owned state', async () => {
  const user = userEvent.setup();
  function SelectionPair(): React.JSX.Element {
    const [value, setValue] = useState('a');
    return <>
      <Listbox options={options} value={value} onValueChange={setValue} />
      <SegmentedControl options={options} value={value} onValueChange={setValue} />
      <output aria-label="Current selection">{value}</output>
    </>;
  }
  render(<SelectionPair />);
  await user.click(screen.getByRole('option', { name: 'Gamma' }));
  expect(screen.getByRole('radio', { name: 'Gamma' })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByLabelText('Current selection')).toHaveTextContent('c');
  await user.click(screen.getByRole('radio', { name: 'Alpha' }));
  expect(screen.getByRole('option', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByLabelText('Current selection')).toHaveTextContent('a');
});
