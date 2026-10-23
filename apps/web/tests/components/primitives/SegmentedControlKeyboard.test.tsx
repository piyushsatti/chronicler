import { fireEvent, render, screen } from '@testing-library/react';
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
  return screen.getAllByRole('button').filter((button) => button.closest('[data-component="SegmentedControl"]'))
    .map((button) => button.getAttribute('tabindex'));
}

describe('SegmentedControl keyboard toolbar', () => {
  it('exposes one tab stop and pressed state for a single selected value', () => {
    render(<SegmentedControl options={options} defaultValue="c" aria-label="Letters" />);
    expect(screen.getByRole('toolbar', { name: 'Letters' })).toBeInTheDocument();
    expect(tabIndexes()).toEqual(['0', '-1', '-1', '-1']);
    expect(screen.getByRole('button', { name: 'Gamma' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('enters and exits as one tab stop and preserves controlled selection after rerender', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <>
        <button type="button">Before</button>
        <SegmentedControl options={options} value="c" aria-label="Letters" />
        <button type="button">After</button>
      </>,
    );
    await user.tab();
    expect(screen.getByRole('button', { name: 'Before' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveFocus();
    rerender(
      <>
        <button type="button">Before</button>
        <SegmentedControl options={options} value="d" aria-label="Letters" />
        <button type="button">After</button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Delta' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('moves focus with arrows and activates with Space, skipping disabled options', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<SegmentedControl options={options} defaultValue="a" onValueChange={onValueChange} />);
    const button = (name: string): HTMLElement => screen.getByRole('button', { name });
    await user.tab();
    expect(button('Alpha')).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(button('Gamma')).toHaveFocus();
    expect(button('Alpha')).toHaveAttribute('aria-pressed', 'true');
    expect(button('Gamma')).toHaveAttribute('aria-pressed', 'false');
    await user.keyboard(' ');
    expect(button('Gamma')).toHaveAttribute('aria-pressed', 'true');
    expect(onValueChange).toHaveBeenCalledWith('c');

    await user.keyboard('{End}');
    expect(button('Delta')).toHaveFocus();
    await user.keyboard('{Home}');
    expect(button('Alpha')).toHaveFocus();
    expect(button('Beta')).toBeDisabled();
  });

  it('Home and End land on the first and last enabled options when edges are disabled', async () => {
    const user = userEvent.setup();
    render(
      <SegmentedControl
        options={[
          { value: 'disabled-start', label: 'Disabled start', disabled: true },
          { value: 'first', label: 'First enabled' },
          { value: 'last', label: 'Last enabled' },
          { value: 'disabled-end', label: 'Disabled end', disabled: true },
        ]}
        defaultValue="first"
        aria-label="Edges"
      />,
    );
    await user.tab();
    expect(screen.getByRole('button', { name: 'First enabled' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('button', { name: 'Last enabled' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('button', { name: 'First enabled' })).toHaveFocus();
  });

  it('keeps the active option selected while opening More and updates it from the menu', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        options={[{ value: 'all', label: 'All' }, { value: 'lore', label: 'Lore' }]}
        moreOptions={[{ value: 'rules', label: 'Rules' }]}
        value="all"
        onValueChange={onValueChange}
        aria-label="Categories"
      />,
    );
    await user.click(screen.getByRole('button', { name: /More/ }));
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(await screen.findByRole('menuitemradio', { name: 'Rules' }));
    expect(onValueChange).toHaveBeenLastCalledWith('rules');
    await user.click(screen.getByRole('button', { name: /More/ }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /More/ })).toHaveFocus();
  });

  it('keeps an overflowed More menu in view until selecting its option', async () => {
    const user = userEvent.setup();
    render(
      <SegmentedControl
        options={[{ value: 'all', label: 'All' }, { value: 'lore', label: 'Lore' }]}
        moreOptions={[{ value: 'rules', label: 'Rules' }]}
        defaultValue="all"
        aria-label="Categories"
      />,
    );
    const track = screen.getByRole('toolbar', { name: 'Categories' });
    const row = track.querySelector<HTMLElement>('.segmented-row');
    if (!row) throw new Error('Segmented controls need a measured row');
    let scrollLeft = 64;
    Object.defineProperties(track, {
      clientWidth: { configurable: true, value: 180 },
      scrollWidth: { configurable: true, value: 244 },
      scrollLeft: {
        configurable: true,
        get: () => scrollLeft,
        set: (value: number) => { scrollLeft = Math.max(0, Math.min(value, 64)); },
      },
    });
    const bounds = (left: number, width: number): DOMRect => ({
      left, right: left + width, top: 0, bottom: 40,
      x: left, y: 0, width, height: 40, toJSON: () => ({}),
    });
    vi.spyOn(track, 'getBoundingClientRect').mockImplementation(() => bounds(100, 180));
    vi.spyOn(row, 'getBoundingClientRect').mockImplementation(() => bounds(100 - scrollLeft, 244));
    row.querySelectorAll<HTMLElement>('.segmented-option').forEach((option, index) => {
      vi.spyOn(option, 'getBoundingClientRect').mockImplementation(() => bounds(104 + index * 80 - scrollLeft, 64));
    });
    fireEvent.scroll(track);
    expect(track).toHaveClass('can-scroll-left');
    expect(track).not.toHaveClass('can-scroll-right');

    await user.click(screen.getByRole('button', { name: /More/ }));
    expect(track.scrollLeft).toBe(64);
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('{Escape}');
    expect(track.scrollLeft).toBe(64);
    expect(screen.getByRole('button', { name: /More/ })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: /More/ }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Rules' }));
    expect(track.scrollLeft).toBe(64);
    expect(screen.getByRole('button', { name: /More/ })).toHaveAttribute('aria-pressed', 'true');
    expect(track.style.getPropertyValue('--active-tab-left')).toBe('164px');
    expect(track.style.getPropertyValue('--active-tab-width')).toBe('64px');
  });
});
