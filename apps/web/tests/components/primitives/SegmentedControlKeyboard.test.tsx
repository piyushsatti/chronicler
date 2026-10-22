import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from '../../../src/components/primitives/SegmentedControl.js';

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta', disabled: true },
  { value: 'c', label: 'Gamma' },
  { value: 'd', label: 'Delta' },
];

function tabIndexes(): (string | null)[] {
  return screen.getAllByRole('radio').map((radio) => radio.getAttribute('tabindex'));
}

describe('SegmentedControl keyboard (APG radio group)', () => {
  it('exposes exactly one tab stop on the checked option', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">before</button>
        <SegmentedControl options={options} defaultValue="c" aria-label="Letters" />
        <button type="button">after</button>
      </>,
    );
    expect(tabIndexes()).toEqual(['-1', '-1', '0', '-1']);
    await user.click(screen.getByRole('button', { name: 'before' }));
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Gamma' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('radio', { name: 'Gamma' })).toHaveFocus();
  });

  it('falls back to the first enabled option when nothing (or a disabled option) is checked', () => {
    const { rerender } = render(<SegmentedControl options={options} />);
    expect(tabIndexes()).toEqual(['0', '-1', '-1', '-1']);
    const leadingDisabled = [{ value: 'z', label: 'Zeta', disabled: true }, ...options];
    rerender(<SegmentedControl options={leadingDisabled} value="b" />);
    expect(tabIndexes()).toEqual(['-1', '0', '-1', '-1', '-1']);
  });

  it('moves focus and checks with arrows, wrapping and skipping disabled options', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        options={options}
        defaultValue="a"
        onValueChange={onValueChange}
      />,
    );
    const radio = (name: string): HTMLElement => screen.getByRole('radio', { name });
    await user.tab();
    expect(radio('Alpha')).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(radio('Gamma')).toHaveFocus();
    expect(radio('Gamma')).toHaveAttribute('aria-checked', 'true');
    expect(tabIndexes()).toEqual(['-1', '-1', '0', '-1']);

    await user.keyboard('{ArrowDown}');
    expect(radio('Delta')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(radio('Alpha')).toHaveFocus();
    expect(radio('Alpha')).toHaveAttribute('aria-checked', 'true');

    await user.keyboard('{ArrowLeft}');
    expect(radio('Delta')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(radio('Gamma')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(radio('Alpha')).toHaveFocus();

    expect(onValueChange.mock.calls).toEqual([
      ['c'],
      ['d'],
      ['a'],
      ['d'],
      ['c'],
      ['a'],
    ]);
    expect(radio('Beta')).toHaveAttribute('aria-checked', 'false');
  });

  it('jumps to the first and last enabled options with Home and End', async () => {
    const user = userEvent.setup();
    const edgesDisabled = [
      { value: 'x', label: 'Xi', disabled: true },
      ...options,
      { value: 'y', label: 'Ypsilon', disabled: true },
    ];
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        options={edgesDisabled}
        defaultValue="c"
        onValueChange={onValueChange}
      />,
    );
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Gamma' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('radio', { name: 'Delta' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Delta' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.keyboard('{Home}');
    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(onValueChange.mock.calls).toEqual([['d'], ['a']]);
  });

  it('checks the focused option with Space', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<SegmentedControl options={options} onValueChange={onValueChange} />);
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveFocus();
    await user.keyboard(' ');
    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(onValueChange.mock.calls).toEqual([['a']]);
  });
});
